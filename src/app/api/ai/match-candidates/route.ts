import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { respondError, respondSuccess } from "@/lib/utils/api-response";
import { haversineDistance } from "@/lib/geo/haversine";
import OpenAI from "openai";

// Model selection - using GPT-5 with Responses API
const MATCH_MODEL = process.env.MATCH_MODEL ?? "gpt-5-mini-2025-08-07";

// Lazy initialization of OpenAI client
let openaiClient: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openaiClient) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY not configured");
    }
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openaiClient;
}

// System prompt for candidate matching
const SYSTEM_PROMPT = `Du bist ein Recruiting-Experte für Schweizer Personalvermittlung (Elektro, Holzbau, Gartenbau, Bau, Handwerk etc.).

Deine Aufgabe: Bewerte Kandidaten für eine offene Stelle basierend auf ALLEN verfügbaren Daten.

VERFÜGBARE KANDIDATEN-DATEN:
- Position/Beruf: Der aktuelle oder gewünschte Job des Kandidaten
- Adresse: Wohnort des Kandidaten (für Distanzberechnung)
- Erfahrungslevel: Junior/Mittel/Senior
- Führerschein/Auto: Ob Kandidat Führerschein und/oder eigenes Auto hat
- Qualitätsbewertung: A (Top), B (Ok), C (Flop) - interne Bewertung
- Bewertungsnotiz: Erklärung zur Qualitätsbewertung
- Notizen: Zusätzliche Informationen über den Kandidaten
- Kurzprofil (PDF): Detailliertes Profil (falls vorhanden)

BEWERTUNGSKRITERIEN (in Reihenfolge der Wichtigkeit):
1. Berufliche Qualifikation - Passt die Position/der Beruf zur Vakanz?
2. Erfahrung - Hat der Kandidat genug Erfahrung?
3. Regionale Nähe - Ist der Kandidat in akzeptabler Entfernung?
4. Führerschein/Auto - Falls erforderlich, hat der Kandidat einen?
5. Qualitätsbewertung - Was sagt die interne Bewertung?
6. Zusätzliche Infos aus Notizen oder Kurzprofil

SCORING:
- 85-100: Sehr guter Match - Position passt, Erfahrung vorhanden, gute Qualität
- 70-84: Guter Match - Position passt überwiegend, akzeptable Distanz
- 55-69: Mässiger Match - einige Übereinstimmungen, aber Lücken
- 40-54: Schwacher Match - wenig Übereinstimmung
- 0-39: Nicht passend - keine relevante Übereinstimmung

WICHTIG:
- Bewerte JEDEN Kandidaten, auch ohne Kurzprofil
- Nutze ALLE verfügbaren Daten (Position, Erfahrung, Notizen, etc.)
- Sei fair - auch Kandidaten ohne PDF können gut passen
- Begründe kurz (1-2 Sätze) warum der Score vergeben wurde
- Schweizer Deutsch verwenden
- Keine Füllwörter oder vage Aussagen
- Keine Emojis
- Klare, präzise Begründungen

Antworte IMMER als valides JSON Array mit ALLEN Kandidaten:
[
  {"candidate_id": "uuid-hier", "ai_score": 85, "match_reason": "Kurze Begründung"},
  ...
]`;

// Helper to extract text from PDF using unpdf
async function extractPdfText(pdfUrl: string): Promise<string | null> {
  try {
    const response = await fetch(pdfUrl);
    if (!response.ok) return null;

    const arrayBuffer = await response.arrayBuffer();
    const { extractText } = await import("unpdf");
    const { text } = await extractText(arrayBuffer);

    return Array.isArray(text) ? text.join("\n\n") : (text || null);
  } catch (err) {
    console.error("[AI Match] PDF extraction error:", err);
    return null;
  }
}

// Quality ranking
const QUALITY_RANK: Record<string, number> = { A: 3, B: 2, C: 1 };

// POST /api/ai/match-candidates
// Body: { vacancyId: string }
export async function POST(request: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return respondError("OpenAI API key not configured", 500);
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return respondError("Unauthorized", 401);
    }

    const body = await request.json();
    const { vacancyId } = body;

    if (!vacancyId) {
      return respondError("vacancyId is required", 400);
    }

    const adminSupabase = createAdminClient();

    // Fetch vacancy
    const { data: vacancy, error: vacancyError } = await adminSupabase
      .from("vacancies")
      .select(`
        *,
        contact:contacts(id, company_name, city, canton)
      `)
      .eq("id", vacancyId)
      .single();

    if (vacancyError || !vacancy) {
      return respondError("Vakanz nicht gefunden", 404);
    }

    // Fetch all TMA candidates (we'll filter/score them)
    const { data: allCandidates, error: candidatesError } = await adminSupabase
      .from("tma_candidates")
      .select("*")
      .eq("activity", "active"); // Only active candidates

    if (candidatesError || !allCandidates) {
      return respondError("Kandidaten konnten nicht geladen werden", 500);
    }

    // Get already assigned candidate IDs
    const { data: assignedCandidates } = await adminSupabase
      .from("vacancy_candidates")
      .select("tma_id")
      .eq("vacancy_id", vacancyId);

    const assignedIds = new Set(assignedCandidates?.map(c => c.tma_id) || []);

    // Pre-filter candidates using rule-based logic and calculate distances
    interface ScoredCandidate {
      id: string;
      first_name: string;
      last_name: string;
      position_title: string | null;
      city: string | null;
      canton: string | null;
      postal_code: string | null;
      street: string | null;
      experience_level: string | null;
      driving_license: string | null;
      short_profile_url: string | null;
      distance_km: number;
      rule_score: number;
      status_tags: string[];
      // Additional fields for AI analysis
      phone: string | null;
      email: string | null;
      quality_note: string | null;
      notes: string | null;
      activity: string | null;
    }

    const scoredCandidates: ScoredCandidate[] = [];

    for (const candidate of allCandidates) {
      // Skip already assigned
      if (assignedIds.has(candidate.id)) continue;

      // Calculate distance
      let distance_km = 999;
      if (vacancy.latitude && vacancy.longitude && candidate.latitude && candidate.longitude) {
        distance_km = haversineDistance(
          vacancy.latitude,
          vacancy.longitude,
          candidate.latitude,
          candidate.longitude
        );
      }

      // Check role match (loose)
      const roleMatches = !vacancy.role || 
        candidate.position_title?.toLowerCase().includes(vacancy.role.toLowerCase()) ||
        vacancy.role.toLowerCase().includes(candidate.position_title?.toLowerCase() || "");

      // Calculate rule-based score
      let rule_score = 0;
      
      // Location score (0-40)
      if (vacancy.radius_km && distance_km <= vacancy.radius_km) {
        rule_score += 40 - Math.min(30, distance_km);
      } else if (distance_km < 50) {
        rule_score += 20;
      }

      // Quality score (0-30)
      const candidateQualities = candidate.status_tags?.length > 0 
        ? candidate.status_tags 
        : (candidate.status ? [candidate.status] : []);
      const bestQuality = Math.max(...candidateQualities.map((q: string) => QUALITY_RANK[q] || 0), 0);
      rule_score += bestQuality * 10;

      // Role match bonus (0-20)
      if (roleMatches) rule_score += 20;

      // Experience bonus (0-10)
      if (candidate.experience_level === "senior") rule_score += 10;
      else if (candidate.experience_level === "mid") rule_score += 5;

      scoredCandidates.push({
        id: candidate.id,
        first_name: candidate.first_name,
        last_name: candidate.last_name,
        position_title: candidate.position_title,
        city: candidate.city,
        canton: candidate.canton,
        postal_code: candidate.postal_code,
        street: candidate.street,
        experience_level: candidate.experience_level,
        driving_license: candidate.driving_license,
        short_profile_url: candidate.short_profile_url,
        distance_km,
        rule_score,
        status_tags: candidateQualities,
        // Additional fields for AI
        phone: candidate.phone,
        email: candidate.email,
        quality_note: candidate.quality_note,
        notes: candidate.notes,
        activity: candidate.activity,
      });
    }

    // Sort by rule score and take top 10 for AI analysis
    scoredCandidates.sort((a, b) => b.rule_score - a.rule_score);
    const topCandidates = scoredCandidates.slice(0, 10);

    if (topCandidates.length === 0) {
      return respondSuccess({
        matches: [],
        message: "Keine passenden Kandidaten gefunden",
      });
    }

    // Extract PDF text for candidates with Kurzprofile (limit to avoid timeout)
    const candidatesWithProfiles: Array<{
      candidate: ScoredCandidate;
      profileText: string | null;
    }> = [];

    for (const candidate of topCandidates) {
      let profileText: string | null = null;
      
      if (candidate.short_profile_url) {
        profileText = await extractPdfText(candidate.short_profile_url);
        // Truncate to avoid token limits
        if (profileText && profileText.length > 2000) {
          profileText = profileText.substring(0, 2000) + "...";
        }
      }

      candidatesWithProfiles.push({ candidate, profileText });
    }

    // Build vacancy description for AI
    const vacancyDescription = `
Titel: ${vacancy.title}
Rolle: ${vacancy.role || "Nicht spezifiziert"}
Beschreibung: ${vacancy.description || "Keine Beschreibung"}
Ort: ${vacancy.city || vacancy.contact?.city || "Schweiz"}
Radius: ${vacancy.radius_km || 25} km
Mindest-Erfahrung: ${vacancy.min_experience || "Keine Anforderung"}
Führerschein: ${vacancy.driving_license || "Nicht erforderlich"}
Dringlichkeit: ${vacancy.urgency === 3 ? "Sofort" : vacancy.urgency === 2 ? "Bald" : "Kann warten"}
    `.trim();

    // Build candidates list for AI with all available data
    const candidatesList = candidatesWithProfiles.map((c, i) => {
      const cand = c.candidate;
      
      // Build comprehensive candidate description
      const lines = [
        `${i + 1}. ${cand.first_name} ${cand.last_name} (ID: ${cand.id})`,
        `   - Position/Beruf: ${cand.position_title || "Nicht angegeben"}`,
        `   - Adresse: ${[cand.street, cand.postal_code, cand.city, cand.canton].filter(Boolean).join(", ") || "Unbekannt"}`,
        `   - Entfernung zur Vakanz: ${cand.distance_km < 999 ? `${Math.round(cand.distance_km)} km` : "Unbekannt"}`,
        `   - Erfahrungslevel: ${cand.experience_level === "senior" ? "Senior (5+ Jahre)" : cand.experience_level === "mid" ? "Mittel (2-5 Jahre)" : cand.experience_level === "junior" ? "Junior (0-2 Jahre)" : "Nicht angegeben"}`,
        `   - Führerschein/Auto: ${cand.driving_license === "b_car" ? "Kat. B + eigenes Auto" : cand.driving_license === "be_car" ? "Kat. BE + eigenes Auto" : cand.driving_license === "b" ? "Kat. B (ohne Auto)" : cand.driving_license === "be" ? "Kat. BE (ohne Auto)" : cand.driving_license === "none" ? "Kein Führerschein" : "Nicht angegeben"}`,
        `   - Qualitätsbewertung: ${cand.status_tags.length > 0 ? cand.status_tags.map(t => t === "A" ? "A (Top)" : t === "B" ? "B (Ok)" : "C (Flop)").join(", ") : "Noch nicht bewertet"}`,
        `   - Status: ${cand.activity === "active" ? "Aktiv suchend" : "Inaktiv"}`,
      ];

      // Add quality note if available
      if (cand.quality_note) {
        lines.push(`   - Bewertungsnotiz: ${cand.quality_note}`);
      }

      // Add notes if available (truncate if too long)
      if (cand.notes) {
        const truncatedNotes = cand.notes.length > 500 ? cand.notes.substring(0, 500) + "..." : cand.notes;
        lines.push(`   - Notizen: ${truncatedNotes}`);
      }

      // Add Kurzprofil PDF text if available
      if (c.profileText) {
        lines.push(`   - Kurzprofil (PDF): ${c.profileText}`);
      }

      return { id: cand.id, description: lines.join("\n") };
    });

    // Build user prompt
    const userPrompt = `VAKANZ:
${vacancyDescription}

KANDIDATEN ZU BEWERTEN (${candidatesList.length} Kandidaten):
${candidatesList.map(c => c.description).join("\n\n")}

AUFGABE:
Bewerte JEDEN der ${candidatesList.length} Kandidaten mit einem Score (0-100) und kurzer Begründung.
Nutze alle verfügbaren Daten (Position, Erfahrung, Distanz, Qualitätsbewertung, Notizen, Kurzprofil).

Antworte als JSON Array. Jeder Kandidat MUSS bewertet werden:
[
  {"candidate_id": "uuid-aus-den-daten", "ai_score": 75, "match_reason": "Kurze Begründung"},
  ...für alle ${candidatesList.length} Kandidaten
]`;

    // Call OpenAI with GPT-5 Responses API
    const openai = getOpenAI();
    // Combine system prompt and user prompt for GPT-5 input format
    const fullPrompt = `${SYSTEM_PROMPT}\n\n---\n\n${userPrompt}`;
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let response: any;
    try {
      response = await (openai as any).responses.create({
        model: MATCH_MODEL,
        reasoning: { effort: "low" },
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: fullPrompt }
            ]
          }
        ]
      });
    } catch (openaiError) {
      console.error("[AI Match] OpenAI API Error:", openaiError);
      const errorMessage = openaiError instanceof Error ? openaiError.message : "OpenAI API Fehler";
      return respondError(`OpenAI Fehler: ${errorMessage}`, 500);
    }

    // Log for monitoring
    console.log(`[AI Match] Model: ${MATCH_MODEL}, Response received`);

    // GPT-5 returns output_text, not choices[0].message.content
    const responseText = response.output_text?.trim();

    if (!responseText) {
      console.error("[AI Match] Empty response from OpenAI. Full response:", JSON.stringify(response));
      return respondError("AI konnte keine Bewertung erstellen", 500);
    }

    // Parse JSON response
    let aiResults: Array<{ candidate_id: string; ai_score: number; match_reason: string }>;
    try {
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error("No JSON array found in response");
      }
      aiResults = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      console.error("[AI Match] Parse error:", parseErr, "Response:", responseText);
      return respondError("AI-Antwort konnte nicht verarbeitet werden", 500);
    }

    // Create a map of AI results by candidate ID
    const aiResultsMap = new Map(aiResults.map(r => [r.candidate_id, r]));

    // Build final results with AI scores
    const matches = candidatesWithProfiles.map(({ candidate }) => {
      const aiResult = aiResultsMap.get(candidate.id);
      return {
        id: candidate.id,
        first_name: candidate.first_name,
        last_name: candidate.last_name,
        position_title: candidate.position_title,
        city: candidate.city,
        canton: candidate.canton,
        postal_code: candidate.postal_code,
        experience_level: candidate.experience_level,
        driving_license: candidate.driving_license,
        distance_km: candidate.distance_km < 999 ? Math.round(candidate.distance_km) : null,
        ai_score: aiResult?.ai_score || 0,
        match_reason: aiResult?.match_reason || "Keine Bewertung verfügbar",
        rule_score: candidate.rule_score,
      };
    });

    // Sort by AI score (highest first)
    matches.sort((a, b) => b.ai_score - a.ai_score);

    return respondSuccess({
      matches,
      vacancy: {
        id: vacancy.id,
        title: vacancy.title,
        company: vacancy.contact?.company_name,
      },
    });
  } catch (err) {
    console.error("[AI Match] Error:", err);
    return respondError(
      err instanceof Error ? err.message : "Matching konnte nicht durchgeführt werden",
      500
    );
  }
}


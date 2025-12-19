import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { respondError, respondSuccess } from "@/lib/utils/api-response";
import { haversineDistance } from "@/lib/geo/haversine";
import OpenAI from "openai";

// Quality ranking for A/B/C tags
const QUALITY_RANK: Record<string, number> = { A: 30, B: 20, C: 10 };

// Experience level scoring
const EXPERIENCE_SCORE: Record<string, number> = { 
  more_than_3: 15, 
  more_than_1: 8, 
  less_than_1: 3 
};

// Model for AI matching
const MATCH_MODEL = process.env.MATCH_MODEL ?? "gpt-4o-mini";

// Lazy OpenAI client
let openaiClient: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!openaiClient) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY not configured");
    }
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiClient;
}

interface ScoreBreakdown {
  roleMatch: number;
  quality: number;
  experience: number;
  docsBonus: number;
  notesBonus: number;
  total: number;
}

interface ScoredCandidate {
  id: string;
  first_name: string;
  last_name: string;
  position_title: string | null;
  city: string | null;
  canton: string | null;
  postal_code: string | null;
  experience_level: string | null;
  driving_license: string | null;
  short_profile_url: string | null;
  distance_km: number | null;
  points_score: number;
  score_breakdown: ScoreBreakdown;
  status_tags: string[];
  quality_note: string | null;
  notes: string | null;
  // For AI mode
  ai_score?: number;
  match_reason?: string;
}

// Common suffixes/prefixes to ignore when matching roles
const IGNORE_WORDS = new Set(["efz", "eba", "hf", "bp", "dipl", "ing", "bsc", "msc"]);

/**
 * Extract the core role name by removing common suffixes like EFZ, EBA, etc.
 */
function getCoreRoleName(role: string): string {
  return role
    .toLowerCase()
    .split(/\s+/)
    .filter(word => !IGNORE_WORDS.has(word))
    .join(" ")
    .trim();
}

/**
 * Check if two roles match (strict matching on core role name)
 */
function rolesMatch(positionTitle: string, searchedRole: string): boolean {
  const corePosition = getCoreRoleName(positionTitle);
  const coreSearched = getCoreRoleName(searchedRole);
  
  if (!corePosition || !coreSearched) return false;
  
  // Exact match or one contains the other
  return corePosition.includes(coreSearched) || coreSearched.includes(corePosition);
}

/**
 * Calculate points score for a candidate based on role match
 */
function calculatePointsScore(
  candidate: {
    position_title: string | null;
    status_tags: string[] | null;
    status: string | null;
    experience_level: string | null;
    short_profile_url: string | null;
    quality_note: string | null;
    notes: string | null;
  },
  roleName: string
): ScoreBreakdown {
  let roleMatch = 0;
  let quality = 0;
  let experience = 0;
  let docsBonus = 0;
  let notesBonus = 0;

  // Role match (0-40): strict matching on core role name (ignoring EFZ, EBA, etc.)
  const posTitle = candidate.position_title || "";
  if (posTitle && roleName) {
    if (rolesMatch(posTitle, roleName)) {
      roleMatch = 40;
    }
  }

  // Quality tags (0-30): best tag wins
  const tags = candidate.status_tags?.length 
    ? candidate.status_tags 
    : (candidate.status ? [candidate.status] : []);
  quality = Math.max(...tags.map(t => QUALITY_RANK[t] || 0), 0);

  // Experience (0-15)
  if (candidate.experience_level) {
    experience = EXPERIENCE_SCORE[candidate.experience_level] || 0;
  }

  // Docs bonus (0-10): has short profile
  if (candidate.short_profile_url) {
    docsBonus = 10;
  }

  // Notes bonus (0-5): has notes or quality note
  if (candidate.notes || candidate.quality_note) {
    notesBonus = 5;
  }

  const total = roleMatch + quality + experience + docsBonus + notesBonus;

  return { roleMatch, quality, experience, docsBonus, notesBonus, total };
}

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/contacts/[id]/match-candidates
 * 
 * Find matching candidates for a contact based on role
 * Body: { roleName: string, method: "points" | "ai" }
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id: contactId } = await context.params;
    
    // Auth check
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return respondError("Unauthorized", 401);
    }

    // Parse body
    const body = await request.json().catch(() => null);
    if (!body || !body.roleName) {
      return respondError("roleName is required", 400);
    }
    const { roleName, method = "points" } = body as { roleName: string; method?: "points" | "ai" };

    const adminSupabase = createAdminClient();

    // Fetch contact with coordinates
    const { data: contact, error: contactError } = await adminSupabase
      .from("contacts")
      .select("id, company_name, city, canton, latitude, longitude")
      .eq("id", contactId)
      .single();

    if (contactError || !contact) {
      return respondError("Contact not found", 404);
    }

    // Fetch all ACTIVE candidates
    const { data: allCandidates, error: candidatesError } = await adminSupabase
      .from("tma_candidates")
      .select(`
        id, first_name, last_name, position_title,
        city, canton, postal_code, street,
        latitude, longitude,
        experience_level, driving_license,
        short_profile_url, status_tags, status,
        quality_note, notes, phone, email
      `)
      .eq("activity", "active");

    if (candidatesError || !allCandidates) {
      return respondError("Failed to load candidates", 500);
    }

    // Score and calculate distance for each candidate
    const scoredCandidates: ScoredCandidate[] = [];

    for (const candidate of allCandidates) {
      // Calculate distance
      let distance_km: number | null = null;
      if (contact.latitude && contact.longitude && candidate.latitude && candidate.longitude) {
        distance_km = Math.round(
          haversineDistance(
            contact.latitude,
            contact.longitude,
            candidate.latitude,
            candidate.longitude
          ) * 10
        ) / 10; // Round to 1 decimal
      }

      // Calculate points score
      const scoreBreakdown = calculatePointsScore(candidate, roleName);

      // ONLY include candidates that have a role match (roleMatch > 0)
      // This filters out candidates whose position doesn't match the searched role
      if (scoreBreakdown.roleMatch === 0) {
        continue;
      }

      // Get quality tags
      const statusTags = candidate.status_tags?.length 
        ? candidate.status_tags 
        : (candidate.status ? [candidate.status] : []);

      scoredCandidates.push({
        id: candidate.id,
        first_name: candidate.first_name,
        last_name: candidate.last_name,
        position_title: candidate.position_title,
        city: candidate.city,
        canton: candidate.canton,
        postal_code: candidate.postal_code,
        experience_level: candidate.experience_level,
        driving_license: candidate.driving_license,
        short_profile_url: candidate.short_profile_url,
        distance_km,
        points_score: scoreBreakdown.total,
        score_breakdown: scoreBreakdown,
        status_tags: statusTags,
        quality_note: candidate.quality_note,
        notes: candidate.notes,
      });
    }

    // Sort: by distance first (nulls last), then by points score
    scoredCandidates.sort((a, b) => {
      // Both have distance - sort by distance
      if (a.distance_km !== null && b.distance_km !== null) {
        if (a.distance_km !== b.distance_km) {
          return a.distance_km - b.distance_km;
        }
        // Same distance - sort by points
        return b.points_score - a.points_score;
      }
      // Only a has distance - a comes first
      if (a.distance_km !== null && b.distance_km === null) {
        return -1;
      }
      // Only b has distance - b comes first
      if (a.distance_km === null && b.distance_km !== null) {
        return 1;
      }
      // Neither has distance - sort by points
      return b.points_score - a.points_score;
    });

    // Limit to top 50 for performance
    const topCandidates = scoredCandidates.slice(0, 50);

    // If AI mode, enhance with AI scoring
    if (method === "ai" && process.env.OPENAI_API_KEY) {
      // Take top 15 by distance for AI analysis (to keep it fast)
      const candidatesForAi = topCandidates.slice(0, 15);
      
      try {
        const aiResults = await getAiScores(
          contact,
          roleName,
          candidatesForAi
        );

        // Merge AI results
        for (const candidate of candidatesForAi) {
          const aiResult = aiResults.get(candidate.id);
          if (aiResult) {
            candidate.ai_score = aiResult.score;
            candidate.match_reason = aiResult.reason;
          }
        }

        // Re-sort the AI candidates by AI score
        candidatesForAi.sort((a, b) => {
          const aScore = a.ai_score ?? 0;
          const bScore = b.ai_score ?? 0;
          return bScore - aScore;
        });

        return respondSuccess({
          matches: candidatesForAi,
          method: "ai",
          contact: {
            id: contact.id,
            company_name: contact.company_name,
            city: contact.city,
          },
          roleName,
        });
      } catch (aiErr) {
        console.error("[Match Candidates] AI error:", aiErr);
        // Fall back to points mode if AI fails
      }
    }

    return respondSuccess({
      matches: topCandidates,
      method: "points",
      contact: {
        id: contact.id,
        company_name: contact.company_name,
        city: contact.city,
      },
      roleName,
    });
  } catch (error) {
    console.error("POST /api/contacts/[id]/match-candidates error:", error);
    return respondError("Failed to match candidates", 500);
  }
}

/**
 * Get AI scores for candidates
 */
async function getAiScores(
  contact: { company_name: string | null; city: string | null; canton: string | null },
  roleName: string,
  candidates: ScoredCandidate[]
): Promise<Map<string, { score: number; reason: string }>> {
  const results = new Map<string, { score: number; reason: string }>();

  if (candidates.length === 0) return results;

  const systemPrompt = `Du bist ein Schweizer Recruiting-Experte. Bewerte Kandidaten für eine offene Stelle.

SCORING (0-100):
- 85-100: Sehr guter Match
- 70-84: Guter Match  
- 55-69: Mässiger Match
- 40-54: Schwacher Match
- 0-39: Nicht passend

Antworte als JSON Array:
[{"candidate_id": "uuid", "score": 75, "reason": "Kurze Begründung (1 Satz)"}]`;

  const candidatesList = candidates.map((c, i) => {
    const lines = [
      `${i + 1}. ${c.first_name} ${c.last_name} (ID: ${c.id})`,
      `   Position: ${c.position_title || "Nicht angegeben"}`,
      `   Ort: ${[c.postal_code, c.city, c.canton].filter(Boolean).join(", ") || "Unbekannt"}`,
      `   Entfernung: ${c.distance_km !== null ? `${c.distance_km} km` : "Unbekannt"}`,
      `   Erfahrung: ${c.experience_level || "Nicht angegeben"}`,
      `   Qualität: ${c.status_tags.join(", ") || "Nicht bewertet"}`,
    ];
    if (c.quality_note) lines.push(`   Bewertungsnotiz: ${c.quality_note}`);
    if (c.notes) lines.push(`   Notizen: ${c.notes.substring(0, 200)}${c.notes.length > 200 ? "..." : ""}`);
    return lines.join("\n");
  }).join("\n\n");

  const userPrompt = `FIRMA: ${contact.company_name || "Unbekannt"} (${contact.city || contact.canton || "Schweiz"})
GESUCHTE ROLLE: ${roleName}

KANDIDATEN:
${candidatesList}

Bewerte jeden Kandidaten mit Score und kurzer Begründung.`;

  try {
    const openai = getOpenAI();
    const response = await openai.chat.completions.create({
      model: MATCH_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 1500,
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) return results;

    // Parse JSON from response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return results;

    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      candidate_id: string;
      score: number;
      reason: string;
    }>;

    for (const item of parsed) {
      results.set(item.candidate_id, { score: item.score, reason: item.reason });
    }
  } catch (err) {
    console.error("[AI Scores] Error:", err);
  }

  return results;
}


import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { haversineDistance } from "@/lib/geo/haversine";
import type { TmaCandidate, VacancyCandidate } from "@/lib/types";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Quality ranking for sorting (A is best)
const QUALITY_RANK: Record<string, number> = { A: 3, B: 2, C: 1 };

/**
 * GET /api/vacancies/[id]/candidates - Get matching TMA candidates (auto-suggest)
 * 
 * Matching logic:
 * 1. Filter by role (if vacancy has role specified)
 * 2. Filter by location (haversine distance <= radius_km)
 * 3. Filter by quality (status_tags >= min_quality)
 * 4. Sort by: quality (A first), then distance
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get vacancy details
    const { data: vacancy, error: vacancyError } = await supabase
      .from("vacancies")
      .select("*")
      .eq("id", id)
      .single();

    if (vacancyError || !vacancy) {
      return NextResponse.json({ error: "Vacancy not found" }, { status: 404 });
    }

    // Get already assigned candidates
    const { data: assignedCandidates } = await supabase
      .from("vacancy_candidates")
      .select(`
        *,
        tma:tma_candidates(
          *,
          claimer:profiles!tma_candidates_claimed_by_fkey(id, full_name, avatar_url)
        )
      `)
      .eq("vacancy_id", id);

    const assignedTmaIds = new Set(assignedCandidates?.map(c => c.tma_id) || []);

    // Build query for TMA candidates - fetch all, filter/score in JS
    const { data: allCandidates, error: candidatesError } = await supabase
      .from("tma_candidates")
      .select(`
        *,
        claimer:profiles!tma_candidates_claimed_by_fkey(id, full_name, avatar_url)
      `);

    if (candidatesError) {
      console.error("[Candidates API] Error fetching candidates:", candidatesError);
      return NextResponse.json({ error: candidatesError.message }, { status: 500 });
    }

    // Score all candidates - more lenient matching, sort by relevance
    interface ScoreBreakdown {
      base: number;
      location: number;
      closeness: number;
      quality: number;
      qualityPenalty: number;
      activity: number;
      role: number;
      total: number;
    }

    const suggestedCandidates: Array<TmaCandidate & { 
      distance_km: number; 
      match_score: number;
      score_breakdown: ScoreBreakdown;
    }> = [];

    for (const candidate of allCandidates || []) {
      // Skip already assigned candidates
      if (assignedTmaIds.has(candidate.id)) continue;

      // Calculate distance if vacancy has location
      let distance_km = 0;
      let withinRadius = true;
      if (vacancy.latitude && vacancy.longitude && candidate.latitude && candidate.longitude) {
        distance_km = haversineDistance(
          vacancy.latitude,
          vacancy.longitude,
          candidate.latitude,
          candidate.longitude
        );
        withinRadius = !vacancy.radius_km || distance_km <= vacancy.radius_km;
      }

      // Check quality - use status_tags if populated, otherwise fallback to legacy status field
      const candidateQualities: string[] = 
        (candidate.status_tags && candidate.status_tags.length > 0) 
          ? candidate.status_tags 
          : (candidate.status ? [candidate.status] : []);
      const minQualityRank = vacancy.min_quality ? QUALITY_RANK[vacancy.min_quality] : 0;
      const candidateBestQuality = Math.max(...candidateQualities.map((q: string) => QUALITY_RANK[q] || 0), 0);
      const meetsQuality = minQualityRank === 0 || candidateBestQuality >= minQualityRank;

      // Check role match - REQUIRED if vacancy has role specified
      const roleMatches = !vacancy.role || 
        candidate.position_title?.toLowerCase().includes(vacancy.role.toLowerCase());
      
      // Skip candidates that don't match required role
      if (vacancy.role && !roleMatches) continue;

      // Check if active
      const isActive = candidate.activity === "active";

      // Build score breakdown
      const breakdown: ScoreBreakdown = {
        base: 10,
        location: 0,
        closeness: 0,
        quality: 0,
        qualityPenalty: 0,
        activity: 0,
        role: 0,
        total: 0,
      };

      // === LOCATION (most important - up to 40 points) ===
      if (withinRadius) {
        breakdown.location = 40;
        // Bonus for being closer (up to +10 more)
        if (vacancy.radius_km && distance_km > 0) {
          breakdown.closeness = Math.max(0, Math.round(10 * (1 - distance_km / vacancy.radius_km)));
        } else {
          breakdown.closeness = 10; // No location data = full bonus
        }
      } else {
        breakdown.location = -20; // Outside radius penalty
      }

      // === QUALITY (second most important - up to 35 points) ===
      if (candidateBestQuality === 3) breakdown.quality = 35; // A
      else if (candidateBestQuality === 2) breakdown.quality = 25; // B
      else if (candidateBestQuality === 1) breakdown.quality = 15; // C

      // Penalty if below minimum quality requirement
      if (!meetsQuality) breakdown.qualityPenalty = -20;

      // === SECONDARY FACTORS ===
      if (isActive) breakdown.activity = 10;
      if (roleMatches && vacancy.role) breakdown.role = 5;

      // Calculate total
      breakdown.total = Math.max(0, 
        breakdown.base + 
        breakdown.location + 
        breakdown.closeness + 
        breakdown.quality + 
        breakdown.qualityPenalty + 
        breakdown.activity + 
        breakdown.role
      );

      suggestedCandidates.push({
        ...candidate,
        distance_km: Math.round(distance_km * 10) / 10,
        match_score: breakdown.total,
        score_breakdown: breakdown,
      });
    }

    // Sort by match score (highest first), then by distance
    suggestedCandidates.sort((a, b) => {
      if (b.match_score !== a.match_score) return b.match_score - a.match_score;
      return a.distance_km - b.distance_km; // Closer first as tiebreaker
    });

    // Format assigned candidates with distance
    const formattedAssigned = assignedCandidates?.map(ac => {
      let distance_km = 0;
      if (vacancy.latitude && vacancy.longitude && ac.tma?.latitude && ac.tma?.longitude) {
        distance_km = haversineDistance(
          vacancy.latitude,
          vacancy.longitude,
          ac.tma.latitude,
          ac.tma.longitude
        );
      }
      return {
        ...ac,
        distance_km: Math.round(distance_km * 10) / 10,
      };
    }) || [];

    return NextResponse.json({
      assigned: formattedAssigned,
      suggested: suggestedCandidates.slice(0, 50), // Limit to top 50 suggestions
    });
  } catch (error) {
    console.error("[Candidates API] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/vacancies/[id]/candidates - Assign a candidate to a vacancy
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { tma_id, status, notes } = body;

    if (!tma_id) {
      return NextResponse.json({ error: "tma_id is required" }, { status: 400 });
    }

    // Verify vacancy exists
    const { data: vacancy, error: vacancyError } = await supabase
      .from("vacancies")
      .select("id")
      .eq("id", id)
      .single();

    if (vacancyError || !vacancy) {
      return NextResponse.json({ error: "Vacancy not found" }, { status: 404 });
    }

    // Verify TMA candidate exists
    const { data: tma, error: tmaError } = await supabase
      .from("tma_candidates")
      .select("id")
      .eq("id", tma_id)
      .single();

    if (tmaError || !tma) {
      return NextResponse.json({ error: "TMA candidate not found" }, { status: 404 });
    }

    // Insert or update vacancy candidate
    const { data: vacancyCandidate, error } = await supabase
      .from("vacancy_candidates")
      .upsert({
        vacancy_id: id,
        tma_id,
        status: status || "suggested",
        notes: notes || null,
      }, {
        onConflict: "vacancy_id,tma_id",
      })
      .select(`
        *,
        tma:tma_candidates(
          *,
          claimer:profiles!tma_candidates_claimed_by_fkey(id, full_name, avatar_url)
        )
      `)
      .single();

    if (error) {
      console.error("[Candidates API] Error assigning candidate:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(vacancyCandidate, { status: 201 });
  } catch (error) {
    console.error("[Candidates API] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

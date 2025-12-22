/**
 * Vacancy candidate matching algorithm
 * Extracted from /api/vacancies/[id]/candidates for reuse
 */

import { haversineDistance } from "@/lib/geo/haversine";
import type { TmaCandidate, Vacancy } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

// Quality ranking for sorting (A is best)
const QUALITY_RANK: Record<string, number> = { A: 3, B: 2, C: 1 };

export interface ScoreBreakdown {
  base: number;
  location: number;
  closeness: number;
  quality: number;
  qualityPenalty: number;
  activity: number;
  role: number;
  total: number;
}

export interface MatchedCandidate extends TmaCandidate {
  distance_km: number;
  match_score: number;
  score_breakdown: ScoreBreakdown;
}

export interface MatchResult {
  candidates: MatchedCandidate[];
  count: number;
}

/**
 * Find matching TMA candidates for a vacancy
 * 
 * Matching logic:
 * 1. Filter by role (if vacancy has role specified)
 * 2. Filter by location (haversine distance <= radius_km)
 * 3. Filter by quality (status_tags >= min_quality)
 * 4. Sort by: match score (quality + location + activity)
 */
export async function findMatchingCandidates(
  supabase: SupabaseClient,
  vacancy: Vacancy,
  options?: {
    limit?: number;
    excludeAssigned?: boolean;
  }
): Promise<MatchResult> {
  const { limit = 50, excludeAssigned = false } = options || {};

  // Get already assigned candidates if needed
  let assignedTmaIds = new Set<string>();
  if (excludeAssigned) {
    const { data: assignedCandidates } = await supabase
      .from("vacancy_candidates")
      .select("tma_id")
      .eq("vacancy_id", vacancy.id);
    
    assignedTmaIds = new Set(assignedCandidates?.map(c => c.tma_id) || []);
  }

  // Fetch all TMA candidates
  const { data: allCandidates, error: candidatesError } = await supabase
    .from("tma_candidates")
    .select(`
      *,
      claimer:profiles!tma_candidates_claimed_by_fkey(id, full_name, avatar_url)
    `);

  if (candidatesError) {
    console.error("[Match Candidates] Error fetching candidates:", candidatesError);
    throw new Error(candidatesError.message);
  }

  const matchedCandidates: MatchedCandidate[] = [];

  for (const candidate of allCandidates || []) {
    // Skip already assigned candidates
    if (excludeAssigned && assignedTmaIds.has(candidate.id)) continue;

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

    matchedCandidates.push({
      ...candidate,
      distance_km: Math.round(distance_km * 10) / 10,
      match_score: breakdown.total,
      score_breakdown: breakdown,
    });
  }

  // Sort by match score (highest first), then by distance
  matchedCandidates.sort((a, b) => {
    if (b.match_score !== a.match_score) return b.match_score - a.match_score;
    return a.distance_km - b.distance_km; // Closer first as tiebreaker
  });

  // Return limited results but full count
  return {
    candidates: matchedCandidates.slice(0, limit),
    count: matchedCandidates.length,
  };
}

/**
 * Quick count of matching candidates (faster, no full scoring)
 * Used for notifications where we just need the count
 */
export async function countMatchingCandidates(
  supabase: SupabaseClient,
  vacancy: Vacancy
): Promise<number> {
  // Fetch all TMA candidates (minimal fields for speed)
  const { data: allCandidates, error } = await supabase
    .from("tma_candidates")
    .select("id, position_title, latitude, longitude, status, status_tags, activity");

  if (error || !allCandidates) {
    console.error("[Match Count] Error:", error);
    return 0;
  }

  let count = 0;

  for (const candidate of allCandidates) {
    // Check role match - REQUIRED if vacancy has role specified
    const roleMatches = !vacancy.role || 
      candidate.position_title?.toLowerCase().includes(vacancy.role.toLowerCase());
    
    if (vacancy.role && !roleMatches) continue;

    // Check location if both have coordinates
    if (vacancy.latitude && vacancy.longitude && candidate.latitude && candidate.longitude) {
      const distance_km = haversineDistance(
        vacancy.latitude,
        vacancy.longitude,
        candidate.latitude,
        candidate.longitude
      );
      if (vacancy.radius_km && distance_km > vacancy.radius_km) continue;
    }

    // Check quality
    const candidateQualities: string[] = 
      (candidate.status_tags && candidate.status_tags.length > 0) 
        ? candidate.status_tags 
        : (candidate.status ? [candidate.status] : []);
    const minQualityRank = vacancy.min_quality ? QUALITY_RANK[vacancy.min_quality] : 0;
    const candidateBestQuality = Math.max(...candidateQualities.map((q: string) => QUALITY_RANK[q] || 0), 0);
    
    if (minQualityRank > 0 && candidateBestQuality < minQualityRank) continue;

    count++;
  }

  return count;
}


import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { respondError, respondSuccess } from "@/lib/utils/api-response";
import { haversineDistance } from "@/lib/geo/haversine";
import { findBestMatchingRole } from "@/lib/tma/role-match";

// Quality ranking for sorting tie-breakers
const QUALITY_RANK: Record<string, number> = { A: 3, B: 2, C: 1 };

interface TeamCandidateRow {
  id: string;
  first_name: string;
  last_name: string;
  position_title: string | null;
  city: string | null;
  status_tags: string[];
  short_profile_url: string;
  distance_km: number | null;
  role: {
    id: string;
    name: string;
    color: string;
  };
}

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/contacts/[id]/team-candidates
 *
 * Returns all "available" candidates from the selected candidate's team,
 * filtered to team roles, sorted nearest → furthest by distance to contact.
 *
 * Body: { selectedCandidateId: string }
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id: contactId } = await context.params;

    // Auth check
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return respondError("Unauthorized", 401);
    }

    // Parse body
    const body = await request.json().catch(() => null);
    if (!body || !body.selectedCandidateId) {
      return respondError("selectedCandidateId is required", 400);
    }
    const { selectedCandidateId } = body as { selectedCandidateId: string };

    const adminSupabase = createAdminClient();

    // 1. Fetch selected candidate to get team_id
    const { data: selectedCandidate, error: selCandErr } = await adminSupabase
      .from("tma_candidates")
      .select("id, team_id")
      .eq("id", selectedCandidateId)
      .single();

    if (selCandErr || !selectedCandidate) {
      return respondError("Selected candidate not found", 404);
    }

    const teamId = selectedCandidate.team_id;
    if (!teamId) {
      return respondError("Selected candidate has no team", 400);
    }

    // 2. Fetch the contact to get coordinates
    const { data: contact, error: contactErr } = await adminSupabase
      .from("contacts")
      .select("id, latitude, longitude")
      .eq("id", contactId)
      .single();

    if (contactErr || !contact) {
      return respondError("Contact not found", 404);
    }

    // 3. Fetch team roles
    const { data: roles, error: rolesErr } = await adminSupabase
      .from("tma_roles")
      .select("id, name, color")
      .eq("team_id", teamId);

    if (rolesErr) {
      console.error("[team-candidates] Failed to load roles:", rolesErr);
      return respondError("Failed to load team roles", 500);
    }
    if (!roles || roles.length === 0) {
      // No roles defined for this team => no candidates can match
      return respondSuccess([]);
    }

    // 4. Fetch candidates: same team, active, has short_profile_url, not selected candidate
    const { data: candidates, error: candErr } = await adminSupabase
      .from("tma_candidates")
      .select(
        `
        id, first_name, last_name, position_title,
        city, latitude, longitude,
        status_tags, status, short_profile_url
      `
      )
      .eq("team_id", teamId)
      .eq("activity", "active")
      .not("short_profile_url", "is", null)
      .neq("id", selectedCandidateId);

    if (candErr) {
      console.error("[team-candidates] Failed to load candidates:", candErr);
      return respondError("Failed to load candidates", 500);
    }

    if (!candidates || candidates.length === 0) {
      return respondSuccess([]);
    }

    // 5. Match roles and compute distance
    const results: TeamCandidateRow[] = [];

    for (const c of candidates) {
      // Match best role
      const bestRole = findBestMatchingRole(c.position_title, roles);
      if (!bestRole) {
        // no matching role => skip
        continue;
      }

      // Compute distance
      let distance_km: number | null = null;
      if (
        contact.latitude &&
        contact.longitude &&
        c.latitude &&
        c.longitude
      ) {
        distance_km =
          Math.round(
            haversineDistance(
              contact.latitude,
              contact.longitude,
              c.latitude,
              c.longitude
            ) * 10
          ) / 10; // 1 decimal
      }

      const statusTags: string[] = c.status_tags?.length
        ? c.status_tags
        : c.status
          ? [c.status]
          : [];

      results.push({
        id: c.id,
        first_name: c.first_name,
        last_name: c.last_name,
        position_title: c.position_title,
        city: c.city,
        status_tags: statusTags,
        short_profile_url: c.short_profile_url!,
        distance_km,
        role: bestRole,
      });
    }

    // 6. Sort: distance asc (nulls last), then quality desc, then name asc
    results.sort((a, b) => {
      // Distance asc (null last)
      if (a.distance_km !== null && b.distance_km !== null) {
        if (a.distance_km !== b.distance_km) {
          return a.distance_km - b.distance_km;
        }
      } else if (a.distance_km !== null && b.distance_km === null) {
        return -1;
      } else if (a.distance_km === null && b.distance_km !== null) {
        return 1;
      }

      // Quality tie-breaker (best tag wins)
      const aQuality = Math.max(...a.status_tags.map((t) => QUALITY_RANK[t] || 0), 0);
      const bQuality = Math.max(...b.status_tags.map((t) => QUALITY_RANK[t] || 0), 0);
      if (aQuality !== bQuality) {
        return bQuality - aQuality; // desc
      }

      // Name asc
      const aName = `${a.last_name} ${a.first_name}`.toLowerCase();
      const bName = `${b.last_name} ${b.first_name}`.toLowerCase();
      return aName.localeCompare(bName);
    });

    return respondSuccess(results);
  } catch (error) {
    console.error("POST /api/contacts/[id]/team-candidates error:", error);
    return respondError("Failed to load team candidates", 500);
  }
}


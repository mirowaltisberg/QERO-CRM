import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { respondError, respondSuccess } from "@/lib/utils/api-response";
import { haversineDistance } from "@/lib/geo/haversine";
import type { Contact } from "@/lib/types";

/**
 * GET /api/contacts/sorted-by-candidate
 * 
 * Returns all contacts sorted by distance from a specified TMA candidate's location.
 * Contacts without coordinates are placed at the end of the list.
 * 
 * Query params:
 * - candidateId: UUID of the TMA candidate to use as the reference point
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Authenticate
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return respondError("Unauthorized", 401);
    }

    // Get candidateId from query params
    const candidateId = request.nextUrl.searchParams.get("candidateId");
    if (!candidateId) {
      return respondError("candidateId is required", 400);
    }

    // Fetch the candidate to get their coordinates and team
    const { data: candidate, error: candidateError } = await supabase
      .from("tma_candidates")
      .select("id, first_name, last_name, latitude, longitude, city, team_id")
      .eq("id", candidateId)
      .single();

    if (candidateError || !candidate) {
      return respondError("Candidate not found", 404);
    }

    // Check if candidate has coordinates
    if (!candidate.latitude || !candidate.longitude) {
      return respondError(
        "Candidate has no location data. Cannot sort contacts by distance.",
        400
      );
    }

    // Fetch contacts filtered by candidate's team (if candidate has a team)
    let query = supabase
      .from("contacts")
      .select(`
        *,
        team:teams(id, name, color)
      `)
      .order("company_name", { ascending: true });

    // Filter by candidate's team_id if available
    if (candidate.team_id) {
      query = query.eq("team_id", candidate.team_id);
    }

    const { data: contacts, error: contactsError } = await query;

    if (contactsError) {
      console.error("[Sorted Contacts] Error fetching contacts:", contactsError);
      return respondError("Failed to fetch contacts", 500);
    }

    if (!contacts || contacts.length === 0) {
      return respondSuccess([], {
        status: 200,
        meta: { 
          count: 0,
          candidateId,
          candidateName: `${candidate.first_name} ${candidate.last_name}`,
          candidateCity: candidate.city,
          candidateTeamId: candidate.team_id,
        },
      });
    }

    // Calculate distance for each contact
    const contactsWithDistance = contacts.map((contact: Contact) => {
      if (contact.latitude && contact.longitude) {
        const distance = haversineDistance(
          candidate.latitude!,
          candidate.longitude!,
          contact.latitude,
          contact.longitude
        );
        return {
          ...contact,
          distance_km: Math.round(distance * 10) / 10, // Round to 1 decimal
        };
      }
      // Contact has no coordinates
      return {
        ...contact,
        distance_km: null,
      };
    });

    // Sort: contacts with distance first (ascending), then contacts without distance
    const sortedContacts = contactsWithDistance.sort((a, b) => {
      // Both have distance - sort by distance
      if (a.distance_km !== null && b.distance_km !== null) {
        return a.distance_km - b.distance_km;
      }
      // Only a has distance - a comes first
      if (a.distance_km !== null && b.distance_km === null) {
        return -1;
      }
      // Only b has distance - b comes first
      if (a.distance_km === null && b.distance_km !== null) {
        return 1;
      }
      // Neither has distance - sort alphabetically by company name
      return a.company_name.localeCompare(b.company_name);
    });

    return respondSuccess(sortedContacts, {
      status: 200,
      meta: {
        count: sortedContacts.length,
        candidateId,
        candidateName: `${candidate.first_name} ${candidate.last_name}`,
        candidateCity: candidate.city,
        candidateTeamId: candidate.team_id,
      },
    });
  } catch (error) {
    console.error("GET /api/contacts/sorted-by-candidate error:", error);
    return respondError("Failed to fetch sorted contacts", 500);
  }
}


import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Vacancy, VacancyStatus } from "@/lib/types";
import { countMatchingCandidates } from "@/lib/vacancy/match-candidates";
import { sendPushToUsers } from "@/lib/push/send-notification";

/**
 * GET /api/vacancies - List all vacancies with optional filters
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") as VacancyStatus | null;
    const role = searchParams.get("role");
    const search = searchParams.get("search");
    const contact_id = searchParams.get("contact_id");

    let query = supabase
      .from("vacancies")
      .select(`
        *,
        contact:contacts(id, company_name, phone, email, city, canton, team_id, team:teams(id, name, color)),
        creator:profiles!vacancies_created_by_fkey(id, full_name, avatar_url)
      `)
      .order("created_at", { ascending: false });

    // Apply filters
    if (status) {
      query = query.eq("status", status);
    }
    if (role) {
      query = query.eq("role", role);
    }
    if (contact_id) {
      query = query.eq("contact_id", contact_id);
    }
    if (search) {
      query = query.or(`title.ilike.%${search}%,role.ilike.%${search}%,city.ilike.%${search}%`);
    }

    const { data: vacancies, error } = await query;

    if (error) {
      console.error("[Vacancies API] Error fetching vacancies:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Get candidate counts for each vacancy
    const vacancyIds = vacancies?.map(v => v.id) || [];
    if (vacancyIds.length > 0) {
      const { data: counts } = await supabase
        .from("vacancy_candidates")
        .select("vacancy_id")
        .in("vacancy_id", vacancyIds);

      const countMap = new Map<string, number>();
      counts?.forEach(c => {
        countMap.set(c.vacancy_id, (countMap.get(c.vacancy_id) || 0) + 1);
      });

      vacancies?.forEach(v => {
        (v as Vacancy).candidate_count = countMap.get(v.id) || 0;
      });
    }

    return NextResponse.json(vacancies || []);
  } catch (error) {
    console.error("[Vacancies API] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/vacancies - Create a new vacancy
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      contact_id,
      title,
      role,
      description,
      city,
      postal_code,
      latitude,
      longitude,
      radius_km,
      min_quality,
      urgency,
      driving_license,
      min_experience,
      status,
    } = body;

    // Validate required fields
    if (!contact_id) {
      return NextResponse.json({ error: "contact_id is required" }, { status: 400 });
    }
    if (!title) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }

    // Verify contact exists
    const { data: contact, error: contactError } = await supabase
      .from("contacts")
      .select("id")
      .eq("id", contact_id)
      .single();

    if (contactError || !contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    const { data: vacancy, error } = await supabase
      .from("vacancies")
      .insert({
        contact_id,
        title,
        role: role || null,
        description: description || null,
        city: city || null,
        postal_code: postal_code || null,
        latitude: latitude || null,
        longitude: longitude || null,
        radius_km: radius_km || 25,
        min_quality: min_quality || null,
        urgency: urgency || 1,
        driving_license: driving_license || null,
        min_experience: min_experience || null,
        status: status || "open",
        created_by: user.id,
      })
      .select(`
        *,
        contact:contacts(id, company_name, phone, email, city, canton, team_id, team:teams(id, name, color)),
        creator:profiles!vacancies_created_by_fkey(id, full_name, avatar_url)
      `)
      .single();

    if (error) {
      console.error("[Vacancies API] Error creating vacancy:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Count matching candidates for immediate feedback
    let matchCount = 0;
    try {
      matchCount = await countMatchingCandidates(supabase, vacancy as Vacancy);
    } catch (matchError) {
      console.error("[Vacancies API] Error counting matches:", matchError);
      // Don't fail the request, just log the error
    }

    // Send push notification to all team members
    // Get the team_id from the contact
    const teamId = vacancy.contact?.team_id;
    if (teamId) {
      try {
        const adminClient = createAdminClient();
        // Get all users in the team (except the creator)
        const { data: teamMembers } = await adminClient
          .from("profiles")
          .select("id")
          .eq("team_id", teamId)
          .neq("id", user.id);

        if (teamMembers && teamMembers.length > 0) {
          const userIds = teamMembers.map(m => m.id);
          const urgencyEmoji = vacancy.urgency >= 3 ? "🔥🔥🔥" : vacancy.urgency === 2 ? "🔥🔥" : "🔥";
          
          // Send push notification (async, don't await to not slow down response)
          sendPushToUsers(userIds, {
            title: `Neue Vakanz ${urgencyEmoji}`,
            body: `${vacancy.title}${matchCount > 0 ? ` - ${matchCount} passende Kandidaten` : ""}`,
            url: `/vakanzen?highlight=${vacancy.id}`,
            tag: `vacancy-${vacancy.id}`,
          }).catch(pushError => {
            console.error("[Vacancies API] Push notification error:", pushError);
          });
        }
      } catch (pushSetupError) {
        console.error("[Vacancies API] Push setup error:", pushSetupError);
        // Don't fail the request
      }
    }

    return NextResponse.json({ 
      ...vacancy, 
      match_count: matchCount 
    }, { status: 201 });
  } catch (error) {
    console.error("[Vacancies API] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Vacancy, VacancyStatus } from "@/lib/types";

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

    return NextResponse.json(vacancy, { status: 201 });
  } catch (error) {
    console.error("[Vacancies API] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

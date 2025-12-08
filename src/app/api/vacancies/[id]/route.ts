import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/vacancies/[id] - Get a single vacancy with company info
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: vacancy, error } = await supabase
      .from("vacancies")
      .select(`
        *,
        contact:contacts(id, company_name, phone, email, city, street, postal_code, canton),
        creator:profiles!vacancies_created_by_fkey(id, full_name, avatar_url)
      `)
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json({ error: "Vacancy not found" }, { status: 404 });
      }
      console.error("[Vacancy API] Error fetching vacancy:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Get candidate count
    const { count } = await supabase
      .from("vacancy_candidates")
      .select("*", { count: "exact", head: true })
      .eq("vacancy_id", id);

    vacancy.candidate_count = count || 0;

    return NextResponse.json(vacancy);
  } catch (error) {
    console.error("[Vacancy API] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/vacancies/[id] - Update a vacancy
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const allowedFields = [
      "title",
      "role",
      "description",
      "city",
      "postal_code",
      "latitude",
      "longitude",
      "radius_km",
      "min_quality",
      "status",
      "contact_id",
    ];

    // Only include allowed fields
    const updateData: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in body) {
        updateData[field] = body[field];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const { data: vacancy, error } = await supabase
      .from("vacancies")
      .update(updateData)
      .eq("id", id)
      .select(`
        *,
        contact:contacts(id, company_name, phone, email, city, canton),
        creator:profiles!vacancies_created_by_fkey(id, full_name, avatar_url)
      `)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json({ error: "Vacancy not found" }, { status: 404 });
      }
      console.error("[Vacancy API] Error updating vacancy:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(vacancy);
  } catch (error) {
    console.error("[Vacancy API] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/vacancies/[id] - Delete a vacancy
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { error } = await supabase
      .from("vacancies")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("[Vacancy API] Error deleting vacancy:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Vacancy API] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

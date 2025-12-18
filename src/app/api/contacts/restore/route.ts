import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCleanupAllowed } from "@/lib/utils/cleanup-auth";

/**
 * GET /api/contacts/restore
 * List archived/deleted contacts that can be restored
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isCleanupAllowed(user.email)) {
      return NextResponse.json(
        { error: "You are not authorized to view archived contacts" },
        { status: 403 }
      );
    }

    // Get user's team_id
    const { data: profile } = await supabase
      .from("profiles")
      .select("team_id")
      .eq("id", user.id)
      .single();

    const teamId = profile?.team_id;

    // Parse query params
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    // Fetch archived contacts
    let query = supabase
      .from("deleted_contacts_archive")
      .select("id, original_contact_id, deleted_at, deleted_by, reason, run_id, merged_into_contact_id, contact_snapshot")
      .order("deleted_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (teamId) {
      query = query.eq("team_id", teamId);
    }

    const { data: archived, error } = await query;

    if (error) {
      console.error("[Restore List] Error:", error);
      return NextResponse.json({ error: "Failed to fetch archived contacts" }, { status: 500 });
    }

    // Format for display
    const items = (archived || []).map((a) => ({
      id: a.id,
      originalId: a.original_contact_id,
      companyName: (a.contact_snapshot as Record<string, unknown>)?.company_name || "(unknown)",
      deletedAt: a.deleted_at,
      reason: a.reason,
      mergedIntoId: a.merged_into_contact_id,
    }));

    return NextResponse.json({
      success: true,
      items,
      total: items.length,
    });
  } catch (error) {
    console.error("[Restore List] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/contacts/restore
 * Restore an archived contact
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isCleanupAllowed(user.email)) {
      return NextResponse.json(
        { error: "You are not authorized to restore contacts" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const archiveId = body.archiveId;

    if (!archiveId) {
      return NextResponse.json({ error: "archiveId is required" }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Fetch the archived record
    const { data: archived, error: fetchError } = await adminClient
      .from("deleted_contacts_archive")
      .select("*")
      .eq("id", archiveId)
      .single();

    if (fetchError || !archived) {
      return NextResponse.json({ error: "Archived contact not found" }, { status: 404 });
    }

    const contactSnapshot = archived.contact_snapshot as Record<string, unknown>;

    // Check if a contact with this ID already exists
    const { data: existing } = await adminClient
      .from("contacts")
      .select("id")
      .eq("id", archived.original_contact_id)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: "A contact with this ID already exists. Cannot restore." },
        { status: 409 }
      );
    }

    // Restore the contact
    // Remove fields that shouldn't be restored directly
    const { id: _id, ...contactData } = contactSnapshot;
    
    const { data: restoredContact, error: createError } = await adminClient
      .from("contacts")
      .insert({
        ...contactData,
        id: archived.original_contact_id, // Restore with original ID
      })
      .select("id")
      .single();

    if (createError) {
      console.error("[Restore] Failed to restore contact:", createError);
      return NextResponse.json({ error: "Failed to restore contact" }, { status: 500 });
    }

    const restored = {
      contact: true,
      contact_persons: 0,
      contact_notes: 0,
      vacancies: 0,
    };

    // Restore related data
    const personsSnapshot = archived.contact_persons_snapshot as unknown[];
    if (personsSnapshot && personsSnapshot.length > 0) {
      for (const person of personsSnapshot) {
        const personData = person as Record<string, unknown>;
        const { id: _personId, ...restPerson } = personData;
        await adminClient.from("contact_persons").insert({
          ...restPerson,
          contact_id: restoredContact.id,
        });
        restored.contact_persons++;
      }
    }

    const notesSnapshot = archived.contact_notes_snapshot as unknown[];
    if (notesSnapshot && notesSnapshot.length > 0) {
      for (const note of notesSnapshot) {
        const noteData = note as Record<string, unknown>;
        const { id: _noteId, ...restNote } = noteData;
        await adminClient.from("contact_notes").insert({
          ...restNote,
          contact_id: restoredContact.id,
        });
        restored.contact_notes++;
      }
    }

    const vacanciesSnapshot = archived.vacancies_snapshot as unknown[];
    if (vacanciesSnapshot && vacanciesSnapshot.length > 0) {
      for (const vacancy of vacanciesSnapshot) {
        const vacancyData = vacancy as Record<string, unknown>;
        const { id: _vacancyId, ...restVacancy } = vacancyData;
        await adminClient.from("vacancies").insert({
          ...restVacancy,
          contact_id: restoredContact.id,
        });
        restored.vacancies++;
      }
    }

    // Delete the archive record after successful restore
    await adminClient
      .from("deleted_contacts_archive")
      .delete()
      .eq("id", archiveId);

    return NextResponse.json({
      success: true,
      restoredContactId: restoredContact.id,
      restored,
    });
  } catch (error) {
    console.error("[Restore] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

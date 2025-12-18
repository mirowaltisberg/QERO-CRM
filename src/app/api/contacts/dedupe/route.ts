import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCleanupAllowed } from "@/lib/utils/cleanup-auth";
import {
  findDuplicateGroups,
  mergeContactFields,
  type ContactForDedupe,
  type DuplicateGroup,
} from "@/lib/utils/contact-dedupe";

interface DedupePreviewResult {
  preview: boolean;
  success: boolean;
  duplicateGroups: number;
  contactsToDelete: number;
  examples: Array<{
    primaryName: string;
    duplicateNames: string[];
    matchReason: string;
  }>;
}

interface DedupeApplyResult extends DedupePreviewResult {
  runId: string;
  archived: number;
  merged: {
    contact_notes: number;
    contact_persons: number;
    vacancies: number;
    user_contact_settings: number;
    list_members: number;
    email_drafts: number;
    call_logs: number;
  };
  errors: string[];
}

/**
 * GET /api/contacts/dedupe
 * Alias for preview endpoint
 */
export async function GET() {
  return handlePreview();
}

/**
 * POST /api/contacts/dedupe
 * Apply the dedupe merge
 */
export async function POST() {
  return handleApply();
}

async function handlePreview(): Promise<NextResponse> {
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
        { error: "You are not authorized to run data cleanup operations" },
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

    // Fetch all contacts for the team
    let query = supabase
      .from("contacts")
      .select("id, company_name, contact_name, phone, email, street, city, canton, postal_code, created_at, team_id");

    if (teamId) {
      query = query.eq("team_id", teamId);
    }

    const { data: contacts, error: fetchError } = await query;

    if (fetchError) {
      return NextResponse.json({ error: "Failed to fetch contacts" }, { status: 500 });
    }

    const duplicateGroups = findDuplicateGroups(contacts || []);

    const result: DedupePreviewResult = {
      preview: true,
      success: true,
      duplicateGroups: duplicateGroups.length,
      contactsToDelete: duplicateGroups.reduce((sum, g) => sum + g.duplicateIds.length, 0),
      examples: duplicateGroups.slice(0, 10).map((g) => ({
        primaryName: g.primaryName,
        duplicateNames: g.duplicateNames,
        matchReason: g.matchReason,
      })),
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("[Dedupe Preview] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

async function handleApply(): Promise<NextResponse> {
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
        { error: "You are not authorized to run data cleanup operations" },
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
    const adminClient = createAdminClient();
    const runId = crypto.randomUUID();

    // Fetch all contacts for the team
    let query = adminClient
      .from("contacts")
      .select("id, company_name, contact_name, phone, email, street, city, canton, postal_code, created_at, team_id, latitude, longitude, notes");

    if (teamId) {
      query = query.eq("team_id", teamId);
    }

    const { data: contacts, error: fetchError } = await query;

    if (fetchError) {
      return NextResponse.json({ error: "Failed to fetch contacts" }, { status: 500 });
    }

    const duplicateGroups = findDuplicateGroups(contacts || []);
    const errors: string[] = [];
    const merged = {
      contact_notes: 0,
      contact_persons: 0,
      vacancies: 0,
      user_contact_settings: 0,
      list_members: 0,
      email_drafts: 0,
      call_logs: 0,
    };
    let archived = 0;

    // Process each duplicate group
    for (const group of duplicateGroups) {
      try {
        await processDuplicateGroup(
          adminClient,
          group,
          contacts as ContactForDedupe[],
          user.id,
          teamId,
          runId,
          merged,
          errors
        );
        archived += group.duplicateIds.length;
      } catch (err) {
        errors.push(`Error processing group ${group.primaryName}: ${err}`);
      }
    }

    // Log the cleanup run
    await adminClient.from("contact_cleanup_runs").insert({
      id: runId,
      type: "dedupe_merge",
      team_id: teamId,
      executed_by: user.id,
      summary: {
        duplicateGroups: duplicateGroups.length,
        contactsDeleted: archived,
        merged,
        errors: errors.length,
      },
      status: errors.length > 0 ? "partial" : "completed",
    });

    const result: DedupeApplyResult = {
      preview: false,
      success: true,
      runId,
      duplicateGroups: duplicateGroups.length,
      contactsToDelete: archived,
      archived,
      merged,
      errors,
      examples: duplicateGroups.slice(0, 5).map((g) => ({
        primaryName: g.primaryName,
        duplicateNames: g.duplicateNames,
        matchReason: g.matchReason,
      })),
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("[Dedupe Apply] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

async function processDuplicateGroup(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminClient: any,
  group: DuplicateGroup,
  contacts: ContactForDedupe[],
  userId: string,
  teamId: string | null,
  runId: string,
  merged: DedupeApplyResult["merged"],
  errors: string[]
): Promise<void> {
  const primary = contacts.find((c) => c.id === group.primaryId);
  if (!primary) {
    errors.push(`Primary contact not found: ${group.primaryId}`);
    return;
  }

  const duplicates = group.duplicateIds
    .map((id) => contacts.find((c) => c.id === id))
    .filter((c): c is ContactForDedupe => c !== undefined);

  // For each duplicate:
  for (const duplicate of duplicates) {
    // 1. Archive the duplicate with all its related data
    await archiveContact(adminClient, duplicate.id, userId, teamId, runId, group.primaryId, errors);

    // 2. Merge scalar fields into primary
    const fieldUpdates = mergeContactFields(primary, duplicate);
    if (Object.keys(fieldUpdates).length > 0) {
      const { error } = await adminClient
        .from("contacts")
        .update(fieldUpdates)
        .eq("id", primary.id);

      if (error) {
        errors.push(`Failed to merge fields for ${primary.id}: ${error.message}`);
      }
    }

    // 3. Re-point related records from duplicate to primary
    await rePointRelatedRecords(adminClient, duplicate.id, primary.id, merged, errors);

    // 4. Delete the duplicate contact
    const { error: deleteError } = await adminClient
      .from("contacts")
      .delete()
      .eq("id", duplicate.id);

    if (deleteError) {
      errors.push(`Failed to delete duplicate ${duplicate.id}: ${deleteError.message}`);
    }
  }
}

async function archiveContact(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminClient: any,
  contactId: string,
  userId: string,
  teamId: string | null,
  runId: string,
  mergedIntoId: string,
  errors: string[]
): Promise<void> {
  // Fetch the contact and all related data
  const { data: contact } = await adminClient
    .from("contacts")
    .select("*")
    .eq("id", contactId)
    .single();

  if (!contact) {
    errors.push(`Contact not found for archiving: ${contactId}`);
    return;
  }

  // Fetch related data
  const [
    { data: persons },
    { data: notes },
    { data: vacancies },
    { data: settings },
    { data: listMembers },
    { data: emailDrafts },
    { data: callLogs },
  ] = await Promise.all([
    adminClient.from("contact_persons").select("*").eq("contact_id", contactId),
    adminClient.from("contact_notes").select("*").eq("contact_id", contactId),
    adminClient.from("vacancies").select("*").eq("contact_id", contactId),
    adminClient.from("user_contact_settings").select("*").eq("contact_id", contactId),
    adminClient.from("list_members").select("*").eq("contact_id", contactId),
    adminClient.from("candidate_company_email_drafts").select("*").eq("company_id", contactId),
    adminClient.from("contact_call_logs").select("*").eq("contact_id", contactId),
  ]);

  // Insert into archive
  const { error: archiveError } = await adminClient.from("deleted_contacts_archive").insert({
    original_contact_id: contactId,
    team_id: teamId,
    deleted_by: userId,
    reason: "dedupe_merge",
    run_id: runId,
    merged_into_contact_id: mergedIntoId,
    contact_snapshot: contact,
    contact_persons_snapshot: persons || [],
    contact_notes_snapshot: notes || [],
    vacancies_snapshot: vacancies || [],
    user_contact_settings_snapshot: settings || [],
    list_members_snapshot: listMembers || [],
    email_drafts_snapshot: emailDrafts || [],
    call_logs_snapshot: callLogs || [],
  });

  if (archiveError) {
    errors.push(`Failed to archive contact ${contactId}: ${archiveError.message}`);
  }
}

async function rePointRelatedRecords(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminClient: any,
  fromId: string,
  toId: string,
  merged: DedupeApplyResult["merged"],
  errors: string[]
): Promise<void> {
  // 1. Contact notes - simple re-point
  const { data: notes, error: notesError } = await adminClient
    .from("contact_notes")
    .update({ contact_id: toId })
    .eq("contact_id", fromId)
    .select("id");

  if (notesError) {
    errors.push(`Failed to move notes: ${notesError.message}`);
  } else {
    merged.contact_notes += notes?.length || 0;
  }

  // 2. Contact persons - simple re-point
  const { data: persons, error: personsError } = await adminClient
    .from("contact_persons")
    .update({ contact_id: toId })
    .eq("contact_id", fromId)
    .select("id");

  if (personsError) {
    errors.push(`Failed to move persons: ${personsError.message}`);
  } else {
    merged.contact_persons += persons?.length || 0;
  }

  // 3. Vacancies - simple re-point
  const { data: vacancies, error: vacanciesError } = await adminClient
    .from("vacancies")
    .update({ contact_id: toId })
    .eq("contact_id", fromId)
    .select("id");

  if (vacanciesError) {
    errors.push(`Failed to move vacancies: ${vacanciesError.message}`);
  } else {
    merged.vacancies += vacancies?.length || 0;
  }

  // 4. User contact settings - handle PK conflicts
  const { data: settings } = await adminClient
    .from("user_contact_settings")
    .select("*")
    .eq("contact_id", fromId);

  for (const setting of settings || []) {
    // Check if setting already exists for the target
    const { data: existing } = await adminClient
      .from("user_contact_settings")
      .select("*")
      .eq("user_id", setting.user_id)
      .eq("contact_id", toId)
      .single();

    if (existing) {
      // Merge: keep the one with more recent updated_at, fill missing fields
      const existingDate = new Date(existing.updated_at || 0).getTime();
      const settingDate = new Date(setting.updated_at || 0).getTime();

      if (settingDate > existingDate) {
        await adminClient
          .from("user_contact_settings")
          .update({
            status: setting.status || existing.status,
            follow_up_at: setting.follow_up_at || existing.follow_up_at,
            follow_up_note: setting.follow_up_note || existing.follow_up_note,
            updated_at: setting.updated_at,
          })
          .eq("user_id", setting.user_id)
          .eq("contact_id", toId);
      }
      // Delete the old one
      await adminClient
        .from("user_contact_settings")
        .delete()
        .eq("user_id", setting.user_id)
        .eq("contact_id", fromId);
    } else {
      // No conflict, just re-point
      await adminClient
        .from("user_contact_settings")
        .update({ contact_id: toId })
        .eq("user_id", setting.user_id)
        .eq("contact_id", fromId);
    }
    merged.user_contact_settings++;
  }

  // 5. List members - handle unique constraint
  const { data: listMembers } = await adminClient
    .from("list_members")
    .select("*")
    .eq("contact_id", fromId);

  for (const member of listMembers || []) {
    const { data: existing } = await adminClient
      .from("list_members")
      .select("id")
      .eq("list_id", member.list_id)
      .eq("contact_id", toId)
      .single();

    if (existing) {
      // Already in the list, just delete the duplicate
      await adminClient.from("list_members").delete().eq("id", member.id);
    } else {
      await adminClient
        .from("list_members")
        .update({ contact_id: toId })
        .eq("id", member.id);
    }
    merged.list_members++;
  }

  // 6. Email drafts - handle unique constraint on (candidate_id, company_id)
  const { data: drafts } = await adminClient
    .from("candidate_company_email_drafts")
    .select("*")
    .eq("company_id", fromId);

  for (const draft of drafts || []) {
    const { data: existing } = await adminClient
      .from("candidate_company_email_drafts")
      .select("*")
      .eq("candidate_id", draft.candidate_id)
      .eq("company_id", toId)
      .single();

    if (existing) {
      // Merge: prefer newer drafts
      const updates: Record<string, unknown> = {};

      if (draft.standard_updated_at && (!existing.standard_updated_at || 
          new Date(draft.standard_updated_at) > new Date(existing.standard_updated_at))) {
        updates.standard_body = draft.standard_body;
        updates.standard_subject = draft.standard_subject;
        updates.standard_updated_at = draft.standard_updated_at;
      }

      if (draft.best_updated_at && (!existing.best_updated_at || 
          new Date(draft.best_updated_at) > new Date(existing.best_updated_at))) {
        updates.best_body = draft.best_body;
        updates.best_subject = draft.best_subject;
        updates.best_updated_at = draft.best_updated_at;
        updates.best_research_summary = draft.best_research_summary;
        updates.best_research_confidence = draft.best_research_confidence;
      }

      if (Object.keys(updates).length > 0) {
        await adminClient
          .from("candidate_company_email_drafts")
          .update(updates)
          .eq("id", existing.id);
      }

      await adminClient.from("candidate_company_email_drafts").delete().eq("id", draft.id);
    } else {
      await adminClient
        .from("candidate_company_email_drafts")
        .update({ company_id: toId })
        .eq("id", draft.id);
    }
    merged.email_drafts++;
  }

  // 7. Call logs - simple re-point
  const { data: callLogs, error: callLogsError } = await adminClient
    .from("contact_call_logs")
    .update({ contact_id: toId })
    .eq("contact_id", fromId)
    .select("id");

  if (callLogsError) {
    errors.push(`Failed to move call logs: ${callLogsError.message}`);
  } else {
    merged.call_logs += callLogs?.length || 0;
  }

  // 8. Email threads (optional linkage) - simple re-point
  await adminClient
    .from("email_threads")
    .update({ linked_contact_id: toId })
    .eq("linked_contact_id", fromId);

  // 9. WhatsApp conversations - simple re-point
  await adminClient
    .from("whatsapp_conversations")
    .update({ linked_contact_id: toId })
    .eq("linked_contact_id", fromId);

  // 10. WhatsApp optins - simple re-point
  await adminClient
    .from("whatsapp_optins")
    .update({ linked_contact_id: toId })
    .eq("linked_contact_id", fromId);
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  fixContactEncoding,
  fixObjectEncoding,
  hasEncodingIssues,
} from "@/lib/utils/fix-encoding";
import { isCleanupAllowed } from "@/lib/utils/cleanup-auth";

interface TableStats {
  scanned: number;
  withIssues: number;
  fixed: number;
  errors: string[];
  examples: Array<{ id: string; field: string; before: string; after: string }>;
}

interface EncodingFixResult {
  success: boolean;
  tables: Record<string, TableStats>;
  totalFixed: number;
  totalScanned: number;
  runId?: string;
}

/**
 * GET /api/contacts/fix-encoding
 * Preview: scan for encoding issues without making changes
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is allowed to run cleanup
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

    const result = await scanForEncodingIssues(supabase, teamId, false);

    return NextResponse.json({
      preview: true,
      ...result,
    });
  } catch (error) {
    console.error("[Fix Encoding Preview] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/contacts/fix-encoding
 * Apply: fix encoding issues in all contacts and related tables
 */
export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is allowed to run cleanup
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

    // Use admin client for writes to bypass RLS edge cases
    const adminClient = createAdminClient();

    const result = await scanForEncodingIssues(adminClient, teamId, true);

    // Log the cleanup run
    const runId = crypto.randomUUID();
    await adminClient.from("contact_cleanup_runs").insert({
      id: runId,
      type: "encoding_fix",
      team_id: teamId,
      executed_by: user.id,
      summary: result,
      status: result.totalFixed > 0 ? "completed" : "completed",
    });

    return NextResponse.json({
      preview: false,
      runId,
      ...result,
    });
  } catch (error) {
    console.error("[Fix Encoding Apply] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * Scan (and optionally fix) encoding issues across all relevant tables
 */
async function scanForEncodingIssues(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  teamId: string | null,
  applyFixes: boolean
): Promise<EncodingFixResult> {
  const tables: Record<string, TableStats> = {};
  let totalFixed = 0;
  let totalScanned = 0;

  // 1. Contacts table
  const contactsStats = await processContacts(supabase, teamId, applyFixes);
  tables.contacts = contactsStats;
  totalFixed += contactsStats.fixed;
  totalScanned += contactsStats.scanned;

  // 2. Contact persons table
  const personsStats = await processContactPersons(supabase, teamId, applyFixes);
  tables.contact_persons = personsStats;
  totalFixed += personsStats.fixed;
  totalScanned += personsStats.scanned;

  // 3. Contact notes table
  const notesStats = await processContactNotes(supabase, teamId, applyFixes);
  tables.contact_notes = notesStats;
  totalFixed += notesStats.fixed;
  totalScanned += notesStats.scanned;

  // 4. Vacancies table
  const vacanciesStats = await processVacancies(supabase, teamId, applyFixes);
  tables.vacancies = vacanciesStats;
  totalFixed += vacanciesStats.fixed;
  totalScanned += vacanciesStats.scanned;

  // 5. Email drafts table
  const draftsStats = await processEmailDrafts(supabase, teamId, applyFixes);
  tables.candidate_company_email_drafts = draftsStats;
  totalFixed += draftsStats.fixed;
  totalScanned += draftsStats.scanned;

  return {
    success: true,
    tables,
    totalFixed,
    totalScanned,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processContacts(supabase: any, teamId: string | null, applyFixes: boolean): Promise<TableStats> {
  const stats: TableStats = { scanned: 0, withIssues: 0, fixed: 0, errors: [], examples: [] };

  // Build query with team filter
  let query = supabase
    .from("contacts")
    .select("id, company_name, contact_name, street, city, email, notes");

  if (teamId) {
    query = query.eq("team_id", teamId);
  }

  const { data: contacts, error } = await query;

  if (error) {
    stats.errors.push(`Failed to fetch contacts: ${error.message}`);
    return stats;
  }

  stats.scanned = contacts?.length || 0;

  for (const contact of contacts || []) {
    const fixes = fixContactEncoding(contact);

    if (fixes) {
      stats.withIssues++;

      // Collect examples (max 5)
      if (stats.examples.length < 5) {
        const firstField = Object.keys(fixes)[0] as keyof typeof fixes;
        stats.examples.push({
          id: contact.id,
          field: firstField,
          before: contact[firstField] || "",
          after: fixes[firstField] || "",
        });
      }

      if (applyFixes) {
        const { error: updateError } = await supabase
          .from("contacts")
          .update(fixes)
          .eq("id", contact.id);

        if (updateError) {
          stats.errors.push(`Failed to update contact ${contact.id}: ${updateError.message}`);
        } else {
          stats.fixed++;
        }
      }
    }
  }

  return stats;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processContactPersons(supabase: any, teamId: string | null, applyFixes: boolean): Promise<TableStats> {
  const stats: TableStats = { scanned: 0, withIssues: 0, fixed: 0, errors: [], examples: [] };

  // Get contact IDs for the team first
  let contactIdsQuery = supabase.from("contacts").select("id");
  if (teamId) {
    contactIdsQuery = contactIdsQuery.eq("team_id", teamId);
  }

  const { data: contactIds } = await contactIdsQuery;
  const ids = (contactIds || []).map((c: { id: string }) => c.id);

  if (ids.length === 0) return stats;

  const { data: persons, error } = await supabase
    .from("contact_persons")
    .select("id, contact_id, first_name, last_name, role, email")
    .in("contact_id", ids);

  if (error) {
    stats.errors.push(`Failed to fetch contact_persons: ${error.message}`);
    return stats;
  }

  stats.scanned = persons?.length || 0;

  for (const person of persons || []) {
    const fixes = fixObjectEncoding(person, ["first_name", "last_name", "role", "email"]);

    if (fixes && Object.keys(fixes).length > 0) {
      stats.withIssues++;

      if (stats.examples.length < 5) {
        const firstField = Object.keys(fixes)[0];
        stats.examples.push({
          id: person.id,
          field: firstField,
          before: person[firstField] || "",
          after: (fixes as Record<string, string>)[firstField] || "",
        });
      }

      if (applyFixes) {
        const { error: updateError } = await supabase
          .from("contact_persons")
          .update(fixes)
          .eq("id", person.id);

        if (updateError) {
          stats.errors.push(`Failed to update contact_person ${person.id}: ${updateError.message}`);
        } else {
          stats.fixed++;
        }
      }
    }
  }

  return stats;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processContactNotes(supabase: any, teamId: string | null, applyFixes: boolean): Promise<TableStats> {
  const stats: TableStats = { scanned: 0, withIssues: 0, fixed: 0, errors: [], examples: [] };

  // Get contact IDs for the team
  let contactIdsQuery = supabase.from("contacts").select("id");
  if (teamId) {
    contactIdsQuery = contactIdsQuery.eq("team_id", teamId);
  }

  const { data: contactIds } = await contactIdsQuery;
  const ids = (contactIds || []).map((c: { id: string }) => c.id);

  if (ids.length === 0) return stats;

  const { data: notes, error } = await supabase
    .from("contact_notes")
    .select("id, contact_id, content")
    .in("contact_id", ids);

  if (error) {
    stats.errors.push(`Failed to fetch contact_notes: ${error.message}`);
    return stats;
  }

  stats.scanned = notes?.length || 0;

  for (const note of notes || []) {
    if (note.content && hasEncodingIssues(note.content)) {
      stats.withIssues++;
      const fixes = fixObjectEncoding(note, ["content"]);

      if (fixes && stats.examples.length < 5) {
        stats.examples.push({
          id: note.id,
          field: "content",
          before: note.content.substring(0, 100) + (note.content.length > 100 ? "..." : ""),
          after: ((fixes as { content?: string }).content || "").substring(0, 100) + "...",
        });
      }

      if (applyFixes && fixes) {
        const { error: updateError } = await supabase
          .from("contact_notes")
          .update(fixes)
          .eq("id", note.id);

        if (updateError) {
          stats.errors.push(`Failed to update contact_note ${note.id}: ${updateError.message}`);
        } else {
          stats.fixed++;
        }
      }
    }
  }

  return stats;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processVacancies(supabase: any, teamId: string | null, applyFixes: boolean): Promise<TableStats> {
  const stats: TableStats = { scanned: 0, withIssues: 0, fixed: 0, errors: [], examples: [] };

  // Get contact IDs for the team
  let contactIdsQuery = supabase.from("contacts").select("id");
  if (teamId) {
    contactIdsQuery = contactIdsQuery.eq("team_id", teamId);
  }

  const { data: contactIds } = await contactIdsQuery;
  const ids = (contactIds || []).map((c: { id: string }) => c.id);

  // Vacancies can also have null contact_id, so we need to fetch those too
  let query = supabase
    .from("vacancies")
    .select("id, contact_id, title, description, city");

  if (ids.length > 0) {
    // Fetch vacancies linked to team's contacts or with null contact_id
    query = query.or(`contact_id.in.(${ids.join(",")}),contact_id.is.null`);
  }

  const { data: vacancies, error } = await query;

  if (error) {
    stats.errors.push(`Failed to fetch vacancies: ${error.message}`);
    return stats;
  }

  stats.scanned = vacancies?.length || 0;

  for (const vacancy of vacancies || []) {
    const fixes = fixObjectEncoding(vacancy, ["title", "description", "city"]);

    if (fixes && Object.keys(fixes).length > 0) {
      stats.withIssues++;

      if (stats.examples.length < 5) {
        const firstField = Object.keys(fixes)[0];
        stats.examples.push({
          id: vacancy.id,
          field: firstField,
          before: (vacancy[firstField] || "").substring(0, 100),
          after: ((fixes as Record<string, string>)[firstField] || "").substring(0, 100),
        });
      }

      if (applyFixes) {
        const { error: updateError } = await supabase
          .from("vacancies")
          .update(fixes)
          .eq("id", vacancy.id);

        if (updateError) {
          stats.errors.push(`Failed to update vacancy ${vacancy.id}: ${updateError.message}`);
        } else {
          stats.fixed++;
        }
      }
    }
  }

  return stats;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processEmailDrafts(supabase: any, teamId: string | null, applyFixes: boolean): Promise<TableStats> {
  const stats: TableStats = { scanned: 0, withIssues: 0, fixed: 0, errors: [], examples: [] };

  // Get contact IDs for the team
  let contactIdsQuery = supabase.from("contacts").select("id");
  if (teamId) {
    contactIdsQuery = contactIdsQuery.eq("team_id", teamId);
  }

  const { data: contactIds } = await contactIdsQuery;
  const ids = (contactIds || []).map((c: { id: string }) => c.id);

  if (ids.length === 0) return stats;

  const { data: drafts, error } = await supabase
    .from("candidate_company_email_drafts")
    .select("id, company_id, standard_body, standard_subject, best_body, best_subject")
    .in("company_id", ids);

  if (error) {
    stats.errors.push(`Failed to fetch email_drafts: ${error.message}`);
    return stats;
  }

  stats.scanned = drafts?.length || 0;

  for (const draft of drafts || []) {
    const fixes = fixObjectEncoding(draft, [
      "standard_body",
      "standard_subject",
      "best_body",
      "best_subject",
    ]);

    if (fixes && Object.keys(fixes).length > 0) {
      stats.withIssues++;

      if (stats.examples.length < 5) {
        const firstField = Object.keys(fixes)[0];
        stats.examples.push({
          id: draft.id,
          field: firstField,
          before: (draft[firstField] || "").substring(0, 100),
          after: ((fixes as Record<string, string>)[firstField] || "").substring(0, 100),
        });
      }

      if (applyFixes) {
        const { error: updateError } = await supabase
          .from("candidate_company_email_drafts")
          .update(fixes)
          .eq("id", draft.id);

        if (updateError) {
          stats.errors.push(`Failed to update email_draft ${draft.id}: ${updateError.message}`);
        } else {
          stats.fixed++;
        }
      }
    }
  }

  return stats;
}

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { respondError, respondSuccess } from "@/lib/utils/api-response";

export interface SearchResultContact {
  id: string;
  type: "contact";
  company_name: string;
  contact_name: string | null;
  email: string | null;
  canton: string | null;
  team_id: string | null;
  team: { name: string; color: string } | null;
}

export interface SearchResultTma {
  id: string;
  type: "tma";
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  position_title: string | null;
  canton: string | null;
  team_id: string | null;
  team: { name: string; color: string } | null;
}

export type SearchResult = SearchResultContact | SearchResultTma;

const MAX_RESULTS_PER_TYPE = 5;

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return respondError("Unauthorized", 401);
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.trim();

    if (!query || query.length < 2) {
      return respondSuccess({ contacts: [], tma: [] });
    }

    const searchPattern = `%${query}%`;

    // Search contacts across ALL teams
    const { data: contacts, error: contactsError } = await supabase
      .from("contacts")
      .select(`
        id,
        company_name,
        contact_name,
        email,
        canton,
        team_id
      `)
      .or(`company_name.ilike.${searchPattern},contact_name.ilike.${searchPattern},email.ilike.${searchPattern}`)
      .limit(MAX_RESULTS_PER_TYPE);

    if (contactsError) {
      console.error("[Search] Contacts error:", contactsError);
    }

    // Search TMA candidates across ALL teams
    const { data: tma, error: tmaError } = await supabase
      .from("tma_candidates")
      .select(`
        id,
        first_name,
        last_name,
        email,
        phone,
        position_title,
        canton,
        team_id
      `)
      .or(`first_name.ilike.${searchPattern},last_name.ilike.${searchPattern},email.ilike.${searchPattern},phone.ilike.${searchPattern}`)
      .limit(MAX_RESULTS_PER_TYPE);

    if (tmaError) {
      console.error("[Search] TMA error:", tmaError);
    }

    // Get unique team IDs from results
    const teamIds = new Set<string>();
    for (const c of contacts || []) {
      if (c.team_id) teamIds.add(c.team_id);
    }
    for (const t of tma || []) {
      if (t.team_id) teamIds.add(t.team_id);
    }

    // Fetch team info for all team IDs
    let teamsMap: Record<string, { name: string; color: string }> = {};
    if (teamIds.size > 0) {
      const { data: teams } = await supabase
        .from("teams")
        .select("id, name, color")
        .in("id", Array.from(teamIds));

      if (teams) {
        teamsMap = Object.fromEntries(
          teams.map((t) => [t.id, { name: t.name, color: t.color || "#6B7280" }])
        );
      }
    }

    // Transform contacts with team info
    const contactResults: SearchResultContact[] = (contacts || []).map((c) => ({
      id: c.id,
      type: "contact" as const,
      company_name: c.company_name,
      contact_name: c.contact_name,
      email: c.email,
      canton: c.canton,
      team_id: c.team_id,
      team: c.team_id ? teamsMap[c.team_id] || null : null,
    }));

    // Transform TMA with team info
    const tmaResults: SearchResultTma[] = (tma || []).map((t) => ({
      id: t.id,
      type: "tma" as const,
      first_name: t.first_name,
      last_name: t.last_name,
      email: t.email,
      phone: t.phone,
      position_title: t.position_title,
      canton: t.canton,
      team_id: t.team_id,
      team: t.team_id ? teamsMap[t.team_id] || null : null,
    }));

    return respondSuccess({
      contacts: contactResults,
      tma: tmaResults,
    });
  } catch (error) {
    console.error("[Search] Unexpected error:", error);
    return respondError("Search failed", 500);
  }
}

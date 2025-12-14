import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { respondError, respondSuccess } from "@/lib/utils/api-response";

interface RecipientResult {
  type: "contact" | "tma" | "user";
  id: string;
  label: string;
  email: string;
  secondary?: string; // company name, position, team, etc.
}

const MAX_RESULTS = 15;

/**
 * GET /api/email/recipients?q=...&limit=...
 * Search for email recipients across Contacts, TMA candidates, and Users
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return respondError("Unauthorized", 401);
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.trim();
    const limit = Math.min(
      parseInt(searchParams.get("limit") || String(MAX_RESULTS), 10),
      50
    );

    if (!query || query.length < 1) {
      return respondSuccess({ recipients: [] });
    }

    const searchPattern = `%${query}%`;
    const results: RecipientResult[] = [];

    // 1) Search Contacts (companies) with email
    const { data: contacts } = await supabase
      .from("contacts")
      .select("id, company_name, contact_name, email")
      .not("email", "is", null)
      .neq("email", "")
      .or(`company_name.ilike.${searchPattern},contact_name.ilike.${searchPattern},email.ilike.${searchPattern}`)
      .limit(limit);

    if (contacts) {
      for (const c of contacts) {
        if (c.email) {
          results.push({
            type: "contact",
            id: c.id,
            label: c.contact_name || c.company_name,
            email: c.email,
            secondary: c.company_name,
          });
        }
      }
    }

    // 2) Search TMA candidates with email
    const { data: tma } = await supabase
      .from("tma_candidates")
      .select("id, first_name, last_name, email, position_title")
      .not("email", "is", null)
      .neq("email", "")
      .or(`first_name.ilike.${searchPattern},last_name.ilike.${searchPattern},email.ilike.${searchPattern}`)
      .limit(limit);

    if (tma) {
      for (const t of tma) {
        if (t.email) {
          results.push({
            type: "tma",
            id: t.id,
            label: `${t.first_name} ${t.last_name}`.trim(),
            email: t.email,
            secondary: t.position_title || undefined,
          });
        }
      }
    }

    // 3) Search Users (profiles) with email
    const { data: users } = await supabase
      .from("profiles")
      .select("id, full_name, email, avatar_url")
      .not("email", "is", null)
      .neq("email", "")
      .or(`full_name.ilike.${searchPattern},email.ilike.${searchPattern}`)
      .limit(limit);

    if (users) {
      for (const u of users) {
        if (u.email) {
          results.push({
            type: "user",
            id: u.id,
            label: u.full_name || u.email,
            email: u.email,
            secondary: "Team Member",
          });
        }
      }
    }

    // Sort: exact email match first, then prefix match, then alphabetical by label
    const queryLower = query.toLowerCase();
    results.sort((a, b) => {
      const aEmailLower = a.email.toLowerCase();
      const bEmailLower = b.email.toLowerCase();
      const aLabelLower = a.label.toLowerCase();
      const bLabelLower = b.label.toLowerCase();

      // Exact email match
      const aExact = aEmailLower === queryLower ? 0 : 1;
      const bExact = bEmailLower === queryLower ? 0 : 1;
      if (aExact !== bExact) return aExact - bExact;

      // Email starts with query
      const aPrefix = aEmailLower.startsWith(queryLower) ? 0 : 1;
      const bPrefix = bEmailLower.startsWith(queryLower) ? 0 : 1;
      if (aPrefix !== bPrefix) return aPrefix - bPrefix;

      // Label starts with query
      const aLabelPrefix = aLabelLower.startsWith(queryLower) ? 0 : 1;
      const bLabelPrefix = bLabelLower.startsWith(queryLower) ? 0 : 1;
      if (aLabelPrefix !== bLabelPrefix) return aLabelPrefix - bLabelPrefix;

      // Alphabetical by label
      return aLabelLower.localeCompare(bLabelLower);
    });

    // Dedupe by email (keep first occurrence)
    const seen = new Set<string>();
    const deduped: RecipientResult[] = [];
    for (const r of results) {
      const emailLower = r.email.toLowerCase();
      if (!seen.has(emailLower)) {
        seen.add(emailLower);
        deduped.push(r);
      }
    }

    return respondSuccess({
      recipients: deduped.slice(0, limit),
    });
  } catch (err) {
    console.error("[Recipients API] Error:", err);
    return respondError("Failed to search recipients", 500);
  }
}


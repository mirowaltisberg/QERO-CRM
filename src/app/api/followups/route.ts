import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { respondError, respondSuccess } from "@/lib/utils/api-response";

interface ContactJoin {
  id: string;
  company_name?: string;
  contact_name?: string;
}

interface TmaJoin {
  id: string;
  first_name?: string;
  last_name?: string;
}

// GET /api/followups - Get due follow-ups for the current user (personal settings)
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return respondError("Unauthorized", 401);

    const adminSupabase = createAdminClient();
    const now = new Date().toISOString();

    // Get due contact follow-ups for THIS user
    const { data: contactSettings } = await adminSupabase
      .from("user_contact_settings")
      .select(`
        contact_id,
        follow_up_at,
        follow_up_note,
        contacts:contact_id (id, company_name, contact_name)
      `)
      .eq("user_id", user.id)
      .lte("follow_up_at", now)
      .not("follow_up_at", "is", null)
      .order("follow_up_at", { ascending: true })
      .limit(10);

    // Get due TMA follow-ups for THIS user
    const { data: tmaSettings } = await adminSupabase
      .from("user_tma_settings")
      .select(`
        tma_id,
        follow_up_at,
        follow_up_note,
        tma_candidates:tma_id (id, first_name, last_name)
      `)
      .eq("user_id", user.id)
      .lte("follow_up_at", now)
      .not("follow_up_at", "is", null)
      .order("follow_up_at", { ascending: true })
      .limit(10);

    const followups = [
      ...(contactSettings || []).map(s => {
        // Supabase returns the join as an object (not array) for single FK relations
        const c = s.contacts as unknown as ContactJoin | null;
        return {
          id: s.contact_id,
          type: "contact" as const,
          name: c?.company_name || c?.contact_name || "Unbekannt",
          follow_up_at: s.follow_up_at,
          note: s.follow_up_note,
        };
      }),
      ...(tmaSettings || []).map(s => {
        const t = s.tma_candidates as unknown as TmaJoin | null;
        return {
          id: s.tma_id,
          type: "tma" as const,
          name: `${t?.first_name || ""} ${t?.last_name || ""}`.trim() || "Unbekannt",
          follow_up_at: s.follow_up_at,
          note: s.follow_up_note,
        };
      }),
    ].sort((a, b) => new Date(a.follow_up_at!).getTime() - new Date(b.follow_up_at!).getTime());

    return respondSuccess(followups);
  } catch (err) {
    console.error("GET /api/followups error:", err);
    return respondError("Failed to fetch follow-ups", 500);
  }
}

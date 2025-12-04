import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { respondError, respondSuccess } from "@/lib/utils/api-response";

// GET /api/followups - Get due follow-ups for the current user
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return respondError("Unauthorized", 401);

    const adminSupabase = createAdminClient();
    const now = new Date().toISOString();

    // Get due contact follow-ups
    const { data: contacts } = await adminSupabase
      .from("contacts")
      .select("id, company_name, contact_name, follow_up_at, follow_up_note")
      .lte("follow_up_at", now)
      .not("follow_up_at", "is", null)
      .order("follow_up_at", { ascending: true })
      .limit(10);

    // Get due TMA follow-ups
    const { data: tmas } = await adminSupabase
      .from("tma_candidates")
      .select("id, first_name, last_name, follow_up_at, follow_up_note")
      .lte("follow_up_at", now)
      .not("follow_up_at", "is", null)
      .order("follow_up_at", { ascending: true })
      .limit(10);

    const followups = [
      ...(contacts || []).map(c => ({
        id: c.id,
        type: "contact" as const,
        name: c.company_name || c.contact_name || "Unbekannt",
        follow_up_at: c.follow_up_at,
        note: c.follow_up_note,
      })),
      ...(tmas || []).map(t => ({
        id: t.id,
        type: "tma" as const,
        name: `${t.first_name || ""} ${t.last_name || ""}`.trim() || "Unbekannt",
        follow_up_at: t.follow_up_at,
        note: t.follow_up_note,
      })),
    ].sort((a, b) => new Date(a.follow_up_at!).getTime() - new Date(b.follow_up_at!).getTime());

    return respondSuccess(followups);
  } catch (err) {
    console.error("GET /api/followups error:", err);
    return respondError("Failed to fetch follow-ups", 500);
  }
}

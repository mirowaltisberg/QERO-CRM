import { NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { respondError, respondSuccess } from "@/lib/utils/api-response";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function getBearerToken(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return null;

  const [scheme, token] = authHeader.split(" ");
  if (scheme?.toLowerCase() === "bearer" && token) {
    return token.trim();
  }

  return null;
}

async function resolveUser(
  request: NextRequest,
  adminSupabase: ReturnType<typeof createAdminClient>
): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    return user;
  }

  const bearerToken = getBearerToken(request);
  if (bearerToken) {
    const { data: tokenUser, error } = await adminSupabase.auth.getUser(bearerToken);
    if (!error && tokenUser?.user) {
      return tokenUser.user;
    }
  }

  return null;
}

// GET /api/contacts/[id]/call-logs - Get latest call log for a contact
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id: contactId } = await context.params;
    const adminSupabase = createAdminClient();
    const user = await resolveUser(request, adminSupabase);

    if (!user) {
      return respondError("Unauthorized", 401);
    }

    // Get the latest call log with user info
    const { data: callLog, error } = await adminSupabase
      .from("contact_call_logs")
      .select(`
        id,
        called_at,
        user_id,
        caller:profiles!contact_call_logs_user_id_fkey (
          id,
          full_name,
          avatar_url
        )
      `)
      .eq("contact_id", contactId)
      .order("called_at", { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== "PGRST116") {
      // PGRST116 = no rows returned, which is fine
      console.error("[Call Logs] Error fetching:", error);
      return respondError("Failed to fetch call log", 500);
    }

    return respondSuccess(callLog || null);
  } catch (err) {
    console.error("[Call Logs] Error:", err);
    return respondError("Failed to fetch call log", 500);
  }
}

// POST /api/contacts/[id]/call-logs - Log a new call
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id: contactId } = await context.params;
    const adminSupabase = createAdminClient();
    const user = await resolveUser(request, adminSupabase);

    if (!user) {
      return respondError("Unauthorized", 401);
    }

    // Verify contact exists and belongs to user's team
    const { data: profile } = await adminSupabase
      .from("profiles")
      .select("team_id")
      .eq("id", user.id)
      .single();

    if (!profile?.team_id) {
      return respondError("User has no team", 400);
    }

    const { data: contact } = await adminSupabase
      .from("contacts")
      .select("id, team_id")
      .eq("id", contactId)
      .eq("team_id", profile.team_id)
      .single();

    if (!contact) {
      return respondError("Contact not found", 404);
    }

    // Check for recent call log (prevent duplicates within 60 seconds)
    const sixtySecondsAgo = new Date(Date.now() - 60000).toISOString();
    const { data: recentLog } = await adminSupabase
      .from("contact_call_logs")
      .select("id")
      .eq("contact_id", contactId)
      .eq("user_id", user.id)
      .gte("called_at", sixtySecondsAgo)
      .limit(1)
      .single();

    if (recentLog) {
      // Already logged recently, just return success without creating duplicate
      return respondSuccess({ id: recentLog.id, duplicate: true });
    }

    // Create the call log
    const { data: callLog, error } = await adminSupabase
      .from("contact_call_logs")
      .insert({
        contact_id: contactId,
        user_id: user.id,
        called_at: new Date().toISOString(),
      })
      .select(`
        id,
        called_at,
        user_id,
        caller:profiles!contact_call_logs_user_id_fkey (
          id,
          full_name,
          avatar_url
        )
      `)
      .single();

    if (error) {
      console.error("[Call Logs] Error creating:", error);
      return respondError("Failed to create call log", 500);
    }

    return respondSuccess(callLog);
  } catch (err) {
    console.error("[Call Logs] Error:", err);
    return respondError("Failed to create call log", 500);
  }
}

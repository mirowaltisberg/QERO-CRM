import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const type = searchParams.get("type"); // "invite" for invited users
  const next = searchParams.get("next") ?? "/calling";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    
    if (!error && data.user) {
      // Check if this is an invited user that needs setup
      const isInvitedUser = type === "invite" || 
        data.user.user_metadata?.must_change_password === true ||
        data.user.user_metadata?.must_setup_2fa === true;

      if (isInvitedUser) {
        // Create profile for invited user if it doesn't exist
        const adminClient = createAdminClient();
        const { data: existingProfile } = await adminClient
          .from("profiles")
          .select("id")
          .eq("id", data.user.id)
          .single();

        if (!existingProfile) {
          // Create profile with onboarding flags
          await adminClient.from("profiles").insert({
            id: data.user.id,
            full_name: data.user.user_metadata?.full_name || data.user.email?.split("@")[0] || "User",
            phone: data.user.user_metadata?.phone || "",
            team_id: data.user.user_metadata?.team_id || null,
            must_change_password: true,
            must_setup_2fa: true,
            invited_by: null, // Will be set from invitation record if available
            invited_at: new Date().toISOString(),
          });

          // Mark invitation as accepted
          if (data.user.user_metadata?.invitation_id) {
            await adminClient
              .from("user_invitations")
              .update({
                status: "accepted",
                accepted_at: new Date().toISOString(),
              })
              .eq("id", data.user.user_metadata.invitation_id);
          }
        }

        // Redirect to setup page
        return NextResponse.redirect(`${origin}/setup-account`);
      }

      // Regular login - redirect to next page
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/login?error=auth_callback_error`);
}


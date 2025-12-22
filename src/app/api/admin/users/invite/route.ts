import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCleanupAllowed } from "@/lib/utils/cleanup-auth";
import { z } from "zod";

const InviteSchema = z.object({
  email: z.string().email("Invalid email address"),
  fullName: z.string().min(2, "Full name is required"),
  phone: z.string().optional(),
  teamId: z.string().min(1, "Team is required"),
  forceResend: z.boolean().optional(), // Delete existing user and resend invitation
});

/**
 * POST /api/admin/users/invite
 * 
 * Creates a new user invitation using Supabase's inviteUserByEmail.
 * The invited user receives a magic link and must set password + enable 2FA on first login.
 * 
 * Only admins (isCleanupAllowed) can use this endpoint.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is admin
    if (!isCleanupAllowed(user.email)) {
      return NextResponse.json({ error: "Only admins can invite users" }, { status: 403 });
    }

    // Parse and validate request body
    const body = await request.json();
    console.log("[Invite] Request body:", JSON.stringify(body));
    
    const parsed = InviteSchema.safeParse(body);

    if (!parsed.success) {
      console.log("[Invite] Validation failed:", JSON.stringify(parsed.error.issues));
      const errorMessage = parsed.error.issues[0]?.message || "Invalid input";
      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }

    const { email, fullName, phone, teamId, forceResend } = parsed.data;

    const adminClient = createAdminClient();

    // Verify team exists
    const { data: team, error: teamError } = await adminClient
      .from("teams")
      .select("id, name")
      .eq("id", teamId)
      .single();

    if (teamError || !team) {
      console.log("[Invite] Team not found:", teamId, teamError);
      return NextResponse.json(
        { error: `Team not found: ${teamId}` },
        { status: 400 }
      );
    }

    // Check if user already exists
    const { data: existingUsers } = await adminClient.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(u => u.email === email);

    if (existingUser) {
      if (forceResend) {
        // Delete existing user from auth (this will cascade to profiles via trigger or we delete manually)
        console.log("[Invite] Force resend - deleting existing user:", existingUser.id);
        
        // Delete from profiles first
        await adminClient
          .from("profiles")
          .delete()
          .eq("id", existingUser.id);
        
        // Delete from auth
        const { error: deleteError } = await adminClient.auth.admin.deleteUser(existingUser.id);
        if (deleteError) {
          console.error("[Invite] Error deleting existing user:", deleteError);
          return NextResponse.json(
            { error: `Failed to delete existing user: ${deleteError.message}` },
            { status: 500 }
          );
        }
        
        console.log("[Invite] Successfully deleted existing user");
      } else {
        return NextResponse.json(
          { 
            error: "A user with this email already exists",
            existingUser: true,
            canForceResend: true,
          },
          { status: 409 }
        );
      }
    }

    // Check if there's a pending invitation (and cancel it if force resend)
    const { data: existingInvitation } = await adminClient
      .from("user_invitations")
      .select("id, status")
      .eq("email", email)
      .eq("status", "pending")
      .single();

    if (existingInvitation) {
      if (forceResend) {
        // Cancel the existing invitation
        await adminClient
          .from("user_invitations")
          .update({ status: "cancelled" })
          .eq("id", existingInvitation.id);
        console.log("[Invite] Cancelled existing invitation:", existingInvitation.id);
      } else {
        return NextResponse.json(
          { 
            error: "An invitation is already pending for this email",
            pendingInvitation: true,
            canForceResend: true,
          },
          { status: 409 }
        );
      }
    }

    // Create invitation record
    const { data: invitation, error: invitationError } = await adminClient
      .from("user_invitations")
      .insert({
        email,
        full_name: fullName,
        phone: phone || null,
        team_id: teamId,
        invited_by: user.id,
      })
      .select()
      .single();

    if (invitationError) {
      console.error("[Invite] Error creating invitation record:", invitationError);
      return NextResponse.json(
        { error: "Failed to create invitation" },
        { status: 500 }
      );
    }

    // Send invitation email using Supabase's inviteUserByEmail
    // This creates a user in "invited" state and sends a magic link
    // Redirect to /auth/confirm which will handle session creation and routing
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://qero.international";
    console.log("[Invite] Using site URL:", siteUrl);
    
    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
      email,
      {
        data: {
          full_name: fullName,
          phone: phone || null,
          team_id: teamId,
          invitation_id: invitation.id,
          must_change_password: true,
          must_setup_2fa: true,
        },
        redirectTo: `${siteUrl}/auth/confirm`,
      }
    );
    
    console.log("[Invite] Invite result:", { inviteData, inviteError });

    if (inviteError) {
      console.error("[Invite] Error sending invitation:", inviteError);
      
      // Clean up the invitation record
      await adminClient
        .from("user_invitations")
        .delete()
        .eq("id", invitation.id);

      return NextResponse.json(
        { error: inviteError.message || "Failed to send invitation" },
        { status: 500 }
      );
    }

    console.log("[Invite] Successfully invited user:", email, "by:", user.email);

    return NextResponse.json({
      success: true,
      invitation: {
        id: invitation.id,
        email,
        fullName,
        teamId,
        createdAt: invitation.created_at,
        expiresAt: invitation.expires_at,
      },
    });
  } catch (error) {
    console.error("[Invite] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/users/invite
 * 
 * List all invitations (for admin view)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is admin
    if (!isCleanupAllowed(user.email)) {
      return NextResponse.json({ error: "Only admins can view invitations" }, { status: 403 });
    }

    const adminClient = createAdminClient();
    const { data: invitations, error } = await adminClient
      .from("user_invitations")
      .select(`
        *,
        team:teams(id, name, color),
        inviter:profiles!invited_by(id, full_name, avatar_url)
      `)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[Invite] Error fetching invitations:", error);
      return NextResponse.json(
        { error: "Failed to fetch invitations" },
        { status: 500 }
      );
    }

    return NextResponse.json({ invitations });
  } catch (error) {
    console.error("[Invite] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}


import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { respondError, respondSuccess } from "@/lib/utils/api-response";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { id: roomId } = await context.params;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return respondError("Unauthorized", 401);

    const adminSupabase = createAdminClient();

    const { data: membership } = await adminSupabase
      .from("chat_room_members")
      .select("id")
      .eq("room_id", roomId)
      .eq("user_id", user.id)
      .single();

    if (!membership) return respondError("Not a member", 403);

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "50");

    const { data: messages, error: msgError } = await adminSupabase
      .from("chat_messages")
      .select("id, content, mentions, created_at, updated_at, sender_id")
      .eq("room_id", roomId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (msgError) {
      console.error("Error fetching messages:", msgError);
      return respondError("Failed to fetch messages", 500);
    }

    const { data: allProfiles } = await adminSupabase
      .from("profiles")
      .select("id, full_name, avatar_url, team_id");
    const profilesMap = new Map((allProfiles || []).map(p => [p.id, p]));

    const { data: allTeams } = await adminSupabase
      .from("teams")
      .select("id, name, color");
    const teamsMap = new Map((allTeams || []).map(t => [t.id, t]));

    const messageIds = (messages || []).map(m => m.id);
    const { data: attachments } = messageIds.length > 0 
      ? await adminSupabase
          .from("chat_attachments")
          .select("id, message_id, file_name, file_url, file_type, file_size")
          .in("message_id", messageIds)
      : { data: [] };

    const attachmentsByMessage = new Map<string, typeof attachments>();
    (attachments || []).forEach(a => {
      const existing = attachmentsByMessage.get(a.message_id) || [];
      existing.push(a);
      attachmentsByMessage.set(a.message_id, existing);
    });

    const messagesWithData = (messages || []).map(msg => {
      const senderProfile = profilesMap.get(msg.sender_id);
      const sender = senderProfile ? {
        id: senderProfile.id,
        full_name: senderProfile.full_name,
        avatar_url: senderProfile.avatar_url,
        team: senderProfile.team_id ? teamsMap.get(senderProfile.team_id) : null,
      } : null;

      return {
        id: msg.id,
        content: msg.content,
        mentions: msg.mentions,
        created_at: msg.created_at,
        updated_at: msg.updated_at,
        sender,
        attachments: attachmentsByMessage.get(msg.id) || [],
      };
    });

    await adminSupabase
      .from("chat_room_members")
      .update({ last_read_at: new Date().toISOString() })
      .eq("room_id", roomId)
      .eq("user_id", user.id);

    return respondSuccess(messagesWithData.reverse());
  } catch (err) {
    console.error("GET messages error:", err);
    return respondError("Failed to fetch messages", 500);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id: roomId } = await context.params;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return respondError("Unauthorized", 401);

    const adminSupabase = createAdminClient();

    const { data: membership } = await adminSupabase
      .from("chat_room_members")
      .select("id")
      .eq("room_id", roomId)
      .eq("user_id", user.id)
      .single();

    if (!membership) return respondError("Not a member", 403);

    let body;
    try {
      body = await request.json();
    } catch (e) {
      console.error("Failed to parse request body:", e);
      return respondError("Invalid request body", 400);
    }

    const content = body.content || "";
    const mentions = body.mentions || [];
    const attachments = body.attachments || [];

    if (!content.trim() && attachments.length === 0) {
      return respondError("Content or attachments required", 400);
    }

    console.log("[POST messages] Creating message:", { roomId, content: content.slice(0, 50), mentions, attachmentCount: attachments.length });

    const { data: newMessage, error: msgError } = await adminSupabase
      .from("chat_messages")
      .insert({
        room_id: roomId,
        sender_id: user.id,
        content: content.trim(),
        mentions,
      })
      .select("id, content, mentions, created_at, updated_at, sender_id")
      .single();

    if (msgError || !newMessage) {
      console.error("Error creating message:", msgError);
      return respondError("Failed to send message", 500);
    }

    console.log("[POST messages] Message created:", newMessage.id);

    // Insert attachments if any
    if (attachments.length > 0) {
      const attachmentData = attachments.map((a: { file_name: string; file_url: string; file_type: string; file_size: number }) => ({
        message_id: newMessage.id,
        file_name: a.file_name,
        file_url: a.file_url,
        file_type: a.file_type,
        file_size: a.file_size,
      }));
      
      const { error: attError } = await adminSupabase
        .from("chat_attachments")
        .insert(attachmentData);
      
      if (attError) {
        console.error("Error inserting attachments:", attError);
      }
    }

    // Get sender profile
    const { data: senderProfile } = await adminSupabase
      .from("profiles")
      .select("id, full_name, avatar_url, team_id")
      .eq("id", user.id)
      .single();

    let senderTeam = null;
    if (senderProfile?.team_id) {
      const { data: team } = await adminSupabase
        .from("teams")
        .select("name, color")
        .eq("id", senderProfile.team_id)
        .single();
      senderTeam = team;
    }

    // Get attachments
    const { data: msgAttachments } = await adminSupabase
      .from("chat_attachments")
      .select("id, file_name, file_url, file_type, file_size")
      .eq("message_id", newMessage.id);

    // Update last_read_at
    await adminSupabase
      .from("chat_room_members")
      .update({ last_read_at: new Date().toISOString() })
      .eq("room_id", roomId)
      .eq("user_id", user.id);

    return respondSuccess({
      ...newMessage,
      sender: senderProfile ? {
        id: senderProfile.id,
        full_name: senderProfile.full_name,
        avatar_url: senderProfile.avatar_url,
        team: senderTeam,
      } : null,
      attachments: msgAttachments || [],
    }, { status: 201 });
  } catch (err) {
    console.error("POST message error:", err);
    return respondError("Failed to send message", 500);
  }
}

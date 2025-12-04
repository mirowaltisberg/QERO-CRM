import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { respondError, respondSuccess } from "@/lib/utils/api-response";
import { sendPushToUsers } from "@/lib/push/send-notification";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/chat/rooms/[id]/messages
export async function GET(request: NextRequest, context: RouteContext) {
  const { id: roomId } = await context.params;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return respondError("Unauthorized", 401);

    const adminSupabase = createAdminClient();

    // Verify membership
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
      .select(`
        id, content, mentions, created_at, updated_at,
        sender:profiles!sender_id(id, full_name, avatar_url, team_id),
        attachments:chat_attachments(id, file_name, file_url, file_type, file_size)
      `)
      .eq("room_id", roomId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (msgError) return respondError("Failed to fetch messages", 500);

    // Get team info for senders
    const messagesWithTeams = await Promise.all(
      (messages || []).map(async (msg) => {
        // Handle sender - could be array or object depending on Supabase version
        const rawSender = msg.sender;
        const sender = (Array.isArray(rawSender) ? rawSender[0] : rawSender) as { id: string; full_name: string; avatar_url: string | null; team_id: string | null; team?: { name: string; color: string } | null } | null;
        
        if (sender?.team_id) {
          const { data: team } = await adminSupabase
            .from("teams")
            .select("name, color")
            .eq("id", sender.team_id)
            .single();
          sender.team = team;
        }
        
        // Ensure sender is properly attached
        (msg as Record<string, unknown>).sender = sender;
        return msg;
      })
    );

    // Update last_read_at
    await adminSupabase
      .from("chat_room_members")
      .update({ last_read_at: new Date().toISOString() })
      .eq("room_id", roomId)
      .eq("user_id", user.id);

    // Return with no-cache headers
    return new Response(JSON.stringify({ success: true, data: messagesWithTeams.reverse() }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });
  } catch (err) {
    console.error("GET messages error:", err);
    return respondError("Failed to fetch messages", 500);
  }
}

// POST /api/chat/rooms/[id]/messages
export async function POST(request: NextRequest, context: RouteContext) {
  const { id: roomId } = await context.params;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return respondError("Unauthorized", 401);

    const body = await request.json();
    const { content, mentions = [], attachments = [] } = body;

    if (!content?.trim() && attachments.length === 0) {
      return respondError("Message content or attachments required", 400);
    }

    const adminSupabase = createAdminClient();

    // Verify membership
    const { data: membership } = await adminSupabase
      .from("chat_room_members")
      .select("id")
      .eq("room_id", roomId)
      .eq("user_id", user.id)
      .single();

    if (!membership) return respondError("Not a member", 403);

    // Create message
    const { data: message, error: messageError } = await adminSupabase
      .from("chat_messages")
      .insert({
        room_id: roomId,
        sender_id: user.id,
        content: content?.trim() || "",
        mentions,
      })
      .select(`
        id, content, mentions, created_at, updated_at,
        sender:profiles!sender_id(id, full_name, avatar_url, team_id)
      `)
      .single();

    if (messageError || !message) return respondError("Failed to send message", 500);

    // Add attachments
    if (attachments.length > 0) {
      const attachmentRecords = attachments.map((att: { file_name: string; file_url: string; file_type: string; file_size: number }) => ({
        message_id: message.id,
        file_name: att.file_name,
        file_url: att.file_url,
        file_type: att.file_type,
        file_size: att.file_size,
      }));
      const { data: savedAttachments } = await adminSupabase
        .from("chat_attachments")
        .insert(attachmentRecords)
        .select();
      (message as Record<string, unknown>).attachments = savedAttachments || [];
    } else {
      (message as Record<string, unknown>).attachments = [];
    }

    // Get team info - handle sender that could be array or object
    const rawSender = message.sender;
    const sender = (Array.isArray(rawSender) ? rawSender[0] : rawSender) as { id: string; full_name: string; avatar_url: string | null; team_id: string | null; team?: { name: string; color: string } | null } | null;
    if (sender?.team_id) {
      const { data: team } = await adminSupabase
        .from("teams")
        .select("name, color")
        .eq("id", sender.team_id)
        .single();
      sender.team = team;
    }
    (message as Record<string, unknown>).sender = sender;

    await adminSupabase
      .from("chat_room_members")
      .update({ last_read_at: new Date().toISOString() })
      .eq("room_id", roomId)
      .eq("user_id", user.id);

    // Send push notifications to other room members (async, don't wait)
    sendPushNotificationsToRoomMembers(
      adminSupabase,
      roomId,
      user.id,
      sender?.full_name || "Jemand",
      content?.trim() || "📎 Anhang"
    ).catch(console.error);

    return respondSuccess(message, { status: 201 });
  } catch (err) {
    console.error("POST message error:", err);
    return respondError("Failed to send message", 500);
  }
}

// Helper function to send push notifications
async function sendPushNotificationsToRoomMembers(
  adminSupabase: ReturnType<typeof createAdminClient>,
  roomId: string,
  senderId: string,
  senderName: string,
  messagePreview: string
) {
  try {
    // Get room info
    const { data: room } = await adminSupabase
      .from("chat_rooms")
      .select("name, type")
      .eq("id", roomId)
      .single();

    // Get all room members except sender
    const { data: members } = await adminSupabase
      .from("chat_room_members")
      .select("user_id")
      .eq("room_id", roomId)
      .neq("user_id", senderId);

    if (!members || members.length === 0) return;

    const recipientIds = members.map((m) => m.user_id);

    // Determine notification title
    let title = senderName;
    if (room?.type === "team" || room?.type === "all") {
      title = `${room.name}: ${senderName}`;
    }

    // Truncate message preview
    const body = messagePreview.length > 100 
      ? messagePreview.substring(0, 100) + "..." 
      : messagePreview;

    // Send push notifications
    await sendPushToUsers(recipientIds, {
      title,
      body,
      url: "/chat",
      roomId,
      tag: `chat-${roomId}`,
    });
  } catch (error) {
    console.error("Error sending push notifications:", error);
  }
}

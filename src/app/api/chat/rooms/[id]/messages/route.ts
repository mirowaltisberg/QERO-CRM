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
      .select("id, content, mentions, created_at, updated_at, sender:profiles!sender_id(id, full_name, avatar_url, team_id), attachments:chat_attachments(id, file_name, file_url, file_type, file_size)")
      .eq("room_id", roomId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (msgError) return respondError("Failed to fetch messages", 500);

    const messagesWithTeams = await Promise.all(
      (messages || []).map(async (msg) => {
        const sender = msg.sender as any;
        if (sender?.team_id) {
          const { data: team } = await adminSupabase
            .from("teams")
            .select("name, color")
            .eq("id", sender.team_id)
            .single();
          sender.team = team;
        }
        return msg;
      })
    );

    await adminSupabase
      .from("chat_room_members")
      .update({ last_read_at: new Date().toISOString() })
      .eq("room_id", roomId)
      .eq("user_id", user.id);

    return respondSuccess(messagesWithTeams.reverse());
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

    const body = await request.json();
    const { content, mentions = [], attachments = [] } = body;

    if (!content?.trim() && attachments.length === 0) {
      return respondError("Message content or attachments required", 400);
    }

    const adminSupabase = createAdminClient();

    const { data: membership } = await adminSupabase
      .from("chat_room_members")
      .select("id")
      .eq("room_id", roomId)
      .eq("user_id", user.id)
      .single();

    if (!membership) return respondError("Not a member", 403);

    const { data: message, error: messageError } = await adminSupabase
      .from("chat_messages")
      .insert({
        room_id: roomId,
        sender_id: user.id,
        content: content?.trim() || "",
        mentions,
      })
      .select("id, content, mentions, created_at, updated_at, sender:profiles!sender_id(id, full_name, avatar_url, team_id)")
      .single();

    if (messageError || !message) return respondError("Failed to send message", 500);

    if (attachments.length > 0) {
      const attachmentRecords = attachments.map((att: any) => ({
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
      (message as any).attachments = savedAttachments || [];
    } else {
      (message as any).attachments = [];
    }

    const sender = message.sender as any;
    if (sender?.team_id) {
      const { data: team } = await adminSupabase
        .from("teams")
        .select("name, color")
        .eq("id", sender.team_id)
        .single();
      sender.team = team;
    }

    await adminSupabase
      .from("chat_room_members")
      .update({ last_read_at: new Date().toISOString() })
      .eq("room_id", roomId)
      .eq("user_id", user.id);

    return respondSuccess(message, { status: 201 });
  } catch (err) {
    console.error("POST message error:", err);
    return respondError("Failed to send message", 500);
  }
}

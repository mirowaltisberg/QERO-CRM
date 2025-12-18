/**
 * WhatsApp Messages API
 * GET: List messages for a conversation
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/whatsapp/messages
 * Query params:
 *   - conversation_id: Required - the conversation to fetch messages for
 *   - limit: Number of messages to return (default 50)
 *   - before: Cursor for pagination (message ID)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const conversationId = searchParams.get("conversation_id");
    const limit = parseInt(searchParams.get("limit") || "50");
    const before = searchParams.get("before");

    if (!conversationId) {
      return NextResponse.json({ error: "conversation_id is required" }, { status: 400 });
    }

    let query = supabase
      .from("whatsapp_messages")
      .select(`
        *,
        sender:profiles!whatsapp_messages_sender_id_fkey(id, full_name, avatar_url),
        media:whatsapp_media(*)
      `)
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (before) {
      // Get the created_at of the cursor message
      const { data: cursorMsg } = await supabase
        .from("whatsapp_messages")
        .select("created_at")
        .eq("id", before)
        .single();

      if (cursorMsg) {
        query = query.lt("created_at", cursorMsg.created_at);
      }
    }

    const { data, error } = await query;

    if (error) {
      console.error("[WhatsApp API] Error fetching messages:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Reverse to get chronological order
    const messages = (data || []).reverse();

    // Mark conversation as read
    await supabase
      .from("whatsapp_conversations")
      .update({ is_unread: false, unread_count: 0 })
      .eq("id", conversationId);

    return NextResponse.json({ data: messages });
  } catch (error) {
    console.error("[WhatsApp API] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}




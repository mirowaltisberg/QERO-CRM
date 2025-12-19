/**
 * WhatsApp Conversations API
 * GET: List conversations (with filters)
 * POST: Create a new conversation (for outbound messaging)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/whatsapp/conversations
 * Query params:
 *   - linked_tma_id: Filter by TMA candidate
 *   - linked_contact_id: Filter by contact
 *   - assigned_to: Filter by assigned user
 *   - is_unread: Filter unread only
 *   - search: Search by phone or profile name
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const linkedTmaId = searchParams.get("linked_tma_id");
    const linkedContactId = searchParams.get("linked_contact_id");
    const assignedTo = searchParams.get("assigned_to");
    const isUnread = searchParams.get("is_unread");
    const search = searchParams.get("search");

    let query = supabase
      .from("whatsapp_conversations")
      .select(`
        *,
        linked_tma:tma_candidates(id, first_name, last_name, phone, email),
        linked_contact:contacts(id, company_name, contact_name, phone, email),
        assignee:profiles!whatsapp_conversations_assigned_to_fkey(id, full_name, avatar_url)
      `)
      .order("last_message_at", { ascending: false, nullsFirst: false });

    if (linkedTmaId) {
      query = query.eq("linked_tma_id", linkedTmaId);
    }
    if (linkedContactId) {
      query = query.eq("linked_contact_id", linkedContactId);
    }
    if (assignedTo) {
      query = query.eq("assigned_to", assignedTo);
    }
    if (isUnread === "true") {
      query = query.eq("is_unread", true);
    }
    if (search) {
      query = query.or(`phone_number.ilike.%${search}%,profile_name.ilike.%${search}%`);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[WhatsApp API] Error fetching conversations:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error("[WhatsApp API] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/whatsapp/conversations
 * Create a new conversation for outbound messaging
 * Body: { phone_number, linked_tma_id?, linked_contact_id? }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { phone_number, linked_tma_id, linked_contact_id } = body;

    if (!phone_number) {
      return NextResponse.json({ error: "phone_number is required" }, { status: 400 });
    }

    // Normalize phone number
    let waId = phone_number.replace(/\D/g, "");
    if (waId.startsWith("0")) {
      waId = "41" + waId.slice(1);
    }
    const formattedPhone = `+${waId}`;

    // Get the active WhatsApp account
    const { data: account, error: accountError } = await supabase
      .from("whatsapp_accounts")
      .select("id")
      .eq("is_active", true)
      .limit(1)
      .single();

    if (accountError || !account) {
      return NextResponse.json({ error: "No active WhatsApp account configured" }, { status: 400 });
    }

    // Check if conversation already exists
    const { data: existing } = await supabase
      .from("whatsapp_conversations")
      .select("*")
      .eq("account_id", account.id)
      .eq("wa_id", waId)
      .single();

    if (existing) {
      // Update linkage if provided
      if (linked_tma_id || linked_contact_id) {
        const { data: updated, error: updateError } = await supabase
          .from("whatsapp_conversations")
          .update({
            linked_tma_id: linked_tma_id || existing.linked_tma_id,
            linked_contact_id: linked_contact_id || existing.linked_contact_id,
          })
          .eq("id", existing.id)
          .select()
          .single();

        if (updateError) {
          return NextResponse.json({ error: updateError.message }, { status: 500 });
        }
        return NextResponse.json({ data: updated });
      }
      return NextResponse.json({ data: existing });
    }

    // Create new conversation
    const { data: created, error: createError } = await supabase
      .from("whatsapp_conversations")
      .insert({
        account_id: account.id,
        wa_id: waId,
        phone_number: formattedPhone,
        linked_tma_id,
        linked_contact_id,
        assigned_to: user.id,
        is_unread: false,
        unread_count: 0,
      })
      .select()
      .single();

    if (createError) {
      console.error("[WhatsApp API] Error creating conversation:", createError);
      return NextResponse.json({ error: createError.message }, { status: 500 });
    }

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    console.error("[WhatsApp API] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}





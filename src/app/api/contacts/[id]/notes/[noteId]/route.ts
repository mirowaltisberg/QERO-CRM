import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { respondError, respondSuccess } from "@/lib/utils/api-response";

interface RouteContext {
  params: Promise<{ id: string; noteId: string }>;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id: contactId, noteId } = await context.params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return respondError("Unauthorized", 401);
  }

  const { content } = await request.json();
  if (!content || typeof content !== "string") {
    return respondError("Content is required", 400);
  }

  const { data: note, error } = await supabase
    .from("contact_notes")
    .update({ content: content.trim(), updated_at: new Date().toISOString() })
    .eq("id", noteId)
    .eq("contact_id", contactId)
    .eq("author_id", user.id)
    .select(`*, profiles(full_name, avatar_url)`)
    .single();

  if (error) {
    console.error("Failed to update note", error);
    return respondError("Failed to update note", 500);
  }

  const formatted = {
    ...note,
    author_name: note.profiles?.full_name || "Unknown",
    author_avatar_url: note.profiles?.avatar_url || null,
  };

  return respondSuccess(formatted);
}


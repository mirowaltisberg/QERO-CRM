import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const NoteCreateSchema = z.object({
  content: z.string().min(1, "Note content is required").max(5000),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/contacts/[id]/notes - Get all notes for a contact
export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const supabase = await createClient();

  const { data: notes, error } = await supabase
    .from("contact_notes")
    .select(`
      id,
      contact_id,
      author_id,
      content,
      created_at,
      author:profiles!author_id(id, full_name, avatar_url)
    `)
    .eq("contact_id", id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: notes });
}

// POST /api/contacts/[id]/notes - Create a new note
export async function POST(request: NextRequest, context: RouteContext) {
  const { id: contact_id } = await context.params;
  const supabase = await createClient();

  // Get current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse body
  const body = await request.json();
  const parsed = NoteCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid input" },
      { status: 400 }
    );
  }

  // Create note
  const { data: note, error } = await supabase
    .from("contact_notes")
    .insert({
      contact_id,
      author_id: user.id,
      content: parsed.data.content,
    })
    .select(`
      id,
      contact_id,
      author_id,
      content,
      created_at,
      author:profiles!author_id(id, full_name, avatar_url)
    `)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: note }, { status: 201 });
}


import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const NoteCreateSchema = z.object({
  content: z.string().min(1, "Note content is required").max(5000),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/tma/[id]/notes - Get all notes for a TMA candidate
export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const supabase = await createClient();

  const { data: notes, error } = await supabase
    .from("tma_notes")
    .select(`
      id,
      tma_id,
      author_id,
      content,
      created_at,
      updated_at,
      author:profiles!author_id(id, full_name, avatar_url)
    `)
    .eq("tma_id", id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: notes });
}

// Patterns that indicate a trivial/non-meaningful note
const TRIVIAL_NOTE_PATTERNS = [
  /^c+$/i,           // "c", "cc", "ccc", etc.
  /^cb$/i,           // "cb"
  /^combox$/i,       // "combox"
  /^com\s*box$/i,    // "com box"
  /^besetzt$/i,      // "besetzt"
  /^busy$/i,         // "busy"
  /^na$/i,           // "na" (no answer)
  /^n\/a$/i,         // "n/a"
  /^-+$/,            // just dashes
  /^\.+$/,           // just dots
];

function isMeaningfulNote(content: string): boolean {
  const trimmed = content.trim().toLowerCase();
  if (trimmed.length < 3) return false;
  return !TRIVIAL_NOTE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

// POST /api/tma/[id]/notes - Create a new note for a TMA candidate
export async function POST(request: NextRequest, context: RouteContext) {
  const { id: tma_id } = await context.params;
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
    .from("tma_notes")
    .insert({
      tma_id,
      author_id: user.id,
      content: parsed.data.content,
    })
    .select(`
      id,
      tma_id,
      author_id,
      content,
      created_at,
      updated_at,
      author:profiles!author_id(id, full_name, avatar_url)
    `)
    .single();

  if (error) {
    console.error("Failed to create TMA note:", error);
    return NextResponse.json({ error: error.message, details: error }, { status: 500 });
  }

  // Auto-claim if this is a meaningful note and candidate is unclaimed
  if (isMeaningfulNote(parsed.data.content)) {
    const { data: candidate } = await supabase
      .from("tma_candidates")
      .select("claimed_by")
      .eq("id", tma_id)
      .single();

    if (candidate && !candidate.claimed_by) {
      await supabase
        .from("tma_candidates")
        .update({ claimed_by: user.id })
        .eq("id", tma_id);
    }
  }

  return NextResponse.json({ data: note }, { status: 201 });
}


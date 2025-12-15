import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/tma/[id]/annotations?type=short_profile
export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const searchParams = request.nextUrl.searchParams;
  const documentType = searchParams.get("type") || "short_profile";

  const supabase = await createClient();
  
  // Verify authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch annotations
  const { data, error } = await supabase
    .from("tma_document_annotations")
    .select("annotations, updated_at, updated_by")
    .eq("tma_candidate_id", id)
    .eq("document_type", documentType)
    .maybeSingle();

  if (error) {
    console.error("[Annotations GET] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    annotations: data?.annotations || [],
    updated_at: data?.updated_at || null,
    updated_by: data?.updated_by || null,
  });
}

// PUT /api/tma/[id]/annotations
export async function PUT(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  const supabase = await createClient();
  
  // Verify authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { document_type: string; annotations: unknown[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { document_type, annotations } = body;

  if (!document_type || !Array.isArray(annotations)) {
    return NextResponse.json(
      { error: "document_type and annotations are required" },
      { status: 400 }
    );
  }

  // Validate document_type
  if (document_type !== "short_profile") {
    return NextResponse.json(
      { error: "Invalid document_type" },
      { status: 400 }
    );
  }

  // Upsert annotations
  const { data, error } = await supabase
    .from("tma_document_annotations")
    .upsert(
      {
        tma_candidate_id: id,
        document_type,
        annotations,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      },
      {
        onConflict: "tma_candidate_id,document_type",
      }
    )
    .select("id, updated_at")
    .single();

  if (error) {
    console.error("[Annotations PUT] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    id: data.id,
    updated_at: data.updated_at,
  });
}

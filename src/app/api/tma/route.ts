import { NextRequest } from "next/server";
import { tmaService } from "@/lib/data/data-service";
import { respondError, respondSuccess, formatZodError } from "@/lib/utils/api-response";
import { TmaCreateSchema, TmaFilterSchema } from "@/lib/validation/schemas";
import { createClient } from "@/lib/supabase/server";

function buildFilters(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const raw = {
    status: params.get("status") || undefined,
    canton: params.get("canton") || undefined,
    search: params.get("search") || undefined,
  };
  return TmaFilterSchema.safeParse(raw);
}

export async function GET(request: NextRequest) {
  try {
    const filtersResult = buildFilters(request);
    if (!filtersResult.success) {
      return respondError(formatZodError(filtersResult.error), 400);
    }
    
    const supabase = await createClient();
    let query = supabase
      .from("tma_candidates")
      .select(`
        *,
        claimer:profiles!claimed_by(id, full_name, avatar_url)
      `)
      .order("created_at", { ascending: false });

    const filters = filtersResult.data;
    if (filters.status) {
      query = query.contains("status_tags", [filters.status]);
    }
    if (filters.canton) {
      query = query.eq("canton", filters.canton);
    }
    if (filters.search) {
      const search = filters.search.toLowerCase();
      query = query.or(
        `first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`
      );
    }

    const { data: candidates, error } = await query;
    
    if (error) {
      console.error("Error fetching TMA candidates:", error);
      return respondError("Failed to fetch candidates", 500);
    }
    
    return respondSuccess(candidates ?? [], {
      status: 200,
      meta: { count: candidates?.length ?? 0 },
    });
  } catch (error) {
    console.error("GET /api/tma error", error);
    return respondError("Failed to fetch candidates", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body) {
      return respondError("Invalid JSON payload", 400);
    }
    const parsed = TmaCreateSchema.safeParse(body);
    if (!parsed.success) {
      return respondError(formatZodError(parsed.error), 400);
    }
    const candidate = await tmaService.create(parsed.data);
    return respondSuccess(candidate, { status: 201 });
  } catch (error) {
    console.error("POST /api/tma error", error);
    return respondError("Failed to create candidate", 500);
  }
}


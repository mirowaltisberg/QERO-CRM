import { NextRequest } from "next/server";
import { tmaService } from "@/lib/data/data-service";
import { respondError, respondSuccess, formatZodError } from "@/lib/utils/api-response";
import { TmaCreateSchema, TmaFilterSchema } from "@/lib/validation/schemas";
import { createClient } from "@/lib/supabase/server";
import type { TmaCandidate } from "@/lib/types";

// Supabase default limit is 1000 rows
const BATCH_SIZE = 1000;

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
    const filters = filtersResult.data;

    // First get the total count
    let countQuery = supabase
      .from("tma_candidates")
      .select("*", { count: "exact", head: true });

    if (filters.status) {
      countQuery = countQuery.contains("status_tags", [filters.status]);
    }
    if (filters.canton) {
      countQuery = countQuery.eq("canton", filters.canton);
    }
    if (filters.search) {
      const search = filters.search.toLowerCase();
      countQuery = countQuery.or(
        `first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`
      );
    }

    const { count } = await countQuery;
    const totalCount = count ?? 0;

    if (totalCount === 0) {
      return respondSuccess([], { status: 200, meta: { count: 0 } });
    }

    // Fetch in batches
    const allCandidates: TmaCandidate[] = [];
    const batches = Math.ceil(totalCount / BATCH_SIZE);

    for (let i = 0; i < batches; i++) {
      const from = i * BATCH_SIZE;
      const to = from + BATCH_SIZE - 1;

      let query = supabase
        .from("tma_candidates")
        .select(`
          *,
          claimer:profiles!claimed_by(id, full_name, avatar_url)
        `)
        .order("created_at", { ascending: false })
        .range(from, to);

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

      const { data, error } = await query;
      
      if (error) {
        console.error(`[TMA API] Error fetching batch ${i + 1}/${batches}:`, error);
        continue;
      }

      if (data) {
        allCandidates.push(...(data as TmaCandidate[]));
      }
    }

    console.log(`[TMA API] Fetched ${allCandidates.length} candidates in ${batches} batches`);
    
    // is_new field is now fetched directly from the database
    // No need to calculate notes_count anymore
    
    return respondSuccess(allCandidates, {
      status: 200,
      meta: { count: candidatesWithNotes.length },
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


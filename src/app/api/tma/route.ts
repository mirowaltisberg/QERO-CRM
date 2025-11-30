import { NextRequest } from "next/server";
import { tmaService } from "@/lib/data/data-service";
import { respondError, respondSuccess, formatZodError } from "@/lib/utils/api-response";
import { TmaCreateSchema, TmaFilterSchema } from "@/lib/validation/schemas";

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
    const candidates = await tmaService.getAll(filtersResult.data);
    return respondSuccess(candidates, {
      status: 200,
      meta: { count: candidates.length },
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


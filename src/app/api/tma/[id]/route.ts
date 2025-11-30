import { NextRequest } from "next/server";
import { tmaService } from "@/lib/data/data-service";
import { respondError, respondSuccess, formatZodError } from "@/lib/utils/api-response";
import { TmaUpdateSchema } from "@/lib/validation/schemas";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function clean<T extends Record<string, unknown>>(payload: T) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  try {
    const candidate = await tmaService.getById(id);
    if (!candidate) {
      return respondError("Candidate not found", 404);
    }
    return respondSuccess(candidate);
  } catch (error) {
    console.error(`GET /api/tma/${id} error`, error);
    return respondError("Failed to fetch candidate", 500);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  try {
    const body = await request.json().catch(() => null);
    if (!body) {
      return respondError("Invalid JSON payload", 400);
    }
    const parsed = TmaUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return respondError(formatZodError(parsed.error), 400);
    }
    if (Object.keys(parsed.data).length === 0) {
      return respondError("No fields provided for update", 400);
    }

    const payload = clean(parsed.data);

    if (payload.status && payload.status !== "C") {
      payload.follow_up_at = null;
      payload.follow_up_note = null;
    }

    if (payload.follow_up_at && !payload.status) {
      payload.status = "C";
    }

    const updated = await tmaService.update(id, payload);
    if (!updated) {
      return respondError("Candidate not found", 404);
    }
    return respondSuccess(updated);
  } catch (error) {
    console.error(`PATCH /api/tma/${id} error`, error);
    return respondError("Failed to update candidate", 500);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  try {
    const deleted = await tmaService.delete(id);
    if (!deleted) {
      return respondError("Candidate not found", 404);
    }
    return respondSuccess({ id });
  } catch (error) {
    console.error(`DELETE /api/tma/${id} error`, error);
    return respondError("Failed to delete candidate", 500);
  }
}


import { NextRequest } from "next/server";
import { respondError, respondSuccess } from "@/lib/utils/api-response";
import { tmaService } from "@/lib/data/data-service";
import type { TmaCreateInput } from "@/lib/validation/schemas";
import { TmaCreateSchema } from "@/lib/validation/schemas";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || !Array.isArray(body)) {
      return respondError("Payload must be an array of candidates", 400);
    }

    let success = 0;
    const errors: Array<{ index: number; message: string }> = [];

    for (let i = 0; i < body.length; i++) {
      const row = body[i];
      const parsed = TmaCreateSchema.safeParse(row);
      if (!parsed.success) {
        errors.push({ index: i, message: parsed.error.message });
        continue;
      }
      try {
        await tmaService.create(parsed.data as unknown as TmaCreateInput);
        success += 1;
      } catch (err) {
        errors.push({ index: i, message: err instanceof Error ? err.message : "Unknown error" });
      }
    }

    return respondSuccess({ created: success, errors }, { status: 201 });
  } catch (error) {
    console.error("POST /api/tma/import error", error);
    return respondError("Failed to import candidates", 500);
  }
}



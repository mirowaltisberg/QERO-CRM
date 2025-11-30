import { NextRequest } from 'next/server';
import { callLogService } from '@/lib/data/data-service';
import { formatZodError, respondError, respondSuccess } from '@/lib/utils/api-response';
import { CallLogCreateSchema, CallLogQuerySchema } from '@/lib/validation/schemas';

export async function GET(request: NextRequest) {
  try {
    const params = {
      contact_id: request.nextUrl.searchParams.get('contact_id') || '',
    };
    const parsed = CallLogQuerySchema.safeParse(params);
    if (!parsed.success) {
      return respondError(formatZodError(parsed.error), 400);
    }

    // TODO: Replace callLogService with Supabase query when backend is connected
    const logs = await callLogService.getByContactId(parsed.data.contact_id);
    return respondSuccess(logs, { meta: { count: logs.length } });
  } catch (error) {
    console.error('GET /api/call error', error);
    return respondError('Failed to fetch call history', 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body) {
      return respondError('Invalid JSON payload', 400);
    }
    const parsed = CallLogCreateSchema.safeParse(body);
    if (!parsed.success) {
      return respondError(formatZodError(parsed.error), 400);
    }

    // TODO: Replace callLogService with Supabase mutation when backend is connected
    const log = await callLogService.create({
      contact_id: parsed.data.contact_id,
      outcome: parsed.data.outcome,
      notes: parsed.data.notes ?? undefined,
    });

    return respondSuccess(log, { status: 201 });
  } catch (error) {
    console.error('POST /api/call error', error);
    return respondError('Failed to log call', 500);
  }
}


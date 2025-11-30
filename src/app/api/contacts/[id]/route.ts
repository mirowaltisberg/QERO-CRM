import { NextRequest } from 'next/server';
import { contactService } from '@/lib/data/data-service';
import { respondError, respondSuccess, formatZodError } from '@/lib/utils/api-response';
import { ContactUpdateSchema } from '@/lib/validation/schemas';

interface RouteContext {
  params: Promise<{ id: string }>;
}

function removeUndefined<T extends Record<string, unknown>>(payload: T) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    // TODO: Replace contactService with Supabase query when backend is connected
    const contact = await contactService.getById(id);
    if (!contact) {
      return respondError('Contact not found', 404);
    }
    return respondSuccess(contact);
  } catch (error) {
    console.error(`GET /api/contacts/${context.params.id} error`, error);
    return respondError('Failed to fetch contact', 500);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => null);
    if (!body) {
      return respondError('Invalid JSON payload', 400);
    }
    const parsed = ContactUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return respondError(formatZodError(parsed.error), 400);
    }

    if (Object.keys(parsed.data).length === 0) {
      return respondError('No fields provided for update', 400);
    }

    // TODO: Replace contactService with Supabase mutation when backend is connected
    const cleaned = removeUndefined(parsed.data);

    // TODO: Replace contactService with Supabase mutation when backend is connected
    const updated = await contactService.update(id, cleaned);

    if (!updated) {
      return respondError('Contact not found', 404);
    }

    return respondSuccess(updated);
  } catch (error) {
    console.error(`PATCH /api/contacts/${context.params.id} error`, error);
    return respondError('Failed to update contact', 500);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    // TODO: Replace contactService with Supabase mutation when backend is connected
    const deleted = await contactService.delete(id);
    if (!deleted) {
      return respondError('Contact not found', 404);
    }
    return respondSuccess({ id }, { status: 200 });
  } catch (error) {
    console.error(`DELETE /api/contacts/${context.params.id} error`, error);
    return respondError('Failed to delete contact', 500);
  }
}


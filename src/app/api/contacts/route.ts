import { NextRequest } from 'next/server';
import { serverContactService } from '@/lib/data/server-data-service';
import { respondError, respondSuccess, formatZodError } from '@/lib/utils/api-response';
import {
  ContactCreateSchema,
  ContactFilterSchema,
} from '@/lib/validation/schemas';
import { sanitizeContactPayload } from '@/lib/utils/sanitize-contact';

function buildFilters(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const raw = {
    status: params.get('status') || undefined,
    canton: params.get('canton') || undefined,
    search: params.get('search') || undefined,
    list_id: params.get('list_id') || undefined,
    page: params.get('page') ? parseInt(params.get('page')!, 10) : undefined,
    pageSize: params.get('pageSize') ? parseInt(params.get('pageSize')!, 10) : undefined,
  };
  return ContactFilterSchema.safeParse(raw);
}

export async function GET(request: NextRequest) {
  try {
    const filtersResult = buildFilters(request);
    if (!filtersResult.success) {
      return respondError(formatZodError(filtersResult.error), 400);
    }

    const filters = filtersResult.data;
    
    // Use server contact service (merges personal settings with proper auth)
    // Note: pagination not yet implemented in server service, use getAll for now
    const contacts = await serverContactService.getAll(filters);
    return respondSuccess(contacts, {
      status: 200,
      meta: { count: contacts.length },
    });
  } catch (error) {
    console.error('GET /api/contacts error', error);
    return respondError('Failed to fetch contacts', 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body) {
      return respondError('Invalid JSON payload', 400);
    }
    const parsed = ContactCreateSchema.safeParse(body);
    if (!parsed.success) {
      return respondError(formatZodError(parsed.error), 400);
    }

    // Use server contact service to create (uses server-side auth)
    const contact = await serverContactService.create(sanitizeContactPayload(parsed.data));
    return respondSuccess(contact, { status: 201 });
  } catch (error) {
    console.error('POST /api/contacts error', error);
    return respondError('Failed to create contact', 500);
  }
}

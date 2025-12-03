import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { respondError, respondSuccess, formatZodError } from "@/lib/utils/api-response";
import { ContactPersonSchema } from "@/lib/validation/schemas";

const PERSON_SELECT = `
  id,
  contact_id,
  first_name,
  last_name,
  role,
  mobile,
  direct_phone,
  email,
  created_at,
  updated_at,
  created_by,
  updated_by,
  updated_by_profile:profiles!contact_persons_updated_by_fkey (
    id,
    full_name,
    avatar_url
  )
`;

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("contact_persons")
      .select(PERSON_SELECT)
      .eq("contact_id", id)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[ContactPersons] GET error", error);
      return respondError("Failed to load contact persons", 500);
    }

    return respondSuccess(data || []);
  } catch (error) {
    console.error("[ContactPersons] GET unexpected error", error);
    return respondError("Failed to load contact persons", 500);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  try {
    const body = await request.json().catch(() => null);
    if (!body) {
      return respondError("Invalid JSON payload", 400);
    }

    const parsed = ContactPersonSchema.safeParse(body);
    if (!parsed.success) {
      return respondError(formatZodError(parsed.error), 400);
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return respondError("Unauthorized", 401);
    }

    const payload = {
      contact_id: id,
      first_name: parsed.data.first_name,
      last_name: parsed.data.last_name,
      role: parsed.data.role ?? null,
      mobile: parsed.data.mobile ?? null,
      direct_phone: parsed.data.direct_phone ?? null,
      email: parsed.data.email ?? null,
      created_by: user.id,
      updated_by: user.id,
    };

    const { data, error } = await supabase
      .from("contact_persons")
      .insert(payload)
      .select(PERSON_SELECT)
      .single();

    if (error) {
      console.error("[ContactPersons] POST error", error);
      return respondError("Failed to create contact person", 500);
    }

    return respondSuccess(data, { status: 201 });
  } catch (error) {
    console.error("[ContactPersons] POST unexpected error", error);
    return respondError("Failed to create contact person", 500);
  }
}

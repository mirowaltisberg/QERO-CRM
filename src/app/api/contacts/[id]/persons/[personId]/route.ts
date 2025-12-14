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
  gender,
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
  params: Promise<{ id: string; personId: string }>;
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const { id, personId } = await context.params;

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
      first_name: parsed.data.first_name,
      last_name: parsed.data.last_name,
      role: parsed.data.role ?? null,
      mobile: parsed.data.mobile ?? null,
      direct_phone: parsed.data.direct_phone ?? null,
      email: parsed.data.email ?? null,
      gender: parsed.data.gender ?? null,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("contact_persons")
      .update(payload)
      .eq("id", personId)
      .eq("contact_id", id)
      .select(PERSON_SELECT)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return respondError("Contact person not found", 404);
      }
      console.error("[ContactPersons] PUT error", error);
      return respondError("Failed to update contact person", 500);
    }

    return respondSuccess(data);
  } catch (error) {
    console.error("[ContactPersons] PUT unexpected error", error);
    return respondError("Failed to update contact person", 500);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { id, personId } = await context.params;

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("contact_persons")
      .delete()
      .eq("id", personId)
      .eq("contact_id", id);

    if (error) {
      console.error("[ContactPersons] DELETE error", error);
      return respondError("Failed to delete contact person", 500);
    }

    return respondSuccess({ id: personId });
  } catch (error) {
    console.error("[ContactPersons] DELETE unexpected error", error);
    return respondError("Failed to delete contact person", 500);
  }
}

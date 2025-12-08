import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { respondError, respondSuccess } from "@/lib/utils/api-response";
import { ContactCreateSchema } from "@/lib/validation/schemas";
import { sanitizeContactPayload } from "@/lib/utils/sanitize-contact";
import { geocodeByPostalOrCity } from "@/lib/geo";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return respondError("Unauthorized", 401);
    }

    const body = await request.json().catch(() => null);
    if (!body || !Array.isArray(body.contacts)) {
      return respondError("contacts array is required", 400);
    }

    const created: string[] = [];
    const updated: string[] = [];
    const errors: string[] = [];

    // Get user's team_id for matching
    const { data: profile } = await supabase
      .from("profiles")
      .select("team_id")
      .eq("id", user.id)
      .single();
    
    const teamId = profile?.team_id || null;

    for (const [index, raw] of body.contacts.entries()) {
      const parsed = ContactCreateSchema.safeParse(raw);
      if (!parsed.success) {
        errors.push(`Row ${index + 1}: ${parsed.error.issues[0]?.message ?? "invalid data"}`);
        continue;
      }
      
      // Geocode address if postal_code or city is provided
      const payload = sanitizeContactPayload(parsed.data);
      if ((payload.postal_code || payload.city) && !payload.latitude) {
        const coords = geocodeByPostalOrCity(payload.postal_code, payload.city);
        if (coords) {
          payload.latitude = coords.lat;
          payload.longitude = coords.lng;
        }
      }

      // Check if contact with same company_name exists (within same team)
      let query = supabase
        .from("contacts")
        .select("id")
        .eq("company_name", payload.company_name);
      
      if (teamId) {
        query = query.eq("team_id", teamId);
      }
      
      const { data: existing } = await query.limit(1).single();

      if (existing) {
        // UPDATE existing contact - only update fields from CSV, preserve manual fields
        const updatePayload: Record<string, unknown> = {};
        
        // Always update these from CSV (address info)
        if (payload.street) updatePayload.street = payload.street;
        if (payload.city) updatePayload.city = payload.city;
        if (payload.postal_code) updatePayload.postal_code = payload.postal_code;
        if (payload.latitude) updatePayload.latitude = payload.latitude;
        if (payload.longitude) updatePayload.longitude = payload.longitude;
        if (payload.canton) updatePayload.canton = payload.canton;
        
        // Update phone/email only if CSV has a value
        if (payload.phone) updatePayload.phone = payload.phone;
        if (payload.email) updatePayload.email = payload.email;
        
        // Don't overwrite: status, follow_up_at, follow_up_note, notes (manual fields)
        
        if (Object.keys(updatePayload).length > 0) {
          await supabase
            .from("contacts")
            .update(updatePayload)
            .eq("id", existing.id);
        }
        
        updated.push(existing.id);
      } else {
        // CREATE new contact
        payload.team_id = teamId;
        
        const { data: newContact, error: createError } = await supabase
          .from("contacts")
          .insert(payload)
          .select("id")
          .single();
        
        if (createError) {
          errors.push(`Row ${index + 1}: ${createError.message}`);
        } else if (newContact) {
          created.push(newContact.id);
        }
      }
    }

    return respondSuccess(
      {
        created,
        updated,
        errors,
      },
      { status: errors.length ? 207 : 201 }
    );
  } catch (error) {
    console.error("POST /api/contacts/import error", error);
    return respondError("Failed to import contacts", 500);
  }
}


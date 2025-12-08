import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fixContactEncoding } from "@/lib/utils/fix-encoding";

/**
 * POST /api/contacts/fix-encoding
 * Scan and fix encoding issues in all contacts
 */
export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch all contacts
    const { data: contacts, error: fetchError } = await supabase
      .from("contacts")
      .select("id, company_name, contact_name, street, city");

    if (fetchError) {
      console.error("[Fix Encoding] Error fetching contacts:", fetchError);
      return NextResponse.json({ error: "Failed to fetch contacts" }, { status: 500 });
    }

    let fixedCount = 0;
    const errors: string[] = [];

    // Process each contact
    for (const contact of contacts || []) {
      const fixes = fixContactEncoding(contact);
      
      if (fixes) {
        const { error: updateError } = await supabase
          .from("contacts")
          .update(fixes)
          .eq("id", contact.id);

        if (updateError) {
          errors.push(`Failed to update ${contact.company_name}: ${updateError.message}`);
        } else {
          fixedCount++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      fixed: fixedCount,
      total: contacts?.length || 0,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("[Fix Encoding] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

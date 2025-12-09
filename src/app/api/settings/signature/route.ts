import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { respondError, respondSuccess } from "@/lib/utils/api-response";

// Default signature template
const DEFAULT_SIGNATURE_TEXT = `

--
Freundliche Grüsse

Miró Maximilian Waltisberg
Personalberater

Tel. M    +41 77 289 64 46
Tel. D    +41 58 510 57 64
E-Mail    m.waltisberg@qero.ch
Mehr Über mich
`;

const DEFAULT_SIGNATURE_HTML = `
<br><br>
<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">
  <p style="margin: 0;">Freundliche Grüsse</p>
  <br>
  <p style="margin: 0; font-weight: bold;">Miró Maximilian Waltisberg</p>
  <p style="margin: 0;">Personalberater</p>
  <br>
  <table style="font-size: 14px; color: #333;">
    <tr><td style="padding-right: 12px;">Tel. M</td><td><a href="tel:+41772896446" style="color: #333; text-decoration: none;">+41 77 289 64 46</a></td></tr>
    <tr><td style="padding-right: 12px;">Tel. D</td><td><a href="tel:+41585105764" style="color: #333; text-decoration: none;">+41 58 510 57 64</a></td></tr>
    <tr><td style="padding-right: 12px;">E-Mail</td><td><a href="mailto:m.waltisberg@qero.ch" style="color: #333; text-decoration: none;">m.waltisberg@qero.ch</a></td></tr>
  </table>
  <p style="margin: 8px 0;"><a href="https://www.qero.ch/team/miro-waltisberg" style="color: #333;">Mehr Über mich</a></p>
  <br>
  <a href="https://www.qero.ch" target="_blank">
    <img src="https://qero.international/qero-logo-email.png" alt="QERO - vermittelt Timing." style="max-width: 180px; height: auto;" />
  </a>
  <br><br>
  <p style="margin: 0; font-size: 12px; color: #666;">
    QERO AG | Ifangstrasse 91 | 8153 Rümlang | Tel <a href="tel:+41585105757" style="color: #666; text-decoration: none;">+41 58 510 57 57</a> | <a href="mailto:info@qero.ch" style="color: #666; text-decoration: none;">info@qero.ch</a> | <a href="https://www.qero.ch" style="color: #666; text-decoration: none;">www.qero.ch</a>
  </p>
</div>
`;

// GET: Fetch current signature
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return respondError("Unauthorized", 401);

    const adminSupabase = createAdminClient();
    const { data: profile, error } = await adminSupabase
      .from("profiles")
      .select("email_signature_text, email_signature_html")
      .eq("id", user.id)
      .single();

    if (error && error.code !== "PGRST116") {
      console.error("[Signature GET] Error:", error);
      return respondError("Failed to fetch signature", 500);
    }

    // Return stored signature or defaults
    return respondSuccess({
      signature_text: profile?.email_signature_text ?? DEFAULT_SIGNATURE_TEXT,
      signature_html: profile?.email_signature_html ?? DEFAULT_SIGNATURE_HTML,
      is_default: !profile?.email_signature_text && !profile?.email_signature_html,
    });
  } catch (err) {
    console.error("[Signature GET] Error:", err);
    return respondError("Failed to fetch signature", 500);
  }
}

// PUT: Update signature
export async function PUT(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return respondError("Unauthorized", 401);

    const body = await request.json();
    const { signature_text, signature_html } = body;

    const adminSupabase = createAdminClient();
    const { error } = await adminSupabase
      .from("profiles")
      .update({
        email_signature_text: signature_text || null,
        email_signature_html: signature_html || null,
      })
      .eq("id", user.id);

    if (error) {
      console.error("[Signature PUT] Error:", error);
      return respondError("Failed to update signature", 500);
    }

    return respondSuccess({ updated: true });
  } catch (err) {
    console.error("[Signature PUT] Error:", err);
    return respondError("Failed to update signature", 500);
  }
}

// DELETE: Reset to default signature
export async function DELETE() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return respondError("Unauthorized", 401);

    const adminSupabase = createAdminClient();
    const { error } = await adminSupabase
      .from("profiles")
      .update({
        email_signature_text: null,
        email_signature_html: null,
      })
      .eq("id", user.id);

    if (error) {
      console.error("[Signature DELETE] Error:", error);
      return respondError("Failed to reset signature", 500);
    }

    return respondSuccess({
      signature_text: DEFAULT_SIGNATURE_TEXT,
      signature_html: DEFAULT_SIGNATURE_HTML,
      is_default: true,
    });
  } catch (err) {
    console.error("[Signature DELETE] Error:", err);
    return respondError("Failed to reset signature", 500);
  }
}

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { EmailView } from "@/components/email/EmailView";

export const dynamic = "force-dynamic";

export default async function EmailPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Check if user has connected email
  const { data: account } = await supabase
    .from("email_accounts")
    .select("id, mailbox, last_sync_at, sync_error")
    .eq("user_id", user.id)
    .eq("provider", "outlook")
    .maybeSingle();

  return <EmailView account={account} />;
}


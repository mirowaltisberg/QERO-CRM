import { CallingView } from "@/components/calling/CallingView";
import { serverContactService } from "@/lib/data/server-data-service";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function CallingPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const teamId = typeof params.team === "string" ? params.team : undefined;
  
  // #region agent log
  const fs = require('fs');
  try { fs.appendFileSync('/Users/miro/Desktop/QERO_CRM/.cursor/debug.log', JSON.stringify({location:'calling/page.tsx:13',message:'URL params parsed',data:{rawParamsTeam:params.team,parsedTeamId:teamId,teamIdType:typeof teamId},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'E'})+'\n'); } catch(e) {}
  // #endregion
  
  // Get current user's team ID for TeamFilter component
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let currentUserTeamId: string | null = null;
  
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("team_id")
      .eq("id", user.id)
      .single();
    currentUserTeamId = profile?.team_id || null;
  }
  
  // #region agent log
  try { fs.appendFileSync('/Users/miro/Desktop/QERO_CRM/.cursor/debug.log', JSON.stringify({location:'calling/page.tsx:29',message:'Calling serverContactService.getAll',data:{teamIdParam:teamId},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'E'})+'\n'); } catch(e) {}
  // #endregion
  const contacts = await serverContactService.getAll({ teamId });
  return (
    <CallingView
      initialContacts={contacts}
      currentUserTeamId={currentUserTeamId}
      initialTeamFilter={teamId || currentUserTeamId || "all"}
    />
  );
}

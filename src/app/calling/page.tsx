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
  fetch('http://127.0.0.1:7242/ingest/72691a08-187f-4988-be02-ed969364e6bb',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'calling/page.tsx:13',message:'URL params parsed',data:{rawParamsTeam:params.team,parsedTeamId:teamId,teamIdType:typeof teamId},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'E'})}).catch(()=>{});
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
  fetch('http://127.0.0.1:7242/ingest/72691a08-187f-4988-be02-ed969364e6bb',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'calling/page.tsx:29',message:'Calling serverContactService.getAll',data:{teamIdParam:teamId},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'E'})}).catch(()=>{});
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

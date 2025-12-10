import { createClient } from "@/lib/supabase/server";
import { serverTmaService } from "@/lib/data/server-data-service";
import { TmaView } from "@/components/tma/TmaView";
import type { Team } from "@/lib/types";

export const dynamic = "force-dynamic";

async function getTeams(): Promise<Team[]> {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from("teams")
    .select("id, organization_id, name, color, created_at")
    .order("name", { ascending: true });

  if (error) {
    console.error("[TMA Page] Error fetching teams:", error);
    return [];
  }

  return data || [];
}

async function getUserTeamId(): Promise<string | null> {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  
  const { data: profile } = await supabase
    .from("profiles")
    .select("team_id")
    .eq("id", user.id)
    .single();
  
  return profile?.team_id || null;
}

export default async function TmaPage() {
  const [candidates, teams, userTeamId] = await Promise.all([
    serverTmaService.getAll(),
    getTeams(),
    getUserTeamId(),
  ]);
  
  return <TmaView initialCandidates={candidates} teams={teams} userTeamId={userTeamId} />;
}



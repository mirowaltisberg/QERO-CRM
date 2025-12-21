import { createClient } from "@/lib/supabase/server";
import { VakanzenView } from "@/components/vakanzen/VakanzenView";
import type { Vacancy, TmaRole, Team } from "@/lib/types";

// Simplified contact type for vacancy form (just what we need for selection)
interface ContactForVacancy {
  id: string;
  company_name: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  canton: string | null;
  street: string | null;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
  team_id: string | null;
  team?: { id: string; name: string; color: string } | null;
}

export const dynamic = "force-dynamic";

async function getVacancies(): Promise<Vacancy[]> {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from("vacancies")
    .select(`
      *,
      contact:contacts(id, company_name, phone, email, city, canton, team_id, team:teams(id, name, color)),
      creator:profiles!vacancies_created_by_fkey(id, full_name, avatar_url)
    `)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[Vakanzen Page] Error fetching vacancies:", error);
    return [];
  }

  return data || [];
}

async function getContacts(): Promise<ContactForVacancy[]> {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from("contacts")
    .select("id, company_name, phone, email, city, canton, street, postal_code, latitude, longitude, team_id, team:teams(id, name, color)")
    .order("company_name", { ascending: true });

  if (error) {
    console.error("[Vakanzen Page] Error fetching contacts:", error);
    return [];
  }

  // Transform data - Supabase returns joined relations, need to handle properly
  return (data || []).map((c: Record<string, unknown>) => ({
    id: c.id as string,
    company_name: c.company_name as string,
    phone: c.phone as string | null,
    email: c.email as string | null,
    city: c.city as string | null,
    canton: c.canton as string | null,
    street: c.street as string | null,
    postal_code: c.postal_code as string | null,
    latitude: c.latitude as number | null,
    longitude: c.longitude as number | null,
    team_id: c.team_id as string | null,
    team: c.team as { id: string; name: string; color: string } | null,
  }));
}

async function getAllRoles(): Promise<TmaRole[]> {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from("tma_roles")
    .select(`
      id,
      team_id,
      name,
      color,
      note,
      created_at,
      team:teams(id, name, color)
    `)
    .order("name", { ascending: true });

  if (error) {
    console.error("[Vakanzen Page] Error fetching roles:", error);
    return [];
  }

  // Transform data - handle joined team relation
  return (data || []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    team_id: r.team_id as string,
    name: r.name as string,
    color: r.color as string,
    note: r.note as string | null,
    created_at: r.created_at as string,
    team: r.team as { id: string; name: string; color: string } | null,
  }));
}

async function getTeams(): Promise<Team[]> {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from("teams")
    .select("id, organization_id, name, color, created_at")
    .order("name", { ascending: true });

  if (error) {
    console.error("[Vakanzen Page] Error fetching teams:", error);
    return [];
  }

  return data || [];
}

export default async function VakanzenPage() {
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

  const [vacancies, contacts, roles, teams] = await Promise.all([
    getVacancies(),
    getContacts(),
    getAllRoles(),
    getTeams(),
  ]);

  return (
    <VakanzenView
      initialVacancies={vacancies}
      contacts={contacts}
      roles={roles}
      teams={teams}
      currentUserTeamId={currentUserTeamId}
    />
  );
}

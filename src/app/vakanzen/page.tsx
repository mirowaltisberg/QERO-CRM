import { createClient } from "@/lib/supabase/server";
import { VakanzenView } from "@/components/vakanzen/VakanzenView";
import type { Vacancy } from "@/lib/types";

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
}

export const dynamic = "force-dynamic";

async function getVacancies(): Promise<Vacancy[]> {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from("vacancies")
    .select(`
      *,
      contact:contacts(id, company_name, phone, email, city, canton),
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
    .select("id, company_name, phone, email, city, canton, street, postal_code, latitude, longitude")
    .order("company_name", { ascending: true });

  if (error) {
    console.error("[Vakanzen Page] Error fetching contacts:", error);
    return [];
  }

  return data || [];
}

export default async function VakanzenPage() {
  const [vacancies, contacts] = await Promise.all([
    getVacancies(),
    getContacts(),
  ]);

  return <VakanzenView initialVacancies={vacancies} contacts={contacts} />;
}

import { ContactsTable } from "@/components/contacts/ContactsTable";
import { serverContactService } from "@/lib/data/server-data-service";

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const contacts = await serverContactService.getAll();
  return <ContactsTable initialContacts={contacts} />;
}

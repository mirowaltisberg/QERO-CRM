import { ContactsTable } from "@/components/contacts/ContactsTable";
import { contactService } from "@/lib/data/data-service";

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const contacts = await contactService.getAll();
  return <ContactsTable initialContacts={contacts} />;
}


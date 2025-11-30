import { CallingView } from "@/components/calling/CallingView";
import { contactService } from "@/lib/data/data-service";

export default async function CallingPage() {
  const contacts = await contactService.getAll();
  return <CallingView initialContacts={contacts} />;
}


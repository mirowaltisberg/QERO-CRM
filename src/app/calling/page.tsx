import { CallingView } from "@/components/calling/CallingView";
import { serverContactService } from "@/lib/data/server-data-service";

export const dynamic = "force-dynamic";

export default async function CallingPage() {
  const contacts = await serverContactService.getAll();
  return <CallingView initialContacts={contacts} />;
}

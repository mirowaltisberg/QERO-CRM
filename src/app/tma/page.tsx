import { serverTmaService } from "@/lib/data/server-data-service";
import { TmaView } from "@/components/tma/TmaView";

export const dynamic = "force-dynamic";

export default async function TmaPage() {
  const candidates = await serverTmaService.getAll();
  return <TmaView initialCandidates={candidates} />;
}


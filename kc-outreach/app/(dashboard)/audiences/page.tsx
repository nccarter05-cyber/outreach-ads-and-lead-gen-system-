import { getLeads, getSegments, getSequences } from "@/lib/queries";
import { AudiencesClient } from "./audiences-client";

export default async function AudiencesPage() {
  const [segments, leads, sequences] = await Promise.all([
    getSegments(),
    getLeads(),
    getSequences(),
  ]);
  return <AudiencesClient segments={segments} leads={leads} sequences={sequences} />;
}

import { getCampaigns, getLeads, getSequences } from "@/lib/queries";
import { CampaignsClient } from "./campaigns-client";

export default async function CampaignsPage() {
  const [campaigns, sequences, leads] = await Promise.all([
    getCampaigns(),
    getSequences(),
    getLeads(),
  ]);
  return <CampaignsClient campaigns={campaigns} sequences={sequences} leads={leads} />;
}

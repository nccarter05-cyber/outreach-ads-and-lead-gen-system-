import { Suspense } from "react";
import { getLeads, getSegments } from "@/lib/queries";
import { LeadsClient } from "./leads-client";

export default async function LeadsPage() {
  const [leads, segments] = await Promise.all([getLeads(), getSegments()]);
  return (
    <Suspense>
      <LeadsClient leads={leads} segments={segments} />
    </Suspense>
  );
}

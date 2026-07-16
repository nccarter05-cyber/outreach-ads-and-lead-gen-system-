import { getCallScripts, getLeads, getSegments } from "@/lib/queries";
import { CallsClient } from "./calls-client";

export default async function CallListPage() {
  const [leads, segments, callScripts] = await Promise.all([
    getLeads(),
    getSegments(),
    getCallScripts(),
  ]);
  return <CallsClient leads={leads} segments={segments} callScripts={callScripts} />;
}

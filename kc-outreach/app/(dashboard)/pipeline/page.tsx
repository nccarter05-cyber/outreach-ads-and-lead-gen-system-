import { getDeals } from "@/lib/queries";
import { PipelineClient } from "./pipeline-client";

export default async function PipelinePage() {
  return <PipelineClient deals={await getDeals()} />;
}

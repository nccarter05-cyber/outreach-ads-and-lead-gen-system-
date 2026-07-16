import { getSegments, getSequences } from "@/lib/queries";
import { SequencesClient } from "./sequences-client";

export default async function SequencesPage() {
  const [sequences, segments] = await Promise.all([getSequences(), getSegments()]);
  return <SequencesClient sequences={sequences} segments={segments} />;
}

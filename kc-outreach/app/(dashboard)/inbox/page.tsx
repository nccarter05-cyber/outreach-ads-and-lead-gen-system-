import { getInboxThreads } from "@/lib/queries";
import { InboxClient } from "./inbox-client";

export default async function InboxPage() {
  return <InboxClient threads={await getInboxThreads()} />;
}

import { AppSidebar } from "@/components/app-sidebar";
import { requireUser } from "@/lib/auth";

// All dashboard data comes from Supabase at request time.
export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The authoritative auth check for every route in this group. proxy.ts
  // already turns away unauthenticated traffic, but that is an optimistic
  // edge check; this one runs next to the data and redirects to /login.
  const user = await requireUser();

  return (
    <div className="flex min-h-screen">
      <AppSidebar userEmail={user.email} />
      <main className="bg-throne ml-60 flex-1 px-10 py-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}

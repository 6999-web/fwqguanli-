import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { getSessionUser } from "@/lib/auth";
import { getDashboardData } from "@/lib/dashboard";

export default async function HomePage() {
  const session = await getSessionUser();
  if (!session) {
    redirect("/login");
  }
  const data = await getDashboardData();
  return (
    <AppShell>
      <DashboardClient initialData={data} />
    </AppShell>
  );
}

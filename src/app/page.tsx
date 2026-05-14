import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { UserDashboard } from "@/components/dashboard/user-dashboard";
import { getSessionUser } from "@/lib/auth";
import { getAdminDashboardData, getUserDashboardData } from "@/lib/dashboard";

export default async function HomePage() {
  const session = await getSessionUser();
  if (!session) {
    redirect("/login");
  }

  if (session.role === "USER") {
    const data = await getUserDashboardData(session.id);
    return (
      <AppShell>
        <UserDashboard data={data} />
      </AppShell>
    );
  }

  const data = await getAdminDashboardData();
  return (
    <AppShell>
      <DashboardClient initialData={data} />
    </AppShell>
  );
}

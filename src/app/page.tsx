import Link from "next/link";
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
      <div className="relative">
        {session.role === "ADMIN" ? (
          <div className="absolute right-6 top-6 z-10 lg:right-8 lg:top-8">
            <Link
              href="/usage-overview"
              className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100 transition hover:bg-emerald-500/20"
            >
              使用总览
            </Link>
          </div>
        ) : null}
        <DashboardClient initialData={data} />
      </div>
    </AppShell>
  );
}

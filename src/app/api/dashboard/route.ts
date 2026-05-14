import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { isCollectorRunning, triggerCollectorRun } from "@/lib/collector-runner";
import { getAdminDashboardData, getUserDashboardData } from "@/lib/dashboard";
import { requirePermission } from "@/lib/rbac";

export async function GET() {
  try {
    const user = await requirePermission("server:read");
    const data =
      user.role.code === "USER"
        ? await getUserDashboardData(user.id)
        : await getAdminDashboardData();
    return NextResponse.json(data);
  } catch (error) {
    return apiError(error);
  }
}

export async function POST() {
  try {
    const user = await requirePermission("server:read");
    if (user.role.code === "USER") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    if (isCollectorRunning()) {
      return NextResponse.json({ ok: true, running: true, message: "collector already running" });
    }

    void triggerCollectorRun();
    return NextResponse.json({ ok: true, running: true, message: "collector started" });
  } catch (error) {
    return apiError(error);
  }
}

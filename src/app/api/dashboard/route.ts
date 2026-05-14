import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { isCollectorRunning, triggerCollectorRun } from "@/lib/collector-runner";
import { getDashboardData } from "@/lib/dashboard";
import { requirePermission } from "@/lib/rbac";

export async function GET() {
  try {
    await requirePermission("server:read");
    const data = await getDashboardData();
    return NextResponse.json(data);
  } catch (error) {
    return apiError(error);
  }
}

export async function POST() {
  try {
    await requirePermission("server:read");

    if (isCollectorRunning()) {
      return NextResponse.json({ ok: true, running: true, message: "collector already running" });
    }

    void triggerCollectorRun();
    return NextResponse.json({ ok: true, running: true, message: "collector started" });
  } catch (error) {
    return apiError(error);
  }
}

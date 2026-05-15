import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requirePermission } from "@/lib/rbac";
import { canViewUsageOverview, getUsageOverviewData } from "@/lib/usage-overview";

export async function GET() {
  try {
    const user = await requirePermission("server:read");
    if (!canViewUsageOverview(user.role.code)) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json(await getUsageOverviewData());
  } catch (error) {
    return apiError(error);
  }
}

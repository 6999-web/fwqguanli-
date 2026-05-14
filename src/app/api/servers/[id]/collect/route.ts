import { NextRequest, NextResponse } from "next/server";
import { apiError, getRequestIp } from "@/lib/api";
import { writeAuditLog } from "@/lib/audit";
import { collectServerMetrics } from "@/lib/collector";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission("server:write");
    const { id } = await params;
    const server = await prisma.server.findUnique({ where: { id } });
    if (!server) {
      return NextResponse.json({ message: "Server not found" }, { status: 404 });
    }
    const metric = await collectServerMetrics(server);
    await writeAuditLog({
      userId: user.id,
      action: "COLLECT_SERVER_METRIC",
      module: "collector",
      targetId: id,
      ipAddress: getRequestIp(request),
      detail: { collectedAt: metric.collectedAt },
    });
    return NextResponse.json(metric);
  } catch (error) {
    return apiError(error);
  }
}

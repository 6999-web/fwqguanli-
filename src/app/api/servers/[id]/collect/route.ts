import { NextRequest, NextResponse } from "next/server";
import { apiError, getRequestIp } from "@/lib/api";
import { writeAuditLog } from "@/lib/audit";
import { collectServerMetrics } from "@/lib/collector";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { canAttemptServerConnection } from "@/lib/server-connection-config";
import { runServerConnectivityDiagnostic } from "@/lib/ssh/diagnostics";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let serverId = "";
  try {
    const user = await requirePermission("server:write");
    const { id } = await params;
    serverId = id;
    const server = await prisma.server.findUnique({ where: { id } });
    if (!server) {
      return NextResponse.json({ message: "Server not found" }, { status: 404 });
    }
    if (!canAttemptServerConnection(server) && !server.serverPassword) {
      return NextResponse.json(
        {
          message: "SSH connection configuration is incomplete. Confirm the SSH port before collecting metrics.",
          diagnostic: await runServerConnectivityDiagnostic(server),
        },
        { status: 400 },
      );
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
    if (serverId) {
      const server = await prisma.server.findUnique({ where: { id: serverId } });
      if (server) {
        const diagnostic = await runServerConnectivityDiagnostic(server).catch(() => null);
        return NextResponse.json(
          {
            message: error instanceof Error ? error.message : "Collector failed",
            diagnostic,
          },
          { status: 400 },
        );
      }
    }
    return apiError(error);
  }
}

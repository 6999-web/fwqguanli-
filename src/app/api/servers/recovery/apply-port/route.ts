import { NextRequest, NextResponse } from "next/server";
import { apiError, getRequestIp } from "@/lib/api";
import { sanitizeServer } from "@/lib/api-serializers";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { normalizeSshPort } from "@/lib/server-connection-config";

export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission("server:write");
    const body = await request.json();
    if (typeof body.serverId !== "string" || !body.serverId) {
      return NextResponse.json({ message: "serverId is required" }, { status: 400 });
    }

    const sshPort = normalizeSshPort(body.sshPort);
    if (!sshPort || sshPort < 1) {
      return NextResponse.json({ message: "sshPort is invalid" }, { status: 400 });
    }

    const current = await prisma.server.findUnique({ where: { id: body.serverId } });
    if (!current) {
      return NextResponse.json({ message: "Server not found" }, { status: 404 });
    }

    const updated = await prisma.server.update({
      where: { id: body.serverId },
      data: { sshPort },
      include: {
        currentOwner: true,
        backupOwner: true,
        environment: true,
        metrics: { orderBy: { collectedAt: "desc" }, take: 1 },
        alerts: { orderBy: { detectedAt: "desc" }, take: 1 },
      },
    });

    await writeAuditLog({
      userId: user.id,
      action: "RECOVER_SERVER_PORT",
      module: "server",
      targetId: updated.id,
      ipAddress: getRequestIp(request),
      detail: {
        connectionConfigChange: {
          source: "recovery-apply-port",
          previousPort: current.sshPort,
          nextPort: updated.sshPort,
        },
      },
    });

    return NextResponse.json({ server: sanitizeServer(updated, user.role.code) });
  } catch (error) {
    return apiError(error);
  }
}

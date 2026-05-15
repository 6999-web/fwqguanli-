import { NextRequest, NextResponse } from "next/server";
import { apiError, getRequestIp } from "@/lib/api";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { DEFAULT_RECOVERY_PORTS, normalizeSshPort } from "@/lib/server-connection-config";
import { scanTcpPorts } from "@/lib/ssh/diagnostics";

export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission("server:write");
    const body = await request.json();
    const serverIds = Array.isArray(body.serverIds)
      ? body.serverIds.filter((item: unknown): item is string => typeof item === "string")
      : [];
    if (serverIds.length === 0) {
      return NextResponse.json({ message: "serverIds is required" }, { status: 400 });
    }

    const requestedPorts = Array.isArray(body.candidatePorts)
      ? body.candidatePorts
          .map((item: unknown) => normalizeSshPort(item))
          .filter((item: number | null): item is number => item !== null && item > 0)
      : [];
    const candidatePorts = Array.from(new Set([...(requestedPorts.length > 0 ? requestedPorts : DEFAULT_RECOVERY_PORTS)]));

    const servers = await prisma.server.findMany({
      where: { id: { in: serverIds } },
      select: { id: true, serverCode: true, publicIp: true, sshPort: true },
    });

    const results = [];
    for (const server of servers) {
      const probes = await scanTcpPorts(server.publicIp, candidatePorts);
      results.push({
        serverId: server.id,
        serverCode: server.serverCode,
        publicIp: server.publicIp,
        configuredPort: server.sshPort,
        probes,
      });
    }

    await writeAuditLog({
      userId: user.id,
      action: "SCAN_SERVER_PORTS",
      module: "server",
      ipAddress: getRequestIp(request),
      detail: {
        serverIds,
        candidatePorts,
      },
    });

    return NextResponse.json({ candidatePorts, results });
  } catch (error) {
    return apiError(error);
  }
}

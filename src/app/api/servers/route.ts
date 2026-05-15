import { NextRequest, NextResponse } from "next/server";
import { ServerStatus } from "@prisma/client";
import { apiError, getRequestIp } from "@/lib/api";
import { sanitizeServer } from "@/lib/api-serializers";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { encryptText } from "@/lib/crypto";
import { generateServerCode } from "@/lib/server-code";
import { writeAuditLog } from "@/lib/audit";

export async function GET() {
  try {
    const user = await requirePermission("server:read");
    const servers = await prisma.server.findMany({
      include: {
        currentOwner: true,
        backupOwner: true,
        environment: true,
        metrics: { orderBy: { collectedAt: "desc" }, take: 1 },
        alerts: { orderBy: { detectedAt: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
    });

    if (user.role.code === "USER") {
      return NextResponse.json(
        servers.map((server) => ({
          id: server.id,
          serverCode: server.serverCode,
          region: server.region,
          provider: server.provider ?? "Unknown",
          status: server.status,
        })),
      );
    }

    return NextResponse.json(
      servers.map((server) => sanitizeServer(server, user.role.code)),
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission("server:write");
    const body = await request.json();
    const serverCode = await generateServerCode(body.region);

    const created = await prisma.server.create({
      data: {
        serverCode,
        accountId: body.accountId,
        loginEmail: body.loginEmail,
        loginEmailPassword: encryptText(body.loginEmailPassword),
        region: body.region,
        publicIp: body.publicIp,
        privateIp: body.privateIp,
        provider: body.provider,
        serverUsername: body.serverUsername,
        sshPort: body.sshPort ? Number(body.sshPort) : 22,
        serverPassword: encryptText(body.serverPassword),
        purpose: body.purpose,
        currentOwnerId: body.currentOwnerId,
        backupOwnerId: body.backupOwnerId,
        status: body.status ?? ServerStatus.IDLE,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
        cpuSpec: body.cpuSpec,
        memorySpec: body.memorySpec,
        diskSpec: body.diskSpec,
        gpuSpec: body.gpuSpec,
        bandwidth: body.bandwidth,
        osVersion: body.osVersion,
        notes: body.notes,
      },
    });

    await writeAuditLog({
      userId: user.id,
      action: "CREATE_SERVER",
      module: "server",
      targetId: created.id,
      ipAddress: getRequestIp(request),
      detail: { serverCode: created.serverCode, publicIp: created.publicIp },
    });

    return NextResponse.json(sanitizeServer(created, user.role.code));
  } catch (error) {
    return apiError(error);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { apiError, getRequestIp } from "@/lib/api";
import { sanitizeServer } from "@/lib/api-serializers";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { encryptText } from "@/lib/crypto";
import { writeAuditLog } from "@/lib/audit";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission("server:read");
    const { id } = await params;
    const server = await prisma.server.findUnique({
      where: { id },
      include: {
        currentOwner: true,
        backupOwner: true,
        environment: true,
        metrics: { orderBy: { collectedAt: "desc" }, take: 20 },
        alerts: { orderBy: { detectedAt: "desc" }, take: 20 },
      },
    });

    if (!server) {
      return NextResponse.json({ message: "Not found" }, { status: 404 });
    }

    return NextResponse.json(sanitizeServer(server, user.role.code));
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission("server:write");
    const { id } = await params;
    const body = await request.json();

    const updated = await prisma.server.update({
      where: { id },
      data: {
        accountId: body.accountId,
        loginEmail: body.loginEmail,
        loginEmailPassword: body.loginEmailPassword
          ? encryptText(body.loginEmailPassword)
          : undefined,
        region: body.region,
        publicIp: body.publicIp,
        privateIp: body.privateIp,
        provider: body.provider,
        serverUsername: body.serverUsername,
        sshPort: body.sshPort ? Number(body.sshPort) : 1010,
        serverPassword: body.serverPassword ? encryptText(body.serverPassword) : undefined,
        purpose: body.purpose,
        currentOwnerId: body.currentOwnerId,
        backupOwnerId: body.backupOwnerId,
        status: body.status,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
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
      action: "UPDATE_SERVER",
      module: "server",
      targetId: updated.id,
      ipAddress: getRequestIp(request),
      detail: body,
    });

    return NextResponse.json(sanitizeServer(updated, user.role.code));
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission("server:write");
    const { id } = await params;
    await prisma.server.delete({ where: { id } });
    await writeAuditLog({
      userId: user.id,
      action: "DELETE_SERVER",
      module: "server",
      targetId: id,
      ipAddress: getRequestIp(request),
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}

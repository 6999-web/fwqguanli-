import { NextRequest, NextResponse } from "next/server";
import { RequestStatus } from "@prisma/client";
import { apiError, getRequestIp } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requirePermission("approval:manage");
    const { id } = await params;
    const body = await request.json();
    const status = body.approve ? RequestStatus.APPROVED : RequestStatus.REJECTED;

    const existing = await prisma.portRequest.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ message: "Request not found" }, { status: 404 });
    }
    if (existing.status !== RequestStatus.PENDING) {
      return NextResponse.json({ message: "Request already processed" }, { status: 409 });
    }

    const portRequest = await prisma.portRequest.update({
      where: { id },
      data: {
        approverId: admin.id,
        status,
        openedAt: body.approve ? new Date() : undefined,
        closedAt: body.approve && existing.action === "CLOSE" ? new Date() : undefined,
      },
    });

    if (body.approve) {
      await prisma.firewallRule.create({
        data: {
          serverId: portRequest.serverId,
          port: portRequest.port,
          protocol: portRequest.protocol,
          action: portRequest.action,
          description: portRequest.purpose,
          syncedAt: new Date(),
        },
      });
    }

    await prisma.operationApproval.updateMany({
      where: { serverId: portRequest.serverId, type: "PORT_CHANGE", status: RequestStatus.PENDING },
      data: { approverId: admin.id, status },
    });

    await writeAuditLog({
      userId: admin.id,
      action: "APPROVE_PORT_REQUEST",
      module: "port",
      targetId: id,
      ipAddress: getRequestIp(request),
      detail: { approve: body.approve },
    });

    return NextResponse.json(portRequest);
  } catch (error) {
    return apiError(error);
  }
}

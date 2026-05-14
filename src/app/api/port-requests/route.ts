import { NextRequest, NextResponse } from "next/server";
import { RequestStatus, RiskLevel } from "@prisma/client";
import { apiError, getRequestIp } from "@/lib/api";
import { sanitizeServer, sanitizeUser } from "@/lib/api-serializers";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";

export async function GET() {
  try {
    const user = await requirePermission("port:request");
    const requests = await prisma.portRequest.findMany({
      where: user.role.code === "ADMIN" ? undefined : { requesterId: user.id },
      include: { server: true, requester: true, approver: true },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(
      requests.map((request) => ({
        ...request,
        server: sanitizeServer(request.server, user.role.code),
        requester: sanitizeUser(request.requester),
        approver: sanitizeUser(request.approver),
      })),
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission("port:request");
    const body = await request.json();
    const port = Number(body.port);

    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      return NextResponse.json({ message: "Port must be between 1 and 65535" }, { status: 400 });
    }

    if (!["TCP", "UDP"].includes(body.protocol)) {
      return NextResponse.json({ message: "Protocol must be TCP or UDP" }, { status: 400 });
    }

    const existingPending = await prisma.portRequest.findFirst({
      where: {
        serverId: body.serverId,
        port,
        protocol: body.protocol,
        action: body.action ?? "OPEN",
        status: RequestStatus.PENDING,
      },
    });
    if (existingPending) {
      return NextResponse.json({ message: "A matching pending port request already exists" }, { status: 409 });
    }

    const created = await prisma.portRequest.create({
      data: {
        serverId: body.serverId,
        port,
        protocol: body.protocol,
        purpose: body.purpose,
        requesterId: user.id,
        action: body.action ?? "OPEN",
        status: RequestStatus.PENDING,
      },
    });

    await prisma.operationApproval.create({
      data: {
        serverId: body.serverId,
        type: "PORT_CHANGE",
        title: `${body.action ?? "OPEN"} 端口 ${body.port}`,
        riskLevel: RiskLevel.HIGH,
        status: RequestStatus.PENDING,
        requesterId: user.id,
        payload: {
          ...body,
          requestId: created.id,
        },
      },
    });

    await writeAuditLog({
      userId: user.id,
      action: "CREATE_PORT_REQUEST",
      module: "port",
      targetId: created.id,
      ipAddress: getRequestIp(request),
      detail: body,
    });

    return NextResponse.json(created);
  } catch (error) {
    return apiError(error);
  }
}

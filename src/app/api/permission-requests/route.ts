import { NextRequest, NextResponse } from "next/server";
import { RequestStatus, RiskLevel } from "@prisma/client";
import { apiError, getRequestIp } from "@/lib/api";
import { sanitizeServer, sanitizeUser } from "@/lib/api-serializers";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";

export async function GET() {
  try {
    const user = await requirePermission("workspace:read");
    const requests = await prisma.permissionRequest.findMany({
      where: user.role.code === "ADMIN" ? undefined : { requesterId: user.id },
      include: { requester: true, approver: true, server: true },
      orderBy: { createdAt: "desc" },
    });

    const requestIds = requests.map((request) => request.id);
    const workspaces = requestIds.length
      ? await prisma.workspace.findMany({
          where: {
            permissionRequestId: {
              in: requestIds,
            },
          },
          orderBy: { createdAt: "desc" },
        })
      : [];
    const latestWorkspaceByRequestId = new Map(
      workspaces.map((workspace) => [workspace.permissionRequestId, workspace]),
    );

    return NextResponse.json(
      requests.map((request) => ({
        ...request,
        requester: sanitizeUser(request.requester),
        approver: sanitizeUser(request.approver),
        server: sanitizeServer(request.server, user.role.code),
        latestWorkspace: latestWorkspaceByRequestId.get(request.id) ?? null,
      })),
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission("workspace:request");
    const body = await request.json();

    const requiredPorts = Array.isArray(body.requiredPorts) ? body.requiredPorts : [];
    const requiredEnvironments = Array.isArray(body.requiredEnvironments) ? body.requiredEnvironments : [];
    const requestedCpu = body.requestedCpu ? Number(body.requestedCpu) : null;
    const requestedMemoryMb = body.requestedMemoryMb ? Number(body.requestedMemoryMb) : null;
    const requestedDiskGb = body.requestedDiskGb ? Number(body.requestedDiskGb) : null;
    const requestedGpu = body.requestedGpu ? Number(body.requestedGpu) : null;
    const requestedPortCount = body.requestedPortCount ? Number(body.requestedPortCount) : null;

    if (!body.purpose || !body.expectedDuration) {
      return NextResponse.json({ message: "Missing required fields" }, { status: 400 });
    }

    const created = await prisma.permissionRequest.create({
      data: {
        requesterId: user.id,
        serverId: body.serverId || undefined,
        requestType: "WORKSPACE_ACCESS",
        purpose: body.purpose,
        expectedDuration: body.expectedDuration,
        requiredConfig: body.requiredConfig,
        requiredPorts,
        requiredEnvironments,
        requestedCpu: requestedCpu ?? undefined,
        requestedMemoryMb: requestedMemoryMb ?? undefined,
        requestedDiskGb: requestedDiskGb ?? undefined,
        requestedGpu: requestedGpu ?? undefined,
        requestedPortCount: requestedPortCount ?? undefined,
        note: body.note,
        status: RequestStatus.PENDING,
      },
      include: { requester: true },
    });

    await prisma.operationApproval.create({
      data: {
        serverId: body.serverId || undefined,
        type: "WORKSPACE_ACCESS",
        title: `工作区访问申请 - ${created.requester.name}`,
        riskLevel: requestedGpu && requestedGpu > 0 ? RiskLevel.HIGH : RiskLevel.MEDIUM,
        status: RequestStatus.PENDING,
        requesterId: user.id,
        payload: {
          requestId: created.id,
          serverId: body.serverId || null,
          purpose: body.purpose,
          expectedDuration: body.expectedDuration,
          requiredConfig: body.requiredConfig || "",
          requiredPorts,
          requiredEnvironments,
          requestedCpu,
          requestedMemoryMb,
          requestedDiskGb,
          requestedGpu,
          requestedPortCount,
          note: body.note || "",
        },
      },
    });

    await writeAuditLog({
      userId: user.id,
      action: "CREATE_WORKSPACE_REQUEST",
      module: "workspace",
      targetId: created.id,
      ipAddress: getRequestIp(request),
      detail: {
        purpose: body.purpose,
        serverId: body.serverId || null,
        requestedCpu,
        requestedMemoryMb,
        requestedDiskGb,
        requestedGpu,
        requestedPortCount,
      },
    });

    return NextResponse.json({
      ...created,
      requester: sanitizeUser(created.requester),
    });
  } catch (error) {
    return apiError(error);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { RequestStatus, ServerStatus } from "@prisma/client";
import { apiError, getRequestIp } from "@/lib/api";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission("server:read");
    const { id } = await params;

    const result = await prisma.$transaction(async (tx) => {
      const handover = await tx.handoverRecord.update({
        where: { id },
        data: {
          confirmStatus: RequestStatus.COMPLETED,
          actualReturnedAt: new Date(),
        },
      });

      if (!handover.workspaceId) {
        await tx.server.update({
          where: { id: handover.serverId },
          data: {
            status: ServerStatus.IDLE,
            currentOwnerId: null,
            expiresAt: null,
          },
        });
      }

      return handover;
    });

    await writeAuditLog({
      userId: user.id,
      action: "RETURN_HANDOVER",
      module: "handover",
      targetId: id,
      ipAddress: getRequestIp(request),
    });

    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}

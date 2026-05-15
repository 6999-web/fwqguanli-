import { NextRequest, NextResponse } from "next/server";
import { RequestStatus } from "@prisma/client";
import { apiError, getRequestIp } from "@/lib/api";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { syncManagedServerStatus } from "@/lib/server-status";

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
            currentOwnerId: null,
            expiresAt: null,
          },
        });
      }

      return handover;
    });
    await syncManagedServerStatus(result.serverId);

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

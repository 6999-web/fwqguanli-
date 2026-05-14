import { NextRequest, NextResponse } from "next/server";
import { RequestStatus } from "@prisma/client";
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

    const handover = await prisma.handoverRecord.update({
      where: { id },
      data: {
        confirmStatus: RequestStatus.APPROVED,
        confirmedAt: new Date(),
      },
    });

    await writeAuditLog({
      userId: user.id,
      action: "CONFIRM_HANDOVER",
      module: "handover",
      targetId: id,
      ipAddress: getRequestIp(request),
    });

    return NextResponse.json(handover);
  } catch (error) {
    return apiError(error);
  }
}

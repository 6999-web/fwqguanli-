import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

export async function GET() {
  try {
    await requirePermission("server:read");
    const handovers = await prisma.handoverRecord.findMany({
      include: {
        server: true,
        owner: true,
      },
      orderBy: { handoverAt: "desc" },
    });

    return NextResponse.json(
      handovers.map((item) => ({
        id: item.id,
        serverId: item.serverId,
        serverCode: item.server.serverCode,
        publicIp: item.publicIp,
        loginMethod: item.loginMethod,
        owner: item.owner?.name ?? "未分配",
        handoverAt: item.handoverAt,
        plannedReturnAt: item.plannedReturnAt,
        actualReturnedAt: item.actualReturnedAt,
        confirmedAt: item.confirmedAt,
        confirmStatus: item.confirmStatus,
      })),
    );
  } catch (error) {
    return apiError(error);
  }
}

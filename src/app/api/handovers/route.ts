import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { decryptText } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { decryptWorkspacePassword } from "@/lib/workspace-orchestrator";

export async function GET() {
  try {
    await requirePermission("server:read");
    const handovers = await prisma.handoverRecord.findMany({
      include: {
        server: true,
        owner: true,
        workspace: true,
      },
      orderBy: { handoverAt: "desc" },
    });

    return NextResponse.json(
      handovers.map((item) => {
        const accountName = item.workspace?.sshUsername ?? item.server.serverUsername;
        const accountPassword = item.workspace
          ? decryptWorkspacePassword(item.workspace)
          : decryptText(item.server.serverPassword);

        return {
          id: item.id,
          serverId: item.serverId,
          workspaceId: item.workspaceId,
          serverCode: item.server.serverCode,
          publicIp: item.publicIp,
          loginMethod: item.loginMethod,
          owner: item.owner?.name ?? "Unassigned",
          accountName,
          accountPassword,
          accessHost: item.workspace?.sshHost ?? item.publicIp,
          accessPort: item.workspace?.sshPort ?? item.server.sshPort,
          handoverAt: item.handoverAt,
          plannedReturnAt: item.plannedReturnAt,
          actualReturnedAt: item.actualReturnedAt,
          confirmedAt: item.confirmedAt,
          confirmStatus: item.confirmStatus,
        };
      }),
    );
  } catch (error) {
    return apiError(error);
  }
}

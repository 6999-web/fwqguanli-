import { RequestStatus, ServerStatus, WorkspaceStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function resolveManagedServerStatus(serverId: string) {
  const server = await prisma.server.findUnique({
    where: { id: serverId },
    select: {
      id: true,
      status: true,
      currentOwnerId: true,
      expiresAt: true,
      workspaces: {
        where: {
          deletedAt: null,
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } },
          ],
          status: {
            in: [WorkspaceStatus.PROVISIONING, WorkspaceStatus.RUNNING, WorkspaceStatus.STOPPED, WorkspaceStatus.FAILED],
          },
        },
        select: { id: true },
        take: 1,
      },
      handovers: {
        where: {
          OR: [{ actualReturnedAt: null }, { confirmStatus: { not: RequestStatus.COMPLETED } }],
        },
        select: { id: true },
        take: 1,
      },
    },
  });

  if (!server) {
    throw new Error("Server not found");
  }

  if (server.status === ServerStatus.DISABLED || server.status === ServerStatus.MAINTENANCE) {
    return server.status;
  }

  const hasWorkspace = server.workspaces.length > 0;
  const hasHandover = server.handovers.length > 0;
  const hasOwnerAssignment = Boolean(server.currentOwnerId);
  const hasActiveAssignment = hasOwnerAssignment && (!server.expiresAt || server.expiresAt > new Date());

  return hasWorkspace || hasHandover || hasActiveAssignment ? ServerStatus.IN_USE : ServerStatus.IDLE;
}

export async function syncManagedServerStatus(serverId: string) {
  const nextStatus = await resolveManagedServerStatus(serverId);
  return prisma.server.update({
    where: { id: serverId },
    data: { status: nextStatus },
  });
}

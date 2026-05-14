import { prisma } from "@/lib/prisma";

const DEFAULT_SSH_PORT_BASE = Number(process.env.WORKSPACE_SSH_PORT_BASE ?? 22000);
const DEFAULT_PORT_BLOCK_SIZE = Number(process.env.WORKSPACE_PORT_BLOCK_SIZE ?? 20);

export async function ensureWorkspacePorts(options: {
  serverId: string;
  sshPort?: number | null;
  hostPortStart?: number | null;
  hostPortEnd?: number | null;
  requestedPortCount?: number | null;
  excludeWorkspaceId?: string | null;
}) {
  const blockSize = Math.max(1, options.requestedPortCount ?? DEFAULT_PORT_BLOCK_SIZE);
  const existing = await prisma.workspace.findMany({
    where: {
      serverId: options.serverId,
      deletedAt: null,
      ...(options.excludeWorkspaceId ? { id: { not: options.excludeWorkspaceId } } : {}),
    },
    select: {
      id: true,
      sshPort: true,
      hostPortStart: true,
      hostPortEnd: true,
    },
  });

  if (options.sshPort && options.hostPortStart && options.hostPortEnd) {
    assertPortAvailability(existing, options.sshPort, options.hostPortStart, options.hostPortEnd);
    return {
      sshPort: options.sshPort,
      hostPortStart: options.hostPortStart,
      hostPortEnd: options.hostPortEnd,
    };
  }

  let sshPort = options.sshPort ?? DEFAULT_SSH_PORT_BASE;
  let hostPortStart = options.hostPortStart ?? sshPort + 1;
  let hostPortEnd = options.hostPortEnd ?? hostPortStart + blockSize - 1;

  while (hasConflict(existing, sshPort, hostPortStart, hostPortEnd)) {
    sshPort = hostPortEnd + 1;
    hostPortStart = sshPort + 1;
    hostPortEnd = hostPortStart + blockSize - 1;
  }

  return { sshPort, hostPortStart, hostPortEnd };
}

function assertPortAvailability(
  existing: Array<{ sshPort: number; hostPortStart: number; hostPortEnd: number }>,
  sshPort: number,
  hostPortStart: number,
  hostPortEnd: number,
) {
  if (hasConflict(existing, sshPort, hostPortStart, hostPortEnd)) {
    throw new Error("Requested workspace ports conflict with an existing workspace");
  }
}

function hasConflict(
  existing: Array<{ sshPort: number; hostPortStart: number; hostPortEnd: number }>,
  sshPort: number,
  hostPortStart: number,
  hostPortEnd: number,
) {
  return existing.some((item) => {
    const sshConflict = item.sshPort === sshPort || between(sshPort, item.hostPortStart, item.hostPortEnd);
    const rangeConflict =
      between(item.hostPortStart, hostPortStart, hostPortEnd) ||
      between(item.hostPortEnd, hostPortStart, hostPortEnd) ||
      between(hostPortStart, item.hostPortStart, item.hostPortEnd) ||
      between(hostPortEnd, item.hostPortStart, item.hostPortEnd);
    return sshConflict || rangeConflict;
  });
}

function between(value: number, start: number, end: number) {
  return value >= start && value <= end;
}


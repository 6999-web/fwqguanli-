import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

export async function GET() {
  try {
    const user = await requirePermission("port:request");

    if (user.role.code === "USER") {
      const workspaces = await prisma.workspace.findMany({
        where: {
          ownerId: user.id,
          deletedAt: null,
        },
        include: {
          server: {
            include: {
              environment: true,
              metrics: {
                orderBy: { collectedAt: "desc" },
                take: 1,
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      const byServer = new Map<string, (typeof workspaces)[number][]>();
      for (const workspace of workspaces) {
        const list = byServer.get(workspace.serverId) ?? [];
        list.push(workspace);
        byServer.set(workspace.serverId, list);
      }

      return NextResponse.json(
        Array.from(byServer.values()).map((items) => {
          const first = items[0];
          const latestMetric = first.server.metrics[0];
          return {
            id: first.server.id,
            serverCode: first.server.serverCode,
            publicIp: first.server.publicIp,
            region: first.server.region,
            status: first.server.status,
            openPorts: normalizeStringArray(first.server.environment?.openPorts),
            openPortsCount: latestMetric?.openPortsCount ?? 0,
            workspaces: items.map((workspace) => ({
              id: workspace.id,
              name: workspace.name,
              sshPort: workspace.sshPort,
              hostPortStart: workspace.hostPortStart,
              hostPortEnd: workspace.hostPortEnd,
              status: workspace.status,
            })),
          };
        }),
      );
    }

    const servers = await prisma.server.findMany({
      include: {
        currentOwner: true,
        environment: true,
        metrics: {
          orderBy: { collectedAt: "desc" },
          take: 1,
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json(
      servers.map((server) => ({
        id: server.id,
        serverCode: server.serverCode,
        publicIp: server.publicIp,
        region: server.region,
        status: server.status,
        currentOwner: server.currentOwner?.name ?? "未分配",
        openPorts: normalizeStringArray(server.environment?.openPorts),
        openPortsCount: server.metrics[0]?.openPortsCount ?? 0,
        workspaces: [],
      })),
    );
  } catch (error) {
    return apiError(error);
  }
}

function normalizeStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.filter((item): item is string => typeof item === "string");
}

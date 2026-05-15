import { RequestStatus, RoleCode, ServerStatus, WorkspaceStatus } from "@prisma/client";
import { subDays } from "date-fns";
import { prisma } from "@/lib/prisma";

type SuggestedAction = "保留" | "回收" | "待确认";

export async function getUsageOverviewData() {
  const now = new Date();
  const idleCutoff = subDays(now, 7);

  const [servers, permissionRequests, portRequests] = await Promise.all([
    prisma.server.findMany({
      include: {
        currentOwner: true,
        metrics: { orderBy: { collectedAt: "desc" }, take: 1 },
        alerts: { orderBy: { detectedAt: "desc" }, take: 5 },
        workspaces: {
          where: { deletedAt: null },
          include: {
            owner: true,
            permissionRequest: {
              include: {
                requester: true,
              },
            },
          },
          orderBy: { updatedAt: "desc" },
        },
        handovers: {
          include: {
            owner: true,
            workspace: {
              include: {
                owner: true,
                permissionRequest: {
                  include: {
                    requester: true,
                  },
                },
              },
            },
          },
          orderBy: { handoverAt: "desc" },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.permissionRequest.findMany({
      include: {
        requester: true,
        server: true,
        workspaces: true,
      },
    }),
    prisma.portRequest.findMany({
      where: {
        status: RequestStatus.APPROVED,
      },
      include: {
        server: {
          include: {
            firewallRules: true,
          },
        },
      },
    }),
  ]);

  const ownershipRows = servers.map((server) => {
    const latestMetric = server.metrics[0];
    const activeWorkspace = server.workspaces.find((workspace) => workspace.deletedAt == null && workspace.status !== WorkspaceStatus.DELETED);
    const activeHandover = server.handovers.find((handover) => handover.actualReturnedAt == null || handover.confirmStatus !== RequestStatus.COMPLETED);
    const recentAlert = server.alerts[0];
    const requestOwner = activeWorkspace?.permissionRequest?.requester?.name ?? activeHandover?.workspace?.permissionRequest?.requester?.name ?? null;
    const actors = [
      server.currentOwner?.name ?? null,
      activeWorkspace?.owner?.name ?? null,
      activeHandover?.owner?.name ?? null,
      requestOwner,
    ].filter((value): value is string => Boolean(value));
    const uniqueActors = new Set(actors);
    const responsibilityStatus =
      uniqueActors.size === 0 ? "缺失" : uniqueActors.size === 1 ? "明确" : "冲突";

    return {
      id: server.id,
      serverCode: server.serverCode,
      publicIp: server.publicIp,
      status: server.status,
      currentOwner: server.currentOwner?.name ?? "-",
      workspaceOwner: activeWorkspace?.owner?.name ?? "-",
      requestOwner: requestOwner ?? "-",
      handoverStatus: activeHandover ? activeHandover.confirmStatus : "NONE",
      expiresAt: activeWorkspace?.expiresAt ?? activeHandover?.plannedReturnAt ?? null,
      recentActivityAt: latestMetric?.lastLoginAt ?? latestMetric?.collectedAt ?? null,
      responsibilityStatus,
      activeWorkspaceId: activeWorkspace?.id ?? null,
      activeWorkspaceName: activeWorkspace?.name ?? null,
      activeRequestId: activeWorkspace?.permissionRequestId ?? activeHandover?.workspace?.permissionRequestId ?? null,
      recentAlert: recentAlert?.title ?? null,
    };
  });

  const idleCandidates = ownershipRows
    .filter((row) => {
      const server = servers.find((item) => item.id === row.id);
      if (!server || server.status === ServerStatus.ERROR || server.status === ServerStatus.DISABLED) return false;
      const latestMetric = server.metrics[0];
      const noWorkspace = !server.workspaces.some((workspace) => workspace.deletedAt == null && workspace.status !== WorkspaceStatus.DELETED);
      const noHandover = !server.handovers.some((handover) => handover.actualReturnedAt == null || handover.confirmStatus !== RequestStatus.COMPLETED);
      const recentActivityAt = latestMetric?.lastLoginAt ?? latestMetric?.collectedAt ?? null;
      const noRecentActivity = !recentActivityAt || recentActivityAt <= idleCutoff;
      return noWorkspace && noHandover && noRecentActivity;
    })
    .map((row) => {
      const server = servers.find((item) => item.id === row.id)!;
      const latestMetric = server.metrics[0];
      const suggestion: SuggestedAction =
        row.recentAlert ? "待确认" : latestMetric?.collectedAt && latestMetric.collectedAt > idleCutoff ? "保留" : "回收";
      return {
        id: row.id,
        serverCode: row.serverCode,
        publicIp: row.publicIp,
        latestCollectedAt: latestMetric?.collectedAt ?? null,
        recentLoginAt: latestMetric?.lastLoginAt ?? null,
        recentAlert: row.recentAlert,
        suggestion,
      };
    });

  const anomalies = [
    ...servers
      .filter((server) => server.status === ServerStatus.ERROR)
      .map((server) => ({
        id: `server-error-${server.id}`,
        type: "连接异常服务器",
        serverCode: server.serverCode,
        detail: server.alerts[0]?.description ?? "最近一次采集或连接失败",
      })),
    ...servers.flatMap((server) =>
      server.workspaces
        .filter((workspace) => workspace.expiresAt && workspace.expiresAt < now && workspace.deletedAt == null)
        .map((workspace) => ({
          id: `workspace-expired-${workspace.id}`,
          type: "工作区已过期未清理",
          serverCode: server.serverCode,
          detail: `${workspace.name} 已过期但仍保留，状态 ${workspace.status}`,
        })),
    ),
    ...servers.flatMap((server) =>
      server.handovers
        .filter((handover) => handover.confirmStatus !== RequestStatus.COMPLETED)
        .map((handover) => ({
          id: `handover-open-${handover.id}`,
          type: "交接未确认",
          serverCode: server.serverCode,
          detail: `交接状态 ${handover.confirmStatus}，交接人 ${handover.owner?.name ?? "未指派"}`,
        })),
    ),
    ...portRequests
      .filter((request) => {
        const matchedRule = request.server.firewallRules.find(
          (rule) => rule.port === request.port && rule.protocol === request.protocol && rule.action === request.action,
        );
        return !matchedRule;
      })
      .map((request) => ({
        id: `port-mismatch-${request.id}`,
        type: "端口申请已批准但未同步记录",
        serverCode: request.server.serverCode,
        detail: `${request.protocol} ${request.port} / ${request.action} 缺少 firewall rule 台账`,
      })),
    ...permissionRequests
      .filter((request) => request.status === RequestStatus.APPROVED)
      .filter((request) => request.workspaces.length === 0 || !request.handoverId)
      .map((request) => ({
        id: `request-chain-${request.id}`,
        type: "审批链断链",
        serverCode: request.server?.serverCode ?? "自动分配",
        detail: `请求 ${request.id} 已批准，但 ${request.workspaces.length === 0 ? "缺少 workspace" : "缺少 handover"}`,
      })),
    ...ownershipRows
      .filter((row) => row.responsibilityStatus !== "明确")
      .map((row) => ({
        id: `ownership-${row.id}`,
        type: "责任链不完整",
        serverCode: row.serverCode,
        detail: `责任状态 ${row.responsibilityStatus}，当前负责人 ${row.currentOwner}，工作区负责人 ${row.workspaceOwner}`,
      })),
  ];

  const inUseServerCount = ownershipRows.filter((row) => {
    const server = servers.find((item) => item.id === row.id)!;
    return server.workspaces.some((workspace) => workspace.deletedAt == null && workspace.status !== WorkspaceStatus.DELETED) ||
      server.handovers.some((handover) => handover.actualReturnedAt == null || handover.confirmStatus !== RequestStatus.COMPLETED);
  }).length;

  return {
    summary: {
      totalServers: servers.length,
      inUseServers: inUseServerCount,
      idleServers: servers.filter((server) => server.status === ServerStatus.IDLE).length,
      idleCandidates: idleCandidates.length,
      overdueResources: anomalies.filter((item) => item.type === "工作区已过期未清理" || item.type === "交接未确认").length,
      unclearResponsibilities: ownershipRows.filter((row) => row.responsibilityStatus !== "明确").length,
    },
    ownershipRows,
    idleCandidates,
    anomalies,
  };
}

export function canViewUsageOverview(role: RoleCode) {
  return role === RoleCode.ADMIN;
}

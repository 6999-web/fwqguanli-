import { RequestStatus, ServerStatus, WorkspaceStatus } from "@prisma/client";
import { subHours } from "date-fns";
import { maskEmail, maskSecret } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";

export async function getAdminDashboardData() {
  const [servers, latestMetrics, alerts, metrics, handovers] = await Promise.all([
    prisma.server.findMany({
      include: {
        currentOwner: true,
        environment: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.serverMetric.findMany({
      orderBy: { collectedAt: "desc" },
      take: 100,
    }),
    prisma.alert.findMany({
      orderBy: { detectedAt: "desc" },
      take: 20,
      include: { server: true },
    }),
    prisma.serverMetric.findMany({
      where: { collectedAt: { gte: subHours(new Date(), 6) } },
      orderBy: { collectedAt: "asc" },
    }),
    prisma.handoverRecord.findMany({
      orderBy: { handoverAt: "desc" },
      take: 10,
      include: { server: true, owner: true },
    }),
  ]);

  const metricMap = new Map<string, (typeof latestMetrics)[number]>();
  for (const metric of latestMetrics) {
    if (!metricMap.has(metric.serverId)) {
      metricMap.set(metric.serverId, metric);
    }
  }

  const overview = {
    total: servers.length,
    online: servers.filter((item) => item.status !== ServerStatus.ERROR && item.status !== ServerStatus.DISABLED).length,
    offline: servers.filter((item) => item.status === ServerStatus.ERROR).length,
    inUse: servers.filter((item) => item.status === ServerStatus.IN_USE).length,
    idle: servers.filter((item) => item.status === ServerStatus.IDLE).length,
    abnormal: servers.filter((item) => item.status === ServerStatus.ERROR).length,
  };

  const cards = servers.map((server) => {
    const metric = metricMap.get(server.id);
    return {
      id: server.id,
      serverCode: server.serverCode,
      publicIp: server.publicIp,
      region: server.region,
      provider: server.provider ?? "Unknown",
      currentOwner: server.currentOwner?.name ?? "未分配",
      status: server.status,
      cpuUsage: metric?.cpuUsage ?? 0,
      memoryUsage: metric?.memoryUsage ?? 0,
      diskUsage: metric?.diskUsage ?? 0,
      networkTraffic: (metric?.networkIn ?? 0) + (metric?.networkOut ?? 0),
      processCount: metric?.processCount ?? 0,
      openPortsCount: metric?.openPortsCount ?? 0,
      lastLoginAt: metric?.lastLoginAt,
      alertCount: metric?.alertCount ?? 0,
      osVersion: server.environment?.osVersion ?? server.osVersion ?? "待采集",
      dockerVersion: server.environment?.dockerVersion ?? "待采集",
      pythonVersion: server.environment?.pythonVersion ?? "待采集",
      nodeVersion: server.environment?.nodeVersion ?? "待采集",
      cudaVersion: server.environment?.cudaVersion ?? "待采集",
      nginxStatus: server.environment?.nginxStatus ?? "待采集",
      databaseInfo: server.environment?.databaseInfo ?? "待采集",
      runningServices: (server.environment?.runningServices as string[] | null) ?? [],
      installedComponents: (server.environment?.installedComponents as string[] | null) ?? [],
      maskedLoginEmail: maskEmail(server.loginEmail),
      maskedServerUsername: maskSecret(server.serverUsername, 1),
    };
  });

  const groupedByHour = metrics.reduce<Record<string, { cpu: number[]; memory: number[]; disk: number[]; traffic: number[] }>>(
    (acc, item) => {
      const key = item.collectedAt.toISOString().slice(11, 16);
      acc[key] ??= { cpu: [], memory: [], disk: [], traffic: [] };
      acc[key].cpu.push(item.cpuUsage);
      acc[key].memory.push(item.memoryUsage);
      acc[key].disk.push(item.diskUsage);
      acc[key].traffic.push(item.networkIn + item.networkOut);
      return acc;
    },
    {},
  );

  const trendSeries = Object.entries(groupedByHour).map(([time, value]) => ({
    time,
    cpu: average(value.cpu),
    memory: average(value.memory),
    disk: average(value.disk),
    traffic: average(value.traffic),
  }));

  const statusDistribution = Object.values(ServerStatus).map((status) => ({
    name: status,
    value: servers.filter((item) => item.status === status).length,
  }));

  const regionDistribution = summarize(servers.map((item) => item.region));
  const providerDistribution = summarize(servers.map((item) => item.provider ?? "Unknown"));
  const alertTrend = summarize(alerts.map((item) => item.level));

  return {
    overview,
    cards,
    trendSeries,
    statusDistribution,
    regionDistribution,
    providerDistribution,
    alertTrend,
    alerts: alerts.map((item) => ({
      id: item.id,
      title: item.title,
      level: item.level,
      type: item.type,
      serverCode: item.server.serverCode,
      detectedAt: item.detectedAt,
      description: item.description,
    })),
    handovers: handovers.map((item) => ({
      id: item.id,
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
    pendingApprovals: await prisma.operationApproval.count({ where: { status: RequestStatus.PENDING } }),
  };
}

export async function getUserDashboardData(userId: string) {
  const [workspaces, requests, portRequests] = await Promise.all([
    prisma.workspace.findMany({
      where: {
        ownerId: userId,
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
      orderBy: { updatedAt: "desc" },
    }),
    prisma.permissionRequest.findMany({
      where: { requesterId: userId },
      include: {
        approver: true,
        server: true,
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.portRequest.findMany({
      where: { requesterId: userId },
      include: {
        approver: true,
        server: true,
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  const uniqueServerCount = new Set(workspaces.map((item) => item.serverId)).size;
  const expiringSoonCount = workspaces.filter((item) => {
    if (!item.expiresAt) return false;
    return item.expiresAt.getTime() - Date.now() <= 7 * 24 * 60 * 60 * 1000;
  }).length;

  return {
    summary: {
      accountCount: workspaces.length,
      runningCount: workspaces.filter((item) => item.status === WorkspaceStatus.RUNNING).length,
      serverCount: uniqueServerCount,
      expiringSoonCount,
    },
    accounts: workspaces.map((workspace) => {
      const latestMetric = workspace.server.metrics[0];
      return {
        id: workspace.id,
        name: workspace.name,
        status: workspace.status,
        statusMessage: workspace.statusMessage,
        serverCode: workspace.server.serverCode,
        publicIp: workspace.server.publicIp,
        region: workspace.server.region,
        provider: workspace.server.provider ?? "Unknown",
        serverStatus: workspace.server.status,
        sshHost: workspace.sshHost,
        sshPort: workspace.sshPort,
        sshUsername: workspace.sshUsername,
        workingDirectory: workspace.workingDirectory,
        expiresAt: workspace.expiresAt,
        lastStartedAt: workspace.lastStartedAt,
        lastStoppedAt: workspace.lastStoppedAt,
        lastPasswordResetAt: workspace.lastPasswordResetAt,
        cpuLimit: workspace.cpuLimit,
        memoryLimitMb: workspace.memoryLimitMb,
        diskLimitGb: workspace.diskLimitGb,
        hostPortStart: workspace.hostPortStart,
        hostPortEnd: workspace.hostPortEnd,
        latestCpuUsage: latestMetric?.cpuUsage ?? 0,
        latestMemoryUsage: latestMetric?.memoryUsage ?? 0,
        latestDiskUsage: latestMetric?.diskUsage ?? 0,
        latestOpenPortsCount: latestMetric?.openPortsCount ?? 0,
        openPorts: normalizeStringArray(workspace.server.environment?.openPorts),
      };
    }),
    requests: requests.map((request) => ({
      id: request.id,
      requestType: request.requestType,
      purpose: request.purpose,
      expectedDuration: request.expectedDuration,
      requestedCpu: request.requestedCpu,
      requestedMemoryMb: request.requestedMemoryMb,
      requestedDiskGb: request.requestedDiskGb,
      requestedGpu: request.requestedGpu,
      status: request.status,
      serverCode: request.server?.serverCode ?? "系统自动分配",
      approverName: request.approver?.name ?? "-",
      createdAt: request.createdAt,
      dueAt: request.dueAt,
    })),
    ports: portRequests.map((request) => ({
      id: request.id,
      serverCode: request.server.serverCode,
      port: request.port,
      protocol: request.protocol,
      action: request.action,
      purpose: request.purpose,
      status: request.status,
      approverName: request.approver?.name ?? "-",
      createdAt: request.createdAt,
    })),
  };
}

function average(values: number[]) {
  if (!values.length) return 0;
  return Number((values.reduce((sum, item) => sum + item, 0) / values.length).toFixed(2));
}

function summarize(values: string[]) {
  const map = new Map<string, number>();
  values.forEach((value) => map.set(value, (map.get(value) ?? 0) + 1));
  return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
}

function normalizeStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.filter((item): item is string => typeof item === "string");
}

import { RequestStatus, ServerStatus } from "@prisma/client";
import { subHours } from "date-fns";
import { maskEmail, maskSecret } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";

export async function getDashboardData() {
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

function average(values: number[]) {
  if (!values.length) return 0;
  return Number((values.reduce((sum, item) => sum + item, 0) / values.length).toFixed(2));
}

function summarize(values: string[]) {
  const map = new Map<string, number>();
  values.forEach((value) => map.set(value, (map.get(value) ?? 0) + 1));
  return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
}

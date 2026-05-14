import { AlertLevel, AlertType, Server, ServerStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { emitSocketEvent } from "@/lib/socket";
import { execWhitelistedCommands } from "@/lib/ssh/executor";

function parseNetwork(raw: string) {
  const line = raw
    .split("\n")
    .find((item) => item.includes("eth0") || item.includes("ens") || item.includes("enp"));
  if (!line) return { inMb: 0, outMb: 0 };
  const parts = line.trim().split(/\s+/);
  return {
    inMb: Number(parts[1] ?? 0) / 1024 / 1024,
    outMb: Number(parts[9] ?? 0) / 1024 / 1024,
  };
}

function normalizeServices(raw: string) {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/\s+/)[0]);
}

function parseRecentLogin(loginsRaw: string) {
  const firstLine = loginsRaw
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("wtmp begins"));

  if (!firstLine) {
    return null;
  }

  const parts = firstLine.split(/\s+/);
  const isoIndex = parts.findIndex((part) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(part));
  if (isoIndex === -1) {
    return null;
  }

  const parsed = new Date(parts[isoIndex]);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseAccounts(rawUsers: string, rawSudoers: string, rawLogins: string) {
  const sudoers = new Set(
    rawSudoers
      .split(/[,\s]+/)
      .map((item) => item.trim())
      .filter(Boolean),
  );

  const loginMap = new Map<string, { at: Date | null; raw: string[] }>();
  for (const line of rawLogins.split("\n").map((item) => item.trim()).filter(Boolean)) {
    if (line.startsWith("wtmp begins")) continue;
    const parts = line.split(/\s+/);
    const username = parts[0];
    if (!username || username === "reboot") continue;
    const isoIndex = parts.findIndex((part) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(part));
    const parsed = isoIndex === -1 ? null : new Date(parts[isoIndex]);
    const safeDate = parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
    if (!loginMap.has(username)) {
      loginMap.set(username, { at: safeDate, raw: [line] });
    } else {
      loginMap.get(username)?.raw.push(line);
    }
  }

  return rawUsers
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [username, shell] = line.split(":");
      const login = loginMap.get(username);
      const accessLevel =
        username === "root" ? "ROOT" : sudoers.has(username) ? "SUDO" : "USER";

      return {
        username,
        accessLevel,
        status: shell?.includes("nologin") ? "DISABLED" : "ACTIVE",
        lastLoginAt: login?.at ?? null,
        loginLogs: login?.raw ?? [],
      };
    });
}

async function syncServerAccounts(server: Server, rawUsers: string, rawSudoers: string, rawLogins: string) {
  const accounts = parseAccounts(rawUsers, rawSudoers, rawLogins);
  const usernames = accounts.map((item) => item.username);

  await prisma.$transaction([
    ...accounts.map((account) =>
      prisma.serverAccount.upsert({
        where: {
          serverId_username: {
            serverId: server.id,
            username: account.username,
          },
        },
        update: {
          accessLevel: account.accessLevel,
          status: account.status,
          lastLoginAt: account.lastLoginAt ?? undefined,
          loginLogs: account.loginLogs,
          source: "DISCOVERED",
        },
        create: {
          serverId: server.id,
          username: account.username,
          accessLevel: account.accessLevel,
          status: account.status,
          lastLoginAt: account.lastLoginAt ?? undefined,
          loginLogs: account.loginLogs,
          source: "DISCOVERED",
        },
      }),
    ),
    prisma.serverAccount.updateMany({
      where: {
        serverId: server.id,
        source: "DISCOVERED",
        username: { notIn: usernames.length ? usernames : ["__none__"] },
      },
      data: { status: "STALE" },
    }),
  ]);
}

async function createThresholdAlerts(serverId: string, cpu: number, memory: number, disk: number) {
  if (cpu >= 90) {
    await prisma.alert.create({
      data: {
        serverId,
        type: AlertType.CPU_HIGH,
        level: AlertLevel.CRITICAL,
        title: "CPU usage too high",
        description: `CPU usage reached ${cpu.toFixed(2)}%`,
      },
    });
  }
  if (memory >= 90) {
    await prisma.alert.create({
      data: {
        serverId,
        type: AlertType.MEMORY_HIGH,
        level: AlertLevel.HIGH,
        title: "Memory usage too high",
        description: `Memory usage reached ${memory.toFixed(2)}%`,
      },
    });
  }
  if (disk >= 85) {
    await prisma.alert.create({
      data: {
        serverId,
        type: AlertType.DISK_LOW,
        level: AlertLevel.HIGH,
        title: "Disk space running low",
        description: `Disk usage reached ${disk.toFixed(2)}%`,
      },
    });
  }
}

export async function collectServerMetrics(server: Server) {
  try {
    const commandResults = await execWhitelistedCommands(server, [
      "cpu",
      "cpuSpec",
      "memory",
      "memorySpec",
      "disk",
      "diskSpec",
      "processes",
      "ports",
      "logins",
      "network",
      "os",
      "python",
      "node",
      "docker",
      "cuda",
      "gpuSpec",
      "bandwidth",
      "nginx",
      "database",
      "services",
      "users",
      "sudoers",
    ] as const);

    const ports = commandResults.ports.split("\n").filter(Boolean);
    const network = parseNetwork(commandResults.network);
    const alertCount = await prisma.alert.count({ where: { serverId: server.id, status: "OPEN" } });
    const osVersion = commandResults.os.replaceAll('"', "");
    const gpuSpec = normalizeSpec(commandResults.gpuSpec, "Unavailable");
    const bandwidth = normalizeBandwidth(commandResults.bandwidth);
    const lastLoginAt = parseRecentLogin(commandResults.logins);

    const metric = await prisma.serverMetric.create({
      data: {
        serverId: server.id,
        cpuUsage: Number(commandResults.cpu),
        memoryUsage: Number(commandResults.memory),
        diskUsage: Number(commandResults.disk),
        networkIn: network.inMb,
        networkOut: network.outMb,
        processCount: Number(commandResults.processes),
        openPortsCount: ports.length,
        loginCount: commandResults.logins.split("\n").filter(Boolean).length,
        alertCount,
        lastLoginAt: lastLoginAt ?? undefined,
      },
    });

    await prisma.serverEnvironment.upsert({
      where: { serverId: server.id },
      update: {
        osVersion,
        dockerVersion: commandResults.docker,
        pythonVersion: commandResults.python,
        nodeVersion: commandResults.node,
        cudaVersion: commandResults.cuda,
        nginxStatus: commandResults.nginx,
        databaseInfo: commandResults.database,
        runningServices: normalizeServices(commandResults.services),
        installedComponents: [commandResults.docker, commandResults.python, commandResults.node].filter(Boolean),
        openPorts: ports,
      },
      create: {
        serverId: server.id,
        osVersion,
        dockerVersion: commandResults.docker,
        pythonVersion: commandResults.python,
        nodeVersion: commandResults.node,
        cudaVersion: commandResults.cuda,
        nginxStatus: commandResults.nginx,
        databaseInfo: commandResults.database,
        runningServices: normalizeServices(commandResults.services),
        installedComponents: [commandResults.docker, commandResults.python, commandResults.node].filter(Boolean),
        openPorts: ports,
      },
    });

    await syncServerAccounts(server, commandResults.users, commandResults.sudoers, commandResults.logins);

    await prisma.server.update({
      where: { id: server.id },
      data: {
        status: ServerStatus.IN_USE,
        osVersion,
        cpuSpec: normalizeSpec(commandResults.cpuSpec),
        memorySpec: normalizeSpec(commandResults.memorySpec),
        diskSpec: normalizeSpec(commandResults.diskSpec),
        gpuSpec,
        bandwidth,
      },
    });

    await createThresholdAlerts(
      server.id,
      Number(commandResults.cpu),
      Number(commandResults.memory),
      Number(commandResults.disk),
    );

    emitSocketEvent("metrics:update", {
      serverId: server.id,
      serverCode: server.serverCode,
      metric,
    });

    return metric;
  } catch (error) {
    await prisma.server.update({
      where: { id: server.id },
      data: { status: ServerStatus.ERROR },
    });
    await prisma.alert.create({
      data: {
        serverId: server.id,
        type: AlertType.SERVER_OFFLINE,
        level: AlertLevel.CRITICAL,
        title: "Collector failed",
        description: error instanceof Error ? error.message : "Unknown collector error",
      },
    });
    throw error;
  }
}

export async function collectAllServers() {
  const servers = await prisma.server.findMany();
  const results: PromiseSettledResult<Awaited<ReturnType<typeof collectServerMetrics>>>[] = [];

  for (const server of servers) {
    try {
      const metric = await collectServerMetrics(server);
      results.push({ status: "fulfilled", value: metric });
    } catch (error) {
      results.push({ status: "rejected", reason: error });
    }
  }

  return results;
}

function normalizeSpec(value: string, fallback = "待采集") {
  const normalized = value.trim();
  return normalized && normalized !== "Unknown" ? normalized : fallback;
}

function normalizeBandwidth(value: string) {
  const normalized = value.trim();
  if (!normalized || normalized === "Unknown" || normalized === "-1") return "待采集";
  return /^\d+$/.test(normalized) ? `${normalized} Mbps` : normalized;
}

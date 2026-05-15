import { type Server } from "@prisma/client";
import { decryptText } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { DEFAULT_RECOVERY_PORTS, isValidSshPort } from "@/lib/server-connection-config";
import { connectSSH, type SSHConnectionConfig } from "@/lib/ssh/client";

type ServerSshLike = Pick<Server, "id" | "publicIp" | "sshPort" | "serverUsername" | "serverPassword">;

export type ResolvedServerSshConfig = SSHConnectionConfig & {
  port: number;
  resolvedFromFallback: boolean;
  triedPorts: number[];
};

export async function resolveServerSshConfig(server: ServerSshLike): Promise<ResolvedServerSshConfig> {
  const password = decryptText(server.serverPassword);
  const candidatePorts = buildCandidatePorts(server.sshPort);
  let lastError: unknown;

  for (const port of candidatePorts) {
    try {
      const conn = await connectSSH({
        host: server.publicIp,
        port,
        username: server.serverUsername,
        password,
      });
      conn.end();
      await persistResolvedPort(server, port);
      return {
        host: server.publicIp,
        port,
        username: server.serverUsername,
        password,
        resolvedFromFallback: port !== server.sshPort,
        triedPorts: candidatePorts,
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("SSH connection failed");
}

export async function connectToServer(server: ServerSshLike) {
  const resolved = await resolveServerSshConfig(server);
  const conn = await connectSSH(resolved);
  return {
    conn,
    resolved,
  };
}

function buildCandidatePorts(configuredPort: number | null | undefined) {
  const ordered = [
    ...(isValidSshPort(configuredPort) ? [configuredPort] : []),
    1010,
    ...DEFAULT_RECOVERY_PORTS,
  ];

  return Array.from(new Set(ordered.filter((port): port is number => isValidSshPort(port))));
}

async function persistResolvedPort(server: ServerSshLike, port: number) {
  if (server.sshPort === port) return;

  try {
    await prisma.server.update({
      where: { id: server.id },
      data: { sshPort: port },
    });
  } catch {
    // Best effort only.
  }
}

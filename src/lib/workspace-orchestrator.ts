import crypto from "crypto";
import { WorkspaceStatus, type Server, type Workspace } from "@prisma/client";
import { decryptText, encryptText } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { syncManagedServerStatus } from "@/lib/server-status";
import { runSSHCommand } from "@/lib/ssh/client";
import { connectToServer } from "@/lib/server-ssh";
import { buildWorkspaceFilesystem } from "@/lib/workspace-compose";
import { ensureWorkspacePorts } from "@/lib/workspace-port-allocation";
import { generateWorkspacePassword } from "@/lib/workspace-password";

const DEFAULT_BASE_IMAGE =
  process.env.WORKSPACE_BASE_IMAGE ?? "ghcr.io/opencode-ops/opencode-workspace:latest";
const DEFAULT_GRACE_DAYS = Number(process.env.WORKSPACE_DEFAULT_GRACE_DAYS ?? 7);

type WorkspaceSpec = {
  cpuLimit: number;
  memoryLimitMb: number;
  diskLimitGb: number;
  gpuLimit?: number | null;
  sshPort?: number | null;
  hostPortStart?: number | null;
  hostPortEnd?: number | null;
  requestedPortCount?: number | null;
  graceDays?: number | null;
  dueAt?: Date | null;
  baseImage?: string | null;
};

export async function provisionWorkspace(options: {
  server: Server;
  ownerId: string;
  permissionRequestId: string;
  workspaceName: string;
  sshUsername: string;
  spec: WorkspaceSpec;
}) {
  const ports = await ensureWorkspacePorts({
    serverId: options.server.id,
    sshPort: options.spec.sshPort,
    hostPortStart: options.spec.hostPortStart,
    hostPortEnd: options.spec.hostPortEnd,
    requestedPortCount: options.spec.requestedPortCount,
  });
  const workspaceId = crypto.randomUUID();
  const safeId = workspaceId.replace(/-/g, "");
  const slug = `workspace-${safeId.slice(0, 12)}`;
  const composeProjectName = `opsws_${safeId.slice(0, 12)}`;
  const containerName = `opsws-${safeId.slice(0, 12)}`;
  const workspaceRoot = resolveWorkspaceRoot(options.server.serverUsername);
  const workingDirectory = `${workspaceRoot}/${workspaceId}`;
  const sshPassword = generateWorkspacePassword();
  const dueAt = options.spec.dueAt ?? null;
  const graceDays = Math.max(1, options.spec.graceDays ?? DEFAULT_GRACE_DAYS);
  const graceUntil = dueAt ? new Date(dueAt.getTime() + graceDays * 24 * 60 * 60 * 1000) : null;
  const cpuLimit = Number(options.spec.cpuLimit);
  const memoryLimitMb = Number(options.spec.memoryLimitMb);
  const diskLimitGb = Number(options.spec.diskLimitGb);
  const gpuLimit = options.spec.gpuLimit ?? null;
  const baseImage = options.spec.baseImage || DEFAULT_BASE_IMAGE;
  const sshUsername = options.sshUsername;

  await prisma.workspace.create({
    data: {
      id: workspaceId,
      serverId: options.server.id,
      ownerId: options.ownerId,
      permissionRequestId: options.permissionRequestId,
      name: options.workspaceName,
      slug,
      composeProjectName,
      containerName,
      sshUsername,
      sshPasswordEncrypted: encryptText(sshPassword),
      sshHost: options.server.publicIp,
      sshPort: ports.sshPort,
      hostPortStart: ports.hostPortStart,
      hostPortEnd: ports.hostPortEnd,
      cpuLimit,
      memoryLimitMb,
      diskLimitGb,
      gpuLimit,
      workingDirectory,
      baseImage,
      status: WorkspaceStatus.PROVISIONING,
      expiresAt: dueAt ?? undefined,
      graceUntil: graceUntil ?? undefined,
    },
  });

  try {
    await provisionRemoteWorkspace(options.server, {
      workspaceId,
      composeProjectName,
      containerName,
      baseImage,
      sshUsername,
      sshPassword,
      sshPort: ports.sshPort,
      hostPortStart: ports.hostPortStart,
      hostPortEnd: ports.hostPortEnd,
      cpuLimit,
      memoryLimitMb,
      diskLimitGb,
      gpuLimit,
      workingDirectory,
    });

    const workspace = await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        status: WorkspaceStatus.RUNNING,
        statusMessage: diskLimitGb > 0 ? "running; disk limit recorded as soft quota" : "running",
        lastStartedAt: new Date(),
      },
    });
    await syncManagedServerStatus(options.server.id);
    return workspace;
  } catch (error) {
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        status: WorkspaceStatus.FAILED,
        statusMessage: error instanceof Error ? error.message : "workspace provisioning failed",
      },
    });
    throw error;
  }
}

export async function stopWorkspace(workspaceId: string) {
  const workspace = await getWorkspaceOrThrow(workspaceId);
  await runComposeCommand(workspace.server, workspace.workingDirectory, `${workspace.composeProjectName} stop`);
  const updated = await prisma.workspace.update({
    where: { id: workspaceId },
    data: {
      status: WorkspaceStatus.STOPPED,
      lastStoppedAt: new Date(),
      statusMessage: "stopped",
    },
  });
  await syncManagedServerStatus(workspace.serverId);
  return updated;
}

export async function startWorkspace(workspaceId: string) {
  const workspace = await getWorkspaceOrThrow(workspaceId);
  await runComposeCommand(workspace.server, workspace.workingDirectory, `${workspace.composeProjectName} up -d`);
  const updated = await prisma.workspace.update({
    where: { id: workspaceId },
    data: {
      status: WorkspaceStatus.RUNNING,
      lastStartedAt: new Date(),
      statusMessage: "running",
    },
  });
  await syncManagedServerStatus(workspace.serverId);
  return updated;
}

export async function deleteWorkspace(workspaceId: string) {
  const workspace = await getWorkspaceOrThrow(workspaceId);
  await runComposeCommand(workspace.server, workspace.workingDirectory, `${workspace.composeProjectName} down -v`);
  await runRemoteCommand(
    workspace.server,
    `rm -rf ${shellEscape(workspace.workingDirectory)}`,
  );
  const updated = await prisma.workspace.update({
    where: { id: workspaceId },
    data: {
      status: WorkspaceStatus.DELETED,
      deletedAt: new Date(),
      statusMessage: "deleted",
    },
  });
  await syncManagedServerStatus(workspace.serverId);
  return updated;
}

export async function resetWorkspacePassword(workspaceId: string) {
  const workspace = await getWorkspaceOrThrow(workspaceId);
  const nextPassword = generateWorkspacePassword();
  const quoted = shellEscape(`${workspace.sshUsername}:${nextPassword}`);
  await runRemoteCommand(
    workspace.server,
    [
      `docker exec ${shellEscape(workspace.containerName)}`,
      "/bin/bash -lc",
      shellEscape(`echo ${quoted} | chpasswd`),
    ].join(" "),
  );
  return prisma.workspace.update({
    where: { id: workspaceId },
    data: {
      sshPasswordEncrypted: encryptText(nextPassword),
      lastPasswordResetAt: new Date(),
      statusMessage: "password reset",
    },
  });
}

export async function collectWorkspaceStatus(workspaceId: string) {
  const workspace = await getWorkspaceOrThrow(workspaceId);
  const inspect = await runRemoteCommand(
    workspace.server,
    `docker inspect -f '{{.State.Status}}' ${shellEscape(workspace.containerName)} 2>/dev/null || echo missing`,
  );
  const remoteStatus = inspect.stdout.trim();
  const nextStatus =
    remoteStatus === "running"
      ? WorkspaceStatus.RUNNING
      : remoteStatus === "exited"
        ? WorkspaceStatus.STOPPED
        : remoteStatus === "missing"
          ? WorkspaceStatus.FAILED
          : workspace.status;
  const updated = await prisma.workspace.update({
    where: { id: workspaceId },
    data: {
      status: nextStatus,
      statusMessage: `remote:${remoteStatus || "unknown"}`,
    },
  });
  await syncManagedServerStatus(workspace.serverId);
  return updated;
}

export async function reconcileWorkspaceLifecycle(workspaceId: string) {
  const workspace = await getWorkspaceOrThrow(workspaceId);
  const now = new Date();

  if (workspace.deletedAt) {
    return workspace;
  }

  if (workspace.graceUntil && workspace.graceUntil <= now && workspace.status !== WorkspaceStatus.DELETED) {
    return deleteWorkspace(workspace.id);
  }

  if (workspace.expiresAt && workspace.expiresAt <= now) {
    if (workspace.status === WorkspaceStatus.RUNNING || workspace.status === WorkspaceStatus.PROVISIONING) {
      await stopWorkspace(workspace.id);
    }
    const updated = await prisma.workspace.update({
      where: { id: workspace.id },
      data: {
        status: WorkspaceStatus.EXPIRED,
        statusMessage: "expired and waiting for grace cleanup",
      },
    });
    await syncManagedServerStatus(workspace.serverId);
    return updated;
  }

  return workspace;
}

export function decryptWorkspacePassword(workspace: Pick<Workspace, "sshPasswordEncrypted">) {
  return decryptText(workspace.sshPasswordEncrypted);
}

async function getWorkspaceOrThrow(workspaceId: string) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    include: { server: true },
  });
  if (!workspace) {
    throw new Error("Workspace not found");
  }
  return workspace;
}

async function provisionRemoteWorkspace(server: Server, input: Parameters<typeof buildWorkspaceFilesystem>[0]) {
  const files = buildWorkspaceFilesystem(input);
  const mkdirs = [
    `${input.workingDirectory}`,
    `${input.workingDirectory}/compose`,
    `${input.workingDirectory}/data`,
    `${input.workingDirectory}/home`,
    `${input.workingDirectory}/logs`,
    `${input.workingDirectory}/meta`,
  ];
  await runRemoteCommand(server, `mkdir -p ${mkdirs.map(shellEscape).join(" ")}`);
  await writeRemoteFile(server, `${input.workingDirectory}/compose/.env`, files.env);
  await writeRemoteFile(server, `${input.workingDirectory}/compose/docker-compose.yml`, files.compose);
  await writeRemoteFile(server, `${input.workingDirectory}/meta/workspace.json`, files.metadata);
  await writeRemoteFile(server, `${input.workingDirectory}/meta/init.sh`, files.initScript);
  await runRemoteCommand(server, `chmod +x ${shellEscape(`${input.workingDirectory}/meta/init.sh`)}`);
  await runRemoteCommand(
    server,
    [
      `cd ${shellEscape(`${input.workingDirectory}/compose`)}`,
      `docker compose -p ${shellEscape(input.composeProjectName)} up -d`,
    ].join(" && "),
  );
}

async function runComposeCommand(server: Server, workingDirectory: string, suffix: string) {
  await runRemoteCommand(
    server,
    `cd ${shellEscape(`${workingDirectory}/compose`)} && docker compose -p ${suffix}`,
  );
}

async function writeRemoteFile(server: Server, path: string, content: string) {
  const encoded = Buffer.from(content, "utf8").toString("base64");
  await runRemoteCommand(
    server,
    `python3 - <<'PY'\nimport base64\nfrom pathlib import Path\npath = Path(${JSON.stringify(path)})\npath.parent.mkdir(parents=True, exist_ok=True)\npath.write_bytes(base64.b64decode(${JSON.stringify(encoded)}))\nPY`,
  );
}

async function runRemoteCommand(server: Server, command: string) {
  const { conn } = await connectToServer(server);
  try {
    const wrapped = `export PATH="$PATH:/usr/local/bin:/usr/bin:/bin" && ${command}`;
    const result = await runSSHCommand(conn, `bash -lc ${shellEscape(wrapped)}`);
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || result.stdout || `Remote command failed with ${result.exitCode}`);
    }
    return result;
  } finally {
    conn.end();
  }
}

function shellEscape(value: string) {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

function resolveWorkspaceRoot(serverUsername: string) {
  if (process.env.WORKSPACE_ROOT_DIR?.trim()) {
    return process.env.WORKSPACE_ROOT_DIR.trim();
  }

  if (!serverUsername || serverUsername === "root") {
    return "/root/opencode-workspaces";
  }

  return `/home/${serverUsername}/opencode-workspaces`;
}

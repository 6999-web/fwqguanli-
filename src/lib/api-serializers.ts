import { RoleCode } from "@prisma/client";
import { maskEmail } from "@/lib/crypto";

type UserLike = {
  id: string;
  email: string;
  name: string;
  roleId?: string;
  status?: string;
  role?: { code: RoleCode; name?: string | null } | null;
} | null | undefined;

type ServerLike = {
  id: string;
  loginEmail: string;
  loginEmailPassword?: string | null;
  serverPassword?: string | null;
  currentOwner?: UserLike;
  backupOwner?: UserLike;
  [key: string]: unknown;
} | null | undefined;

export function sanitizeUser(user: UserLike) {
  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    roleId: user.roleId,
    status: user.status,
    role: user.role ?? undefined,
  };
}

export function sanitizeServer(server: ServerLike, viewerRole: RoleCode) {
  if (!server) return null;

  return {
    ...server,
    currentOwner: sanitizeUser(server.currentOwner),
    backupOwner: sanitizeUser(server.backupOwner),
    loginEmail: viewerRole === RoleCode.ADMIN ? server.loginEmail : maskEmail(server.loginEmail),
    loginEmailPassword: viewerRole === RoleCode.ADMIN ? "已加密存储" : "******",
    serverPassword: "******",
  };
}

type WorkspaceLike = {
  id: string;
  name: string;
  slug: string;
  sshUsername: string;
  sshHost: string;
  sshPort: number;
  hostPortStart: number;
  hostPortEnd: number;
  cpuLimit: number;
  memoryLimitMb: number;
  diskLimitGb: number;
  gpuLimit?: number | null;
  workingDirectory: string;
  baseImage: string;
  status: string;
  statusMessage?: string | null;
  expiresAt?: Date | null;
  graceUntil?: Date | null;
  lastStartedAt?: Date | null;
  lastStoppedAt?: Date | null;
  lastPasswordResetAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date | null;
  ownerId: string;
  owner?: UserLike;
  server?: ServerLike;
  permissionRequestId?: string | null;
  sshPasswordEncrypted?: string;
} | null | undefined;

export function sanitizeWorkspace(workspace: WorkspaceLike, viewerRole: RoleCode, viewerUserId?: string) {
  if (!workspace) return null;

  const canReadCredentials = viewerRole === RoleCode.ADMIN || workspace.ownerId === viewerUserId;
  return {
    ...workspace,
    owner: sanitizeUser(workspace.owner),
    server: sanitizeServer(workspace.server, viewerRole),
    sshUsername: canReadCredentials ? workspace.sshUsername : `${workspace.sshUsername.slice(0, 1)}***`,
    sshPasswordEncrypted: undefined,
    sshCredentialAvailable: canReadCredentials,
  };
}

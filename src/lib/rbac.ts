import { RoleCode } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";

const permissionMap: Record<RoleCode, string[]> = {
  ADMIN: [
    "server:read",
    "server:write",
    "server:credential:read",
    "approval:create",
    "approval:read",
    "approval:manage",
    "audit:read",
    "port:request",
    "port:manage",
    "account:request",
    "account:manage",
    "assistant:execute",
    "workspace:read",
    "workspace:request",
    "workspace:manage",
    "workspace:credential:read",
  ],
  OPS: [
    "server:read",
    "approval:create",
    "approval:read",
    "port:request",
    "account:request",
    "assistant:execute",
    "workspace:read",
  ],
  USER: ["server:read", "approval:create", "port:request", "account:request", "workspace:read", "workspace:request", "workspace:credential:read"],
};

export async function requirePermission(permission: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");
  if (!permissionMap[user.role.code].includes(permission)) {
    throw new Error("FORBIDDEN");
  }
  return user;
}

export function hasPermission(role: RoleCode, permission: string) {
  return permissionMap[role].includes(permission);
}

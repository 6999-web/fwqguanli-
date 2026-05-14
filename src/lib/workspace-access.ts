import type { RoleCode } from "@prisma/client";

export function canManageWorkspace(role: RoleCode) {
  return role === "ADMIN";
}

export function canReadWorkspaceCredentials(role: RoleCode, ownerId: string, userId: string) {
  return role === "ADMIN" || ownerId === userId;
}

export function workspaceReadFilter(role: RoleCode, userId: string) {
  return role === "ADMIN" || role === "OPS" ? {} : { ownerId: userId };
}


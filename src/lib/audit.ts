import { prisma } from "@/lib/prisma";

type AuditInput = {
  userId?: string | null;
  action: string;
  module: string;
  targetId?: string;
  detail?: unknown;
  ipAddress?: string | null;
};

const REDACTED_KEYS = new Set([
  "password",
  "passwordHash",
  "serverPassword",
  "loginEmailPassword",
  "passwordEncrypted",
  "privateKey",
  "privateKeyEncrypted",
  "secret",
  "token",
]);

function sanitizeAuditDetail(detail: unknown): unknown {
  if (Array.isArray(detail)) {
    return detail.map((item) => sanitizeAuditDetail(item));
  }

  if (!detail || typeof detail !== "object") {
    return detail;
  }

  return Object.fromEntries(
    Object.entries(detail).map(([key, value]) => [
      key,
      REDACTED_KEYS.has(key) ? "[REDACTED]" : sanitizeAuditDetail(value),
    ]),
  );
}

export async function writeAuditLog(input: AuditInput) {
  return prisma.auditLog.create({
    data: {
      userId: input.userId ?? undefined,
      action: input.action,
      module: input.module,
      targetId: input.targetId,
      detail: sanitizeAuditDetail(input.detail) as never,
      ipAddress: input.ipAddress ?? undefined,
    },
  });
}

import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { sanitizeUser } from "@/lib/api-serializers";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

export async function GET() {
  try {
    await requirePermission("audit:read");
    const logs = await prisma.auditLog.findMany({
      include: { user: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return NextResponse.json(
      logs.map((log) => ({
        ...log,
        user: sanitizeUser(log.user),
      })),
    );
  } catch (error) {
    return apiError(error);
  }
}

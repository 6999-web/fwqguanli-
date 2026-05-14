import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { sanitizeServer } from "@/lib/api-serializers";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

export async function GET() {
  try {
    const user = await requirePermission("server:read");
    const alerts = await prisma.alert.findMany({
      include: { server: true },
      orderBy: { detectedAt: "desc" },
    });
    return NextResponse.json(
      alerts.map((alert) => ({
        ...alert,
        server: sanitizeServer(alert.server, user.role.code),
      })),
    );
  } catch (error) {
    return apiError(error);
  }
}

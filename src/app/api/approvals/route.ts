import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { sanitizeServer, sanitizeUser } from "@/lib/api-serializers";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

export async function GET() {
  try {
    const user = await requirePermission("approval:read");
    const approvals = await prisma.operationApproval.findMany({
      where:
        user.role.code === "ADMIN"
          ? undefined
          : {
              requesterId: user.id,
            },
      include: { server: true, approver: true },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(
      approvals.map((approval) => ({
        ...approval,
        server: sanitizeServer(approval.server, user.role.code),
        approver: sanitizeUser(approval.approver),
      })),
    );
  } catch (error) {
    return apiError(error);
  }
}

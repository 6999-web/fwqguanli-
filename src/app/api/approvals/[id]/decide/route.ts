import { NextRequest, NextResponse } from "next/server";
import { apiError, getRequestIp } from "@/lib/api";
import { decideApproval } from "@/lib/approval-workflows";
import { writeAuditLog } from "@/lib/audit";
import { parseDateInput } from "@/lib/time";
import { requirePermission } from "@/lib/rbac";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requirePermission("approval:manage");
    const { id } = await params;
    const body = await request.json();
    const dueAt =
      typeof body.dueAt === "string" ? parseDateInput(body.dueAt) : null;

    const result = await decideApproval({
      approvalId: id,
      approve: Boolean(body.approve),
      admin,
      dueAt,
      body,
    });

    await writeAuditLog({
      userId: admin.id,
      action: "DECIDE_APPROVAL",
      module: "approval",
      targetId: id,
      ipAddress: getRequestIp(request),
      detail: {
        approve: Boolean(body.approve),
        dueAt: dueAt?.toISOString() ?? null,
        type: result.type,
        workspaceSpec: body.workspaceSpec ?? null,
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}

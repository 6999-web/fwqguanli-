import { NextRequest, NextResponse } from "next/server";
import { apiError, getRequestIp } from "@/lib/api";
import { writeAuditLog } from "@/lib/audit";
import { closeTerminalSession, getTerminalSession } from "@/lib/terminal-runtime";
import { requirePermission } from "@/lib/rbac";

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission("workspace:read");
    const { id } = await context.params;
    const session = getTerminalSession(id);

    if (!session) {
      return NextResponse.json({ ok: true });
    }

    if (session.userId !== user.id) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    closeTerminalSession(id, "api");

    await writeAuditLog({
      userId: user.id,
      action: "TERMINAL_SESSION_CLOSE",
      module: "opencode",
      targetId: id,
      ipAddress: getRequestIp(request),
      detail: {
        serverId: session.serverId,
        workspaceId: session.workspaceId,
        targetLabel: session.targetLabel,
        host: session.host,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}

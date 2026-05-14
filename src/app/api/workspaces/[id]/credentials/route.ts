import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { canReadWorkspaceCredentials, workspaceReadFilter } from "@/lib/workspace-access";
import { decryptWorkspacePassword } from "@/lib/workspace-orchestrator";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission("workspace:credential:read");
    const { id } = await params;
    const workspace = await prisma.workspace.findFirst({
      where: {
        id,
        deletedAt: null,
        ...workspaceReadFilter(user.role.code, user.id),
      },
    });
    if (!workspace) {
      return NextResponse.json({ message: "Workspace not found" }, { status: 404 });
    }
    if (!canReadWorkspaceCredentials(user.role.code, workspace.ownerId, user.id)) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({
      id: workspace.id,
      sshHost: workspace.sshHost,
      sshPort: workspace.sshPort,
      sshUsername: workspace.sshUsername,
      sshPassword: decryptWorkspacePassword(workspace),
      expiresAt: workspace.expiresAt,
      graceUntil: workspace.graceUntil,
    });
  } catch (error) {
    return apiError(error);
  }
}


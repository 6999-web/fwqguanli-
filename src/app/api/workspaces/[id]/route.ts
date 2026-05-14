import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { sanitizeWorkspace } from "@/lib/api-serializers";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { canManageWorkspace, workspaceReadFilter } from "@/lib/workspace-access";
import { collectWorkspaceStatus, deleteWorkspace, reconcileWorkspaceLifecycle } from "@/lib/workspace-orchestrator";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission("workspace:read");
    const { id } = await params;
    const workspace = await prisma.workspace.findFirst({
      where: {
        id,
        deletedAt: null,
        ...workspaceReadFilter(user.role.code, user.id),
      },
      include: {
        owner: true,
        server: true,
      },
    });

    if (!workspace) {
      return NextResponse.json({ message: "Workspace not found" }, { status: 404 });
    }

    await reconcileWorkspaceLifecycle(workspace.id);
    const updated = await collectWorkspaceStatus(workspace.id).catch(() => workspace);

    return NextResponse.json(sanitizeWorkspace(updated, user.role.code, user.id));
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission("workspace:manage");
    if (!canManageWorkspace(user.role.code)) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    const deleted = await deleteWorkspace(id);
    return NextResponse.json(deleted);
  } catch (error) {
    return apiError(error);
  }
}


import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { sanitizeWorkspace } from "@/lib/api-serializers";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { workspaceReadFilter } from "@/lib/workspace-access";
import { reconcileWorkspaceLifecycle } from "@/lib/workspace-orchestrator";

export async function GET() {
  try {
    const user = await requirePermission("workspace:read");
    const workspaces = await prisma.workspace.findMany({
      where: {
        deletedAt: null,
        ...workspaceReadFilter(user.role.code, user.id),
      },
      include: {
        owner: true,
        server: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const reconciled = [];
    for (const workspace of workspaces) {
      reconciled.push(await reconcileWorkspaceLifecycle(workspace.id));
    }

    const hydrated = await prisma.workspace.findMany({
      where: {
        id: {
          in: reconciled.map((item) => item.id),
        },
      },
      include: {
        owner: true,
        server: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(hydrated.map((workspace) => sanitizeWorkspace(workspace, user.role.code, user.id)));
  } catch (error) {
    return apiError(error);
  }
}


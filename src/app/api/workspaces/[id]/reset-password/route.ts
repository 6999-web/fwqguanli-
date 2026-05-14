import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { resetWorkspacePassword, decryptWorkspacePassword } from "@/lib/workspace-orchestrator";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("workspace:manage");
    const { id } = await params;
    const workspace = await resetWorkspacePassword(id);
    const refreshed = await prisma.workspace.findUnique({ where: { id: workspace.id } });
    return NextResponse.json({
      ...workspace,
      sshPassword: refreshed ? decryptWorkspacePassword(refreshed) : null,
    });
  } catch (error) {
    return apiError(error);
  }
}

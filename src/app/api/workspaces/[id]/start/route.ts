import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requirePermission } from "@/lib/rbac";
import { startWorkspace } from "@/lib/workspace-orchestrator";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("workspace:manage");
    const { id } = await params;
    return NextResponse.json(await startWorkspace(id));
  } catch (error) {
    return apiError(error);
  }
}


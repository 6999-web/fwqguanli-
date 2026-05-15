import { NextRequest, NextResponse } from "next/server";
import { apiError, getRequestIp } from "@/lib/api";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { runServerConnectivityDiagnostic } from "@/lib/ssh/diagnostics";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission("server:write");
    const { id } = await params;
    const server = await prisma.server.findUnique({ where: { id } });

    if (!server) {
      return NextResponse.json({ message: "Server not found" }, { status: 404 });
    }

    const diagnostic = await runServerConnectivityDiagnostic(server);

    await writeAuditLog({
      userId: user.id,
      action: "DIAGNOSE_SERVER_CONNECTIVITY",
      module: "server",
      targetId: server.id,
      ipAddress: getRequestIp(request),
      detail: diagnostic,
    });

    return NextResponse.json(diagnostic);
  } catch (error) {
    return apiError(error);
  }
}

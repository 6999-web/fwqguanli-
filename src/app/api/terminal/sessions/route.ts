import { NextRequest, NextResponse } from "next/server";
import { apiError, getRequestIp } from "@/lib/api";
import { decryptText } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit";
import { createTerminalSession } from "@/lib/terminal-runtime";
import { decryptWorkspacePassword } from "@/lib/workspace-orchestrator";

export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission("workspace:read");
    const body = await request.json();
    const mode = body.mode === "server" ? "server" : "workspace";

    if (mode === "server") {
      if (user.role.code !== "ADMIN") {
        return NextResponse.json({ message: "Only admins can open host SSH sessions" }, { status: 403 });
      }
      if (!body.serverId) {
        return NextResponse.json({ message: "Missing serverId" }, { status: 400 });
      }

      const server = await prisma.server.findUnique({
        where: { id: body.serverId },
      });

      if (!server) {
        return NextResponse.json({ message: "Target server not found" }, { status: 404 });
      }

      const session = createTerminalSession({
        userId: user.id,
        serverId: server.id,
        targetLabel: `宿主机 ${server.serverCode}`,
        host: server.publicIp,
        port: server.sshPort,
        username: server.serverUsername,
        password: decryptText(server.serverPassword),
        cols: Number(body.cols) || 120,
        rows: Number(body.rows) || 32,
        initialCommand: typeof body.initialCommand === "string" ? body.initialCommand : undefined,
      });

      await writeAuditLog({
        userId: user.id,
        action: "TERMINAL_SESSION_CREATE",
        module: "workspace",
        targetId: session.id,
        ipAddress: getRequestIp(request),
        detail: {
          mode,
          serverId: server.id,
          serverCode: server.serverCode,
          host: server.publicIp,
        },
      });

      return NextResponse.json({
        sessionId: session.id,
        mode,
        target: {
          id: server.id,
          label: server.serverCode,
          host: server.publicIp,
          username: server.serverUsername,
          port: server.sshPort,
        },
      });
    }

    if (!body.workspaceId) {
      return NextResponse.json({ message: "Missing workspaceId" }, { status: 400 });
    }

    const workspace = await prisma.workspace.findFirst({
      where: {
        id: body.workspaceId,
        deletedAt: null,
        ...(user.role.code === "ADMIN" || user.role.code === "OPS" ? {} : { ownerId: user.id }),
      },
      include: {
        owner: true,
      },
    });

    if (!workspace) {
      return NextResponse.json({ message: "Workspace not found" }, { status: 404 });
    }

    const session = createTerminalSession({
      userId: user.id,
      workspaceId: workspace.id,
      serverId: workspace.serverId,
      targetLabel: `工作区 ${workspace.name}`,
      host: workspace.sshHost,
      port: workspace.sshPort,
      username: workspace.sshUsername,
      password: decryptWorkspacePassword(workspace),
      cols: Number(body.cols) || 120,
      rows: Number(body.rows) || 32,
      initialCommand: typeof body.initialCommand === "string" ? body.initialCommand : undefined,
    });

    await writeAuditLog({
      userId: user.id,
      action: "TERMINAL_SESSION_CREATE",
      module: "workspace",
      targetId: session.id,
      ipAddress: getRequestIp(request),
      detail: {
        mode,
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        host: workspace.sshHost,
        port: workspace.sshPort,
      },
    });

    return NextResponse.json({
      sessionId: session.id,
      mode,
      target: {
        id: workspace.id,
        label: workspace.name,
        host: workspace.sshHost,
        username: workspace.sshUsername,
        port: workspace.sshPort,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}

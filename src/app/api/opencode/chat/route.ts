import { NextRequest, NextResponse } from "next/server";
import { RequestStatus } from "@prisma/client";
import { apiError, getRequestIp } from "@/lib/api";
import { writeAuditLog } from "@/lib/audit";
import { analyzeDirectCommand, analyzeOpsPrompt, isDirectShellCommand } from "@/lib/opencode";
import { executeOpenCodeTask } from "@/lib/opencode-execution";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission("assistant:execute");
    const body = await request.json();
    const server = body.serverId
      ? await prisma.server.findUnique({ where: { id: body.serverId } })
      : null;

    if (body.execute && !server) {
      return NextResponse.json({ message: "执行任务前请先选择目标服务器" }, { status: 400 });
    }

    const shouldDirectExecute = Boolean(body.execute && server && isDirectShellCommand(body.prompt));
    const directAnalysis = shouldDirectExecute ? analyzeDirectCommand(body.prompt) : null;
    const workflowAnalysis =
      body.execute && server && !shouldDirectExecute ? analyzeOpsPrompt(body.prompt) : null;
    const approvalAnalysis = directAnalysis ?? workflowAnalysis;

    if (body.execute && server && approvalAnalysis && approvalAnalysis.riskLevel !== "LOW") {
      const task = await prisma.openCodeTask.create({
        data: {
          serverId: body.serverId || undefined,
          userId: user.id,
          prompt: body.prompt,
          analysis: approvalAnalysis.analysis,
          suggestedCommands: approvalAnalysis.suggestedCommands,
          riskLevel: approvalAnalysis.riskLevel,
          status: RequestStatus.PENDING,
          report: approvalAnalysis.report,
        },
      });

      const approval = await prisma.operationApproval.create({
        data: {
          serverId: body.serverId || undefined,
          type: "OPENCODE_HIGH_RISK",
          title: "OpenCode 高风险远程执行审批",
          payload: {
            taskId: task.id,
            prompt: body.prompt,
            serverId: body.serverId || null,
          },
          riskLevel: approvalAnalysis.riskLevel,
          requesterId: user.id,
          status: RequestStatus.PENDING,
        },
      });

      await writeAuditLog({
        userId: user.id,
        action: "OPENCODE_CHAT",
        module: "opencode",
        targetId: task.id,
        ipAddress: getRequestIp(request),
        detail: {
          serverId: body.serverId,
          execute: body.execute,
          mode: "server-ssh",
          usedFallback: false,
          exitCode: null,
          targetHost: server.publicIp,
          approvalRequired: true,
        },
      });

      return NextResponse.json({
        task,
        approval,
        mode: "server-ssh",
        stdout: "",
        stderr: "",
        exitCode: 0,
        usedFallback: false,
        analysis: approvalAnalysis.analysis,
        riskLevel: approvalAnalysis.riskLevel,
        report: approvalAnalysis.report,
        suggestedCommands: approvalAnalysis.suggestedCommands.map((item) => ({
          ...item,
          riskLevel: approvalAnalysis.riskLevel,
        })),
      });
    }

    const execution = await executeOpenCodeTask({
      prompt: body.prompt,
      execute: Boolean(body.execute),
      server,
    });

    const taskStatus =
      body.execute && execution.exitCode !== 0
        ? RequestStatus.REJECTED
        : body.execute
          ? RequestStatus.COMPLETED
          : RequestStatus.PENDING;

    const task = await prisma.openCodeTask.create({
      data: {
        serverId: body.serverId || undefined,
        userId: user.id,
        prompt: body.prompt,
        analysis: execution.analysis,
        suggestedCommands: execution.suggestedCommands,
        riskLevel: execution.riskLevel,
        status: taskStatus,
        executionResult: [execution.stdout, execution.stderr].filter(Boolean).join("\n") || undefined,
        report: execution.report,
      },
    });

    await writeAuditLog({
      userId: user.id,
      action: "OPENCODE_CHAT",
      module: "opencode",
      targetId: task.id,
      ipAddress: getRequestIp(request),
      detail: {
        serverId: body.serverId,
        execute: body.execute,
        mode: execution.mode,
        usedFallback: execution.usedFallback,
        exitCode: execution.exitCode,
        targetHost: execution.mode === "central-opencode" ? process.env.OPENCODE_CENTRAL_HOST : server?.publicIp,
      },
    });

    return NextResponse.json({
      task,
      approval: null,
      ...execution,
    });
  } catch (error) {
    return apiError(error);
  }
}

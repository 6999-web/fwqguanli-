import { Prisma, RequestStatus, RiskLevel, type OperationApproval, type User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { syncManagedServerStatus } from "@/lib/server-status";
import { executeOpenCodeTask } from "@/lib/opencode-execution";
import { decryptWorkspacePassword, provisionWorkspace } from "@/lib/workspace-orchestrator";

type ApprovalWithRelations = OperationApproval & {
  server: {
    id: string;
    serverCode: string;
    publicIp: string;
    serverUsername: string;
    serverPassword: string;
  } | null;
};

type ApprovalPayload = Record<string, unknown>;

export async function decideApproval(options: {
  approvalId: string;
  approve: boolean;
  admin: User;
  dueAt?: Date | null;
  body?: Record<string, unknown>;
}) {
  const approval = await prisma.operationApproval.findUnique({
    where: { id: options.approvalId },
    include: {
      server: true,
    },
  });

  if (!approval) {
    throw new Error("Approval not found");
  }

  if (approval.status !== RequestStatus.PENDING) {
    throw new Error("Approval already processed");
  }

  const payload = normalizePayload(approval.payload);
  const status = options.approve ? RequestStatus.APPROVED : RequestStatus.REJECTED;
  const dueAt = options.dueAt ?? null;

  switch (approval.type) {
    case "SERVER_USAGE":
    case "WORKSPACE_ACCESS":
      return decideWorkspaceApproval(approval as ApprovalWithRelations, payload, options.admin, status, dueAt, options.body ?? {});
    case "PORT_CHANGE":
      return decidePortChangeApproval(approval as ApprovalWithRelations, payload, options.admin, status);
    case "OPENCODE_HIGH_RISK":
      return decideHighRiskOpenCodeApproval(approval as ApprovalWithRelations, payload, options.admin, status);
    default:
      return decideAccountApproval(approval as ApprovalWithRelations, payload, options.admin, status);
  }
}

function normalizePayload(payload: Prisma.JsonValue | null): ApprovalPayload {
  return payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as ApprovalPayload) : {};
}

async function decideWorkspaceApproval(
  approval: ApprovalWithRelations,
  payload: ApprovalPayload,
  admin: User,
  status: RequestStatus,
  dueAt: Date | null,
  body: Record<string, unknown>,
) {
  const requestId = asString(payload.requestId);
  const permissionRequest =
    (requestId
      ? await prisma.permissionRequest.findUnique({ where: { id: requestId }, include: { requester: true } })
      : null) ??
    (await prisma.permissionRequest.findFirst({
      where: {
        requesterId: approval.requesterId ?? undefined,
        status: RequestStatus.PENDING,
      },
      include: { requester: true },
      orderBy: { createdAt: "desc" },
    }));

  if (!permissionRequest) {
    throw new Error("Workspace request not found");
  }

  const targetServerId = asString(body.targetServerId) ?? asString(payload.serverId) ?? permissionRequest.serverId;
  if (status === RequestStatus.APPROVED && !targetServerId) {
    throw new Error("Target server is required");
  }

  const spec = {
    cpuLimit: asNumber(body.cpuLimit) ?? permissionRequest.requestedCpu ?? 2,
    memoryLimitMb: asInteger(body.memoryLimitMb) ?? permissionRequest.requestedMemoryMb ?? 4096,
    diskLimitGb: asInteger(body.diskLimitGb) ?? permissionRequest.requestedDiskGb ?? 40,
    gpuLimit: asInteger(body.gpuLimit) ?? permissionRequest.requestedGpu ?? 0,
    sshPort: asInteger(body.sshPort),
    hostPortStart: asInteger(body.hostPortStart),
    hostPortEnd: asInteger(body.hostPortEnd),
    requestedPortCount: asInteger(body.requestedPortCount) ?? permissionRequest.requestedPortCount ?? 20,
    graceDays: asInteger(body.graceDays) ?? 7,
    baseImage: asString(body.baseImage),
    dueAt,
  };

  if (status === RequestStatus.APPROVED) {
    validateWorkspaceSpec(spec);
  }

  const result = await prisma.$transaction(async (tx) => {
    const updatedRequest = await tx.permissionRequest.update({
      where: { id: permissionRequest.id },
      data: {
        approverId: admin.id,
        assignedServerId: targetServerId ?? undefined,
        dueAt: dueAt ?? undefined,
        status,
      },
    });

    const updatedApproval = await tx.operationApproval.update({
      where: { id: approval.id },
      data: {
        approverId: admin.id,
        status,
        riskLevel: spec.gpuLimit && spec.gpuLimit > 0 ? RiskLevel.HIGH : RiskLevel.MEDIUM,
        payload: {
          ...payload,
          workspaceSpec: {
            ...spec,
            dueAt: spec.dueAt?.toISOString() ?? null,
          },
          targetServerId,
          graceDays: spec.graceDays,
          baseImage: spec.baseImage ?? null,
        },
        result: status === RequestStatus.APPROVED ? "工作区创建中" : "工作区访问申请已驳回",
      },
    });

    return { updatedRequest, updatedApproval };
  });

  let workspace = null;
  if (status === RequestStatus.APPROVED && targetServerId) {
    const server = await prisma.server.findUnique({ where: { id: targetServerId } });
    if (!server) {
      throw new Error("Target server not found");
    }

    try {
      workspace = await provisionWorkspace({
        server,
        ownerId: permissionRequest.requesterId,
        permissionRequestId: permissionRequest.id,
        workspaceName: `${permissionRequest.requester.name}-${permissionRequest.purpose}`,
        sshUsername: buildWorkspaceUsername(permissionRequest.requester.name, permissionRequest.id),
        spec,
      });

      await syncManagedServerStatus(server.id);

      await createWorkspaceHandover({
        workspace,
        serverId: server.id,
        ownerId: permissionRequest.requesterId,
        permissionRequestId: permissionRequest.id,
        plannedReturnAt: dueAt,
      });

      await prisma.operationApproval.update({
        where: { id: approval.id },
        data: {
          result: `工作区已分配，SSH ${workspace.sshHost}:${workspace.sshPort}，账号 ${workspace.sshUsername}，密码 ${decryptWorkspacePassword(workspace)}`,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "workspace provisioning failed";
      const failedWorkspace = await prisma.workspace.findFirst({
        where: {
          permissionRequestId: permissionRequest.id,
        },
        orderBy: { createdAt: "desc" },
      });

      if (!failedWorkspace) {
        await prisma.$transaction([
          prisma.permissionRequest.update({
            where: { id: permissionRequest.id },
            data: {
              status: RequestStatus.PENDING,
              approverId: null,
              assignedServerId: null,
              dueAt: null,
            },
          }),
          prisma.operationApproval.update({
            where: { id: approval.id },
            data: {
              status: RequestStatus.PENDING,
              approverId: null,
              result: `工作区创建失败：${message}`,
            },
          }),
        ]);
        throw error;
      }

      workspace = failedWorkspace;
      await createWorkspaceHandover({
        workspace: failedWorkspace,
        serverId: server.id,
        ownerId: permissionRequest.requesterId,
        permissionRequestId: permissionRequest.id,
        plannedReturnAt: dueAt,
      });

      await prisma.operationApproval.update({
        where: { id: approval.id },
        data: {
          result: `工作区账号已生成，但环境启动失败：${message}。SSH ${failedWorkspace.sshHost}:${failedWorkspace.sshPort}，账号 ${failedWorkspace.sshUsername}，密码 ${decryptWorkspacePassword(failedWorkspace)}`,
        },
      });
    }
  }

  return {
    type: "WORKSPACE_ACCESS",
    approval: await prisma.operationApproval.findUnique({ where: { id: approval.id } }),
    permissionRequest: result.updatedRequest,
    workspace,
  };
}

async function decidePortChangeApproval(
  approval: ApprovalWithRelations,
  payload: ApprovalPayload,
  admin: User,
  status: RequestStatus,
) {
  const requestId = asString(payload.requestId);
  const portRequest =
    (requestId ? await prisma.portRequest.findUnique({ where: { id: requestId } }) : null) ??
    (await prisma.portRequest.findFirst({
      where: {
        requesterId: approval.requesterId ?? undefined,
        status: RequestStatus.PENDING,
      },
      orderBy: { createdAt: "desc" },
    }));

  if (!portRequest) {
    throw new Error("Port request not found");
  }

  const result = await prisma.$transaction(async (tx) => {
    const updatedPortRequest = await tx.portRequest.update({
      where: { id: portRequest.id },
      data: {
        approverId: admin.id,
        status,
        openedAt: status === RequestStatus.APPROVED ? new Date() : undefined,
        closedAt: status === RequestStatus.APPROVED && portRequest.action === "CLOSE" ? new Date() : undefined,
      },
    });

    if (status === RequestStatus.APPROVED) {
      await tx.firewallRule.create({
        data: {
          serverId: updatedPortRequest.serverId,
          port: updatedPortRequest.port,
          protocol: updatedPortRequest.protocol,
          action: updatedPortRequest.action,
          description: updatedPortRequest.purpose,
          syncedAt: new Date(),
        },
      });
    }

    const updatedApproval = await tx.operationApproval.update({
      where: { id: approval.id },
      data: {
        approverId: admin.id,
        status,
        result: status === RequestStatus.APPROVED ? "端口变更已同步" : "端口变更已驳回",
      },
    });

    return { updatedApproval, updatedPortRequest };
  });

  return {
    type: approval.type,
    approval: result.updatedApproval,
    portRequest: result.updatedPortRequest,
  };
}

async function decideAccountApproval(
  approval: ApprovalWithRelations,
  payload: ApprovalPayload,
  admin: User,
  status: RequestStatus,
) {
  const updatedApproval = await prisma.operationApproval.update({
    where: { id: approval.id },
    data: {
      approverId: admin.id,
      status,
      result: status === RequestStatus.APPROVED ? "宿主机账号发放已停用，请改用工作区" : "已驳回",
    },
  });

  return {
    type: approval.type,
    approval: updatedApproval,
    disabled: true,
    requestType: payload.requestType ?? approval.type,
  };
}

async function decideHighRiskOpenCodeApproval(
  approval: ApprovalWithRelations,
  payload: ApprovalPayload,
  admin: User,
  status: RequestStatus,
) {
  const taskId = asString(payload.taskId);
  const prompt = asString(payload.prompt);
  const serverId = asString(payload.serverId) ?? approval.serverId;
  const server = serverId ? await prisma.server.findUnique({ where: { id: serverId } }) : null;

  let resultMessage = status === RequestStatus.APPROVED ? "已审批通过" : "已驳回";
  let executionOutput = null;

  if (status === RequestStatus.APPROVED && prompt && server) {
    executionOutput = await executeOpenCodeTask({
      prompt,
      execute: true,
      server,
    });
    resultMessage = executionOutput.stdout || executionOutput.stderr || "OpenCode 已执行";
  }

  const result = await prisma.$transaction(async (tx) => {
    const updatedApproval = await tx.operationApproval.update({
      where: { id: approval.id },
      data: {
        approverId: admin.id,
        status,
        result: resultMessage,
      },
    });

    let task = null;
    if (taskId) {
      task = await tx.openCodeTask.update({
        where: { id: taskId },
        data: {
          status: status === RequestStatus.APPROVED ? RequestStatus.COMPLETED : RequestStatus.REJECTED,
          executionResult: executionOutput
            ? [executionOutput.stdout, executionOutput.stderr].filter(Boolean).join("\n")
            : updatedApproval.result,
          report: executionOutput?.report,
        },
      });
    }

    return { updatedApproval, task };
  });

  return {
    type: approval.type,
    approval: result.updatedApproval,
    task: result.task,
  };
}

function validateWorkspaceSpec(spec: {
  cpuLimit: number;
  memoryLimitMb: number;
  diskLimitGb: number;
  gpuLimit?: number | null;
  sshPort?: number | null;
  hostPortStart?: number | null;
  hostPortEnd?: number | null;
}) {
  if (!spec.cpuLimit || spec.cpuLimit <= 0) throw new Error("cpuLimit must be greater than 0");
  if (!spec.memoryLimitMb || spec.memoryLimitMb <= 0) throw new Error("memoryLimitMb must be greater than 0");
  if (!spec.diskLimitGb || spec.diskLimitGb <= 0) throw new Error("diskLimitGb must be greater than 0");
  if (spec.gpuLimit != null && spec.gpuLimit < 0) throw new Error("gpuLimit cannot be negative");
  if (spec.sshPort && spec.sshPort < 1) throw new Error("sshPort is invalid");
  if ((spec.hostPortStart && !spec.hostPortEnd) || (!spec.hostPortStart && spec.hostPortEnd)) {
    throw new Error("host port range must include both start and end");
  }
  if (spec.hostPortStart && spec.hostPortEnd && spec.hostPortStart > spec.hostPortEnd) {
    throw new Error("host port range is invalid");
  }
}

function buildWorkspaceUsername(name: string, requestId: string) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 8) || "user";
  return `${base}${requestId.slice(-4)}`;
}

async function createWorkspaceHandover(options: {
  workspace: {
    id: string;
    sshHost: string;
    sshPort: number;
    sshUsername: string;
    hostPortStart: number;
    hostPortEnd: number;
    baseImage: string;
  };
  serverId: string;
  ownerId: string;
  permissionRequestId: string;
  plannedReturnAt: Date | null;
}) {
  const handover = await prisma.handoverRecord.create({
    data: {
      serverId: options.serverId,
      workspaceId: options.workspace.id,
      ownerId: options.ownerId,
      publicIp: options.workspace.sshHost,
      loginMethod: "WORKSPACE_SSH",
      openPorts: {
        sshPort: options.workspace.sshPort,
        hostPortStart: options.workspace.hostPortStart,
        hostPortEnd: options.workspace.hostPortEnd,
      },
      installedEnvironments: {
        baseImage: options.workspace.baseImage,
      },
      plannedReturnAt: options.plannedReturnAt ?? undefined,
    },
  });

  await prisma.permissionRequest.update({
    where: { id: options.permissionRequestId },
    data: {
      handoverId: handover.id,
    },
  });

  return handover;
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asInteger(value: unknown) {
  const parsed = asNumber(value);
  return parsed == null ? null : Math.trunc(parsed);
}

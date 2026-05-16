/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { DataTable } from "@/components/ui/data-table";
import { approvalTypeLabel, statusLabel, workspaceRequestTypeLabel } from "@/lib/format";
import { formatDateTime } from "@/lib/time";

type WorkspaceSpecDraft = {
  dueAt: string;
  targetServerId: string;
  cpuLimit: string;
  memoryLimitMb: string;
  diskLimitGb: string;
  gpuLimit: string;
  sshPort: string;
  hostPortStart: string;
  hostPortEnd: string;
  requestedPortCount: string;
  graceDays: string;
  baseImage: string;
};

const defaultDraft: WorkspaceSpecDraft = {
  dueAt: "",
  targetServerId: "",
  cpuLimit: "2",
  memoryLimitMb: "4096",
  diskLimitGb: "40",
  gpuLimit: "0",
  sshPort: "",
  hostPortStart: "",
  hostPortEnd: "",
  requestedPortCount: "20",
  graceDays: "7",
  baseImage: "",
};

export default function ApprovalCenterPage() {
  const [approvals, setApprovals] = useState<any[]>([]);
  const [role, setRole] = useState("");
  const [servers, setServers] = useState<any[]>([]);
  const [drafts, setDrafts] = useState<Record<string, WorkspaceSpecDraft>>({});
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  async function load() {
    const [meRes, approvalsRes, serversRes] = await Promise.all([
      fetch("/api/auth/me", { cache: "no-store" }),
      fetch("/api/approvals", { cache: "no-store" }),
      fetch("/api/servers", { cache: "no-store" }),
    ]);
    const me = await meRes.json();
    const approvalRows = await approvalsRes.json();
    setRole(me.role);
    setApprovals(Array.isArray(approvalRows) ? approvalRows : []);
    setServers(await serversRes.json());
  }

  useEffect(() => {
    void load();
  }, []);

  function getDefaultServerId() {
    return servers[0]?.id ?? "";
  }

  function getDraft(approval: any): WorkspaceSpecDraft {
    return drafts[approval.id] ?? {
      ...defaultDraft,
      targetServerId: approval.payload?.targetServerId ?? approval.payload?.serverId ?? getDefaultServerId(),
      cpuLimit: String(approval.payload?.requestedCpu ?? 2),
      memoryLimitMb: String(approval.payload?.requestedMemoryMb ?? 4096),
      diskLimitGb: String(approval.payload?.requestedDiskGb ?? 40),
      gpuLimit: String(approval.payload?.requestedGpu ?? 0),
      requestedPortCount: String(approval.payload?.requestedPortCount ?? 20),
    };
  }

  function updateDraft(id: string, patch: Partial<WorkspaceSpecDraft>) {
    setDrafts((current) => ({
      ...current,
      [id]: {
        ...(current[id] ?? defaultDraft),
        ...patch,
      },
    }));
  }

  async function decide(approval: any, approve: boolean) {
    if (approval.status !== "PENDING" || submittingId) {
      await load();
      return;
    }

    const draft = getDraft(approval);
    const targetServerId = draft.targetServerId || getDefaultServerId();
    setSubmittingId(approval.id);
    try {
      const response = await fetch(`/api/approvals/${approval.id}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          approve,
          dueAt: draft.dueAt || null,
          targetServerId: targetServerId || null,
          cpuLimit: draft.cpuLimit,
          memoryLimitMb: draft.memoryLimitMb,
          diskLimitGb: draft.diskLimitGb,
          gpuLimit: draft.gpuLimit,
          sshPort: draft.sshPort || null,
          hostPortStart: draft.hostPortStart || null,
          hostPortEnd: draft.hostPortEnd || null,
          requestedPortCount: draft.requestedPortCount,
          graceDays: draft.graceDays,
          baseImage: draft.baseImage || null,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({ message: "审批操作失败" }));
        await load();
        window.alert(payload.message ?? "审批操作失败");
        return;
      }

      await load();
    } finally {
      setSubmittingId(null);
    }
  }

  const rows = approvals.map((approval) => [
    approvalTypeLabel(approval.type),
    workspaceRequestTypeLabel(approval.payload?.requestType ?? approval.type),
    approval.server?.serverCode ?? "-",
    statusLabel(approval.status),
    statusLabel(approval.riskLevel),
    formatDateTime(approval.createdAt),
    approval.result ?? "-",
    role === "ADMIN" && approval.status === "PENDING" ? (
      <div key={approval.id} className="space-y-3">
        {approval.type === "WORKSPACE_ACCESS" || approval.type === "SERVER_USAGE" ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <select className="rounded bg-[#031224] px-3 py-2 text-xs text-slate-200" value={getDraft(approval).targetServerId} onChange={(event) => updateDraft(approval.id, { targetServerId: event.target.value })}>
              <option value="">选择宿主机</option>
              {servers.map((server) => (
                <option key={server.id} value={server.id}>{server.serverCode}</option>
              ))}
            </select>
            <input className="rounded bg-[#031224] px-3 py-2 text-xs text-slate-200" type="date" value={getDraft(approval).dueAt} onChange={(event) => updateDraft(approval.id, { dueAt: event.target.value })} />
            <input className="rounded bg-[#031224] px-3 py-2 text-xs text-slate-200" placeholder="CPU" value={getDraft(approval).cpuLimit} onChange={(event) => updateDraft(approval.id, { cpuLimit: event.target.value })} />
            <input className="rounded bg-[#031224] px-3 py-2 text-xs text-slate-200" placeholder="内存 MB" value={getDraft(approval).memoryLimitMb} onChange={(event) => updateDraft(approval.id, { memoryLimitMb: event.target.value })} />
            <input className="rounded bg-[#031224] px-3 py-2 text-xs text-slate-200" placeholder="磁盘 GB" value={getDraft(approval).diskLimitGb} onChange={(event) => updateDraft(approval.id, { diskLimitGb: event.target.value })} />
            <input className="rounded bg-[#031224] px-3 py-2 text-xs text-slate-200" placeholder="GPU" value={getDraft(approval).gpuLimit} onChange={(event) => updateDraft(approval.id, { gpuLimit: event.target.value })} />
            <input className="rounded bg-[#031224] px-3 py-2 text-xs text-slate-200" placeholder="SSH 端口" value={getDraft(approval).sshPort} onChange={(event) => updateDraft(approval.id, { sshPort: event.target.value })} />
            <input className="rounded bg-[#031224] px-3 py-2 text-xs text-slate-200" placeholder="业务端口起始" value={getDraft(approval).hostPortStart} onChange={(event) => updateDraft(approval.id, { hostPortStart: event.target.value })} />
            <input className="rounded bg-[#031224] px-3 py-2 text-xs text-slate-200" placeholder="业务端口结束" value={getDraft(approval).hostPortEnd} onChange={(event) => updateDraft(approval.id, { hostPortEnd: event.target.value })} />
            <input className="rounded bg-[#031224] px-3 py-2 text-xs text-slate-200" placeholder="端口数量" value={getDraft(approval).requestedPortCount} onChange={(event) => updateDraft(approval.id, { requestedPortCount: event.target.value })} />
            <input className="rounded bg-[#031224] px-3 py-2 text-xs text-slate-200" placeholder="宽限天数" value={getDraft(approval).graceDays} onChange={(event) => updateDraft(approval.id, { graceDays: event.target.value })} />
            <input className="rounded bg-[#031224] px-3 py-2 text-xs text-slate-200 sm:col-span-2" placeholder="镜像，可选" value={getDraft(approval).baseImage} onChange={(event) => updateDraft(approval.id, { baseImage: event.target.value })} />
          </div>
        ) : null}
        <div className="flex gap-2">
          <button className="rounded bg-cyan-500/10 px-3 py-1 text-cyan-100 disabled:cursor-not-allowed disabled:opacity-50" disabled={submittingId === approval.id} onClick={() => decide(approval, true)}>通过</button>
          <button className="rounded bg-rose-500/10 px-3 py-1 text-rose-200 disabled:cursor-not-allowed disabled:opacity-50" disabled={submittingId === approval.id} onClick={() => decide(approval, false)}>驳回</button>
        </div>
      </div>
    ) : "-",
  ]);

  return (
    <AppShell>
      <div className="p-6 text-white">
        <h1 className="text-3xl font-semibold">审批中心</h1>
        <p className="mt-2 text-sm text-slate-400">统一处理工作区访问、端口变更与 OpenCode 高风险审批。工作区审批通过后会自动生成账号密码，并在交接记录和工作区访问页面展示。</p>
        <div className="mt-6">
          {role && role !== "ADMIN" ? (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-100">当前账号仅有查看权限，审批操作只对管理员开放。</div>
          ) : null}
          <DataTable columns={["审批类型", "申请类型", "宿主机", "状态", "风险", "创建时间", "结果", "操作"]} rows={rows} />
        </div>
      </div>
    </AppShell>
  );
}

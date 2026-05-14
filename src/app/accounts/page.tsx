/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { DataTable } from "@/components/ui/data-table";
import { statusLabel } from "@/lib/format";
import { formatDateTime } from "@/lib/time";

export default function AccountsPage() {
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [credentials, setCredentials] = useState<Record<string, any>>({});
  const [role, setRole] = useState("");

  async function loadCredentials(workspaceRows: any[]) {
    const entries = await Promise.all(
      workspaceRows.map(async (workspace) => {
        const response = await fetch(`/api/workspaces/${workspace.id}/credentials`);
        if (!response.ok) {
          return [workspace.id, null] as const;
        }
        return [workspace.id, await response.json()] as const;
      }),
    );

    setCredentials(
      Object.fromEntries(entries.filter((entry): entry is readonly [string, any] => Boolean(entry[1]))),
    );
  }

  async function load() {
    const [meRes, workspacesRes, requestsRes] = await Promise.all([
      fetch("/api/auth/me"),
      fetch("/api/workspaces"),
      fetch("/api/permission-requests"),
    ]);
    const me = await meRes.json();
    const workspaceRows = await workspacesRes.json();
    const requestRows = await requestsRes.json();
    setRole(me.role);
    setWorkspaces(workspaceRows);
    setRequests(requestRows);
    await loadCredentials(workspaceRows);
  }

  useEffect(() => {
    void load();
  }, []);

  async function action(id: string, kind: "start" | "stop" | "reset-password" | "delete") {
    const method = kind === "delete" ? "DELETE" : "POST";
    const path = kind === "delete" ? `/api/workspaces/${id}` : `/api/workspaces/${id}/${kind}`;
    await fetch(path, { method });
    await load();
  }

  return (
    <AppShell>
      <div className="p-6 text-white">
        <h1 className="text-3xl font-semibold">{role === "USER" ? "我的账号状态" : "工作区访问"}</h1>
        <p className="mt-2 text-sm text-slate-400">
          {role === "USER"
            ? "这里集中查看超级管理员分配给你的账号、密码、服务器地址，以及你自己的历史申请记录。"
            : "这里展示平台发放的工作区，以及审批通过后自动生成的 SSH 账号和密码。"}
        </p>

        <div className="mt-6 space-y-6">
          <DataTable
            columns={[
              "工作区",
              "服务器",
              "状态",
              "服务器地址",
              "账号",
              "密码",
              "资源",
              "到期时间",
              "目录",
              "操作",
            ]}
            rows={workspaces.map((workspace) => {
              const credential = credentials[workspace.id];
              return [
                workspace.name,
                workspace.server?.serverCode ?? "-",
                statusLabel(workspace.status),
                credential ? `${credential.sshHost}:${credential.sshPort}` : "-",
                credential ? credential.sshUsername : "-",
                credential ? <span className="font-mono text-cyan-200">{credential.sshPassword}</span> : "-",
                `CPU ${workspace.cpuLimit} / MEM ${workspace.memoryLimitMb}MB / DISK ${workspace.diskLimitGb}GB / PORT ${workspace.hostPortStart}-${workspace.hostPortEnd}`,
                formatDateTime(workspace.expiresAt),
                workspace.workingDirectory,
                <div key={`${workspace.id}-actions`} className="flex flex-wrap gap-2">
                  {role === "ADMIN" ? (
                    <>
                      <button className="rounded bg-cyan-500/10 px-3 py-1 text-cyan-100" onClick={() => action(workspace.id, "start")}>
                        启动
                      </button>
                      <button className="rounded bg-amber-500/10 px-3 py-1 text-amber-100" onClick={() => action(workspace.id, "stop")}>
                        停止
                      </button>
                      <button className="rounded bg-slate-500/20 px-3 py-1 text-slate-200" onClick={() => action(workspace.id, "reset-password")}>
                        重置密码
                      </button>
                      <button className="rounded bg-rose-500/10 px-3 py-1 text-rose-200" onClick={() => action(workspace.id, "delete")}>
                        删除
                      </button>
                    </>
                  ) : (
                    "-"
                  )}
                </div>,
              ];
            })}
          />

          <DataTable
            columns={[
              "申请类型",
              "申请用途",
              "目标服务器",
              "状态",
              "审批人",
              "创建时间",
              "最近工作区状态",
            ]}
            rows={requests.map((request) => [
              request.requestType ?? "WORKSPACE_ACCESS",
              request.purpose,
              request.server?.serverCode ?? "系统自动分配",
              statusLabel(request.status),
              request.approver?.name ?? "-",
              formatDateTime(request.createdAt),
              request.latestWorkspace?.status ? statusLabel(request.latestWorkspace.status) : "-",
            ])}
          />
        </div>
      </div>
    </AppShell>
  );
}

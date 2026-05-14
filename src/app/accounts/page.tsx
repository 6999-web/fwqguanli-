/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { DataTable } from "@/components/ui/data-table";
import { statusLabel } from "@/lib/format";
import { formatDateTime } from "@/lib/time";

export default function AccountsPage() {
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [credentials, setCredentials] = useState<Record<string, any>>({});
  const [role, setRole] = useState("");

  async function load() {
    const [meRes, workspacesRes] = await Promise.all([fetch("/api/auth/me"), fetch("/api/workspaces")]);
    const me = await meRes.json();
    setRole(me.role);
    setWorkspaces(await workspacesRes.json());
  }

  useEffect(() => {
    void load();
  }, []);

  async function showCredentials(id: string) {
    const response = await fetch(`/api/workspaces/${id}/credentials`);
    if (!response.ok) return;
    const payload = await response.json();
    setCredentials((current) => ({ ...current, [id]: payload }));
  }

  async function action(id: string, kind: "start" | "stop" | "reset-password" | "delete") {
    const method = kind === "delete" ? "DELETE" : "POST";
    const path = kind === "delete" ? `/api/workspaces/${id}` : `/api/workspaces/${id}/${kind}`;
    await fetch(path, { method });
    if (kind === "reset-password") {
      await showCredentials(id);
    }
    await load();
  }

  return (
    <AppShell>
      <div className="p-6 text-white">
        <h1 className="text-3xl font-semibold">工作区访问</h1>
        <p className="mt-2 text-sm text-slate-400">
          这里展示平台发放的隔离工作区，而不是宿主机账号。普通用户只能查看自己的工作区与容器 SSH 信息。
        </p>
        <div className="mt-6 space-y-6">
          <DataTable
            columns={["工作区", "宿主机", "状态", "SSH", "资源", "到期", "目录", "操作"]}
            rows={workspaces.map((workspace) => {
              const credential = credentials[workspace.id];
              return [
                workspace.name,
                workspace.server?.serverCode ?? "-",
                statusLabel(workspace.status),
                credential ? (
                  <div key={`${workspace.id}-cred`} className="space-y-1 text-xs">
                    <div>{credential.sshHost}:{credential.sshPort}</div>
                    <div>{credential.sshUsername}</div>
                    <div className="text-cyan-200">{credential.sshPassword}</div>
                  </div>
                ) : (
                  <button
                    key={`${workspace.id}-show`}
                    className="rounded bg-cyan-500/10 px-3 py-1 text-cyan-100"
                    onClick={() => showCredentials(workspace.id)}
                  >
                    查看凭据
                  </button>
                ),
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
        </div>
      </div>
    </AppShell>
  );
}

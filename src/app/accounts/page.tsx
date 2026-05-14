/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { DataTable } from "@/components/ui/data-table";
import { statusLabel } from "@/lib/format";
import { formatDateTime } from "@/lib/time";

export default function AccountsPage() {
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [credentials, setCredentials] = useState<Record<string, any>>({});
  const [role, setRole] = useState("");

  const loadCredentials = useCallback(async (workspaceRows: any[]) => {
    const entries = await Promise.all(
      workspaceRows.map(async (workspace) => {
        const response = await fetch(`/api/workspaces/${workspace.id}/credentials`);
        if (!response.ok) {
          return [workspace.id, null] as const;
        }
        return [workspace.id, await response.json()] as const;
      }),
    );

    setCredentials(Object.fromEntries(entries.filter((entry): entry is readonly [string, any] => Boolean(entry[1]))));
  }, []);

  const load = useCallback(async () => {
    const [meRes, workspacesRes] = await Promise.all([fetch("/api/auth/me"), fetch("/api/workspaces")]);
    const me = await meRes.json();
    const workspaceRows = await workspacesRes.json();
    setRole(me.role);
    setWorkspaces(workspaceRows);
    await loadCredentials(workspaceRows);
  }, [loadCredentials]);

  useEffect(() => {
    void load();
  }, [load]);

  async function action(id: string, kind: "start" | "stop" | "reset-password" | "delete") {
    const method = kind === "delete" ? "DELETE" : "POST";
    const path = kind === "delete" ? `/api/workspaces/${id}` : `/api/workspaces/${id}/${kind}`;
    await fetch(path, { method });
    await load();
  }

  return (
    <AppShell>
      <div className="p-6 text-white">
        {role === "USER" ? (
          <UserAccountView workspaces={workspaces} credentials={credentials} />
        ) : (
          <AdminWorkspaceView workspaces={workspaces} credentials={credentials} onAction={action} />
        )}
      </div>
    </AppShell>
  );
}

function UserAccountView({
  workspaces,
  credentials,
}: {
  workspaces: any[];
  credentials: Record<string, any>;
}) {
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">我的账号状态</h1>
          <p className="mt-2 text-sm text-slate-400">
            这里只展示你自己的工作区账号状态、连接方式和资源有效期，不展示其他人的账号信息。
          </p>
        </div>
        <Link href="/guide" className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100">
          查看使用文档
        </Link>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {workspaces.length ? (
          workspaces.map((workspace) => {
            const credential = credentials[workspace.id];
            return (
              <div key={workspace.id} className="rounded-lg border border-cyan-500/15 bg-[#06182f]/80 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-lg font-medium text-white">{workspace.name}</div>
                    <div className="mt-1 text-sm text-slate-400">{workspace.server?.serverCode ?? "-"}</div>
                  </div>
                  <div className="rounded-full bg-cyan-500/10 px-3 py-1 text-xs text-cyan-100">{statusLabel(workspace.status)}</div>
                </div>

                <div className="mt-4 space-y-3 text-sm">
                  <Field label="连接地址" value={credential ? `${credential.sshHost}:${credential.sshPort}` : "-"} />
                  <Field label="登录账号" value={credential?.sshUsername ?? "-"} />
                  <Field label="登录密码" value={credential?.sshPassword ?? "-"} mono />
                  <Field label="工作目录" value={workspace.workingDirectory} />
                  <Field
                    label="资源配额"
                    value={`CPU ${workspace.cpuLimit} / MEM ${workspace.memoryLimitMb}MB / DISK ${workspace.diskLimitGb}GB`}
                  />
                  <Field label="端口范围" value={`${workspace.hostPortStart}-${workspace.hostPortEnd}`} />
                  <Field label="到期时间" value={formatDateTime(workspace.expiresAt)} />
                </div>
              </div>
            );
          })
        ) : (
          <div className="rounded-lg border border-dashed border-cyan-500/15 bg-[#06182f]/80 p-6 text-sm text-slate-300 md:col-span-2 xl:col-span-3">
            你当前没有已获批账号。先到“工作区申请”提交申请，审批通过后这里会显示可用连接信息。
          </div>
        )}
      </div>
    </>
  );
}

function AdminWorkspaceView({
  workspaces,
  credentials,
  onAction,
}: {
  workspaces: any[];
  credentials: Record<string, any>;
  onAction: (id: string, kind: "start" | "stop" | "reset-password" | "delete") => Promise<void>;
}) {
  return (
    <>
      <h1 className="text-3xl font-semibold">工作区访问</h1>
      <p className="mt-2 text-sm text-slate-400">管理员可查看已发放工作区、连接信息与运行状态，并执行启停和重置密码。</p>

      <div className="mt-6">
        <DataTable
          columns={["工作区", "服务器", "状态", "连接地址", "账号", "密码", "资源", "到期时间", "目录", "操作"]}
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
                <button className="rounded bg-cyan-500/10 px-3 py-1 text-cyan-100" onClick={() => void onAction(workspace.id, "start")}>
                  启动
                </button>
                <button className="rounded bg-amber-500/10 px-3 py-1 text-amber-100" onClick={() => void onAction(workspace.id, "stop")}>
                  停止
                </button>
                <button className="rounded bg-slate-500/20 px-3 py-1 text-slate-200" onClick={() => void onAction(workspace.id, "reset-password")}>
                  重置密码
                </button>
                <button className="rounded bg-rose-500/10 px-3 py-1 text-rose-200" onClick={() => void onAction(workspace.id, "delete")}>
                  删除
                </button>
              </div>,
            ];
          })}
        />
      </div>
    </>
  );
}

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 break-all text-slate-200 ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}

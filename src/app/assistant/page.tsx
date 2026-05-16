"use client";

import { useEffect, useMemo, useState } from "react";
import { Bot, Box, ChevronRight, Server } from "lucide-react";
import { SSHTerminal } from "@/components/assistant/ssh-terminal";
import { AppShell } from "@/components/layout/app-shell";
import { cn, statusLabel } from "@/lib/format";

type ServerRecord = {
  id: string;
  serverCode: string;
  publicIp: string;
  status: string;
  serverUsername?: string | null;
};

type WorkspaceRecord = {
  id: string;
  name: string;
  sshHost: string;
  sshPort: number;
  sshUsername: string;
  status: string;
};

type Target =
  | { id: string; label: string; host: string; username?: string | null; status: string; mode: "server" }
  | { id: string; label: string; host: string; username?: string | null; status: string; mode: "workspace"; port: number };

export default function AssistantPage() {
  const [role, setRole] = useState("");
  const [servers, setServers] = useState<ServerRecord[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>([]);
  const [targetId, setTargetId] = useState("");

  useEffect(() => {
    Promise.all([fetch("/api/auth/me"), fetch("/api/servers"), fetch("/api/workspaces")]).then(
      async ([meRes, serversRes, workspacesRes]) => {
        const me = await meRes.json();
        setRole(me.role);
        setServers(await serversRes.json());
        setWorkspaces(await workspacesRes.json());
      },
    );
  }, []);

  const targets = useMemo<Target[]>(() => {
    const workspaceTargets = workspaces.map((workspace) => ({
      id: workspace.id,
      label: workspace.name,
      host: workspace.sshHost,
      username: workspace.sshUsername,
      status: workspace.status,
      mode: "workspace" as const,
      port: workspace.sshPort,
    }));
    if (role === "ADMIN") {
      return [
        ...workspaceTargets,
        ...servers.map((server) => ({
          id: `server:${server.id}`,
          label: `宿主机 ${server.serverCode}`,
          host: server.publicIp,
          username: server.serverUsername,
          status: server.status,
          mode: "server" as const,
        })),
      ];
    }
    return workspaceTargets;
  }, [role, servers, workspaces]);

  const selectedTarget = useMemo(() => targets.find((item) => item.id === targetId) ?? null, [targetId, targets]);

  return (
    <AppShell>
      <div className="min-h-screen p-6 text-white">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-cyan-300">
            <Bot size={18} />
            <span className="text-sm uppercase tracking-[0.35em]">OpenCode Ops</span>
          </div>
          <h1 className="text-3xl font-semibold">工作区 SSH 终端</h1>
          <p className="max-w-4xl text-sm text-slate-400">
            普通用户只能连接自己的容器工作区；管理员除工作区之外，还保留宿主机 SSH 入口。
          </p>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
          <section className="rounded-lg border border-cyan-500/15 bg-[#06182f]/80 p-4">
            <div className="flex items-center gap-2 text-sm text-cyan-100">
              {role === "ADMIN" ? <Server size={16} /> : <Box size={16} />}
              <span>{role === "ADMIN" ? "宿主机 / 工作区" : "我的工作区"}</span>
            </div>
            <div className="mt-4 space-y-3">
              {targets.map((target) => {
                const active = target.id === targetId;
                return (
                  <button
                    key={target.id}
                    type="button"
                    onClick={() => setTargetId(target.id)}
                    className={cn(
                      "w-full rounded-lg border p-4 text-left transition",
                      active ? "border-cyan-400/50 bg-cyan-500/10" : "border-cyan-500/10 bg-[#031224] hover:border-cyan-500/30",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-white">{target.label}</div>
                        <div className="mt-1 text-xs text-slate-400">{target.host}</div>
                      </div>
                      <div className="rounded-full border border-cyan-500/20 px-2 py-1 text-[11px] text-cyan-100">
                        {statusLabel(target.status)}
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                      <ChevronRight size={14} />
                      <span>{target.mode === "workspace" ? "容器工作区" : "宿主机"} / {target.username || "root"}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <SSHTerminal selectedTarget={selectedTarget} />
        </div>
      </div>
    </AppShell>
  );
}

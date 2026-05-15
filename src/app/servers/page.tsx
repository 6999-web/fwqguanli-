"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { ServerDiagnoseButton } from "@/components/servers/server-diagnose-button";
import { ServerRecoveryPanel } from "@/components/servers/server-recovery-panel";
import { DataTable } from "@/components/ui/data-table";
import { cn, connectionConfigStateLabel, connectivityPhaseLabel, statusLabel } from "@/lib/format";

type ServerRow = {
  id: string;
  serverCode: string;
  region: string;
  publicIp: string;
  sshPort: number;
  provider?: string;
  purpose?: string;
  status: string;
  loginEmail: string;
  connectionConfigState: string;
  currentOwner?: { name: string } | null;
  metrics: Array<{ cpuUsage: number; memoryUsage: number; diskUsage: number }>;
  latestConnectivityIssue?: { phase: string; reason: string } | null;
};

export default function ServersPage() {
  const [servers, setServers] = useState<ServerRow[]>([]);
  const [keyword, setKeyword] = useState("");

  async function loadServers() {
    const response = await fetch("/api/servers");
    const payload = await response.json();
    setServers(payload);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadServers();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const filtered = useMemo(() => {
    return servers.filter((server) =>
      [
        server.serverCode,
        server.publicIp,
        server.region,
        server.currentOwner?.name ?? "",
        server.latestConnectivityIssue?.phase ?? "",
        server.connectionConfigState,
      ]
        .join(" ")
        .toLowerCase()
        .includes(keyword.toLowerCase()),
    );
  }, [keyword, servers]);

  return (
    <AppShell>
      <div className="p-6 text-white">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">服务器资源</h1>
            <p className="mt-2 text-sm text-slate-400">
              统一查看连接状态、最近一次连通性异常，并在端口未确认时直接发起恢复扫描。
            </p>
          </div>
          <input
            className="rounded-lg border border-cyan-500/20 bg-[#06182f] px-4 py-3 text-white outline-none"
            placeholder="搜索编号 / IP / 地区 / 负责人 / 连接状态"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
        </div>

        <DataTable
          columns={["服务器编号", "公网 IP", "地区", "服务商", "负责人", "状态", "连接配置", "资源概况", "最近连接问题", "登录邮箱", "操作"]}
          rows={filtered.map((server) => {
            const latest = server.metrics[0];
            const connectionReady = server.connectionConfigState === "READY";
            return [
              server.serverCode,
              `${server.publicIp}${server.sshPort > 0 ? `:${server.sshPort}` : ""}`,
              server.region,
              server.provider ?? "Unknown",
              server.currentOwner?.name ?? "未分配",
              statusLabel(server.status),
              <span
                key={`${server.id}-config`}
                className={cn(
                  "inline-flex rounded px-2 py-1 text-xs",
                  connectionReady ? "bg-emerald-500/10 text-emerald-200" : "bg-amber-500/10 text-amber-100",
                )}
              >
                {connectionConfigStateLabel(server.connectionConfigState)}
              </span>,
              latest
                ? `CPU ${latest.cpuUsage.toFixed(1)}% / MEM ${latest.memoryUsage.toFixed(1)}% / DISK ${latest.diskUsage.toFixed(1)}%`
                : "待采集",
              server.latestConnectivityIssue
                ? `${connectivityPhaseLabel(server.latestConnectivityIssue.phase)} / ${server.latestConnectivityIssue.reason}`
                : "-",
              server.loginEmail,
              <div key={server.id} className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  <Link href={`/servers/${server.id}`} className="rounded bg-cyan-500/10 px-3 py-1 text-cyan-100">
                    详情
                  </Link>
                  <button
                    className="rounded bg-indigo-500/10 px-3 py-1 text-indigo-200 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={async () => {
                      const response = await fetch(`/api/servers/${server.id}/collect`, { method: "POST" });
                      if (!response.ok) {
                        const payload = await response.json();
                        const message = payload.diagnostic
                          ? `${connectivityPhaseLabel(payload.diagnostic.phase)}: ${payload.diagnostic.reason}`
                          : payload.message;
                        alert(message);
                        return;
                      }
                      await loadServers();
                    }}
                    disabled={!connectionReady}
                  >
                    采集
                  </button>
                </div>
                <ServerDiagnoseButton serverId={server.id} compact disabled={!connectionReady} />
                <ServerRecoveryPanel serverId={server.id} compact onRecovered={() => void loadServers()} />
              </div>,
            ];
          })}
        />
      </div>
    </AppShell>
  );
}

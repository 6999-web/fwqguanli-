"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { DataTable } from "@/components/ui/data-table";
import { statusLabel } from "@/lib/format";

type ServerRow = {
  id: string;
  serverCode: string;
  region: string;
  publicIp: string;
  provider?: string;
  purpose?: string;
  status: string;
  loginEmail: string;
  currentOwner?: { name: string } | null;
  metrics: Array<{ cpuUsage: number; memoryUsage: number; diskUsage: number }>;
};

export default function ServersPage() {
  const [servers, setServers] = useState<ServerRow[]>([]);
  const [keyword, setKeyword] = useState("");

  useEffect(() => {
    fetch("/api/servers")
      .then((res) => res.json())
      .then(setServers);
  }, []);

  const filtered = useMemo(() => {
    return servers.filter((server) =>
      [server.serverCode, server.publicIp, server.region, server.currentOwner?.name ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(keyword.toLowerCase()),
    );
  }, [keyword, servers]);

  return (
    <AppShell>
      <div className="p-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold text-white">服务器资产管理</h1>
            <p className="mt-2 text-sm text-slate-400">支持搜索、详情查看、敏感字段脱敏展示与手动采集。</p>
          </div>
          <input
            className="rounded-lg border border-cyan-500/20 bg-[#06182f] px-4 py-3 text-white outline-none"
            placeholder="搜索编号 / IP / 地区 / 负责人"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
        </div>
        <DataTable
          columns={["服务器编号", "公网 IP", "地区", "服务商", "负责人", "状态", "资源概况", "登录邮箱", "操作"]}
          rows={filtered.map((server) => {
            const latest = server.metrics[0];
            return [
              server.serverCode,
              server.publicIp,
              server.region,
              server.provider ?? "Unknown",
              server.currentOwner?.name ?? "未分配",
              statusLabel(server.status),
              latest
                ? `CPU ${latest.cpuUsage.toFixed(1)}% / MEM ${latest.memoryUsage.toFixed(1)}% / DISK ${latest.diskUsage.toFixed(1)}%`
                : "待采集",
              server.loginEmail,
              <div key={server.id} className="flex gap-2">
                <Link href={`/servers/${server.id}`} className="rounded bg-cyan-500/10 px-3 py-1 text-cyan-100">
                  详情
                </Link>
                <button
                  className="rounded bg-indigo-500/10 px-3 py-1 text-indigo-200"
                  onClick={async () => {
                    await fetch(`/api/servers/${server.id}/collect`, { method: "POST" });
                    location.reload();
                  }}
                >
                  采集
                </button>
              </div>,
            ];
          })}
        />
      </div>
    </AppShell>
  );
}

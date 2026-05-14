/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { DataTable } from "@/components/ui/data-table";
import { statusLabel } from "@/lib/format";
import { formatDateTime } from "@/lib/time";

export default function PortsPage() {
  const [role, setRole] = useState("");
  const [servers, setServers] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [form, setForm] = useState({ serverId: "", port: "8080", protocol: "TCP", purpose: "", action: "OPEN" });

  async function load() {
    const [meRes, serversRes, requestsRes] = await Promise.all([
      fetch("/api/auth/me"),
      fetch("/api/ports"),
      fetch("/api/port-requests"),
    ]);

    const me = await meRes.json();
    const serverRows = await serversRes.json();
    const requestRows = await requestsRes.json();

    setRole(me.role ?? "");
    setServers(serverRows);
    setRequests(requestRows);
    setForm((current) => ({
      ...current,
      serverId: current.serverId || serverRows[0]?.id || "",
    }));
  }

  useEffect(() => {
    void load();
  }, []);

  async function submit() {
    await fetch("/api/port-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    await load();
  }

  return (
    <AppShell>
      <div className="p-6 text-white">
        <h1 className="text-3xl font-semibold">{role === "USER" ? "我的服务器端口" : "端口与安全策略管理"}</h1>
        <p className="mt-2 text-sm text-slate-400">
          {role === "USER"
            ? "这里只显示你自己工作区所在服务器的端口占用情况，以及你提交过的端口申请。"
            : "管理员和运维可统一查看服务器端口占用并处理端口变更申请。"}
        </p>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1.25fr]">
          <div className="rounded-lg border border-cyan-500/15 bg-[#06182f]/80 p-6">
            <div className="mb-4 text-lg font-medium text-cyan-100">端口申请</div>
            <div className="space-y-4">
              <select
                className="w-full rounded-lg bg-[#031224] px-4 py-3"
                value={form.serverId}
                onChange={(e) => setForm({ ...form, serverId: e.target.value })}
              >
                <option value="">选择服务器</option>
                {servers.map((server) => (
                  <option key={server.id} value={server.id}>
                    {server.serverCode}
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-3 gap-3">
                <input
                  className="rounded-lg bg-[#031224] px-4 py-3"
                  value={form.port}
                  onChange={(e) => setForm({ ...form, port: e.target.value })}
                />
                <select
                  className="rounded-lg bg-[#031224] px-4 py-3"
                  value={form.protocol}
                  onChange={(e) => setForm({ ...form, protocol: e.target.value })}
                >
                  <option value="TCP">TCP</option>
                  <option value="UDP">UDP</option>
                </select>
                <select
                  className="rounded-lg bg-[#031224] px-4 py-3"
                  value={form.action}
                  onChange={(e) => setForm({ ...form, action: e.target.value })}
                >
                  <option value="OPEN">开放端口</option>
                  <option value="CLOSE">关闭端口</option>
                </select>
              </div>
              <input
                className="w-full rounded-lg bg-[#031224] px-4 py-3"
                placeholder="用途"
                value={form.purpose}
                onChange={(e) => setForm({ ...form, purpose: e.target.value })}
              />
            </div>
            <button className="mt-6 rounded-lg bg-cyan-500 px-4 py-3 font-medium text-slate-950" onClick={submit}>
              提交审批
            </button>
          </div>

          <div className="space-y-6">
            <div>
              <div className="mb-3 text-lg font-medium text-cyan-100">当前端口占用</div>
              <DataTable
                columns={["服务器", "IP", "状态", "开放端口数", "工作区/保留范围", "端口占用情况"]}
                rows={servers.map((server) => [
                  server.serverCode,
                  server.publicIp ?? "-",
                  statusLabel(server.status),
                  String(server.openPortsCount ?? 0),
                  Array.isArray(server.workspaces) && server.workspaces.length
                    ? server.workspaces
                        .map((workspace: any) => `${workspace.name}: ${workspace.hostPortStart}-${workspace.hostPortEnd}`)
                        .join(" / ")
                    : "-",
                  Array.isArray(server.openPorts) && server.openPorts.length ? server.openPorts.slice(0, 14).join(" / ") : "待采集",
                ])}
              />
            </div>

            <div>
              <div className="mb-3 text-lg font-medium text-cyan-100">{role === "USER" ? "我的端口申请记录" : "端口申请记录"}</div>
              <DataTable
                columns={["服务器", "端口", "协议", "动作", "用途", "申请人", "状态", "创建时间"]}
                rows={requests.map((request) => [
                  request.server?.serverCode ?? "-",
                  String(request.port),
                  request.protocol,
                  request.action,
                  request.purpose,
                  request.requester?.name ?? "-",
                  statusLabel(request.status),
                  formatDateTime(request.createdAt),
                ])}
              />
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { DataTable } from "@/components/ui/data-table";

export default function PortsPage() {
  const [servers, setServers] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [form, setForm] = useState({ serverId: "", port: "8080", protocol: "TCP", purpose: "", action: "OPEN" });

  useEffect(() => {
    fetch("/api/servers").then((res) => res.json()).then(setServers);
    fetch("/api/port-requests").then((res) => res.json()).then(setRequests);
  }, []);

  async function submit() {
    await fetch("/api/port-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    location.reload();
  }

  return (
    <AppShell>
      <div className="p-6 text-white">
        <h1 className="text-3xl font-semibold">端口与安全策略管理</h1>
        <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1.4fr]">
          <div className="rounded-lg border border-cyan-500/15 bg-[#06182f]/80 p-6">
            <div className="mb-4 text-lg font-medium text-cyan-100">端口申请</div>
            <div className="space-y-4">
              <select className="w-full rounded-lg bg-[#031224] px-4 py-3" value={form.serverId} onChange={(e) => setForm({ ...form, serverId: e.target.value })}>
                <option value="">选择服务器</option>
                {servers.map((server) => (
                  <option key={server.id} value={server.id}>{server.serverCode}</option>
                ))}
              </select>
              <div className="grid grid-cols-3 gap-3">
                <input className="rounded-lg bg-[#031224] px-4 py-3" value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} />
                <select className="rounded-lg bg-[#031224] px-4 py-3" value={form.protocol} onChange={(e) => setForm({ ...form, protocol: e.target.value })}>
                  <option value="TCP">TCP</option>
                  <option value="UDP">UDP</option>
                </select>
                <select className="rounded-lg bg-[#031224] px-4 py-3" value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value })}>
                  <option value="OPEN">开放端口</option>
                  <option value="CLOSE">关闭端口</option>
                </select>
              </div>
              <input className="w-full rounded-lg bg-[#031224] px-4 py-3" placeholder="用途" value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} />
            </div>
            <button className="mt-6 rounded-lg bg-cyan-500 px-4 py-3 font-medium text-slate-950" onClick={submit}>提交高风险审批</button>
          </div>
          <DataTable
            columns={["服务器", "端口", "协议", "用途", "申请人", "状态"]}
            rows={requests.map((request) => [
              request.server?.serverCode ?? "-",
              String(request.port),
              request.protocol,
              request.purpose,
              request.requester?.name ?? "-",
              request.status,
            ])}
          />
        </div>
      </div>
    </AppShell>
  );
}

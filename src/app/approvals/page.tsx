/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { DataTable } from "@/components/ui/data-table";
import { statusLabel, workspaceRequestTypeLabel } from "@/lib/format";
import { formatDateTime } from "@/lib/time";

export default function ApprovalsPage() {
  const [requests, setRequests] = useState<any[]>([]);
  const [servers, setServers] = useState<any[]>([]);
  const [form, setForm] = useState({
    requestType: "DEVELOPMENT",
    serverId: "",
    purpose: "",
    expectedDuration: "7 days",
    requiredConfig: "",
    requiredPorts: "",
    requiredEnvironments: "",
    requestedCpu: "2",
    requestedMemoryMb: "4096",
    requestedDiskGb: "40",
    requestedGpu: "0",
    requestedPortCount: "20",
    note: "",
  });

  async function load() {
    const [requestsRes, serversRes] = await Promise.all([fetch("/api/permission-requests"), fetch("/api/servers")]);
    setRequests(await requestsRes.json());
    setServers(await serversRes.json());
  }

  useEffect(() => {
    void load();
  }, []);

  async function submit() {
    await fetch("/api/permission-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        requiredPorts: form.requiredPorts
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        requiredEnvironments: form.requiredEnvironments
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      }),
    });

    setForm({
      ...form,
      purpose: "",
      requiredConfig: "",
      requiredPorts: "",
      requiredEnvironments: "",
      note: "",
    });
    await load();
  }

  return (
    <AppShell>
      <div className="p-6 text-white">
        <h1 className="text-3xl font-semibold">工作区申请</h1>
        <p className="mt-2 text-sm text-slate-400">左侧提交新的工作区需求，右侧查看你自己的历史申请记录。</p>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_1fr]">
          <div className="rounded-lg border border-cyan-500/15 bg-[#06182f]/80 p-6">
            <div className="mb-4 text-lg font-medium text-cyan-100">提交容器工作区申请</div>
            <div className="grid gap-4 md:grid-cols-2">
              <select className="rounded-lg bg-[#031224] px-4 py-3" value={form.requestType} onChange={(e) => setForm({ ...form, requestType: e.target.value })}>
                <option value="DEVELOPMENT">开发调试</option>
                <option value="TRAINING">模型训练</option>
                <option value="TESTING">测试验证</option>
                <option value="DATA_PROCESSING">数据处理</option>
                <option value="DEMO">演示展示</option>
                <option value="TEMPORARY">临时使用</option>
              </select>
              <select className="rounded-lg bg-[#031224] px-4 py-3" value={form.serverId} onChange={(e) => setForm({ ...form, serverId: e.target.value })}>
                <option value="">自动分配宿主机</option>
                {servers.map((server) => (
                  <option key={server.id} value={server.id}>{server.serverCode}</option>
                ))}
              </select>
              <input className="rounded-lg bg-[#031224] px-4 py-3" placeholder="预计使用时长，如 7 days" value={form.expectedDuration} onChange={(e) => setForm({ ...form, expectedDuration: e.target.value })} />
              <input className="rounded-lg bg-[#031224] px-4 py-3 md:col-span-2" placeholder="用途" value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} />
              <input className="rounded-lg bg-[#031224] px-4 py-3" placeholder="CPU 核数" value={form.requestedCpu} onChange={(e) => setForm({ ...form, requestedCpu: e.target.value })} />
              <input className="rounded-lg bg-[#031224] px-4 py-3" placeholder="内存 MB" value={form.requestedMemoryMb} onChange={(e) => setForm({ ...form, requestedMemoryMb: e.target.value })} />
              <input className="rounded-lg bg-[#031224] px-4 py-3" placeholder="磁盘 GB" value={form.requestedDiskGb} onChange={(e) => setForm({ ...form, requestedDiskGb: e.target.value })} />
              <input className="rounded-lg bg-[#031224] px-4 py-3" placeholder="GPU 数量" value={form.requestedGpu} onChange={(e) => setForm({ ...form, requestedGpu: e.target.value })} />
              <input className="rounded-lg bg-[#031224] px-4 py-3" placeholder="业务端口数量" value={form.requestedPortCount} onChange={(e) => setForm({ ...form, requestedPortCount: e.target.value })} />
              <input className="rounded-lg bg-[#031224] px-4 py-3" placeholder="基础配置要求" value={form.requiredConfig} onChange={(e) => setForm({ ...form, requiredConfig: e.target.value })} />
              <input className="rounded-lg bg-[#031224] px-4 py-3 md:col-span-2" placeholder="保留端口，逗号分隔" value={form.requiredPorts} onChange={(e) => setForm({ ...form, requiredPorts: e.target.value })} />
              <input className="rounded-lg bg-[#031224] px-4 py-3 md:col-span-2" placeholder="所需环境，逗号分隔" value={form.requiredEnvironments} onChange={(e) => setForm({ ...form, requiredEnvironments: e.target.value })} />
              <textarea className="rounded-lg bg-[#031224] px-4 py-3 md:col-span-2" rows={4} placeholder="补充说明" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </div>
            <button className="mt-6 rounded-lg bg-cyan-500 px-4 py-3 font-medium text-slate-950" onClick={submit}>提交申请</button>
          </div>

          <div className="space-y-3">
            <div>
              <div className="text-lg font-medium text-cyan-100">历史申请记录</div>
              <div className="mt-1 text-sm text-slate-400">显示你的工作区申请、审批状态和最终分配结果。</div>
            </div>
            <DataTable
              columns={["申请类型", "用途", "目标服务器", "状态", "审批人", "工作区状态", "创建时间"]}
              rows={requests.map((request) => [
                workspaceRequestTypeLabel(request.requestType),
                request.purpose,
                request.server?.serverCode ?? "自动分配",
                statusLabel(request.status),
                request.approver?.name ?? "-",
                request.latestWorkspace?.status ? statusLabel(request.latestWorkspace.status) : "-",
                formatDateTime(request.createdAt),
              ])}
            />
          </div>
        </div>
      </div>
    </AppShell>
  );
}

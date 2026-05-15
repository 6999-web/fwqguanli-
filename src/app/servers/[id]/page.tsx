/* eslint-disable @typescript-eslint/no-explicit-any */
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { ServerDiagnoseButton } from "@/components/servers/server-diagnose-button";
import { DataTable } from "@/components/ui/data-table";
import { getCurrentUser } from "@/lib/auth";
import { maskEmail } from "@/lib/crypto";
import { connectivityPhaseLabel, statusLabel } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { parseConnectivityAlert } from "@/lib/ssh/diagnostics";
import { formatDateTime } from "@/lib/time";

async function getServer(id: string) {
  const user = await getCurrentUser();
  const server = await prisma.server.findUnique({
    where: { id },
    include: {
      currentOwner: true,
      backupOwner: true,
      environment: true,
      metrics: { orderBy: { collectedAt: "desc" }, take: 20 },
      alerts: { orderBy: { detectedAt: "desc" }, take: 20 },
    },
  });

  if (!server) notFound();

  return {
    ...server,
    loginEmail: user?.role.code === "ADMIN" ? server.loginEmail : maskEmail(server.loginEmail),
    latestConnectivityIssue: server.alerts
      .map((alert) => parseConnectivityAlert(alert.description))
      .find(Boolean),
  };
}

export default async function ServerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const server = await getServer(id);

  return (
    <AppShell>
      <div className="p-6 text-white">
        <h1 className="text-3xl font-semibold">{server.serverCode}</h1>
        <p className="mt-2 text-slate-400">
          {server.publicIp}:{server.sshPort}
        </p>

        <div className="mt-6 grid gap-4 lg:grid-cols-4">
          <Card title="基础信息">
            <Meta label="地区" value={server.region} />
            <Meta label="服务商" value={server.provider ?? "Unknown"} />
            <Meta label="状态" value={statusLabel(server.status)} />
            <Meta label="登录邮箱" value={server.loginEmail} />
          </Card>
          <Card title="连接诊断">
            <Meta
              label="最近一次阶段"
              value={
                server.latestConnectivityIssue
                  ? connectivityPhaseLabel(server.latestConnectivityIssue.phase)
                  : "暂无异常"
              }
            />
            <Meta
              label="原因"
              value={server.latestConnectivityIssue?.reason ?? "最近一次采集没有连接异常"}
            />
            <div className="pt-2">
              <ServerDiagnoseButton serverId={server.id} />
            </div>
          </Card>
          <Card title="硬件配置">
            <Meta label="CPU 配置" value={server.cpuSpec ?? "待补充"} />
            <Meta label="内存配置" value={server.memorySpec ?? "待补充"} />
            <Meta label="磁盘配置" value={server.diskSpec ?? "待补充"} />
            <Meta label="GPU 配置" value={server.gpuSpec ?? "待补充"} />
          </Card>
          <Card title="环境信息">
            <Meta label="操作系统" value={server.environment?.osVersion ?? "待采集"} />
            <Meta label="Docker" value={server.environment?.dockerVersion ?? "待采集"} />
            <Meta label="Python" value={server.environment?.pythonVersion ?? "待采集"} />
            <Meta label="Node" value={server.environment?.nodeVersion ?? "待采集"} />
          </Card>
        </div>

        <div className="mt-6">
          <h2 className="mb-4 text-xl font-medium text-cyan-100">采集历史</h2>
          <DataTable
            columns={["时间", "CPU", "内存", "磁盘", "流入", "流出", "端口数"]}
            rows={(server.metrics ?? []).map((metric: any) => [
              formatDateTime(metric.collectedAt),
              `${metric.cpuUsage.toFixed(1)}%`,
              `${metric.memoryUsage.toFixed(1)}%`,
              `${metric.diskUsage.toFixed(1)}%`,
              `${metric.networkIn.toFixed(2)} MB`,
              `${metric.networkOut.toFixed(2)} MB`,
              String(metric.openPortsCount),
            ])}
          />
        </div>

        <div className="mt-6">
          <h2 className="mb-4 text-xl font-medium text-cyan-100">最近告警</h2>
          <DataTable
            columns={["时间", "级别", "标题", "详情"]}
            rows={(server.alerts ?? []).map((alert: any) => [
              formatDateTime(alert.detectedAt),
              statusLabel(alert.level),
              alert.title,
              alert.description,
            ])}
          />
        </div>
      </div>
    </AppShell>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-cyan-500/15 bg-[#06182f]/80 p-4">
      <div className="mb-3 text-lg font-medium text-cyan-100">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 break-all text-sm text-slate-200">{value}</div>
    </div>
  );
}

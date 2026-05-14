"use client";

import { useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { StatCard } from "@/components/ui/stat-card";
import { statusLabel } from "@/lib/format";
import { formatDateTime } from "@/lib/time";

type DashboardPayload = Awaited<ReturnType<typeof import("@/lib/dashboard").getDashboardData>>;

const colors = ["#22d3ee", "#0ea5e9", "#6366f1", "#14b8a6", "#f97316", "#ef4444"];

export function DashboardClient({ initialData }: { initialData: DashboardPayload }) {
  const [data, setData] = useState(initialData);
  const [isCollecting, setIsCollecting] = useState(initialData.trendSeries.length === 0);

  useEffect(() => {
    const socket = io({ path: "/api/socket" });
    socket.on("metrics:update", () => {
      fetch("/api/dashboard")
        .then((res) => res.json())
        .then((payload) => {
          setData(payload);
          setIsCollecting(false);
        });
    });

    return () => {
      socket.close();
    };
  }, []);

  useEffect(() => {
    if (data.trendSeries.length > 0) return;

    let cancelled = false;
    void fetch("/api/dashboard", { method: "POST" })
      .then(() => {
        if (!cancelled) setIsCollecting(true);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [data.trendSeries.length]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      fetch("/api/dashboard")
        .then((res) => res.json())
        .then((payload) => {
          setData(payload);
          if (payload.trendSeries.length > 0) {
            setIsCollecting(false);
          }
        })
        .catch(() => undefined);
    }, 15000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void fetch("/api/dashboard", { method: "POST" }).catch(() => undefined);
    }, 60000);

    return () => window.clearInterval(interval);
  }, []);

  const latestUpdatedAt = useMemo(() => {
    const latest = data.cards.find((item) => item.lastLoginAt)?.lastLoginAt;
    return latest ? formatDateTime(latest) : "--";
  }, [data.cards]);

  return (
    <div
      className="min-h-screen bg-cover bg-center bg-no-repeat"
      style={{
        backgroundImage:
          "linear-gradient(rgba(1, 18, 38, 0.92), rgba(2, 13, 32, 0.94)), url('/dashboard-bg.jpg')",
      }}
    >
      <div className="p-6 lg:p-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-sm uppercase tracking-[0.4em] text-cyan-300/70">Smart Ops Command</div>
            <h1 className="mt-3 text-4xl font-semibold text-white">服务器资产与实时运维总览</h1>
            <p className="mt-2 text-sm text-slate-300">统一查看监控趋势、审批积压、交接状态、告警与环境信息。</p>
            {isCollecting ? (
              <p className="mt-2 text-sm text-amber-300">正在自动采集最新监控样本，图表会在采集完成后自动刷新。</p>
            ) : null}
          </div>
          <div className="rounded-lg border border-cyan-400/20 bg-[#051428]/70 px-4 py-3 text-sm text-cyan-100">
            最近真实登录时间：{latestUpdatedAt}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <StatCard title="服务器总数" value={data.overview.total} />
          <StatCard title="在线数量" value={data.overview.online} />
          <StatCard title="离线数量" value={data.overview.offline} />
          <StatCard title="使用中" value={data.overview.inUse} />
          <StatCard title="空闲数量" value={data.overview.idle} />
          <StatCard title="异常数量" value={data.overview.abnormal} />
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-[2fr_1fr]">
          <div className="rounded-lg border border-cyan-500/15 bg-[#06182f]/80 p-4">
            <div className="mb-3 text-lg font-medium text-cyan-100">资源趋势</div>
            {data.trendSeries.length === 0 ? (
              <EmptyTrendState isCollecting={isCollecting} />
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                <ChartPanel title="CPU 趋势">
                  <AreaChart data={data.trendSeries}>
                    <defs>
                      <linearGradient id="cpuFill" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.8} />
                        <stop offset="95%" stopColor="#22d3ee" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#154064" strokeDasharray="3 3" />
                    <XAxis dataKey="time" stroke="#7dd3fc" />
                    <YAxis stroke="#7dd3fc" />
                    <Tooltip />
                    <Area type="monotone" dataKey="cpu" stroke="#22d3ee" fill="url(#cpuFill)" />
                  </AreaChart>
                </ChartPanel>
                <ChartPanel title="内存趋势">
                  <AreaChart data={data.trendSeries}>
                    <CartesianGrid stroke="#154064" strokeDasharray="3 3" />
                    <XAxis dataKey="time" stroke="#7dd3fc" />
                    <YAxis stroke="#7dd3fc" />
                    <Tooltip />
                    <Area type="monotone" dataKey="memory" stroke="#818cf8" fill="#818cf833" />
                  </AreaChart>
                </ChartPanel>
                <ChartPanel title="磁盘趋势">
                  <AreaChart data={data.trendSeries}>
                    <CartesianGrid stroke="#154064" strokeDasharray="3 3" />
                    <XAxis dataKey="time" stroke="#7dd3fc" />
                    <YAxis stroke="#7dd3fc" />
                    <Tooltip />
                    <Area type="monotone" dataKey="disk" stroke="#14b8a6" fill="#14b8a633" />
                  </AreaChart>
                </ChartPanel>
                <ChartPanel title="网络流量趋势">
                  <AreaChart data={data.trendSeries}>
                    <CartesianGrid stroke="#154064" strokeDasharray="3 3" />
                    <XAxis dataKey="time" stroke="#7dd3fc" />
                    <YAxis stroke="#7dd3fc" />
                    <Tooltip />
                    <Area type="monotone" dataKey="traffic" stroke="#f97316" fill="#f9731633" />
                  </AreaChart>
                </ChartPanel>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <ChartCard title="状态分布">
              <PieChart>
                <Pie data={data.statusDistribution} dataKey="value" nameKey="name" outerRadius={85}>
                  {data.statusDistribution.map((entry, index) => (
                    <Cell key={entry.name} fill={colors[index % colors.length]} />
                  ))}
                </Pie>
                <Legend />
                <Tooltip />
              </PieChart>
            </ChartCard>
            <ChartCard title="地区分布">
              <BarChart data={data.regionDistribution}>
                <CartesianGrid stroke="#154064" strokeDasharray="3 3" />
                <XAxis dataKey="name" stroke="#7dd3fc" />
                <YAxis stroke="#7dd3fc" />
                <Tooltip />
                <Bar dataKey="value" fill="#22d3ee" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartCard>
            <ChartCard title="服务商分布">
              <BarChart data={data.providerDistribution}>
                <CartesianGrid stroke="#154064" strokeDasharray="3 3" />
                <XAxis dataKey="name" stroke="#7dd3fc" />
                <YAxis stroke="#7dd3fc" />
                <Tooltip />
                <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartCard>
          </div>
        </div>

        <section className="mt-6 rounded-lg border border-cyan-500/15 bg-[#06182f]/80 p-4">
          <div className="mb-4 text-lg font-medium text-cyan-100">服务器状态卡片</div>
          <div className="grid gap-4 xl:grid-cols-3">
            {data.cards.map((card) => (
              <div key={card.id} className="rounded-lg border border-cyan-500/15 bg-[#091e39] p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-lg font-medium text-white">{card.serverCode}</div>
                    <div className="text-sm text-slate-400">{card.publicIp}</div>
                  </div>
                  <div className="rounded-full bg-cyan-500/10 px-3 py-1 text-xs text-cyan-100">
                    {statusLabel(card.status)}
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-slate-300">
                  <Info label="地区" value={card.region} />
                  <Info label="服务商" value={card.provider} />
                  <Info label="负责人" value={card.currentOwner} />
                  <Info label="CPU" value={`${card.cpuUsage.toFixed(1)}%`} />
                  <Info label="内存" value={`${card.memoryUsage.toFixed(1)}%`} />
                  <Info label="磁盘" value={`${card.diskUsage.toFixed(1)}%`} />
                  <Info label="流量" value={`${card.networkTraffic.toFixed(2)} MB`} />
                  <Info label="进程数" value={String(card.processCount)} />
                  <Info label="开放端口" value={String(card.openPortsCount)} />
                  <Info label="告警数" value={String(card.alertCount)} />
                  <Info label="Node" value={card.nodeVersion} />
                  <Info label="Docker" value={card.dockerVersion} />
                </div>
                <div className="mt-4 border-t border-cyan-500/10 pt-3 text-xs text-slate-400">
                  最近登录：{card.lastLoginAt ? formatDateTime(card.lastLoginAt) : "暂无"}
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          <section className="rounded-lg border border-cyan-500/15 bg-[#06182f]/80 p-4">
            <div className="mb-4 text-lg font-medium text-cyan-100">基础环境展示</div>
            <div className="space-y-3">
              {data.cards.map((card) => (
                <div key={card.id} className="rounded-lg border border-cyan-500/10 bg-[#091e39] p-4">
                  <div className="mb-2 text-sm font-medium text-white">{card.serverCode}</div>
                  <div className="grid gap-2 text-sm text-slate-300 md:grid-cols-2">
                    <Info label="系统版本" value={card.osVersion} />
                    <Info label="Docker 版本" value={card.dockerVersion} />
                    <Info label="Python 版本" value={card.pythonVersion} />
                    <Info label="Node.js 版本" value={card.nodeVersion} />
                    <Info label="CUDA 版本" value={card.cudaVersion} />
                    <Info label="Nginx 状态" value={card.nginxStatus} />
                    <Info label="数据库" value={card.databaseInfo} />
                    <Info label="运行服务" value={card.runningServices.join(", ") || "待采集"} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-cyan-500/15 bg-[#06182f]/80 p-4">
            <div className="mb-4 text-lg font-medium text-cyan-100">告警中心</div>
            <div className="space-y-3">
              {data.alerts.map((alert) => (
                <div key={alert.id} className="rounded-lg border border-cyan-500/10 bg-[#091e39] p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="font-medium text-white">{alert.title}</div>
                    <div className="text-xs text-cyan-200">{alert.serverCode}</div>
                  </div>
                  <div className="mt-2 text-sm text-slate-300">{alert.description}</div>
                  <div className="mt-2 text-xs text-slate-500">
                    {statusLabel(alert.level)} / {alert.type} / {formatDateTime(alert.detectedAt)}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function EmptyTrendState({ isCollecting }: { isCollecting: boolean }) {
  return (
    <div className="flex h-[34rem] items-center justify-center rounded-lg border border-dashed border-cyan-500/15 bg-[#091e39] px-6 text-center text-sm text-slate-300">
      <div>
        <div className="text-base text-cyan-100">{isCollecting ? "正在采集真实监控数据" : "暂无趋势数据"}</div>
        <p className="mt-2">
          {isCollecting
            ? "系统已经触发批量采集，完成后会自动刷新 CPU、内存、磁盘和网络趋势。"
            : "当前还没有入库的监控样本，刷新页面后会自动触发一次采集。"}
        </p>
      </div>
    </div>
  );
}

function ChartPanel({ title, children }: { title: string; children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div>
      <div className="mb-2 text-sm text-cyan-200">{title}</div>
      <div className="h-64">
        {mounted ? (
          <ResponsiveContainer width="100%" height="100%">
            {children as React.ReactElement}
          </ResponsiveContainer>
        ) : (
          <div className="h-full rounded-lg border border-dashed border-cyan-500/10 bg-[#091e39]" />
        )}
      </div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="rounded-lg border border-cyan-500/15 bg-[#06182f]/80 p-4">
      <div className="mb-2 text-sm text-cyan-200">{title}</div>
      <div className="h-64">
        {mounted ? (
          <ResponsiveContainer width="100%" height="100%">
            {children as React.ReactElement}
          </ResponsiveContainer>
        ) : (
          <div className="h-full rounded-lg border border-dashed border-cyan-500/10 bg-[#091e39]" />
        )}
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-sm text-slate-200">{value}</div>
    </div>
  );
}

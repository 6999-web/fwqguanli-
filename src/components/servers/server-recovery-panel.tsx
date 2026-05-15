"use client";

import { useState } from "react";
import { DEFAULT_RECOVERY_PORTS } from "@/lib/server-connection-config";

type Probe = {
  port: number;
  status: "open" | "refused" | "timeout" | "dns_unreachable" | "error";
  reason: string;
};

type ScanResult = {
  serverId: string;
  serverCode: string;
  publicIp: string;
  configuredPort: number;
  probes: Probe[];
};

function statusLabel(status: Probe["status"]) {
  switch (status) {
    case "open":
      return "可连通";
    case "refused":
      return "被拒绝";
    case "timeout":
      return "超时";
    case "dns_unreachable":
      return "不可达";
    default:
      return "异常";
  }
}

export function ServerRecoveryPanel({
  serverId,
  compact = false,
  onRecovered,
}: {
  serverId: string;
  compact?: boolean;
  onRecovered?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [candidatePorts, setCandidatePorts] = useState(DEFAULT_RECOVERY_PORTS.join(","));
  const [result, setResult] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingPort, setSavingPort] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function scan() {
    setLoading(true);
    setMessage(null);
    try {
      const ports = candidatePorts
        .split(",")
        .map((item) => Number(item.trim()))
        .filter((item) => Number.isFinite(item) && item > 0);
      const response = await fetch("/api/servers/recovery/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serverIds: [serverId], candidatePorts: ports }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.message ?? "扫描失败");
      }
      setResult(payload.results?.[0] ?? null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "扫描失败");
    } finally {
      setLoading(false);
    }
  }

  async function applyPort(port: number) {
    setSavingPort(port);
    setMessage(null);
    try {
      const response = await fetch("/api/servers/recovery/apply-port", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serverId, sshPort: port }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.message ?? "回填端口失败");
      }
      setMessage(`已将 SSH 端口回填为 ${port}`);
      onRecovered?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "回填端口失败");
    } finally {
      setSavingPort(null);
    }
  }

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      <button
        className="rounded bg-amber-500/10 px-3 py-1 text-amber-100"
        onClick={() => setExpanded((value) => !value)}
      >
        {expanded ? "收起恢复面板" : "端口恢复"}
      </button>
      {expanded ? (
        <div className="rounded border border-amber-500/15 bg-[#091e39] p-3 text-xs text-slate-300">
          <div className="space-y-2">
            <div className="text-slate-400">候选端口（逗号分隔）</div>
            <input
              className="w-full rounded border border-cyan-500/20 bg-[#06182f] px-3 py-2 text-white outline-none"
              value={candidatePorts}
              onChange={(event) => setCandidatePorts(event.target.value)}
            />
            <button
              className="rounded bg-cyan-500/10 px-3 py-1 text-cyan-100 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => void scan()}
              disabled={loading}
            >
              {loading ? "扫描中..." : "扫描候选端口"}
            </button>
          </div>
          {message ? <div className="mt-2 text-amber-200">{message}</div> : null}
          {result ? (
            <div className="mt-3 space-y-2">
              <div className="text-slate-400">
                当前配置端口: {result.configuredPort > 0 ? result.configuredPort : "未确认"}
              </div>
              {result.probes.map((probe) => (
                <div key={probe.port} className="rounded border border-cyan-500/10 px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-medium text-cyan-100">
                      端口 {probe.port} / {statusLabel(probe.status)}
                    </div>
                    <button
                      className="rounded bg-violet-500/10 px-2 py-1 text-violet-100 disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={() => void applyPort(probe.port)}
                      disabled={savingPort === probe.port}
                    >
                      {savingPort === probe.port ? "保存中..." : "用这个端口"}
                    </button>
                  </div>
                  <div className="mt-1 break-all text-slate-400">{probe.reason}</div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

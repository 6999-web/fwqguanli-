"use client";

import { useState } from "react";
import { connectivityPhaseLabel } from "@/lib/format";

type Diagnostic = {
  phase: string;
  reason: string;
  portReachable: boolean;
  handshakeOk: boolean;
  authOk: boolean;
  commandOk: boolean;
};

export function ServerDiagnoseButton({
  serverId,
  compact = false,
}: {
  serverId: string;
  compact?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [diagnostic, setDiagnostic] = useState<Diagnostic | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runDiagnosis() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/servers/${serverId}/diagnose`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.message ?? "诊断失败");
      }
      setDiagnostic(payload);
    } catch (diagnosisError) {
      setError(diagnosisError instanceof Error ? diagnosisError.message : "诊断失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      <button
        className="rounded bg-violet-500/10 px-3 py-1 text-violet-100"
        onClick={() => void runDiagnosis()}
        disabled={loading}
      >
        {loading ? "诊断中..." : "诊断"}
      </button>
      {error ? <div className="text-xs text-rose-300">{error}</div> : null}
      {diagnostic ? (
        <div className="rounded border border-cyan-500/10 bg-[#091e39] p-3 text-xs text-slate-300">
          <div className="font-medium text-cyan-100">{connectivityPhaseLabel(diagnostic.phase)}</div>
          <div className="mt-1 break-all text-slate-400">{diagnostic.reason}</div>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-400">
            <span>TCP {diagnostic.portReachable ? "OK" : "FAIL"}</span>
            <span>Handshake {diagnostic.handshakeOk ? "OK" : "FAIL"}</span>
            <span>Auth {diagnostic.authOk ? "OK" : "FAIL"}</span>
            <span>Command {diagnostic.commandOk ? "OK" : "FAIL"}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

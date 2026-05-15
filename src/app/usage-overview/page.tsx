import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { DataTable } from "@/components/ui/data-table";
import { getSessionUser } from "@/lib/auth";
import { connectivityPhaseLabel, statusLabel } from "@/lib/format";
import { formatDateTime } from "@/lib/time";
import { getUsageOverviewData } from "@/lib/usage-overview";

export default async function UsageOverviewPage() {
  const session = await getSessionUser();
  if (!session) {
    redirect("/login");
  }
  if (session.role !== "ADMIN") {
    redirect("/");
  }

  const data = await getUsageOverviewData();

  return (
    <AppShell>
      <div className="min-h-screen bg-[#031224] p-6 text-white">
        <div className="mb-6">
          <div className="text-sm uppercase tracking-[0.3em] text-emerald-300/70">Usage Governance</div>
          <h1 className="mt-3 text-3xl font-semibold">使用总览</h1>
          <p className="mt-2 max-w-4xl text-sm text-slate-300">
            这个页面专门看服务器是否闲置、谁正在使用、责任链是否完整，以及哪些资源已经超期或异常。
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <SummaryCard title="服务器总数" value={data.summary.totalServers} />
          <SummaryCard title="占用中" value={data.summary.inUseServers} />
          <SummaryCard title="空闲数量" value={data.summary.idleServers} />
          <SummaryCard title="闲置候选" value={data.summary.idleCandidates} />
          <SummaryCard title="待处理超期" value={data.summary.overdueResources} />
          <SummaryCard title="责任不清" value={data.summary.unclearResponsibilities} />
        </div>

        <section className="mt-6">
          <SectionTitle title="责任与占用" />
          <DataTable
            columns={["服务器", "IP", "状态", "当前负责人", "工作区负责人", "来源申请人", "交接状态", "到期时间", "最近活动", "责任状态"]}
            rows={data.ownershipRows.map((row) => [
              row.serverCode,
              row.publicIp,
              statusLabel(row.status),
              row.currentOwner,
              row.workspaceOwner,
              row.requestOwner,
              row.handoverStatus === "NONE" ? "-" : statusLabel(row.handoverStatus),
              formatDateTime(row.expiresAt),
              formatDateTime(row.recentActivityAt),
              row.responsibilityStatus,
            ])}
          />
        </section>

        <section className="mt-6">
          <SectionTitle title="闲置治理" />
          <DataTable
            columns={["服务器", "IP", "最近采集", "最近登录", "最近告警", "建议动作"]}
            rows={data.idleCandidates.map((row) => [
              row.serverCode,
              row.publicIp,
              formatDateTime(row.latestCollectedAt),
              formatDateTime(row.recentLoginAt),
              row.recentAlert ?? "-",
              row.suggestion,
            ])}
          />
        </section>

        <section className="mt-6">
          <SectionTitle title="异常治理" />
          <DataTable
            columns={["类型", "服务器", "详情"]}
            rows={data.anomalies.map((item) => [item.type, item.serverCode, item.detail])}
          />
        </section>

        <section className="mt-6 rounded-lg border border-cyan-500/15 bg-[#06182f]/80 p-4">
          <SectionTitle title="连接诊断参考" compact />
          <div className="grid gap-3 text-sm text-slate-300 md:grid-cols-2 xl:grid-cols-4">
            <InfoRow label="DNS/IP 不可达" value={connectivityPhaseLabel("DNS_UNREACHABLE")} />
            <InfoRow label="TCP 拒绝" value={connectivityPhaseLabel("TCP_REFUSED")} />
            <InfoRow label="TCP 超时" value={connectivityPhaseLabel("TCP_TIMEOUT")} />
            <InfoRow label="SSH 握手超时" value={connectivityPhaseLabel("SSH_HANDSHAKE_TIMEOUT")} />
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function SummaryCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="rounded-lg border border-cyan-500/15 bg-[#06182f]/80 p-5">
      <div className="text-sm text-cyan-200">{title}</div>
      <div className="mt-3 text-3xl font-semibold text-white">{value}</div>
    </div>
  );
}

function SectionTitle({ title, compact = false }: { title: string; compact?: boolean }) {
  return <h2 className={compact ? "mb-3 text-lg font-medium text-cyan-100" : "mb-4 text-xl font-medium text-cyan-100"}>{title}</h2>;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-cyan-500/10 bg-[#091e39] p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-sm text-slate-200">{value}</div>
    </div>
  );
}

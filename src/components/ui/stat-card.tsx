export function StatCard({
  title,
  value,
  detail,
}: {
  title: string;
  value: string | number;
  detail?: string;
}) {
  return (
    <div className="rounded-lg border border-cyan-500/15 bg-[#081b32]/80 p-4 shadow-[0_0_30px_rgba(34,211,238,0.06)]">
      <div className="text-sm text-cyan-200/70">{title}</div>
      <div className="mt-3 text-3xl font-semibold text-white">{value}</div>
      {detail ? <div className="mt-2 text-xs text-slate-400">{detail}</div> : null}
    </div>
  );
}

import { statusLabel, workspaceRequestTypeLabel } from "@/lib/format";
import { formatDateTime } from "@/lib/time";

type UserDashboardData = Awaited<ReturnType<typeof import("@/lib/dashboard").getUserDashboardData>>;

function SummaryCard({ title, value, hint }: { title: string; value: string | number; hint: string }) {
  return (
    <div className="rounded-lg border border-cyan-500/15 bg-[#06182f]/80 p-5">
      <div className="text-sm text-cyan-200">{title}</div>
      <div className="mt-3 text-3xl font-semibold text-white">{value}</div>
      <div className="mt-2 text-sm text-slate-400">{hint}</div>
    </div>
  );
}

export function UserDashboard({ data }: { data: UserDashboardData }) {
  return (
    <div
      className="min-h-screen bg-cover bg-center bg-no-repeat"
      style={{
        backgroundImage:
          "linear-gradient(rgba(1, 18, 38, 0.92), rgba(2, 13, 32, 0.94)), url('/dashboard-bg.jpg')",
      }}
    >
      <div className="p-6 lg:p-8 text-white">
        <div className="mb-6">
          <div className="text-sm uppercase tracking-[0.4em] text-cyan-300/70">My Workspace</div>
          <h1 className="mt-3 text-4xl font-semibold">我的已获批账号与工作区</h1>
          <p className="mt-2 text-sm text-slate-300">
            数据总览只展示你已经申请并实际拿到的工作区账号、对应服务器以及最近的申请记录。
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard title="已获批账号" value={data.summary.accountCount} hint="当前归属于你的工作区账号数量" />
          <SummaryCard title="运行中工作区" value={data.summary.runningCount} hint="当前仍可直接连接和使用的账号" />
          <SummaryCard title="关联服务器" value={data.summary.serverCount} hint="你的账号当前分布的服务器数量" />
          <SummaryCard title="7 天内到期" value={data.summary.expiringSoonCount} hint="建议提前续期或重新申请" />
        </div>

        <section className="mt-6 rounded-lg border border-cyan-500/15 bg-[#06182f]/80 p-5">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-medium text-cyan-100">当前可用账号</h2>
              <p className="mt-1 text-sm text-slate-400">这里展示你已拿到的账号信息，不展示其他用户或未获批资源。</p>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {data.accounts.length ? (
              data.accounts.map((account) => (
                <div key={account.id} className="rounded-lg border border-cyan-500/10 bg-[#091e39] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="text-lg font-medium text-white">{account.name}</div>
                      <div className="mt-1 text-sm text-slate-400">
                        {account.serverCode} / {account.publicIp}:{account.sshPort}
                      </div>
                    </div>
                    <div className="rounded-full bg-cyan-500/10 px-3 py-1 text-xs text-cyan-100">
                      {statusLabel(account.status)}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2 text-sm">
                    <Info label="登录账号" value={account.sshUsername} />
                    <Info label="工作目录" value={account.workingDirectory} />
                    <Info label="服务器状态" value={statusLabel(account.serverStatus)} />
                    <Info label="到期时间" value={formatDateTime(account.expiresAt)} />
                    <Info label="资源配额" value={`CPU ${account.cpuLimit} / 内存 ${account.memoryLimitMb}MB / 磁盘 ${account.diskLimitGb}GB`} />
                    <Info label="端口范围" value={`${account.hostPortStart}-${account.hostPortEnd}`} />
                    <Info label="最近 CPU" value={`${account.latestCpuUsage.toFixed(1)}%`} />
                    <Info label="最近内存" value={`${account.latestMemoryUsage.toFixed(1)}%`} />
                  </div>

                  <div className="mt-4 border-t border-cyan-500/10 pt-3 text-sm text-slate-300">
                    <div>开放端口数：{account.latestOpenPortsCount}</div>
                    <div className="mt-2 text-slate-400 break-all">
                      端口占用：{account.openPorts.length ? account.openPorts.slice(0, 12).join(" / ") : "待采集"}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-dashed border-cyan-500/15 bg-[#091e39] p-6 text-sm text-slate-300 xl:col-span-2">
                你当前还没有已获批的工作区账号。先到“工作区申请”提交申请，审批通过后这里会自动显示。
              </div>
            )}
          </div>
        </section>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-lg border border-cyan-500/15 bg-[#06182f]/80 p-5">
            <h2 className="text-xl font-medium text-cyan-100">最近申请记录</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm text-slate-200">
                <thead className="bg-[#0b2341] text-left text-xs uppercase tracking-[0.2em] text-cyan-200/70">
                  <tr>
                    <th className="px-4 py-3 font-medium">类型</th>
                    <th className="px-4 py-3 font-medium">用途</th>
                    <th className="px-4 py-3 font-medium">目标服务器</th>
                    <th className="px-4 py-3 font-medium">状态</th>
                    <th className="px-4 py-3 font-medium">审批人</th>
                    <th className="px-4 py-3 font-medium">创建时间</th>
                  </tr>
                </thead>
                <tbody>
                  {data.requests.length ? (
                    data.requests.map((request) => (
                      <tr key={request.id} className="border-t border-cyan-500/10">
                        <td className="px-4 py-3 align-top">{workspaceRequestTypeLabel(request.requestType)}</td>
                        <td className="px-4 py-3 align-top">{request.purpose}</td>
                        <td className="px-4 py-3 align-top">{request.serverCode}</td>
                        <td className="px-4 py-3 align-top">{statusLabel(request.status)}</td>
                        <td className="px-4 py-3 align-top">{request.approverName}</td>
                        <td className="px-4 py-3 align-top">{formatDateTime(request.createdAt)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="px-4 py-6 text-slate-400" colSpan={6}>
                        暂无申请记录
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-lg border border-cyan-500/15 bg-[#06182f]/80 p-5">
            <h2 className="text-xl font-medium text-cyan-100">最近端口申请</h2>
            <div className="mt-4 space-y-3">
              {data.ports.length ? (
                data.ports.map((item) => (
                  <div key={item.id} className="rounded-lg border border-cyan-500/10 bg-[#091e39] p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="font-medium text-white">
                        {item.serverCode} / {item.protocol} {item.port}
                      </div>
                      <div className="text-xs text-cyan-200">{statusLabel(item.status)}</div>
                    </div>
                    <div className="mt-2 text-sm text-slate-300">{item.action} / {item.purpose}</div>
                    <div className="mt-2 text-xs text-slate-500">
                      审批人：{item.approverName} / {formatDateTime(item.createdAt)}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-lg border border-dashed border-cyan-500/15 bg-[#091e39] p-6 text-sm text-slate-300">
                  暂无端口申请记录
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-sm text-slate-200 break-all">{value}</div>
    </div>
  );
}

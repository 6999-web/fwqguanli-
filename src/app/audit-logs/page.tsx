/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { DataTable } from "@/components/ui/data-table";
import { formatDateTime } from "@/lib/time";

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/audit-logs").then((res) => res.json()).then(setLogs);
  }, []);

  return (
    <AppShell>
      <div className="p-6 text-white">
        <h1 className="text-3xl font-semibold">审计日志</h1>
        <div className="mt-6">
          <DataTable
            columns={["时间", "用户", "模块", "动作", "目标", "详情"]}
            rows={logs.map((log) => [
              formatDateTime(log.createdAt),
              log.user?.name ?? "系统",
              log.module,
              log.action,
              log.targetId ?? "-",
              JSON.stringify(log.detail ?? {}),
            ])}
          />
        </div>
      </div>
    </AppShell>
  );
}

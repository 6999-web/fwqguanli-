/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { DataTable } from "@/components/ui/data-table";
import { statusLabel } from "@/lib/format";
import { formatDateTime } from "@/lib/time";

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/alerts").then((res) => res.json()).then(setAlerts);
  }, []);

  return (
    <AppShell>
      <div className="p-6 text-white">
        <h1 className="text-3xl font-semibold">告警中心</h1>
        <div className="mt-6">
          <DataTable
            columns={["服务器", "告警类型", "级别", "标题", "描述", "时间"]}
            rows={alerts.map((alert) => [
              alert.server?.serverCode ?? "-",
              alert.type,
              statusLabel(alert.level),
              alert.title,
              alert.description,
              formatDateTime(alert.detectedAt),
            ])}
          />
        </div>
      </div>
    </AppShell>
  );
}

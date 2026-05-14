/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { DataTable } from "@/components/ui/data-table";

export default function InspectionsPage() {
  const [reports, setReports] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/dashboard").then((res) => res.json()).then((data) => {
      setReports(
        (data.cards ?? []).map((card: any) => ({
          serverCode: card.serverCode,
          summary: `CPU ${card.cpuUsage.toFixed(1)}%，内存 ${card.memoryUsage.toFixed(1)}%，磁盘 ${card.diskUsage.toFixed(1)}%，运行服务 ${card.runningServices.length} 项。`,
          recommendation:
            card.alertCount > 0
              ? "优先处理告警，并复核端口、登录记录和关键服务状态。"
              : "当前状态稳定，继续保持定时巡检。",
        })),
      );
    });
  }, []);

  return (
    <AppShell>
      <div className="p-6 text-white">
        <h1 className="text-3xl font-semibold">巡检报告</h1>
        <div className="mt-6">
          <DataTable
            columns={["服务器编号", "巡检摘要", "建议"]}
            rows={reports.map((item) => [item.serverCode, item.summary, item.recommendation])}
          />
        </div>
      </div>
    </AppShell>
  );
}

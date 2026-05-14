/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { DataTable } from "@/components/ui/data-table";
import { statusLabel } from "@/lib/format";
import { formatDateTime } from "@/lib/time";

export default function HandoversPage() {
  const [rows, setRows] = useState<any[]>([]);

  async function load() {
    const response = await fetch("/api/handovers");
    setRows(await response.json());
  }

  useEffect(() => {
    void load();
  }, []);

  async function confirmHandover(id: string) {
    await fetch(`/api/handovers/${id}/confirm`, { method: "POST" });
    await load();
  }

  async function returnHandover(id: string) {
    await fetch(`/api/handovers/${id}/return`, { method: "POST" });
    await load();
  }

  return (
    <AppShell>
      <div className="p-6 text-white">
        <h1 className="text-3xl font-semibold">交接记录</h1>
        <div className="mt-6">
          <DataTable
            columns={["服务器编号", "接入地址", "登录方式", "账号名称", "密码", "当前使用人", "交接时间", "计划归还", "实际归还", "确认状态", "操作"]}
            rows={rows.map((item) => [
              item.serverCode,
              `${item.accessHost}:${item.accessPort}`,
              item.loginMethod,
              item.accountName,
              <span key={`${item.id}-password`} className="font-mono text-cyan-200">
                {item.accountPassword}
              </span>,
              item.owner,
              formatDateTime(item.handoverAt),
              formatDateTime(item.plannedReturnAt),
              formatDateTime(item.actualReturnedAt),
              statusLabel(item.confirmStatus),
              <div key={item.id} className="flex gap-2">
                <button
                  className="rounded bg-cyan-500/10 px-3 py-1 text-cyan-100"
                  onClick={() => confirmHandover(item.id)}
                >
                  确认
                </button>
                <button
                  className="rounded bg-amber-500/10 px-3 py-1 text-amber-100"
                  onClick={() => returnHandover(item.id)}
                >
                  归还
                </button>
              </div>,
            ])}
          />
        </div>
      </div>
    </AppShell>
  );
}

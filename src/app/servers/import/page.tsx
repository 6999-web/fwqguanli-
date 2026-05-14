"use client";

import { useState } from "react";
import { AppShell } from "@/components/layout/app-shell";

export default function ServerImportPage() {
  const [message, setMessage] = useState("");
  const [count, setCount] = useState(0);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/servers/import", {
      method: "POST",
      body: form,
    });
    const payload = await response.json();

    if (!response.ok) {
      setMessage(payload.message ?? "导入失败");
      return;
    }

    setCount(payload.count);
    setMessage("导入完成，敏感密码已在后端加密存储。");
  }

  return (
    <AppShell>
      <div className="p-6 text-white">
        <h1 className="text-3xl font-semibold">服务器导入</h1>
        <p className="mt-2 text-sm text-slate-400">支持直接上传包含服务器信息的 Excel，后端会自动生成服务器编号并加密凭据。</p>
        <form onSubmit={onSubmit} className="mt-8 max-w-xl rounded-lg border border-cyan-500/15 bg-[#06182f]/80 p-6">
          <input name="file" type="file" accept=".xlsx,.xls" className="block w-full text-sm text-slate-300" />
          <button className="mt-6 rounded-lg bg-cyan-500 px-4 py-3 font-medium text-slate-950">开始导入</button>
          {message ? <div className="mt-4 text-sm text-cyan-100">{message} 导入数量：{count}</div> : null}
        </form>
      </div>
    </AppShell>
  );
}

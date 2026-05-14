"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@opencode.local");
  const [password, setPassword] = useState("ChangeMe123!");
  const [error, setError] = useState("");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const payload = await response.json();
      setError(payload.message ?? "登录失败");
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#113563_0,#041226_40%,#020817_100%)] p-6 text-white">
      <div className="w-full max-w-md rounded-xl border border-cyan-500/20 bg-[#07182f]/85 p-8 shadow-[0_0_50px_rgba(34,211,238,0.12)]">
        <div className="text-sm uppercase tracking-[0.4em] text-cyan-300/70">OpenCode Ops</div>
        <h1 className="mt-4 text-3xl font-semibold">登录系统</h1>
        <p className="mt-2 text-sm text-slate-400">默认管理员账号会在数据库初始化时自动创建。</p>
        <form className="mt-8 space-y-4" onSubmit={onSubmit}>
          <label className="block">
            <div className="mb-2 text-sm text-slate-300">邮箱</div>
            <input
              className="w-full rounded-lg border border-cyan-500/20 bg-[#031224] px-4 py-3 outline-none ring-0 focus:border-cyan-400"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className="block">
            <div className="mb-2 text-sm text-slate-300">密码</div>
            <input
              type="password"
              className="w-full rounded-lg border border-cyan-500/20 bg-[#031224] px-4 py-3 outline-none ring-0 focus:border-cyan-400"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error ? <div className="text-sm text-rose-300">{error}</div> : null}
          <button className="w-full rounded-lg bg-cyan-500 px-4 py-3 font-medium text-slate-950 transition hover:bg-cyan-400">
            登录
          </button>
        </form>
      </div>
    </div>
  );
}

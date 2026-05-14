"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
        <p className="mt-2 text-sm text-slate-400">打开系统必须先输入账号和密码，页面不再默认展示任何密码。</p>
        <form className="mt-8 space-y-4" onSubmit={onSubmit} autoComplete="off">
          <label className="block">
            <div className="mb-2 text-sm text-slate-300">账号</div>
            <input
              className="w-full rounded-lg border border-cyan-500/20 bg-[#031224] px-4 py-3 outline-none ring-0 focus:border-cyan-400"
              value={email}
              name="login_email"
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className="block">
            <div className="mb-2 text-sm text-slate-300">密码</div>
            <div className="flex items-center rounded-lg border border-cyan-500/20 bg-[#031224] pr-2 focus-within:border-cyan-400">
              <input
                type={showPassword ? "text" : "password"}
                className="w-full bg-transparent px-4 py-3 outline-none"
                value={password}
                name="login_password"
                autoComplete="new-password"
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                type="button"
                className="rounded p-2 text-slate-400 transition hover:bg-cyan-500/10 hover:text-cyan-200"
                aria-label={showPassword ? "隐藏密码" : "显示密码"}
                onClick={() => setShowPassword((current) => !current)}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
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

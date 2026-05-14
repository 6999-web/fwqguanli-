"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Activity,
  AlarmClock,
  Bot,
  FileText,
  History,
  LayoutDashboard,
  LogOut,
  Network,
  ServerCog,
  ShieldCheck,
  UserCog,
  Workflow,
} from "lucide-react";
import { cn } from "@/lib/format";

const navItems = [
  { href: "/", label: "数据总览", icon: LayoutDashboard, roles: ["ADMIN", "OPS", "USER"] },
  { href: "/servers", label: "服务器资产", icon: ServerCog, roles: ["ADMIN", "OPS", "USER"] },
  { href: "/servers/import", label: "服务器导入", icon: FileText, roles: ["ADMIN"] },
  { href: "/approvals", label: "工作区申请", icon: Workflow, roles: ["USER"] },
  { href: "/approval-center", label: "审批中心", icon: ShieldCheck, roles: ["ADMIN", "OPS"] },
  { href: "/handovers", label: "交接记录", icon: AlarmClock, roles: ["ADMIN", "OPS"] },
  { href: "/accounts", label: "账号状态", icon: UserCog, roles: ["ADMIN", "USER"] },
  { href: "/ports", label: "端口安全", icon: Network, roles: ["ADMIN", "OPS", "USER"] },
  { href: "/alerts", label: "告警中心", icon: Activity, roles: ["ADMIN", "OPS"] },
  { href: "/inspections", label: "巡检报告", icon: FileText, roles: ["ADMIN", "OPS"] },
  { href: "/assistant", label: "OpenCode 助手", icon: Bot, roles: ["ADMIN", "OPS"] },
  { href: "/audit-logs", label: "审计日志", icon: History, roles: ["ADMIN"] },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [role, setRole] = useState<string>("");
  const [name, setName] = useState<string>("");

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((payload) => {
        setRole(payload.role ?? "");
        setName(payload.name ?? "");
      })
      .catch(() => {
        setRole("");
        setName("");
      });
  }, []);

  useEffect(() => {
    function clearSessionOnUnload() {
      if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
        navigator.sendBeacon("/api/auth/logout");
        return;
      }

      void fetch("/api/auth/logout", {
        method: "POST",
        keepalive: true,
      });
    }

    window.addEventListener("pagehide", clearSessionOnUnload);
    return () => {
      window.removeEventListener("pagehide", clearSessionOnUnload);
    };
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const visibleItems = navItems.filter((item) => item.roles.includes(role));

  return (
    <div className="min-h-screen bg-[#031224] text-white">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 border-r border-cyan-500/15 bg-[#041a33]/90 p-5 lg:flex lg:flex-col">
          <div className="mb-8">
            <div className="text-sm uppercase tracking-[0.4em] text-cyan-300/70">OpenCode Ops</div>
            <h1 className="mt-3 text-2xl font-semibold">运维管理平台</h1>
            {name ? <div className="mt-3 text-sm text-slate-400">{name}</div> : null}
          </div>
          <nav className="space-y-2">
            {visibleItems.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border px-3 py-2 text-sm transition",
                    active
                      ? "border-cyan-400/60 bg-cyan-500/10 text-cyan-200"
                      : "border-transparent text-slate-300 hover:border-cyan-500/20 hover:bg-[#0b2243]",
                  )}
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
          <button
            className="mt-auto flex items-center gap-3 rounded-lg border border-cyan-500/15 px-3 py-2 text-sm text-slate-300 transition hover:border-cyan-500/30 hover:bg-[#0b2243]"
            onClick={logout}
          >
            <LogOut size={18} />
            <span>退出登录</span>
          </button>
        </aside>
        <main className="flex-1 overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}

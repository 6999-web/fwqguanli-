"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Activity,
  AlarmClock,
  Bot,
  FileText,
  History,
  LayoutDashboard,
  Network,
  ServerCog,
  ShieldCheck,
  UserCog,
  Workflow,
} from "lucide-react";
import { cn } from "@/lib/format";

const navItems = [
  { href: "/", label: "数据总览", icon: LayoutDashboard },
  { href: "/servers", label: "服务器资产", icon: ServerCog },
  { href: "/servers/import", label: "服务器导入", icon: FileText, roles: ["ADMIN"] },
  { href: "/approvals", label: "工作区申请", icon: Workflow },
  { href: "/approval-center", label: "审批中心", icon: ShieldCheck, roles: ["ADMIN", "OPS"] },
  { href: "/handovers", label: "交接记录", icon: AlarmClock, roles: ["ADMIN", "OPS"] },
  { href: "/accounts", label: "工作区访问", icon: UserCog },
  { href: "/ports", label: "端口安全", icon: Network },
  { href: "/alerts", label: "告警中心", icon: Activity },
  { href: "/inspections", label: "巡检报告", icon: FileText },
  { href: "/assistant", label: "OpenCode 助手", icon: Bot, roles: ["ADMIN", "OPS"] },
  { href: "/audit-logs", label: "审计日志", icon: History, roles: ["ADMIN"] },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [role, setRole] = useState<string>("");

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((payload) => setRole(payload.role ?? ""))
      .catch(() => setRole(""));
  }, []);

  const visibleItems = navItems.filter((item) => !item.roles || item.roles.includes(role));

  return (
    <div className="min-h-screen bg-[#031224] text-white">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 border-r border-cyan-500/15 bg-[#041a33]/90 p-5 lg:block">
          <div className="mb-8">
            <div className="text-sm uppercase tracking-[0.4em] text-cyan-300/70">OpenCode Ops</div>
            <h1 className="mt-3 text-2xl font-semibold">运维管理平台</h1>
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
        </aside>
        <main className="flex-1 overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}

import { ServerStatus } from "@prisma/client";

export function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function statusLabel(status: ServerStatus | string) {
  const map: Record<string, string> = {
    IDLE: "空闲",
    IN_USE: "使用中",
    MAINTENANCE: "维护中",
    ERROR: "异常",
    DISABLED: "停用",
    PENDING: "待审批",
    APPROVED: "已通过",
    REJECTED: "已驳回",
    EXECUTING: "执行中",
    COMPLETED: "已完成",
    EXPIRED: "已过期",
    LOW: "低风险",
    MEDIUM: "中风险",
    HIGH: "高风险",
    CRITICAL: "严重",
    ACTIVE: "启用",
    PROVISIONING: "创建中",
    RUNNING: "运行中",
    STOPPED: "已停止",
    FAILED: "失败",
    DELETED: "已删除",
  };

  return map[status] ?? status;
}

export function approvalTypeLabel(type: string) {
  const map: Record<string, string> = {
    SERVER_USAGE: "工作区访问审批",
    WORKSPACE_ACCESS: "工作区访问审批",
    PORT_CHANGE: "端口变更审批",
    OPENCODE_HIGH_RISK: "OpenCode 高风险审批",
    "root-access": "Root 权限申请",
    "sudo-access": "Sudo 权限申请",
    "ssh-user-create": "SSH 用户创建申请",
    "password-rotation": "密码轮换申请",
    "disable-account": "账号禁用申请",
  };

  return map[type] ?? type;
}

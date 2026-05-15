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

export function workspaceRequestTypeLabel(type: string) {
  const map: Record<string, string> = {
    DEVELOPMENT: "开发调试",
    TRAINING: "模型训练",
    TESTING: "测试验证",
    DATA_PROCESSING: "数据处理",
    DEMO: "演示展示",
    TEMPORARY: "临时使用",
    WORKSPACE_ACCESS: "标准工作区",
  };

  return map[type] ?? type;
}

export function connectivityPhaseLabel(phase: string | null | undefined) {
  const map: Record<string, string> = {
    OK: "连接正常",
    DNS_UNREACHABLE: "DNS/IP 不可达",
    TCP_REFUSED: "TCP 拒绝",
    TCP_TIMEOUT: "TCP 超时",
    SSH_HANDSHAKE_TIMEOUT: "SSH 握手超时",
    AUTH_FAILED: "认证失败",
    COMMAND_FAILED: "远端命令失败",
    UNKNOWN_ERROR: "未知连接异常",
  };

  if (!phase) return "-";
  return map[phase] ?? phase;
}

export function connectionConfigStateLabel(state: string | null | undefined) {
  const map: Record<string, string> = {
    READY: "连接配置完整",
    MISSING_PORT: "端口待确认",
    MISSING_PASSWORD: "密码缺失",
    INVALID: "配置不完整",
  };

  if (!state) return "-";
  return map[state] ?? state;
}

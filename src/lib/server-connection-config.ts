export const DEFAULT_RECOVERY_PORTS = [22, 2222, 2022, 1010, 10022, 22022, 36000] as const;

export type ConnectionConfigState = "READY" | "MISSING_PORT" | "MISSING_PASSWORD" | "INVALID";

type ServerConnectionLike = {
  publicIp?: string | null;
  serverUsername?: string | null;
  serverPassword?: string | null;
  sshPort?: number | null;
};

export function normalizeSshPort(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.trunc(parsed);
}

export function isValidSshPort(port: number | null | undefined) {
  return Number.isInteger(port) && Number(port) > 0 && Number(port) <= 65535;
}

export function getConnectionConfigState(server: ServerConnectionLike): ConnectionConfigState {
  if (!server.publicIp || !server.serverUsername) {
    return "INVALID";
  }
  if (!isValidSshPort(server.sshPort)) {
    return "MISSING_PORT";
  }
  if (!server.serverPassword) {
    return "MISSING_PASSWORD";
  }
  return "READY";
}

export function canAttemptServerConnection(server: ServerConnectionLike) {
  return getConnectionConfigState(server) === "READY";
}

export function connectionConfigStateMessage(state: ConnectionConfigState) {
  switch (state) {
    case "READY":
      return "连接信息完整";
    case "MISSING_PORT":
      return "SSH 端口待确认";
    case "MISSING_PASSWORD":
      return "SSH 密码缺失";
    default:
      return "连接配置不完整";
  }
}

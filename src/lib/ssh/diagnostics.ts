import { Socket } from "net";
import { type Server } from "@prisma/client";
import { decryptText } from "@/lib/crypto";
import { isValidSshPort } from "@/lib/server-connection-config";
import { connectSSH, runSSHCommand, type SSHConnectionConfig } from "@/lib/ssh/client";

export type ConnectivityPhase =
  | "OK"
  | "DNS_UNREACHABLE"
  | "TCP_REFUSED"
  | "TCP_TIMEOUT"
  | "SSH_HANDSHAKE_TIMEOUT"
  | "AUTH_FAILED"
  | "COMMAND_FAILED"
  | "UNKNOWN_ERROR";

export type ConnectivityDiagnostic = {
  host: string;
  configuredPort: number | null;
  probedPort: number | null;
  phase: ConnectivityPhase;
  reason: string;
  nextAction: string;
  portReachable: boolean;
  handshakeOk: boolean;
  authOk: boolean;
  commandOk: boolean;
  checkedAt: string;
};

export type PortProbeResult = {
  host: string;
  port: number;
  status: "open" | "refused" | "timeout" | "dns_unreachable" | "error";
  reason: string;
};

export async function runServerConnectivityDiagnostic(server: Pick<Server, "publicIp" | "sshPort" | "serverUsername" | "serverPassword">) {
  const host = server.publicIp;
  const port = server.sshPort;
  const username = server.serverUsername;
  const checkedAt = new Date().toISOString();

  if (!isValidSshPort(port)) {
    return {
      host,
      configuredPort: port ?? null,
      probedPort: null,
      phase: "TCP_REFUSED",
      reason: "SSH port is missing or invalid in server configuration",
      nextAction: "先在服务器恢复面板中确认真实 SSH 端口，再重新诊断或采集。",
      portReachable: false,
      handshakeOk: false,
      authOk: false,
      commandOk: false,
      checkedAt,
    } satisfies ConnectivityDiagnostic;
  }

  const password = decryptText(server.serverPassword);

  const tcp = await testTcpReachability(host, port);
  if (!tcp.ok) {
    return {
      host,
      configuredPort: port,
      probedPort: port,
      phase: tcp.phase,
      reason: tcp.reason,
      nextAction: nextActionForPhase(tcp.phase),
      portReachable: false,
      handshakeOk: false,
      authOk: false,
      commandOk: false,
      checkedAt,
    } satisfies ConnectivityDiagnostic;
  }

  try {
    const conn = await connectSSH(
      {
        host,
        port,
        username,
        password,
      },
      1,
    );

    try {
      const result = await runSSHCommand(conn, "true");
      if (result.exitCode !== 0) {
        return {
          host,
          configuredPort: port,
          probedPort: port,
          phase: "COMMAND_FAILED",
          reason: result.stderr || result.stdout || `Command exited with code ${result.exitCode}`,
          nextAction: nextActionForPhase("COMMAND_FAILED"),
          portReachable: true,
          handshakeOk: true,
          authOk: true,
          commandOk: false,
          checkedAt,
        } satisfies ConnectivityDiagnostic;
      }

      return {
        host,
        configuredPort: port,
        probedPort: port,
        phase: "OK",
        reason: "SSH connection and command probe succeeded",
        nextAction: nextActionForPhase("OK"),
        portReachable: true,
        handshakeOk: true,
        authOk: true,
        commandOk: true,
        checkedAt,
      } satisfies ConnectivityDiagnostic;
    } finally {
      conn.end();
    }
  } catch (error) {
    return classifySshError(error, { host, port, checkedAt });
  }
}

export function classifySshError(error: unknown, options: { host: string; port: number; checkedAt?: string }) {
  const checkedAt = options.checkedAt ?? new Date().toISOString();
  const message = getErrorMessage(error);
  const lowered = message.toLowerCase();

  if (lowered.includes("getaddrinfo") || lowered.includes("enotfound") || lowered.includes("eai_again")) {
    return diagnosticResult(options, checkedAt, "DNS_UNREACHABLE", message, false, false, false, false);
  }
  if (lowered.includes("econnrefused") || lowered.includes("connection refused")) {
    return diagnosticResult(options, checkedAt, "TCP_REFUSED", message, false, false, false, false);
  }
  if (lowered.includes("timed out while waiting for handshake")) {
    return diagnosticResult(options, checkedAt, "SSH_HANDSHAKE_TIMEOUT", message, true, false, false, false);
  }
  if (lowered.includes("all configured authentication methods failed") || lowered.includes("permission denied")) {
    return diagnosticResult(options, checkedAt, "AUTH_FAILED", message, true, true, false, false);
  }
  if (lowered.includes("command probe failed")) {
    return diagnosticResult(options, checkedAt, "COMMAND_FAILED", message, true, true, true, false);
  }
  if (lowered.includes("timeout") || lowered.includes("etimedout")) {
    return diagnosticResult(options, checkedAt, "TCP_TIMEOUT", message, false, false, false, false);
  }

  return diagnosticResult(options, checkedAt, "UNKNOWN_ERROR", message, true, false, false, false);
}

export function formatConnectivityAlert(diagnostic: ConnectivityDiagnostic) {
  const port = diagnostic.probedPort ?? diagnostic.configuredPort ?? 0;
  return `host=${diagnostic.host} port=${port} phase=${diagnostic.phase} reason=${diagnostic.reason}`;
}

export function parseConnectivityAlert(description: string | null | undefined) {
  if (!description) return null;

  const hostMatch = description.match(/host=([^\s]+)/);
  const portMatch = description.match(/port=(\d+)/);
  const phaseMatch = description.match(/phase=([A-Z_]+)/);
  const reasonMatch = description.match(/reason=(.+)$/);

  if (!phaseMatch) return null;

  return {
    host: hostMatch?.[1] ?? null,
    port: portMatch ? Number(portMatch[1]) : null,
    phase: phaseMatch[1] as ConnectivityPhase,
    reason: reasonMatch?.[1] ?? description,
  };
}

export async function scanTcpPorts(host: string, ports: number[]) {
  const results: PortProbeResult[] = [];
  for (const port of ports) {
    const result = await testTcpReachability(host, port);
    if (result.ok) {
      results.push({ host, port, status: "open", reason: "TCP connect succeeded" });
      continue;
    }
    const status =
      result.phase === "TCP_REFUSED"
        ? "refused"
        : result.phase === "TCP_TIMEOUT"
          ? "timeout"
          : result.phase === "DNS_UNREACHABLE"
            ? "dns_unreachable"
            : "error";
    results.push({ host, port, status, reason: result.reason });
  }
  return results;
}

async function testTcpReachability(host: string, port: number, timeoutMs = Number(process.env.SSH_CONNECT_TIMEOUT_MS ?? 10000)) {
  return new Promise<
    | { ok: true }
    | {
        ok: false;
        phase: ConnectivityPhase;
        reason: string;
      }
  >((resolve) => {
    const socket = new Socket();
    let finished = false;

    const finish = (result: { ok: true } | { ok: false; phase: ConnectivityPhase; reason: string }) => {
      if (finished) return;
      finished = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish({ ok: true }));
    socket.once("timeout", () => finish({ ok: false, phase: "TCP_TIMEOUT", reason: `TCP connect timed out after ${timeoutMs}ms` }));
    socket.once("error", (error) => {
      const message = getErrorMessage(error);
      const lowered = message.toLowerCase();
      if (lowered.includes("enotfound") || lowered.includes("eai_again")) {
        finish({ ok: false, phase: "DNS_UNREACHABLE", reason: message });
        return;
      }
      if (lowered.includes("econnrefused") || lowered.includes("connection refused")) {
        finish({ ok: false, phase: "TCP_REFUSED", reason: message });
        return;
      }
      if (lowered.includes("timeout") || lowered.includes("etimedout")) {
        finish({ ok: false, phase: "TCP_TIMEOUT", reason: message });
        return;
      }
      finish({ ok: false, phase: "UNKNOWN_ERROR", reason: message });
    });

    socket.connect(port, host);
  });
}

function diagnosticResult(
  options: { host: string; port: number },
  checkedAt: string,
  phase: ConnectivityPhase,
  reason: string,
  portReachable: boolean,
  handshakeOk: boolean,
  authOk: boolean,
  commandOk: boolean,
) {
  return {
    host: options.host,
    configuredPort: options.port,
    probedPort: options.port,
    phase,
    reason,
    nextAction: nextActionForPhase(phase),
    portReachable,
    handshakeOk,
    authOk,
    commandOk,
    checkedAt,
  } satisfies ConnectivityDiagnostic;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function buildDiagnosticConnectionConfig(server: Pick<Server, "publicIp" | "sshPort" | "serverUsername" | "serverPassword">): SSHConnectionConfig {
  return {
    host: server.publicIp,
    port: server.sshPort,
    username: server.serverUsername,
    password: decryptText(server.serverPassword),
  };
}

export function nextActionForPhase(phase: ConnectivityPhase) {
  switch (phase) {
    case "OK":
      return "连接正常，可继续采集或打开终端。";
    case "TCP_REFUSED":
      return "目标机当前端口未监听或端口配置错误，请确认真实 SSH 端口和 sshd 监听配置。";
    case "TCP_TIMEOUT":
      return "更像安全组、防火墙或公网链路拦截，请先检查云安全组和主机防火墙。";
    case "SSH_HANDSHAKE_TIMEOUT":
      return "TCP 已通但 SSH 握手异常，请检查 sshd 服务状态、负载和中间网络设备。";
    case "AUTH_FAILED":
      return "端口可达但认证失败，请核对服务器账号、密码或密钥。";
    case "COMMAND_FAILED":
      return "SSH 已登录但探测命令执行失败，请检查远端 shell/权限环境。";
    case "DNS_UNREACHABLE":
      return "目标地址无法解析或不可达，请确认公网 IP 或 DNS 配置。";
    default:
      return "请先确认连接配置，再结合云侧网络和主机 SSH 配置排查。";
  }
}

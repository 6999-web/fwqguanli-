import { Socket } from "net";
import { type Server } from "@prisma/client";
import { decryptText } from "@/lib/crypto";
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
  port: number;
  phase: ConnectivityPhase;
  reason: string;
  portReachable: boolean;
  handshakeOk: boolean;
  authOk: boolean;
  commandOk: boolean;
  checkedAt: string;
};

export async function runServerConnectivityDiagnostic(server: Pick<Server, "publicIp" | "sshPort" | "serverUsername" | "serverPassword">) {
  const host = server.publicIp;
  const port = server.sshPort;
  const username = server.serverUsername;
  const password = decryptText(server.serverPassword);
  const checkedAt = new Date().toISOString();

  const tcp = await testTcpReachability(host, port);
  if (!tcp.ok) {
    return {
      host,
      port,
      phase: tcp.phase,
      reason: tcp.reason,
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
          port,
          phase: "COMMAND_FAILED",
          reason: result.stderr || result.stdout || `Command exited with code ${result.exitCode}`,
          portReachable: true,
          handshakeOk: true,
          authOk: true,
          commandOk: false,
          checkedAt,
        } satisfies ConnectivityDiagnostic;
      }

      return {
        host,
        port,
        phase: "OK",
        reason: "SSH connection and command probe succeeded",
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
  return `host=${diagnostic.host} port=${diagnostic.port} phase=${diagnostic.phase} reason=${diagnostic.reason}`;
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
    port: options.port,
    phase,
    reason,
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

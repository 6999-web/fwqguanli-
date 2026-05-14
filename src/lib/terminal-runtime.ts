type TerminalSessionRecord = {
  id: string;
  userId: string;
  serverId?: string;
  workspaceId?: string;
  targetLabel: string;
  host: string;
  port: number;
  username: string;
  password?: string;
  initialCommand?: string;
  status: "created" | "connecting" | "connected" | "closed" | "error";
  createdAt: number;
  cols: number;
  rows: number;
  buffer: string;
  cleanupTimer?: ReturnType<typeof setTimeout>;
  close?: (reason?: string) => void;
};

type TerminalRuntime = {
  sessions: Map<string, TerminalSessionRecord>;
};

declare global {
  var __OPENCODE_TERMINAL_RUNTIME__: TerminalRuntime | undefined;
}

function getRuntime(): TerminalRuntime {
  if (!globalThis.__OPENCODE_TERMINAL_RUNTIME__) {
    globalThis.__OPENCODE_TERMINAL_RUNTIME__ = {
      sessions: new Map(),
    };
  }

  return globalThis.__OPENCODE_TERMINAL_RUNTIME__;
}

export function createTerminalSession(input: {
  userId: string;
  serverId?: string;
  workspaceId?: string;
  targetLabel: string;
  host: string;
  port?: number;
  username: string;
  password?: string;
  cols?: number;
  rows?: number;
  initialCommand?: string;
}) {
  const session: TerminalSessionRecord = {
    id: crypto.randomUUID(),
    userId: input.userId,
    serverId: input.serverId,
    workspaceId: input.workspaceId,
    targetLabel: input.targetLabel,
    host: input.host,
    port: input.port ?? 22,
    username: input.username,
    password: input.password,
    initialCommand: input.initialCommand,
    status: "created",
    createdAt: Date.now(),
    cols: input.cols ?? 120,
    rows: input.rows ?? 32,
    buffer: "",
  };

  getRuntime().sessions.set(session.id, session);
  return session;
}

export function getTerminalSession(sessionId: string) {
  return getRuntime().sessions.get(sessionId) ?? null;
}

export function closeTerminalSession(sessionId: string, reason = "api") {
  const session = getTerminalSession(sessionId);
  if (!session) return false;
  session.close?.(reason);
  getRuntime().sessions.delete(sessionId);
  return true;
}

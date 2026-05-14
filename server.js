/* eslint-disable @typescript-eslint/no-require-imports */
const { createServer } = require("http");
const next = require("next");
const { Server } = require("socket.io");
const { Client } = require("ssh2");

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();
const TERMINAL_RUNTIME_KEY = "__OPENCODE_TERMINAL_RUNTIME__";
const TERMINAL_BUFFER_LIMIT = 64 * 1024;
const TERMINAL_RECONNECT_GRACE_MS = 60_000;

function getTerminalRuntime() {
  global[TERMINAL_RUNTIME_KEY] ||= {
    sessions: new Map(),
  };

  return global[TERMINAL_RUNTIME_KEY];
}

function roomName(sessionId) {
  return `terminal:${sessionId}`;
}

function systemLine(message, color = 36) {
  return `\r\n\u001b[${color}m${message}\u001b[0m\r\n`;
}

function pushToBuffer(session, chunk) {
  session.buffer = `${session.buffer || ""}${chunk}`;
  if (session.buffer.length > TERMINAL_BUFFER_LIMIT) {
    session.buffer = session.buffer.slice(-TERMINAL_BUFFER_LIMIT);
  }
}

function emitTerminalData(io, session, chunk) {
  pushToBuffer(session, chunk);
  io.to(roomName(session.id)).emit("terminal:data", {
    sessionId: session.id,
    data: chunk,
  });
}

function emitTerminalStatus(io, session, status) {
  session.status = status;
  io.to(roomName(session.id)).emit("terminal:status", {
    sessionId: session.id,
    status,
  });
}

function closeTerminalSession(io, sessionId, reason = "closed") {
  const runtime = getTerminalRuntime();
  const session = runtime.sessions.get(sessionId);
  if (!session) return;

  if (session.cleanupTimer) {
    clearTimeout(session.cleanupTimer);
    session.cleanupTimer = undefined;
  }

  emitTerminalStatus(io, session, "closed");

  if (session.stream) {
    try {
      session.stream.end("exit\n");
    } catch {}
  }
  if (session.conn) {
    try {
      session.conn.end();
    } catch {}
  }

  io.to(roomName(sessionId)).emit("terminal:exit", {
    sessionId,
    reason,
  });

  runtime.sessions.delete(sessionId);
}

function attachTerminalSession(io, session, cols, rows) {
  session.close = (reason) => closeTerminalSession(io, session.id, reason);
  session.cols = cols || session.cols || 120;
  session.rows = rows || session.rows || 32;

  const conn = new Client();
  session.conn = conn;
  emitTerminalStatus(io, session, "connecting");

  emitTerminalData(
    io,
    session,
    systemLine(`Connecting to ${session.username}@${session.host}:${session.port} ...`, 36),
  );

  conn
    .on("ready", () => {
      conn.shell(
        {
          term: "xterm-256color",
          cols: session.cols,
          rows: session.rows,
        },
        (error, stream) => {
          if (error) {
            emitTerminalStatus(io, session, "error");
            emitTerminalData(io, session, systemLine(`Shell open failed: ${error.message}`, 31));
            closeTerminalSession(io, session.id, "shell-error");
            return;
          }

          emitTerminalStatus(io, session, "connected");
          session.stream = stream;

          emitTerminalData(
            io,
            session,
            systemLine(`Connected to ${session.targetLabel} (${session.host})`, 32),
          );

          stream.on("close", () => {
            closeTerminalSession(io, session.id, "remote-closed");
          });

          stream.on("data", (data) => {
            emitTerminalData(io, session, data.toString("utf8"));
          });

          if (stream.stderr) {
            stream.stderr.on("data", (data) => {
              emitTerminalData(io, session, `\u001b[31m${data.toString("utf8")}\u001b[0m`);
            });
          }

          if (session.initialCommand) {
            stream.write(session.initialCommand);
            session.initialCommand = undefined;
          }
        },
      );
    })
    .on("error", (error) => {
      emitTerminalStatus(io, session, "error");
      emitTerminalData(io, session, systemLine(`SSH connection failed: ${error.message}`, 31));
      closeTerminalSession(io, session.id, "connect-error");
    })
    .on("close", () => {
      if (getTerminalRuntime().sessions.has(session.id)) {
        closeTerminalSession(io, session.id, "connection-closed");
      }
    })
    .connect({
      host: session.host,
      port: session.port || 22,
      username: session.username,
      password: session.password,
      readyTimeout: Number(process.env.SSH_CONNECT_TIMEOUT_MS || 10000),
      keepaliveInterval: 10000,
      keepaliveCountMax: 3,
    });
}

app.prepare().then(() => {
  const handleUpgrade = app.getUpgradeHandler();
  const server = createServer((req, res) => handle(req, res));
  const io = new Server(server, {
    path: "/api/socket",
    cors: { origin: "*" },
  });

  global.io = io;

  io.on("connection", (socket) => {
    const joinedSessionIds = new Set();

    socket.emit("welcome", {
      ok: true,
      at: new Date().toISOString(),
      message: "OpenCode Ops socket connected",
    });

    socket.on("terminal:join", ({ sessionId, cols, rows }) => {
      const session = getTerminalRuntime().sessions.get(sessionId);
      if (!session) {
        socket.emit("terminal:error", {
          sessionId,
          message: "Terminal session not found or already closed.",
        });
        return;
      }

      if (session.cleanupTimer) {
        clearTimeout(session.cleanupTimer);
        session.cleanupTimer = undefined;
      }

      joinedSessionIds.add(sessionId);
      socket.join(roomName(sessionId));

      if (session.buffer) {
        socket.emit("terminal:replay", {
          sessionId,
          data: session.buffer,
        });
      }

      socket.emit("terminal:status", {
        sessionId,
        status: session.status,
      });

      if (!session.conn) {
        attachTerminalSession(io, session, cols, rows);
      }
    });

    socket.on("terminal:input", ({ sessionId, data }) => {
      const session = getTerminalRuntime().sessions.get(sessionId);
      if (!session?.stream) return;
      session.stream.write(data);
    });

    socket.on("terminal:resize", ({ sessionId, cols, rows }) => {
      const session = getTerminalRuntime().sessions.get(sessionId);
      if (!session?.stream || !cols || !rows) return;

      session.cols = cols;
      session.rows = rows;

      try {
        session.stream.setWindow(rows, cols, 0, 0);
      } catch {}
    });

    socket.on("terminal:close", ({ sessionId }) => {
      closeTerminalSession(io, sessionId, "client-closed");
    });

    socket.on("disconnect", () => {
      const runtime = getTerminalRuntime();
      for (const sessionId of joinedSessionIds) {
        const session = runtime.sessions.get(sessionId);
        if (!session || session.cleanupTimer) continue;
        session.cleanupTimer = setTimeout(() => {
          closeTerminalSession(io, sessionId, "disconnect-timeout");
        }, TERMINAL_RECONNECT_GRACE_MS);
      }
    });
  });

  server.on("upgrade", (req, socket, head) => {
    if (req.url?.startsWith("/_next/webpack-hmr")) {
      handleUpgrade(req, socket, head);
    }
  });

  const port = Number(process.env.PORT || 3000);
  server.listen(port, () => {
    console.log(`> OpenCode Ops ready on http://localhost:${port}`);
  });
});

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { Bot, PlugZap, RotateCcw, SquareTerminal, Wifi, WifiOff } from "lucide-react";
import { cn } from "@/lib/format";

type SelectedTarget =
  | {
      id: string;
      label: string;
      host: string;
      username?: string | null;
      status: string;
      mode: "server";
    }
  | {
      id: string;
      label: string;
      host: string;
      username?: string | null;
      status: string;
      mode: "workspace";
      port: number;
    }
  | null;

type SessionResponse = {
  sessionId: string;
  mode: "server" | "workspace";
  target: {
    id: string;
    label: string;
    host: string;
    username: string;
    port?: number;
  };
};

type TerminalStatus = "idle" | "connecting" | "connected" | "closed" | "error" | "created";

export function SSHTerminal({ selectedTarget }: { selectedTarget: SelectedTarget }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<XTerm | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  const [status, setStatus] = useState<TerminalStatus>("idle");
  const [busy, setBusy] = useState(false);

  const statusText = useMemo(() => {
    switch (status) {
      case "connecting":
      case "created":
        return "连接中";
      case "connected":
        return "已连接";
      case "error":
        return "异常";
      case "closed":
        return "已关闭";
      default:
        return "未连接";
    }
  }, [status]);

  useEffect(() => {
    if (!containerRef.current || terminalRef.current) return;

    const terminal = new XTerm({
      cursorBlink: true,
      fontFamily: "var(--font-geist-mono), Consolas, monospace",
      fontSize: 13,
      lineHeight: 1.3,
      theme: {
        background: "#02070d",
        foreground: "#dbe7f3",
        cursor: "#22d3ee",
        selectionBackground: "#164e63",
      },
      convertEol: true,
      scrollback: 3000,
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(containerRef.current);
    fitAddon.fit();
    terminal.writeln("\x1b[36mOpenCode workspace terminal ready.\x1b[0m");
    terminal.writeln("\x1b[90mChoose a workspace on the left, then connect a shell.\x1b[0m");

    const onDataDispose = terminal.onData((data) => {
      if (!sessionIdRef.current || !socketRef.current) return;
      socketRef.current.emit("terminal:input", {
        sessionId: sessionIdRef.current,
        data,
      });
    });

    const observer = new ResizeObserver(() => {
      try {
        fitAddon.fit();
      } catch {}

      if (!sessionIdRef.current || !socketRef.current || !terminalRef.current) return;
      socketRef.current.emit("terminal:resize", {
        sessionId: sessionIdRef.current,
        cols: terminalRef.current.cols,
        rows: terminalRef.current.rows,
      });
    });
    observer.observe(containerRef.current);

    terminalRef.current = terminal;
    return () => {
      observer.disconnect();
      onDataDispose.dispose();
      terminal.dispose();
      terminalRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (socketRef.current) return;

    const socket = io({ path: "/api/socket" });
    socketRef.current = socket;

    socket.on("connect", () => {
      if (!sessionIdRef.current || !terminalRef.current) return;
      socket.emit("terminal:join", {
        sessionId: sessionIdRef.current,
        cols: terminalRef.current.cols,
        rows: terminalRef.current.rows,
      });
    });

    socket.on("terminal:replay", ({ sessionId, data }) => {
      if (sessionId !== sessionIdRef.current || !terminalRef.current) return;
      terminalRef.current.reset();
      terminalRef.current.write(data);
    });

    socket.on("terminal:data", ({ sessionId, data }) => {
      if (sessionId !== sessionIdRef.current || !terminalRef.current) return;
      terminalRef.current.write(data);
    });

    socket.on("terminal:status", ({ sessionId, status: nextStatus }) => {
      if (sessionId !== sessionIdRef.current) return;
      setStatus(nextStatus);
    });

    socket.on("terminal:error", ({ sessionId, message }) => {
      if (sessionId !== sessionIdRef.current || !terminalRef.current) return;
      setStatus("error");
      terminalRef.current.writeln(`\r\n\x1b[31m${message}\x1b[0m`);
    });

    socket.on("terminal:exit", ({ sessionId, reason }) => {
      if (sessionId !== sessionIdRef.current || !terminalRef.current) return;
      setStatus("closed");
      terminalRef.current.writeln(`\r\n\x1b[33mSession closed: ${reason}\x1b[0m`);
      sessionIdRef.current = null;
    });

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, []);

  async function destroySession() {
    const currentSessionId = sessionIdRef.current;
    if (!currentSessionId) return;

    try {
      socketRef.current?.emit("terminal:close", { sessionId: currentSessionId });
      await fetch(`/api/terminal/sessions/${currentSessionId}`, {
        method: "DELETE",
      });
    } catch {}

    sessionIdRef.current = null;
    setStatus("closed");
  }

  useEffect(() => {
    return () => {
      void destroySession();
    };
  }, []);

  async function startSession(initialCommand?: string) {
    if (!selectedTarget || !terminalRef.current) return;

    setBusy(true);
    setStatus("connecting");

    if (sessionIdRef.current) {
      await destroySession();
      terminalRef.current.reset();
    }

    terminalRef.current.writeln(`\r\n\x1b[36mOpening session for ${selectedTarget.label} (${selectedTarget.host})...\x1b[0m`);

    try {
      const response = await fetch("/api/terminal/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: selectedTarget.mode,
          serverId: selectedTarget.mode === "server" ? selectedTarget.id.replace("server:", "") : undefined,
          workspaceId: selectedTarget.mode === "workspace" ? selectedTarget.id : undefined,
          cols: terminalRef.current.cols,
          rows: terminalRef.current.rows,
          initialCommand,
        }),
      });

      const payload = (await response.json()) as SessionResponse & { message?: string };
      if (!response.ok) {
        throw new Error(payload.message ?? "Unable to create terminal session");
      }

      sessionIdRef.current = payload.sessionId;
      socketRef.current?.emit("terminal:join", {
        sessionId: payload.sessionId,
        cols: terminalRef.current.cols,
        rows: terminalRef.current.rows,
      });
    } catch (error) {
      setStatus("error");
      terminalRef.current.writeln(
        `\r\n\x1b[31m${error instanceof Error ? error.message : "Unable to connect terminal."}\x1b[0m`,
      );
    } finally {
      setBusy(false);
    }
  }

  function clearTerminal() {
    terminalRef.current?.clear();
  }

  function relaunchOpenCode() {
    if (!sessionIdRef.current || !socketRef.current || !terminalRef.current) return;
    terminalRef.current.write("\r\n");
    socketRef.current.emit("terminal:input", {
      sessionId: sessionIdRef.current,
      data: "opencode\n",
    });
  }

  const statusTone =
    status === "connected" ? "text-emerald-300" : status === "error" ? "text-rose-300" : "text-amber-300";

  return (
    <div className="min-w-0 rounded-lg border border-cyan-500/15 bg-[#06182f]/80 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cyan-500/10 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-cyan-100">
            <SquareTerminal size={17} />
            <span className="font-medium">实时 SSH 终端</span>
          </div>
          <div className={cn("rounded-full border border-cyan-500/20 px-3 py-1 text-xs", statusTone)}>{statusText}</div>
          <div className="rounded-full border border-cyan-500/20 px-3 py-1 text-xs text-slate-300">
            {selectedTarget ? `${selectedTarget.label} / ${selectedTarget.host}` : "尚未选择目标"}
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          {status === "connected" ? <Wifi size={14} /> : <WifiOff size={14} />}
          <span>PTY shell / streaming output / reconnect buffer</span>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-cyan-500/10 bg-[#020b16] p-4">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-800 pb-3">
          <button
            type="button"
            onClick={() => startSession()}
            disabled={!selectedTarget || busy}
            className="inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <PlugZap size={16} />
            连接 Shell
          </button>
          <button
            type="button"
            onClick={() => startSession("opencode\n")}
            disabled={!selectedTarget || busy}
            className="inline-flex items-center gap-2 rounded-lg border border-cyan-500/20 px-4 py-2 text-sm text-cyan-100 transition hover:bg-cyan-500/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Bot size={16} />
            启动 OpenCode
          </button>
          <button
            type="button"
            onClick={relaunchOpenCode}
            disabled={status !== "connected"}
            className="inline-flex items-center gap-2 rounded-lg border border-cyan-500/20 px-4 py-2 text-sm text-slate-200 transition hover:bg-cyan-500/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Bot size={16} />
            在当前终端运行 opencode
          </button>
          <button
            type="button"
            onClick={clearTerminal}
            className="inline-flex items-center gap-2 rounded-lg border border-cyan-500/20 px-4 py-2 text-sm text-slate-300 transition hover:bg-cyan-500/10"
          >
            <RotateCcw size={16} />
            清屏
          </button>
        </div>

        <div className="mt-4 h-[560px] overflow-hidden rounded-md bg-[#02070d] p-2">
          <div ref={containerRef} className="h-full w-full" />
        </div>

        <div className="mt-4 grid gap-3 text-xs text-slate-400 lg:grid-cols-3">
          <div className="rounded-md border border-cyan-500/10 bg-[#031224] p-3">普通用户只会连接自己的容器工作区，宿主机 SSH 不再外发。</div>
          <div className="rounded-md border border-cyan-500/10 bg-[#031224] p-3">页面刷新后会保留短暂重连窗口，并回放最近一段终端输出。</div>
          <div className="rounded-md border border-cyan-500/10 bg-[#031224] p-3">如果镜像内已安装 `opencode`，可以直接从当前终端进入 CLI 工作流。</div>
        </div>
      </div>
    </div>
  );
}

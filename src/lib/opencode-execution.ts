import { RiskLevel, Server } from "@prisma/client";
import { decryptText } from "@/lib/crypto";
import { analyzeDirectCommand, analyzeOpsPrompt, isDirectShellCommand } from "@/lib/opencode";
import { assessCommandRisk, execWhitelistedCommand } from "@/lib/ssh/executor";
import { READ_ONLY_COMMANDS } from "@/lib/ssh/commands";
import { connectSSH, runSSHCommand } from "@/lib/ssh/client";

export type OpenCodeExecutionMode = "central-opencode" | "server-ssh";

export type OpenCodeExecutionPayload = {
  prompt: string;
  execute: boolean;
  server: Server | null;
};

export type OpenCodeExecutionResponse = {
  mode: OpenCodeExecutionMode;
  stdout: string;
  stderr: string;
  exitCode: number;
  usedFallback: boolean;
  analysis: string;
  riskLevel: RiskLevel;
  report: string;
  suggestedCommands: Array<{ label: string; command: string; riskLevel: string }>;
};

type CentralConfig = {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
  workdir?: string;
  planCommand: string;
  execCommand: string;
  timeoutMs: number;
};

export async function executeOpenCodeTask(payload: OpenCodeExecutionPayload): Promise<OpenCodeExecutionResponse> {
  if (payload.execute && payload.server && isDirectShellCommand(payload.prompt)) {
    return {
      ...(await executeViaDirectServerSSH({ ...payload, server: payload.server })),
      usedFallback: false,
    };
  }

  const fallbackAnalysis = analyzeOpsPrompt(payload.prompt);
  const centralConfig = getCentralConfig();

  if (centralConfig && payload.server) {
    try {
      const central = await executeViaCentralOpenCode(
        { ...payload, server: payload.server },
        centralConfig,
        fallbackAnalysis,
      );
      return {
        ...central,
        usedFallback: false,
      };
    } catch (error) {
      return {
        ...(await executeViaServerSSH(payload, fallbackAnalysis)),
        stderr: [
          error instanceof Error ? error.message : "Central OpenCode unavailable",
          "已自动回退到目标服务器的 SSH 巡检模式。",
        ].join("\n"),
        usedFallback: true,
      };
    }
  }

  if (payload.execute && payload.server) {
    return {
      ...(await executeSuggestedWorkflow(payload.server, fallbackAnalysis)),
      usedFallback: false,
    };
  }

  return {
    ...(await executeViaServerSSH(payload, fallbackAnalysis)),
    usedFallback: false,
  };
}

export function isCentralOpenCodeConfigured() {
  return Boolean(getCentralConfig());
}

async function executeViaCentralOpenCode(
  payload: OpenCodeExecutionPayload & { server: Server },
  config: CentralConfig,
  fallbackAnalysis: ReturnType<typeof analyzeOpsPrompt>,
) {
  const conn = await connectSSH({
    host: config.host,
    port: config.port,
    username: config.username,
    password: config.password,
    privateKey: config.privateKey,
    readyTimeout: config.timeoutMs,
  });

  try {
    const commandTemplate = payload.execute ? config.execCommand : config.planCommand;
    const command = buildCentralCommand(commandTemplate, payload.prompt, payload.server, config.workdir);
    const result = await runSSHCommand(conn, command);

    return {
      mode: "central-opencode" as const,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      analysis:
        result.stdout || result.stderr || "中心 OpenCode 已执行，但没有返回可展示内容。",
      riskLevel: payload.execute ? fallbackAnalysis.riskLevel : RiskLevel.MEDIUM,
      report: "结果来自中心 OpenCode 主机。",
      suggestedCommands: fallbackAnalysis.suggestedCommands.map((item) => ({
        ...item,
        riskLevel: assessCommandRisk(item.command),
      })),
    };
  } finally {
    conn.end();
  }
}

async function executeViaServerSSH(
  payload: OpenCodeExecutionPayload,
  analysis = analyzeOpsPrompt(payload.prompt),
) {
  return {
    mode: "server-ssh" as const,
    stdout: "",
    stderr: "",
    exitCode: 0,
    analysis: analysis.analysis,
    riskLevel: analysis.riskLevel,
    report: analysis.report,
    suggestedCommands: analysis.suggestedCommands.map((item) => ({
      ...item,
      riskLevel: assessCommandRisk(item.command),
    })),
  };
}

async function executeSuggestedWorkflow(
  server: Server,
  analysis: ReturnType<typeof analyzeOpsPrompt>,
) {
  if (!analysis.suggestedCommands.length) {
    return {
      mode: "server-ssh" as const,
      stdout: "",
      stderr: "未识别出可自动执行的巡检命令，请补充更具体的运维目标，或直接输入 shell 命令。",
      exitCode: 1,
      analysis: analysis.analysis,
      riskLevel: analysis.riskLevel,
      report: analysis.report,
      suggestedCommands: [],
    };
  }

  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];
  let exitCode = 0;

  for (const item of analysis.suggestedCommands) {
    const commandEntry = Object.entries(READ_ONLY_COMMANDS).find(([, command]) => command === item.command);
    if (!commandEntry) {
      continue;
    }

    try {
      const stdout = await execWhitelistedCommand(server, commandEntry[0] as keyof typeof READ_ONLY_COMMANDS);
      stdoutChunks.push(`$ ${item.command}\n${stdout}`);
    } catch (error) {
      exitCode = 1;
      stderrChunks.push(
        `$ ${item.command}\n${error instanceof Error ? error.message : "Command execution failed"}`,
      );
    }
  }

  return {
    mode: "server-ssh" as const,
    stdout: stdoutChunks.join("\n\n").trim(),
    stderr: stderrChunks.join("\n\n").trim(),
    exitCode,
    analysis: analysis.analysis,
    riskLevel: analysis.riskLevel,
    report: analysis.report,
    suggestedCommands: analysis.suggestedCommands.map((item) => ({
      ...item,
      riskLevel: assessCommandRisk(item.command),
    })),
  };
}

async function executeViaDirectServerSSH(payload: OpenCodeExecutionPayload & { server: Server }) {
  const analysis = analyzeDirectCommand(payload.prompt);
  const conn = await connectSSH({
    host: payload.server.publicIp,
    port: payload.server.sshPort,
    username: payload.server.serverUsername,
    password: decryptText(payload.server.serverPassword),
  });

  try {
    const result = await runSSHCommand(conn, payload.prompt);
    return {
      mode: "server-ssh" as const,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      analysis: analysis.analysis,
      riskLevel: analysis.riskLevel,
      report: analysis.report,
      suggestedCommands: analysis.suggestedCommands.map((item) => ({
        ...item,
        riskLevel: assessCommandRisk(item.command),
      })),
    };
  } finally {
    conn.end();
  }
}

function getCentralConfig(): CentralConfig | null {
  const host = process.env.OPENCODE_CENTRAL_HOST;
  const username = process.env.OPENCODE_CENTRAL_USERNAME;
  const planCommand = process.env.OPENCODE_CENTRAL_PLAN_COMMAND;
  const execCommand = process.env.OPENCODE_CENTRAL_EXEC_COMMAND;

  if (!host || !username || !planCommand || !execCommand) {
    return null;
  }

  return {
    host,
    port: Number(process.env.OPENCODE_CENTRAL_PORT ?? 22),
    username,
    password: process.env.OPENCODE_CENTRAL_PASSWORD,
    privateKey: process.env.OPENCODE_CENTRAL_PRIVATE_KEY,
    workdir: process.env.OPENCODE_CENTRAL_WORKDIR,
    planCommand,
    execCommand,
    timeoutMs: Number(process.env.OPENCODE_TIMEOUT_MS ?? 20000),
  };
}

function buildCentralCommand(template: string, prompt: string, server: Server, workdir?: string) {
  const replacements: Record<string, string> = {
    "{PROMPT}": shellEscape(prompt),
    "{SERVER_CODE}": shellEscape(server.serverCode),
    "{SERVER_IP}": shellEscape(server.publicIp),
    "{SERVER_USERNAME}": shellEscape(server.serverUsername),
    "{SERVER_PASSWORD}": shellEscape(decryptText(server.serverPassword)),
  };

  const command = Object.entries(replacements).reduce(
    (acc, [key, value]) => acc.split(key).join(value),
    template,
  );

  if (!workdir) {
    return command;
  }

  return `cd ${shellEscape(workdir)} && ${command}`;
}

function shellEscape(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

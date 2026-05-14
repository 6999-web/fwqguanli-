import { RiskLevel } from "@prisma/client";
import { assessCommandRisk } from "@/lib/ssh/executor";
import { READ_ONLY_COMMANDS } from "@/lib/ssh/commands";

export type SuggestedCommand = { label: string; command: string };

const SHELL_OPERATOR_PATTERN = /(?:&&|\|\||[|;<>`])/;
const DIRECT_COMMAND_PREFIXES = [
  "cat",
  "cd",
  "chmod",
  "chown",
  "crontab",
  "curl",
  "df",
  "docker",
  "du",
  "echo",
  "find",
  "free",
  "grep",
  "htop",
  "journalctl",
  "kill",
  "less",
  "ls",
  "mkdir",
  "mv",
  "nc",
  "netstat",
  "npm",
  "nvidia-smi",
  "pm2",
  "ps",
  "pwd",
  "rm",
  "sed",
  "service",
  "ss",
  "sudo",
  "systemctl",
  "tail",
  "tar",
  "top",
  "touch",
  "ufw",
  "uname",
  "vi",
  "vim",
  "who",
];

export function analyzeOpsPrompt(prompt: string) {
  const normalized = prompt.toLowerCase();
  const commands: SuggestedCommand[] = [];

  if (normalized.includes("cpu")) {
    commands.push({ label: "查看 CPU 使用率", command: READ_ONLY_COMMANDS.cpu });
  }
  if (normalized.includes("内存") || normalized.includes("memory")) {
    commands.push({ label: "查看内存使用率", command: READ_ONLY_COMMANDS.memory });
  }
  if (normalized.includes("磁盘") || normalized.includes("disk")) {
    commands.push({ label: "查看磁盘使用率", command: READ_ONLY_COMMANDS.disk });
  }
  if (normalized.includes("进程") || normalized.includes("process")) {
    commands.push({ label: "查看进程数量", command: READ_ONLY_COMMANDS.processes });
  }
  if (normalized.includes("端口") || normalized.includes("port")) {
    commands.push({ label: "查看开放端口", command: READ_ONLY_COMMANDS.ports });
  }
  if (normalized.includes("docker")) {
    commands.push({ label: "查看 Docker 版本", command: READ_ONLY_COMMANDS.docker });
  }
  if (normalized.includes("服务") || normalized.includes("service")) {
    commands.push({ label: "查看运行中服务", command: READ_ONLY_COMMANDS.services });
  }
  if (normalized.includes("登录") || normalized.includes("login")) {
    commands.push({ label: "查看最近登录记录", command: READ_ONLY_COMMANDS.logins });
  }
  if (normalized.includes("版本") || normalized.includes("系统") || normalized.includes("os")) {
    commands.push({ label: "查看系统版本", command: READ_ONLY_COMMANDS.os });
  }

  const uniqueCommands = Array.from(new Map(commands.map((item) => [item.command, item])).values());
  const highestRisk = uniqueCommands.reduce<RiskLevel>((current, item) => {
    const risk = assessCommandRisk(item.command);
    if (risk === "HIGH") return RiskLevel.HIGH;
    if (risk === "MEDIUM" && current === RiskLevel.LOW) return RiskLevel.MEDIUM;
    return current;
  }, RiskLevel.LOW);

  return {
    analysis: [
      "已根据你的运维目标生成只读巡检建议。",
      "建议先检查资源使用、端口、登录和关键服务状态，再决定是否进入变更流程。",
      uniqueCommands.length
        ? `本次可直接执行的只读命令共 ${uniqueCommands.length} 条。`
        : "暂未识别到明确的巡检关键词，建议补充 CPU、内存、磁盘、端口、服务或登录记录等目标。",
    ].join(" "),
    riskLevel: highestRisk,
    suggestedCommands: uniqueCommands,
    report: "巡检报告将综合资源利用率、端口、登录记录和关键服务状态生成摘要。",
  };
}

export function analyzeDirectCommand(prompt: string) {
  const risk = assessCommandRisk(prompt);
  return {
    analysis:
      risk === "LOW"
        ? "已识别为可直接在目标服务器执行的低风险命令，将通过 SSH 直连执行。"
        : "已识别为可能影响系统状态的命令，执行前需要审批确认。",
    riskLevel: mapRiskLevel(risk),
    suggestedCommands: [
      {
        label: "原始远程命令",
        command: prompt,
      },
    ],
    report: "执行结果将直接来自所选服务器的 SSH 会话输出。",
  };
}

export function isDirectShellCommand(prompt: string) {
  const normalized = prompt.trim().toLowerCase();
  if (!normalized) return false;

  if (SHELL_OPERATOR_PATTERN.test(normalized) || normalized.includes("\n")) {
    return true;
  }

  if (/^[./~]/.test(normalized)) {
    return true;
  }

  const [firstToken] = normalized.split(/\s+/);
  if (!firstToken) {
    return false;
  }

  if (DIRECT_COMMAND_PREFIXES.includes(firstToken)) {
    return true;
  }

  return false;
}

function mapRiskLevel(risk: string) {
  switch (risk) {
    case "HIGH":
      return RiskLevel.HIGH;
    case "MEDIUM":
      return RiskLevel.MEDIUM;
    default:
      return RiskLevel.LOW;
  }
}

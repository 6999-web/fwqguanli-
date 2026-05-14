import { Server } from "@prisma/client";
import { decryptText } from "@/lib/crypto";
import { connectSSH, runSSHCommand } from "@/lib/ssh/client";
import { HIGH_RISK_PATTERNS, LOW_RISK_KEYWORDS, READ_ONLY_COMMANDS } from "@/lib/ssh/commands";

type CommandKey = keyof typeof READ_ONLY_COMMANDS;

export function assessCommandRisk(command: string) {
  if (HIGH_RISK_PATTERNS.some((pattern) => pattern.test(command))) return "HIGH";
  if (LOW_RISK_KEYWORDS.some((keyword) => command.includes(keyword))) return "LOW";
  return "MEDIUM";
}

export function validateCommand(command: string) {
  const allowed = Object.values(READ_ONLY_COMMANDS).includes(command as never);
  if (allowed) {
    return;
  }
  if (/[;&`$<>]/.test(command)) {
    throw new Error("Dangerous shell metacharacters are not allowed");
  }
  throw new Error("Command not in whitelist");
}

export async function execWhitelistedCommand(server: Server, commandKey: CommandKey) {
  const result = await execWhitelistedCommands(server, [commandKey]);
  return result[commandKey];
}

export async function execWhitelistedCommands<T extends readonly CommandKey[]>(
  server: Server,
  commandKeys: T,
): Promise<Record<T[number], string>> {
  const conn = await connectSSH({
    host: server.publicIp,
    username: server.serverUsername,
    password: decryptText(server.serverPassword),
  });

  try {
    const results: Partial<Record<CommandKey, string>> = {};
    for (const commandKey of commandKeys) {
      const command = READ_ONLY_COMMANDS[commandKey];
      const result = await runCommandOnConnection(conn, command);
      results[commandKey] = result.stdout;
    }
    return results as Record<T[number], string>;
  } finally {
    conn.end();
  }
}

async function runCommandOnConnection(conn: Awaited<ReturnType<typeof connectSSH>>, command: string) {
  validateCommand(command);

  const result = await runSSHCommand(conn, command);
  if (result.stderr.trim()) {
    throw new Error(result.stderr.trim());
  }
  return result;
}

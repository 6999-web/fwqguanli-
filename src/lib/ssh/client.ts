import { Client } from "ssh2";

export type SSHConnectionConfig = {
  host: string;
  port?: number;
  username: string;
  password?: string | null;
  privateKey?: string | Buffer | null;
  readyTimeout?: number;
};

export type SSHExecutionResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

export async function connectSSH(config: SSHConnectionConfig, maxAttempts = 2) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await openConnection(config);
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts) {
        break;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("SSH connection failed");
}

function openConnection(config: SSHConnectionConfig) {
  return new Promise<Client>((resolve, reject) => {
    const conn = new Client();

    conn
      .once("ready", () => resolve(conn))
      .once("error", (error) => {
        conn.end();
        reject(error);
      })
      .connect({
        host: config.host,
        port: config.port ?? 22,
        username: config.username,
        password: config.password ?? undefined,
        privateKey: config.privateKey ?? undefined,
        readyTimeout: config.readyTimeout ?? Number(process.env.SSH_CONNECT_TIMEOUT_MS ?? 10000),
      });
  });
}

export function runSSHCommand(conn: Client, command: string) {
  return new Promise<SSHExecutionResult>((resolve, reject) => {
    conn.exec(command, (err, stream) => {
      if (err) {
        reject(err);
        return;
      }

      let stdout = "";
      let stderr = "";
      let exitCode = 0;

      stream
        .on("close", (code: number | null) => {
          exitCode = code ?? 0;
          resolve({
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            exitCode,
          });
        })
        .on("data", (data: Buffer) => {
          stdout += data.toString("utf8");
        });

      stream.stderr.on("data", (data: Buffer) => {
        stderr += data.toString("utf8");
      });
    });
  });
}

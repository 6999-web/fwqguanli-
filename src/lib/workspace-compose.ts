export type WorkspaceComposeInput = {
  workspaceId: string;
  containerName: string;
  composeProjectName: string;
  baseImage: string;
  sshUsername: string;
  sshPassword: string;
  sshPort: number;
  hostPortStart: number;
  hostPortEnd: number;
  cpuLimit: number;
  memoryLimitMb: number;
  diskLimitGb: number;
  gpuLimit?: number | null;
  workingDirectory: string;
};

export function buildWorkspaceFilesystem(input: WorkspaceComposeInput) {
  const env = [
    `WORKSPACE_ID=${input.workspaceId}`,
    `WORKSPACE_USER=${input.sshUsername}`,
    `WORKSPACE_PASSWORD=${input.sshPassword}`,
    `WORKSPACE_HOME=/workspace/home`,
  ].join("\n");

  const ports = [`      - "${input.sshPort}:22"`];
  for (let port = input.hostPortStart; port <= input.hostPortEnd; port += 1) {
    ports.push(`      - "${port}:${port}"`);
  }

  const gpuLine =
    input.gpuLimit && input.gpuLimit > 0
      ? `    deploy:\n      resources:\n        reservations:\n          devices:\n            - driver: nvidia\n              count: ${input.gpuLimit}\n              capabilities: [gpu]`
      : "";

  const compose = [
    "services:",
    "  workspace:",
    `    image: ${input.baseImage}`,
    `    container_name: ${input.containerName}`,
    "    restart: unless-stopped",
    "    env_file:",
    "      - .env",
    "    command: /bin/bash /workspace/meta/init.sh",
    "    ports:",
    ...ports,
    "    volumes:",
    "      - ../home:/workspace/home",
    "      - ../data:/workspace/data",
    "      - ../logs:/var/log/workspace",
    "      - ../meta:/workspace/meta",
    "    working_dir: /workspace/home",
    "    mem_limit: " + `${input.memoryLimitMb}m`,
    "    cpus: " + `"${input.cpuLimit}"`,
    gpuLine,
  ]
    .filter(Boolean)
    .join("\n");

  const initScript = [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    "export DEBIAN_FRONTEND=noninteractive",
    "if ! command -v sshd >/dev/null 2>&1; then",
    "  apt-get update",
    "  apt-get install -y --no-install-recommends openssh-server ca-certificates",
    "  rm -rf /var/lib/apt/lists/*",
    "fi",
    "mkdir -p /run/sshd",
    "ssh-keygen -A",
    "sed -i 's/^#\\?PasswordAuthentication .*/PasswordAuthentication yes/' /etc/ssh/sshd_config",
    "sed -i 's/^#\\?UsePAM .*/UsePAM yes/' /etc/ssh/sshd_config",
    "mkdir -p \"$WORKSPACE_HOME\" /workspace/data /var/log/workspace",
    "if ! id -u \"$WORKSPACE_USER\" >/dev/null 2>&1; then",
    "  useradd -m -d \"$WORKSPACE_HOME\" -s /bin/bash \"$WORKSPACE_USER\"",
    "fi",
    "echo \"$WORKSPACE_USER:$WORKSPACE_PASSWORD\" | chpasswd",
    "chown -R \"$WORKSPACE_USER:$WORKSPACE_USER\" \"$WORKSPACE_HOME\" /workspace/data /var/log/workspace",
    "exec /usr/sbin/sshd -D -e",
  ].join("\n");

  const metadata = JSON.stringify(
    {
      workspaceId: input.workspaceId,
      composeProjectName: input.composeProjectName,
      diskLimitGb: input.diskLimitGb,
      ports: {
        sshPort: input.sshPort,
        hostPortStart: input.hostPortStart,
        hostPortEnd: input.hostPortEnd,
      },
    },
    null,
    2,
  );

  return { env, compose, initScript, metadata };
}

export const READ_ONLY_COMMANDS = {
  cpu:
    "top -bn1 | grep 'Cpu(s)' | sed 's/.*, *\\([0-9.]*\\)%* id.*/\\1/' | awk '{print 100 - $1}'",
  cpuSpec: "lscpu | awk -F: '/Model name/ {gsub(/^[ \\t]+/, \"\", $2); print $2; exit}'",
  memory: "free -m | awk 'NR==2{printf \"%.2f\", $3*100/$2 }'",
  memorySpec: "free -h | awk 'NR==2 {print $2}'",
  disk: "df -h / | awk 'NR==2 {gsub(/%/,\"\",$5); print $5}'",
  diskSpec: "df -h / | awk 'NR==2 {print $2}'",
  processes: "ps -e --no-headers | wc -l",
  ports: "ss -tuln | awk 'NR>1 {print $5}'",
  logins: "last -n 10 --time-format iso",
  network: "cat /proc/net/dev",
  docker: "docker --version 2>/dev/null || echo 'Docker not installed'",
  nginx: "systemctl is-active nginx 2>/dev/null || echo 'inactive'",
  database:
    "psql --version 2>/dev/null || mysql --version 2>/dev/null || mongod --version 2>/dev/null || echo 'Unknown'",
  os: "cat /etc/os-release | grep PRETTY_NAME | cut -d= -f2",
  python: "python3 --version 2>/dev/null || python --version 2>/dev/null || echo 'Unknown'",
  node: "node --version 2>/dev/null || echo 'Unknown'",
  cuda: "nvidia-smi --query-gpu=driver_version --format=csv,noheader 2>/dev/null || echo 'Unavailable'",
  gpuSpec:
    "nvidia-smi --query-gpu=name,memory.total --format=csv,noheader 2>/dev/null | paste -sd '; ' - || echo 'Unavailable'",
  bandwidth:
    "for file in /sys/class/net/eth0/speed /sys/class/net/ens3/speed /sys/class/net/enp0s3/speed; do if [ -f \"$file\" ]; then cat \"$file\" && exit; fi; done; echo 'Unknown'",
  services: "systemctl list-units --type=service --state=running --no-pager --no-legend | head -n 15",
  users:
    "getent passwd | awk -F: '$3 >= 1000 && $1 != \"nobody\" {print $1\":\"$7}'",
  sudoers:
    "sh -lc 'getent group sudo 2>/dev/null | awk -F: \"{print \\$4}\"; getent group wheel 2>/dev/null | awk -F: \"{print \\$4}\"' | paste -sd ',' -",
} as const;

export const LOW_RISK_KEYWORDS = [
  "top",
  "free",
  "df",
  "ps ",
  "ss ",
  "last",
  "docker --version",
  "systemctl is-active",
  "systemctl list-units",
  "cat /etc/os-release",
  "python3 --version",
  "node --version",
  "nvidia-smi",
  "getent passwd",
  "getent group",
];

export const HIGH_RISK_PATTERNS = [
  /rm\s+/i,
  /reboot/i,
  /shutdown/i,
  /systemctl\s+(restart|stop)/i,
  /kill\s+-?\d*/i,
  /passwd/i,
  /ufw|iptables|firewall-cmd/i,
  /(apt|yum|dnf|pip)\s+install/i,
];

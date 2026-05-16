import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import { PrismaClient, RoleCode, ServerStatus } from "@prisma/client";
import { encryptText } from "../src/lib/crypto";
import { readExcelRowsFromFile } from "../src/lib/excel";
import { normalizeSshPort } from "../src/lib/server-connection-config";

const prisma = new PrismaClient();

const REGION_CODE_MAP: Record<string, string> = {
  北京: "BJ",
  上海: "SH",
  广州: "GZ",
  深圳: "SZ",
  香港: "HK",
  新加坡: "SG",
};

async function nextServerCode(region: string) {
  const count = await prisma.server.count({ where: { region } });
  const prefix = REGION_CODE_MAP[region] ?? region.slice(0, 2).toUpperCase();
  return `SRV-${prefix}-${String(count + 1).padStart(3, "0")}`;
}

async function main() {
  for (const role of [
    { code: RoleCode.ADMIN, name: "管理员", description: "拥有全局管理权限" },
    { code: RoleCode.OPS, name: "运维人员", description: "负责采集、审批和巡检" },
    { code: RoleCode.USER, name: "普通用户", description: "提交申请和查看分配结果" },
  ]) {
    await prisma.role.upsert({
      where: { code: role.code },
      update: role,
      create: role,
    });
  }

  const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.ADMIN } });
  const userRole = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.USER } });

  const adminEmail = process.env.DEFAULT_ADMIN_EMAIL ?? "admin@opencode.local";
  const adminPassword = process.env.DEFAULT_ADMIN_PASSWORD ?? "ChangeMe123!";

  for (const user of [
    { email: "user3@opencode.local", name: "Lab User 3", password: "User345678!", roleId: userRole.id },
    { email: adminEmail, name: "系统管理员", password: adminPassword, roleId: adminRole.id },
    { email: "user@opencode.local", name: "实验室用户", password: "User123456!", roleId: userRole.id },
    { email: "user2@opencode.local", name: "实验室用户二", password: "User234567!", roleId: userRole.id },
  ]) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: {
        name: user.name,
        passwordHash: await bcrypt.hash(user.password, 10),
        roleId: user.roleId,
      },
      create: {
        email: user.email,
        name: user.name,
        passwordHash: await bcrypt.hash(user.password, 10),
        roleId: user.roleId,
      },
    });
  }

  const workbookCandidates = [
    path.resolve(process.cwd(), "..", "实验室运维岗考核服务器负责安排表(李秉泽).xlsx"),
    path.resolve(process.cwd(), "..", "seed-data.xlsx"),
  ];
  const workbookPath = workbookCandidates.find((candidate) => fs.existsSync(candidate));
  if (!workbookPath) {
    console.warn(`Workbook not found: ${workbookCandidates.join(", ")}`);
    return;
  }

  const rows = await readExcelRowsFromFile(workbookPath);
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: adminEmail } });

  for (const row of rows) {
    const publicIp = row["公网IP地址"];
    if (!publicIp) continue;
    const region = row["地区"] ?? "北京";
    const existing = await prisma.server.findUnique({ where: { publicIp } });
    const serverCode = existing?.serverCode ?? (await nextServerCode(region));

    const rawSshPort = row["SSH端口"] ?? row["sshPort"];
    const sshPort = normalizeSshPort(rawSshPort);
    const hasValidPort = sshPort !== null && sshPort > 0;

    await prisma.server.upsert({
      where: { publicIp },
      update: {
        accountId: String(row["账号ID"] ?? ""),
        loginEmail: String(row["登录邮箱"] ?? ""),
        loginEmailPassword: encryptText(String(row["密码"] ?? "")),
        region,
        serverUsername: String(row["服务器账号"] ?? "ubuntu"),
        sshPort: hasValidPort ? sshPort : undefined,
        serverPassword: encryptText(String(row["服务器密码"] ?? "")),
        provider: "Tencent Cloud",
        purpose: "实验室服务器资源池",
        currentOwnerId: admin.id,
        status: ServerStatus.IDLE,
      },
      create: {
        serverCode,
        accountId: String(row["账号ID"] ?? ""),
        loginEmail: String(row["登录邮箱"] ?? ""),
        loginEmailPassword: encryptText(String(row["密码"] ?? "")),
        region,
        publicIp,
        provider: "Tencent Cloud",
        serverUsername: String(row["服务器账号"] ?? "ubuntu"),
        sshPort: hasValidPort ? sshPort : 0,
        serverPassword: encryptText(String(row["服务器密码"] ?? "")),
        purpose: "实验室服务器资源池",
        currentOwnerId: admin.id,
        status: ServerStatus.IDLE,
        cpuSpec: "待采集",
        memorySpec: "待采集",
        diskSpec: "待采集",
        bandwidth: "待采集",
      },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

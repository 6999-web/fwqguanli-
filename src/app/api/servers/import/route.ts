import { RoleCode } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { apiError, getRequestIp } from "@/lib/api";
import { writeAuditLog } from "@/lib/audit";
import { encryptText } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { normalizeSshPort } from "@/lib/server-connection-config";
import { generateServerCode } from "@/lib/server-code";

export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission("server:write");
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ message: "请选择 Excel 文件" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(Buffer.from(arrayBuffer), { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, string | undefined>>(sheet);

    const owner = await prisma.user.findFirst({
      where: { role: { code: RoleCode.ADMIN } },
      include: { role: true },
    });

    const imported = [];
    const summary = {
      createdCount: 0,
      updatedCount: 0,
      portUpdatedCount: 0,
      portSkippedCount: 0,
      warnings: [] as string[],
    };

    for (const row of rows) {
      const region = row["地区"] ?? "北京";
      const publicIp = row["公网IP地址"];
      if (!publicIp) continue;

      const existing = await prisma.server.findUnique({ where: { publicIp } });
      const serverCode = existing?.serverCode ?? (await generateServerCode(region));
      const serverUsername = String(row["服务器账号"] ?? "ubuntu");
      const serverPassword = encryptText(String(row["服务器密码"] ?? ""));
      const rawSshPort = row["SSH端口"] ?? row["sshPort"];
      const parsedPort = normalizeSshPort(rawSshPort);
      const hasValidPort = parsedPort !== null && parsedPort > 0;

      if (!hasValidPort) {
        summary.portSkippedCount += 1;
        summary.warnings.push(`${publicIp}: SSH端口缺失，已跳过端口更新`);
      }

      const server = await prisma.server.upsert({
        where: { publicIp },
        update: {
          accountId: String(row["账号ID"] ?? ""),
          loginEmail: String(row["登录邮箱"] ?? ""),
          loginEmailPassword: encryptText(String(row["密码"] ?? "")),
          region,
          serverUsername,
          sshPort: hasValidPort ? parsedPort : undefined,
          serverPassword,
          provider: "Tencent Cloud",
          currentOwnerId: owner?.id,
        },
        create: {
          serverCode,
          accountId: String(row["账号ID"] ?? ""),
          loginEmail: String(row["登录邮箱"] ?? ""),
          loginEmailPassword: encryptText(String(row["密码"] ?? "")),
          region,
          publicIp,
          provider: "Tencent Cloud",
          serverUsername,
          sshPort: hasValidPort ? parsedPort : 0,
          serverPassword,
          purpose: "Excel 导入服务器",
          currentOwnerId: owner?.id,
        },
      });

      if (existing) {
        summary.updatedCount += 1;
      } else {
        summary.createdCount += 1;
      }
      if (hasValidPort) {
        summary.portUpdatedCount += 1;
      }

      imported.push(server);
    }

    await writeAuditLog({
      userId: user.id,
      action: "IMPORT_SERVERS",
      module: "server",
      ipAddress: getRequestIp(request),
      detail: { count: imported.length, fileName: file.name, summary },
    });

    return NextResponse.json({ count: imported.length, imported, summary });
  } catch (error) {
    return apiError(error);
  }
}

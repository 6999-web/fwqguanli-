import { RoleCode } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { apiError, getRequestIp } from "@/lib/api";
import { encryptText } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { generateServerCode } from "@/lib/server-code";
import { writeAuditLog } from "@/lib/audit";

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
    for (const row of rows) {
      const region = row["地区"] ?? "北京";
      const publicIp = row["公网IP地址"];
      if (!publicIp) continue;
      const existing = await prisma.server.findUnique({ where: { publicIp } });
      const serverCode = existing?.serverCode ?? (await generateServerCode(region));
      const server = await prisma.server.upsert({
        where: { publicIp },
        update: {
          accountId: String(row["账号ID"] ?? ""),
          loginEmail: String(row["登录邮箱"] ?? ""),
          loginEmailPassword: encryptText(String(row["密码"] ?? "")),
          region,
          serverUsername: String(row["服务器账号"] ?? "ubuntu"),
          serverPassword: encryptText(String(row["服务器密码"] ?? "")),
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
          serverUsername: String(row["服务器账号"] ?? "ubuntu"),
          serverPassword: encryptText(String(row["服务器密码"] ?? "")),
          purpose: "Excel 导入服务器",
          currentOwnerId: owner?.id,
        },
      });
      imported.push(server);
    }

    await writeAuditLog({
      userId: user.id,
      action: "IMPORT_SERVERS",
      module: "server",
      ipAddress: getRequestIp(request),
      detail: { count: imported.length, fileName: file.name },
    });

    return NextResponse.json({ count: imported.length, imported });
  } catch (error) {
    return apiError(error);
  }
}

import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, signToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { getRequestIp } from "@/lib/api";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const user = await prisma.user.findUnique({
    where: { email: body.email },
    include: { role: true },
  });
  if (!user) {
    return NextResponse.json({ message: "账号不存在" }, { status: 400 });
  }

  const valid = await bcrypt.compare(body.password, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ message: "密码错误" }, { status: 400 });
  }

  const token = await signToken({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role.code,
  });

  const response = NextResponse.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role.code,
  });

  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  await writeAuditLog({
    userId: user.id,
    action: "LOGIN",
    module: "auth",
    targetId: user.id,
    ipAddress: getRequestIp(request),
    detail: { email: user.email },
  });

  return response;
}

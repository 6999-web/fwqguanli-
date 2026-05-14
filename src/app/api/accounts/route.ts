import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { sanitizeServer } from "@/lib/api-serializers";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

export async function GET() {
  try {
    const user = await requirePermission("account:request");
    if (user.role.code !== "ADMIN") {
      return NextResponse.json({ message: "Host account inventory is admin-only" }, { status: 403 });
    }

    const accounts = await prisma.serverAccount.findMany({
      include: { server: true },
      orderBy: [{ serverId: "asc" }, { username: "asc" }],
    });

    return NextResponse.json({
      accounts: accounts.map((account) => ({
        ...account,
        passwordEncrypted: "******",
        server: sanitizeServer(account.server, user.role.code),
      })),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST() {
  return NextResponse.json(
    { message: "Host SSH account provisioning has been retired. Use workspace requests instead." },
    { status: 410 },
  );
}

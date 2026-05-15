import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      ok: true,
      service: "opencode-ops",
      database: "ok",
      at: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        service: "opencode-ops",
        database: "error",
        message: error instanceof Error ? error.message : "unknown health error",
      },
      { status: 503 },
    );
  }
}

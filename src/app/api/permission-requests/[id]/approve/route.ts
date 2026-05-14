import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { message: "Legacy permission approval endpoint has been retired. Use /api/approvals/:id/decide instead." },
    { status: 410 },
  );
}

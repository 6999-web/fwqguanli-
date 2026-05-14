import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({
    message: "Use `npm run db:init` to initialize database and import the 6 server records.",
  });
}

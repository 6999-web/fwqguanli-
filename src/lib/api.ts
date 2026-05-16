import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export async function withApiAuth() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  return user;
}

export function getRequestIp(request: NextRequest) {
  return request.headers.get("x-forwarded-for") ?? "local";
}

export function apiError(error: unknown) {
  if (error instanceof Error) {
    if (error.message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    if (error.message === "FORBIDDEN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }
    if (error.message === "Approval not found" || error.message === "Workspace request not found" || error.message === "Port request not found") {
      return NextResponse.json({ message: error.message }, { status: 404 });
    }
    if (error.message === "Approval already processed") {
      return NextResponse.json({ message: error.message }, { status: 409 });
    }
    return NextResponse.json({ message: error.message }, { status: 400 });
  }
  return NextResponse.json({ message: "Unknown error" }, { status: 500 });
}

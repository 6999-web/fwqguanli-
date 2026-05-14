import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const COOKIE_NAME = "opencode_ops_token";

const roleRules: Array<{ prefix: string; roles: string[] }> = [
  { prefix: "/approvals", roles: ["USER"] },
  { prefix: "/accounts", roles: ["ADMIN", "USER"] },
  { prefix: "/approval-center", roles: ["ADMIN", "OPS"] },
  { prefix: "/handovers", roles: ["ADMIN", "OPS"] },
  { prefix: "/servers", roles: ["ADMIN", "OPS"] },
  { prefix: "/ports", roles: ["ADMIN", "OPS", "USER"] },
  { prefix: "/guide", roles: ["USER"] },
  { prefix: "/alerts", roles: ["ADMIN", "OPS"] },
  { prefix: "/inspections", roles: ["ADMIN", "OPS"] },
  { prefix: "/assistant", roles: ["ADMIN", "OPS"] },
  { prefix: "/audit-logs", roles: ["ADMIN"] },
];

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is required");
  }
  return new TextEncoder().encode(secret);
}

async function getSession(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as { role?: string };
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/api/auth/login") ||
    pathname.startsWith("/api/auth/logout")
  ) {
    return NextResponse.next();
  }

  const session = await getSession(request);

  if (pathname === "/login") {
    if (!session) {
      return NextResponse.next();
    }
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const matchedRule = roleRules.find((rule) => pathname === rule.prefix || pathname.startsWith(`${rule.prefix}/`));
  if (matchedRule && !matchedRule.roles.includes(session.role ?? "")) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

import { cookies } from "next/headers";
import { jwtVerify, SignJWT } from "jose";
import { prisma } from "@/lib/prisma";

export const COOKIE_NAME = "opencode_ops_token";

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is required");
  return new TextEncoder().encode(secret);
}

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "OPS" | "USER";
};

export async function signToken(user: SessionUser) {
  return new SignJWT(user)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());
}

export async function verifyToken(token: string) {
  const { payload } = await jwtVerify(token, getSecret());
  return payload as unknown as SessionUser;
}

export async function getSessionUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    return await verifyToken(token);
  } catch {
    return null;
  }
}

export async function getCurrentUser() {
  const session = await getSessionUser();
  if (!session) return null;
  return prisma.user.findUnique({
    where: { id: session.id },
    include: { role: true },
  });
}

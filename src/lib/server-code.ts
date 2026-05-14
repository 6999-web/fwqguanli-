import { prisma } from "@/lib/prisma";

const REGION_CODE_MAP: Record<string, string> = {
  北京: "BJ",
  上海: "SH",
  广州: "GZ",
  深圳: "SZ",
  香港: "HK",
  新加坡: "SG",
};

export async function generateServerCode(region: string) {
  const prefix = REGION_CODE_MAP[region] ?? region.slice(0, 2).toUpperCase();
  const count = await prisma.server.count({ where: { region } });
  return `SRV-${prefix}-${String(count + 1).padStart(3, "0")}`;
}

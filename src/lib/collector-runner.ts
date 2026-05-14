import { collectAllServers } from "@/lib/collector";

type CollectorRunResult = {
  ok: boolean;
  fulfilled: number;
  rejected: number;
  startedAt: string;
  finishedAt: string;
};

let activeRun: Promise<CollectorRunResult> | null = null;

export function triggerCollectorRun() {
  if (activeRun) {
    return activeRun;
  }

  const startedAt = new Date().toISOString();
  activeRun = collectAllServers()
    .then((results) => ({
      ok: results.some((item) => item.status === "fulfilled"),
      fulfilled: results.filter((item) => item.status === "fulfilled").length,
      rejected: results.filter((item) => item.status === "rejected").length,
      startedAt,
      finishedAt: new Date().toISOString(),
    }))
    .finally(() => {
      activeRun = null;
    });

  return activeRun;
}

export function isCollectorRunning() {
  return activeRun !== null;
}

import { PrismaClient, RequestStatus } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.SMOKE_BASE_URL || "http://127.0.0.1:3000";

async function main() {
  const noAuthMe = await fetch(`${baseUrl}/api/auth/me`);
  assertStatus(noAuthMe, 401, "Unauthenticated /api/auth/me should return 401");

  await expectLoginFailure("ops@opencode.local", "Ops123456!", 400);

  const admin = await login("admin@opencode.local", "ChangeMe123!");
  const user = await login("user@opencode.local", "User123456!");

  await checkPageStatus(admin.cookie, [
    ["/", 200],
    ["/usage-overview", 200],
    ["/servers", 200],
    ["/servers/import", 307, "/servers"],
    ["/approval-center", 200],
    ["/handovers", 200],
    ["/ports", 200],
    ["/alerts", 200],
    ["/inspections", 200],
    ["/assistant", 200],
    ["/audit-logs", 200],
    ["/accounts", 200],
    ["/approvals", 307, "/"],
  ]);

  await checkPageStatus(user.cookie, [
    ["/", 200],
    ["/usage-overview", 307, "/"],
    ["/servers", 307, "/"],
    ["/ports", 200],
    ["/accounts", 200],
    ["/approvals", 200],
    ["/guide", 200],
    ["/approval-center", 307, "/"],
    ["/alerts", 307, "/"],
    ["/assistant", 307, "/"],
    ["/audit-logs", 307, "/"],
  ]);

  await checkApis("admin", admin.cookie, [
    "/api/auth/me",
    "/api/dashboard",
    "/api/servers",
    "/api/ports",
    "/api/approvals",
    "/api/permission-requests",
    "/api/port-requests",
    "/api/alerts",
    "/api/handovers",
    "/api/workspaces",
    "/api/audit-logs",
    "/api/accounts",
    "/api/usage-overview",
  ]);

  await checkApis("user", user.cookie, [
    "/api/auth/me",
    "/api/dashboard",
    "/api/servers",
    "/api/ports",
    "/api/permission-requests",
    "/api/port-requests",
    "/api/workspaces",
  ]);

  await checkForbidden("user", user.cookie, [
    "/api/approvals",
    "/api/alerts",
    "/api/handovers",
    "/api/audit-logs",
    "/api/accounts",
    "/api/usage-overview",
  ]);

  const server = await prisma.server.findFirst({ orderBy: { createdAt: "asc" } });
  if (!server) {
    throw new Error("No server records available for smoke test");
  }

  await checkDiagnostic(admin.cookie, server.id);

  const workspaceRequest = await createWorkspaceRequest(user.cookie, server.id);
  const workspaceApproval = await findApprovalByRequestId(workspaceRequest.id, "WORKSPACE_ACCESS");
  if (!workspaceApproval) {
    throw new Error("Workspace approval was not created");
  }

  await postJson(admin.cookie, `/api/approvals/${workspaceApproval.id}/decide`, {
    approve: false,
  });

  const rejectedRequest = await prisma.permissionRequest.findUniqueOrThrow({
    where: { id: workspaceRequest.id },
  });
  if (rejectedRequest.status !== RequestStatus.REJECTED) {
    throw new Error(`Workspace request expected REJECTED, got ${rejectedRequest.status}`);
  }

  const portRequest = await createPortRequest(user.cookie, server.id);
  const portApproval = await findApprovalByRequestId(portRequest.id, "PORT_CHANGE");
  if (!portApproval) {
    throw new Error("Port approval was not created");
  }

  await postJson(admin.cookie, `/api/approvals/${portApproval.id}/decide`, {
    approve: true,
  });

  const approvedPort = await prisma.portRequest.findUniqueOrThrow({
    where: { id: portRequest.id },
  });
  if (approvedPort.status !== RequestStatus.APPROVED) {
    throw new Error(`Port request expected APPROVED, got ${approvedPort.status}`);
  }

  const opencodePlan = await postJson(admin.cookie, "/api/opencode/chat", {
    prompt: "检查磁盘使用情况并给出排查建议",
    execute: false,
  });
  if (!opencodePlan.analysis) {
    throw new Error("OpenCode analysis response is missing");
  }

  const collector = await postJson(admin.cookie, "/api/dashboard", {});
  if (!collector.ok) {
    throw new Error("Collector trigger did not return ok=true");
  }

  await logoutAndVerify(admin.cookie);

  console.log(
    JSON.stringify(
      {
        ok: true,
        checkedPageCases: 25,
        checkedApiGroups: 2,
        checkedForbiddenApis: 6,
        workspaceRequestId: workspaceRequest.id,
        portRequestId: portRequest.id,
        opencodeTaskId: opencodePlan.task?.id ?? null,
      },
      null,
      2,
    ),
  );
}

async function login(email, password) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    throw new Error(`Login failed for ${email}: ${response.status} ${await response.text()}`);
  }
  const cookie = response.headers.get("set-cookie");
  if (!cookie) {
    throw new Error(`Login for ${email} did not return a session cookie`);
  }
  return {
    cookie: cookie.split(";")[0],
    user: await response.json(),
  };
}

async function expectLoginFailure(email, password, status) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assertStatus(response, status, `Login for ${email} should fail`);
}

async function checkPageStatus(cookie, cases) {
  for (const [path, status, location] of cases) {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: { cookie },
      redirect: "manual",
    });
    assertStatus(response, status, `Page ${path} expected ${status}`);
    if (location) {
      const actual = response.headers.get("location");
      if (actual !== location) {
        throw new Error(`Page ${path} expected redirect to ${location}, got ${actual ?? "null"}`);
      }
    }
  }
}

async function checkApis(label, cookie, paths) {
  for (const path of paths) {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: { cookie },
    });
    if (!response.ok) {
      throw new Error(`${label} GET ${path} failed with ${response.status}: ${await response.text()}`);
    }
  }
}

async function checkForbidden(label, cookie, paths) {
  for (const path of paths) {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: { cookie },
    });
    if (response.status !== 403) {
      throw new Error(`${label} GET ${path} expected 403, got ${response.status}`);
    }
  }
}

async function createWorkspaceRequest(cookie, serverId) {
  return postJson(cookie, "/api/permission-requests", {
    serverId,
    purpose: `Smoke test workspace ${Date.now()}`,
    expectedDuration: "3 days",
    requiredConfig: "Node.js, Docker",
    requiredPorts: ["3000", "9229"],
    requiredEnvironments: ["NODE_ENV=development"],
    requestedCpu: 2,
    requestedMemoryMb: 2048,
    requestedDiskGb: 20,
    requestedGpu: 0,
    requestedPortCount: 10,
    note: "Automated smoke test",
  });
}

async function createPortRequest(cookie, serverId) {
  const port = 18080 + Math.floor(Math.random() * 1000);
  return postJson(cookie, "/api/port-requests", {
    serverId,
    port,
    protocol: "TCP",
    purpose: `Smoke test port ${Date.now()}`,
    action: "OPEN",
  });
}

async function findApprovalByRequestId(requestId, type) {
  return prisma.operationApproval.findFirst({
    where: {
      type,
      payload: {
        path: ["requestId"],
        equals: requestId,
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

async function logoutAndVerify(cookie) {
  const logoutResponse = await fetch(`${baseUrl}/api/auth/logout`, {
    method: "POST",
    headers: { cookie },
  });
  assertStatus(logoutResponse, 200, "Logout should return 200");
  const setCookie = logoutResponse.headers.get("set-cookie") ?? "";
  if (!setCookie.includes("opencode_ops_token=") || !setCookie.toLowerCase().includes("max-age=0")) {
    throw new Error("Logout response did not clear the session cookie");
  }
}

async function checkDiagnostic(cookie, serverId) {
  const response = await fetch(`${baseUrl}/api/servers/${serverId}/diagnose`, {
    method: "POST",
    headers: {
      cookie,
    },
  });
  if (!response.ok) {
    throw new Error(`POST /api/servers/${serverId}/diagnose failed with ${response.status}: ${await response.text()}`);
  }
  const payload = await response.json();
  if (!payload.phase || typeof payload.reason !== "string") {
    throw new Error("Server diagnostic payload is incomplete");
  }
}

async function postJson(cookie, path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`POST ${path} failed with ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

function assertStatus(response, expected, message) {
  if (response.status !== expected) {
    throw new Error(`${message}; got ${response.status}`);
  }
}

main()
  .catch(async (error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

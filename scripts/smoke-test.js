const { PrismaClient, RequestStatus } = require("@prisma/client");

const prisma = new PrismaClient();
const baseUrl = process.env.SMOKE_BASE_URL || "http://localhost:3000";

async function main() {
  const admin = await login("admin@opencode.local", "ChangeMe123!");
  const ops = await login("ops@opencode.local", "Ops123456!");
  const user = await login("user@opencode.local", "User123456!");

  await checkPages(admin.cookie, [
    "/",
    "/servers",
    "/approvals",
    "/approval-center",
    "/accounts",
    "/ports",
    "/alerts",
    "/assistant",
    "/audit-logs",
  ]);

  await checkPages(ops.cookie, [
    "/",
    "/servers",
    "/approval-center",
    "/alerts",
    "/assistant",
  ]);

  await checkPages(user.cookie, [
    "/",
    "/servers",
    "/approvals",
    "/accounts",
    "/ports",
  ]);

  await checkApis("admin", admin.cookie, [
    "/api/auth/me",
    "/api/dashboard",
    "/api/servers",
    "/api/approvals",
    "/api/permission-requests",
    "/api/port-requests",
    "/api/alerts",
    "/api/handovers",
    "/api/workspaces",
    "/api/audit-logs",
    "/api/accounts",
  ]);

  await checkApis("ops", ops.cookie, [
    "/api/auth/me",
    "/api/dashboard",
    "/api/servers",
    "/api/approvals",
    "/api/permission-requests",
    "/api/port-requests",
    "/api/workspaces",
  ]);

  await checkApis("user", user.cookie, [
    "/api/auth/me",
    "/api/dashboard",
    "/api/servers",
    "/api/permission-requests",
    "/api/port-requests",
    "/api/workspaces",
  ]);

  await checkForbidden("user", user.cookie, [
    "/api/approvals",
    "/api/accounts",
    "/api/audit-logs",
  ]);

  const server = await prisma.server.findFirst({ orderBy: { createdAt: "asc" } });
  if (!server) {
    throw new Error("No server records available for smoke test");
  }

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

  const opencodePlan = await postJson(ops.cookie, "/api/opencode/chat", {
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

  console.log(
    JSON.stringify(
      {
        ok: true,
        checkedPages: 19,
        checkedApiGroups: 3,
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

async function checkPages(cookie, paths) {
  for (const path of paths) {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: { cookie },
      redirect: "manual",
    });
    if (response.status !== 200) {
      throw new Error(`Page ${path} expected 200, got ${response.status}`);
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
  return postJson(cookie, "/api/port-requests", {
    serverId,
    port: 18080,
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

main()
  .catch(async (error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

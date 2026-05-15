# System Audit

## P0

- Server connectivity failures were previously collapsed into a single collector error, which made root-cause triage impossible. Fixed by adding `/api/servers/[id]/diagnose`, phase-aware diagnostics, and structured alert detail.
- Successful collection previously forced `Server.status=IN_USE` even when the machine was simply reachable but idle. Fixed by reconciling server usage status from workspace, handover, and owner assignment state.

## P1

- The admin dashboard mixed real-time monitoring with governance responsibilities. Fixed by adding admin-only `/usage-overview` and `/api/usage-overview`.
- Server list/detail views did not expose the latest connectivity phase, which made the six broken servers look identical. Fixed by surfacing parsed connectivity issue data in list/detail views.
- Manual collection failures returned only a generic error response. Fixed by returning a diagnostic payload when collection fails.

## P2

- Several legacy pages still contain mojibake text. This is not a runtime blocker, but it hurts trust and readability. Recommended next step: normalize the affected page/component files to UTF-8 and refresh labels end to end.
- The six production servers still require real SSH ports or cloud-console/security-group access to be truly repaired. The application can now identify the failure phase, but it cannot open remote SSH access by itself.

## Regression Focus

- Login/logout/session routing
- Admin vs user page and API permissions
- Server collection, diagnostics, and status reconciliation
- Workspace approval to handover chain
- Port approval vs firewall-rule ledger consistency
- Usage overview ownership, idle, and anomaly classifications

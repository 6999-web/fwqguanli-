# Deployment Guide

## 1. Runtime requirements

- Docker Desktop / Docker Engine with Compose
- Or: Node.js 20+ and PostgreSQL 16+
- Public inbound access to the application port
- Outbound network access from the application host to managed servers on their real SSH ports

## 2. Production environment file

1. Copy `.env.production.example` to `.env.production`
2. Fill in real secrets:
   - `JWT_SECRET`
   - `APP_ENCRYPTION_KEY`
   - `DEFAULT_ADMIN_EMAIL`
   - `DEFAULT_ADMIN_PASSWORD`
3. Confirm the production `DATABASE_URL`

## 3. Docker deployment

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec app npx prisma db push
docker compose -f docker-compose.prod.yml exec app npm run db:seed
```

## 4. Health check

```bash
curl http://127.0.0.1:3000/api/health
```

Expected response:

```json
{"ok":true,"service":"opencode-ops","database":"ok"}
```

## 5. Post-deploy verification

- `npm run lint`
- `npm run build`
- `/api/health` returns `200`
- Login with admin account succeeds
- `/usage-overview` is visible only to `ADMIN`
- `/api/servers/:id/diagnose` returns a phase result

## 6. Real connectivity prerequisites for the 6 servers

The current workbook lists 6 public IPs, but no confirmed SSH port field. From the current network position, common SSH ports were not reachable. Before production use, confirm for each server:

- Real SSH port
- Security-group inbound rule
- Host firewall rule
- `sshd` service running on the target machine
- Correct login credential or SSH private key

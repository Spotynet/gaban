# Gaban — Setup & Use Guide

Vite frontend + FastAPI POS. Jay-style Compose pattern.  
Company playbook: [`../setup.md`](../setup.md).

## Architecture (shared EC2)

```text
Browser → host nginx :443
  → 127.0.0.1:3023 (project nginx)
       ├─ /        → frontend:3014 (Vite)
       └─ /api/    → backend:3015 (FastAPI)
```

| | Value |
|--|--------|
| Gateway | `127.0.0.1:3023` |
| Internal | Vite `3014`, API `3015` |
| Dev domain | `gaban-dev.spotynet.com` (set in `dev.sh`) |
| DB | RDS via root `.env` (`DATABASE_URL`) — no compose Postgres on shared EC2 |

## One-time on this machine

1. Root `.env` with `DATABASE_URL`, `JWT_SECRET`, `MASTER_*`, `CORS_ORIGINS`
2. **Host nginx:** `sudo ./deploy/apply-nginx.sh`
3. **Start:** `./dev.sh`

## Day-to-day

```bash
./dev.sh
docker compose -f compose.yaml logs -f
docker compose -f compose.yaml down
```

URL: `https://gaban-dev.spotynet.com/`

## Production (dedicated machine)

```bash
./deploy.sh                      # default: gaban.spotynet.com on :80
./deploy.sh gaban.example.com
./deploy.sh down
```

Legacy `docker-compose.yml` (+ local Postgres) remains for standalone laptop demos; shared EC2 uses `compose.yaml` + RDS.

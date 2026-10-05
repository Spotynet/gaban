#!/usr/bin/env bash
# Gaban DEVELOPMENT — shared EC2 (project nginx on 127.0.0.1:3023).
#
# Once: sudo ./deploy/apply-nginx.sh
# Day-to-day: ./dev.sh
# Prod (dedicated): ./deploy.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

# === Dev domains (committed) ===
GABAN_WEB_HOST="gaban-dev.spotynet.com"

export GABAN_WEB_HOST
export CORS_ORIGINS="${CORS_ORIGINS:-https://${GABAN_WEB_HOST},http://localhost:3014,http://127.0.0.1:3014}"
export VITE_API_PROXY="${VITE_API_PROXY:-http://backend:3015}"

compose() {
  if docker info >/dev/null 2>&1; then
    docker compose "$@"
  elif sudo -n docker info >/dev/null 2>&1; then
    sudo docker compose "$@"
  else
    echo "Docker needs privileges. Prefer: sudo usermod -aG docker \$USER && newgrp docker" >&2
    sudo docker compose "$@"
  fi
}

if [[ ! -f .env ]]; then
  echo "Missing .env (copy from .env.example and set DATABASE_URL, JWT_SECRET, …)" >&2
  exit 1
fi

echo "Cleaning old Gaban PM2 processes (if any)..."
pm2 delete gaban-api-dev 2>/dev/null || true
pm2 delete gaban-dev 2>/dev/null || true
pm2 save 2>/dev/null || true

echo "Starting Gaban DEV (compose.yaml → 127.0.0.1:3023)..."
echo "  web: ${GABAN_WEB_HOST}"
compose -f compose.yaml up -d --build
echo
compose -f compose.yaml ps
echo
echo "DEV URL: https://${GABAN_WEB_HOST}/"
echo
echo "Logs: docker compose -f compose.yaml logs -f"
echo "Stop: docker compose -f compose.yaml down"
echo
echo "If host nginx still points at 3014:"
echo "  sudo ./deploy/apply-nginx.sh"

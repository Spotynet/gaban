#!/usr/bin/env bash
# Gaban PRODUCTION — dedicated machine (project nginx on host :80).
#
# After merge to main: ./deploy.sh
# Optional: ./deploy.sh gaban.example.com
# Do NOT run on the shared Spotynet multi-app EC2.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

# === Production domains (edit once) ===
GABAN_WEB_HOST="gaban.spotynet.com"

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

if [[ "${1:-}" == "down" ]]; then
  echo "Stopping Gaban PRODUCTION..."
  compose -f compose.yaml -f compose.prod.yaml down
  exit 0
fi

if [[ $# -ge 1 ]]; then
  GABAN_WEB_HOST="$1"
fi

export GABAN_WEB_HOST
export CORS_ORIGINS="${CORS_ORIGINS:-https://${GABAN_WEB_HOST}}"
export VITE_API_PROXY="${VITE_API_PROXY:-http://backend:3015}"

if [[ ! -f .env ]]; then
  echo "Missing .env" >&2
  exit 1
fi

echo "Pulling latest from git..."
git pull --ff-only

echo "Deploying Gaban PRODUCTION → :80..."
echo "  web: ${GABAN_WEB_HOST}"
compose -f compose.yaml -f compose.prod.yaml up -d --build
echo
compose -f compose.yaml -f compose.prod.yaml ps
echo
echo "Stop: ./deploy.sh down"

#!/usr/bin/env bash
# Adds gaban-dev.spotynet.com → 127.0.0.1:3014 (Vite dev, /api proxied to 3015)
# to host nginx, tests, reloads.
# Usage: sudo ./deploy/setup-nginx-gaban.sh
set -euo pipefail

CONF=/etc/nginx/sites-available/spotynet-dev.conf
BAK="${CONF}.bak.$(date +%F-%H%M%S)"

if [[ $EUID -ne 0 ]]; then
  echo "Run with sudo: sudo $0" >&2
  exit 1
fi

cp -a "$CONF" "$BAK"
echo "Backup: $BAK"

if grep -q 'server_name gaban-dev.spotynet.com' "$CONF"; then
  echo "gaban-dev block already present — skipping insert"
else
  python3 - "$CONF" <<'PY'
import sys

path = sys.argv[1]
block = """
# =========================
# GABAN
# =========================

# Gaban frontend (Vite dev on 3014, /api proxied to backend 3015 via vite.config.js)
server {
    server_name gaban-dev.spotynet.com;

    location / {
        proxy_pass http://127.0.0.1:3014;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    listen 80;
    listen [::]:80;
}
"""

text = open(path).read()
marker = "if ($host ="
idx = text.find(marker)
if idx < 0:
    text = text.rstrip() + "\n" + block
    print("Appended gaban-dev block at end of file")
else:
    start = text.rfind("server {", 0, idx)
    if start < 0:
        start = idx
    text = text[:start] + block.lstrip("\n") + "\n" + text[start:]
    print("Inserted gaban-dev block before first Certbot HTTP redirect block")
open(path, "w").write(text)
PY
fi

nginx -t
systemctl reload nginx
echo "nginx reloaded OK"
echo
echo "Next (DNS A record already exists):"
echo "  sudo certbot --nginx -d gaban-dev.spotynet.com --redirect"
echo "Then verify:"
echo "  curl -sk http://gaban-dev.spotynet.com/ | grep -oi '<title>.*</title>'   # expect GabAn POS"
echo "  curl -sk https://gaban-dev.spotynet.com/ | grep -oi '<title>.*</title>'  # expect GabAn POS"

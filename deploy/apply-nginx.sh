#!/usr/bin/env bash
# Point Gaban host-nginx vhost at project Compose nginx gateway (3023).
# Usage: sudo ./deploy/apply-nginx.sh
set -euo pipefail

CONF=/etc/nginx/sites-available/spotynet-dev.conf
BAK="${CONF}.bak.$(date +%F-%H%M%S)"
GATEWAY=3023

if [[ $EUID -ne 0 ]]; then
  echo "Run with sudo: sudo $0" >&2
  exit 1
fi

cp -a "$CONF" "$BAK"
echo "Backup: $BAK"

python3 - "$CONF" "$GATEWAY" <<'PY'
import re
import sys

path, gateway = sys.argv[1], sys.argv[2]
text = open(path, encoding="utf-8").read()

def patch_server(text: str, server_name: str, new_port: str) -> str:
    pattern = re.compile(
        rf"(server_name\s+{re.escape(server_name)}\s*;.*?proxy_pass\s+http://127\.0\.0\.1:)\d+(\s*;)",
        re.DOTALL,
    )
    new_text, n = pattern.subn(rf"\g<1>{new_port}\2", text, count=1)
    if n != 1:
        raise SystemExit(f"Expected 1 proxy_pass for {server_name}, found {n}")
    return new_text

text = patch_server(text, "gaban-dev.spotynet.com", gateway)
open(path, "w", encoding="utf-8").write(text)
print(f"Updated gaban-dev.spotynet.com proxy_pass → 127.0.0.1:{gateway}")
PY

nginx -t
systemctl reload nginx
echo "nginx reloaded OK"

SETUP=/home/spotynet/projects/apps/setup.txt
if [[ -f "$SETUP" ]]; then
  echo "==> Updating setup.txt GABAN section"
  cp -a "$SETUP" "${SETUP}.bak.$(date +%F-%H%M%S)"
  python3 - "$SETUP" <<'PY'
from pathlib import Path
import re
import sys
path = Path(sys.argv[1])
text = path.read_text(encoding="utf-8")
new = """GABAN (Docker Compose — per-project nginx)
- Start: cd /home/spotynet/projects/apps/gaban && ./dev.sh
- Project nginx gateway: 127.0.0.1:3023
- Frontend Vite (internal): 3014 — gaban-dev.spotynet.com
- API FastAPI (internal): 3015 — path /api/ via project nginx
- Host nginx proxies gaban-dev.spotynet.com to http://127.0.0.1:3023
- Apply host nginx: sudo ./deploy/apply-nginx.sh
"""
pat = re.compile(r"GABAN\n(?:- .+\n)+")
pat2 = re.compile(r"GABAN \(Docker Compose — per-project nginx\)\n(?:- .+\n)+")
if pat2.search(text):
    text2, n = pat2.subn(new + "\n", text, count=1)
elif pat.search(text):
    text2, n = pat.subn(new + "\n", text, count=1)
else:
    n = 0
    text2 = text
if n:
    path.write_text(text2, encoding="utf-8")
    print("Updated setup.txt GABAN section")
else:
    print("Warning: setup.txt GABAN section not replaced")
PY
fi

echo
echo "Verify:"
echo "  curl -sI -H 'Host: gaban-dev.spotynet.com' http://127.0.0.1:3023/ | head -5"
echo "  curl -s -H 'Host: gaban-dev.spotynet.com' http://127.0.0.1:3023/api/health"

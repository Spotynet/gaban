#!/usr/bin/env bash
# ============================================================
# GabAn — arranque en una instancia EC2 (Ubuntu 22.04 / Amazon Linux 2023)
# Uso:
#   chmod +x deploy.sh && ./deploy.sh
# ============================================================
set -e

echo "==> Instalando Docker y Git (si faltan)…"
if ! command -v docker >/dev/null 2>&1; then
  if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update
    sudo apt-get install -y docker.io docker-compose-plugin git
  else
    sudo yum install -y docker git
    sudo systemctl enable --now docker
  fi
  sudo usermod -aG docker "$USER" || true
  echo "!! Docker instalado. Cierra y reabre la sesión SSH (o ejecuta 'newgrp docker') y vuelve a correr este script."
fi

echo "==> Preparando variables de entorno…"
if [ ! -f .env ]; then
  cp .env.example .env
  echo "!! Se creó .env desde la plantilla. EDÍTALO con secretos reales antes de continuar:"
  echo "   nano .env   (define JWT_SECRET, DB_PASSWORD, MASTER_PASSWORD)"
  read -p "¿Continuar con el despliegue ahora? [y/N] " ans
  [ "$ans" = "y" ] || { echo "Edita .env y vuelve a ejecutar ./deploy.sh"; exit 0; }
fi

echo "==> Construyendo y levantando GabAn (modo producción)…"
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

echo ""
echo "==> Listo. GabAn está corriendo."
echo "   App:  http://$(curl -s ifconfig.me 2>/dev/null || echo '<IP-de-EC2>')/"
echo "   Login master: el correo/clave definidos en .env (MASTER_EMAIL / MASTER_PASSWORD)"
echo ""
echo "Comandos útiles:"
echo "   docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f backend"
echo "   docker compose -f docker-compose.yml -f docker-compose.prod.yml ps"
echo "   docker compose -f docker-compose.yml -f docker-compose.prod.yml down"

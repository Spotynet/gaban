# Guía de despliegue

## A. Pruebas en localhost (lo más rápido)

Requisito único: **Docker Desktop** instalado.

```bash
cd gaban-pos
cp .env.example .env         # (Windows: copy .env.example .env) y edita si quieres
docker compose up --build
```

Esto levanta 3 contenedores: PostgreSQL, backend (FastAPI) y frontend (Nginx).
Al arrancar, el backend crea automáticamente el schema global y el usuario **master**.

Accede a:
- Frontend / app: **http://localhost**
- API + documentación interactiva: **http://localhost:8000/docs**
- Login master: `master@gaban.pos` / `master123` (o lo que pusiste en `.env`)

### Primer flujo de prueba
1. Entra a `http://localhost:8000/docs`, autentícate con el master en `/api/auth/login`.
2. Crea un tenant con `POST /api/admin/tenants` (define slug, moneda, email/clave del admin del tenant). Esto crea automáticamente su schema `tenant_<slug>`.
3. Crea una sucursal con `POST /api/admin/branches`.
4. Cierra sesión y entra con el **admin del tenant** para usar Productos, Ventas, Compras e Inventarios.

### Desarrollo sin Docker (hot reload)
```bash
# Backend
cd backend && python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
export DATABASE_URL=postgresql+psycopg2://pos:pos@localhost:5432/gabanpos
python -m app.seed
uvicorn app.main:app --reload

# Frontend (otra terminal)
cd frontend && npm install && npm run dev   # http://localhost:5173
```
(Necesitas un PostgreSQL local o `docker compose up db`.)

---

## B. Despliegue en AWS EC2

### 1. Crear la instancia
- Tipo: **t3.small** o superior (mín. 2 GB RAM para compilar el frontend). AMI: Ubuntu 22.04 o Amazon Linux 2023.
- **Security Group**: abre puertos **22** (SSH), **80** (HTTP) y **443** (HTTPS). No expongas 5432 ni 8000 al público.
- Asigna una IP elástica y, si tienes dominio, apúntalo a esa IP.

### 2. Instalar Docker en la instancia
```bash
sudo apt update && sudo apt install -y docker.io docker-compose-plugin git
sudo usermod -aG docker $USER && newgrp docker
```

### 3. Subir el código y levantar

Opción rápida (script incluido):
```bash
git clone <tu-repo> gaban-pos   # o sube el ZIP con scp
cd gaban-pos
chmod +x deploy.sh && ./deploy.sh   # instala Docker, crea .env y levanta en modo producción
```

Opción manual (modo producción):
```bash
cd gaban-pos
cp .env.example .env
nano .env       # PON un JWT_SECRET fuerte y contraseñas reales
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```
La app queda en `http://<IP-de-EC2>`. En **producción** solo se publica el puerto **80** (frontend + proxy `/api`); la base de datos y el backend quedan aislados dentro de la red de Docker, y los servicios reinician solos (`restart: always`).

> Para pruebas en tu máquina usa el compose base (`docker compose up --build`), que sí publica 8000 y 5432 para depurar.

### 4. HTTPS (recomendado para producción)
Coloca la instancia detrás de:
- **Opción simple**: Certbot + Nginx en el host, o
- **Opción gestionada**: un **Application Load Balancer (ALB)** con certificado de **AWS Certificate Manager (ACM)** que enruta al puerto 80 del contenedor frontend.

### 5. Buenas prácticas de producción
- **Base de datos**: en producción usa **Amazon RDS for PostgreSQL** en lugar del contenedor `db`. Solo cambia `DATABASE_URL` en `.env` y elimina el servicio `db` del compose. RDS te da backups, alta disponibilidad y parches automáticos.
- **Secretos**: guarda `JWT_SECRET` y contraseñas en **AWS SSM Parameter Store** o **Secrets Manager**, no en el `.env` del servidor.
- **Backups**: snapshots automáticos de RDS (o `pg_dump` programado si usas el contenedor).
- **Logs/monitoreo**: envía logs a CloudWatch; configura alarmas de CPU/RAM.
- **Actualizaciones**: `git pull && docker compose up --build -d`.
- **Escalado**: cuando crezca, separa frontend (S3 + CloudFront), backend (ECS/Fargate o varias EC2 tras el ALB) y RDS.

### Comandos útiles
```bash
docker compose logs -f backend     # ver logs del backend
docker compose ps                  # estado de contenedores
docker compose down                # detener (los datos persisten en el volumen pgdata)
docker compose down -v             # detener y BORRAR datos
```

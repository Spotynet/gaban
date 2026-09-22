# GabAn POS

Sistema de punto de venta **multi-tenant**, **multi-sucursal** y **multi-moneda** (COP, MXN, USD) en la nube, con módulos integrados de **Ventas, Compras, Productos e Inventarios**.

Stack: **FastAPI (Python) + React (Vite) + PostgreSQL**, contenerizado con **Docker**.

> Estado: esta entrega es **arquitectura + esquema de datos completo + scaffold funcional con stubs**. Arranca en localhost y en EC2; la lógica de negocio núcleo (login multi-tenant, alta de tenants/sucursales, productos con EAN, ventas que descuentan inventario, compras que ingresan inventario, kardex y reabastecimiento) está implementada. Faltan reportes, impresión y facturación electrónica por país.

## Arranque rápido (localhost)

```bash
cp .env.example .env
docker compose up --build
```
- App: http://localhost
- API docs: http://localhost:8000/docs
- Master: `master@gaban.pos` / `master123`

Detalle completo y despliegue en AWS EC2: ver [`docs/DESPLIEGUE_EC2.md`](docs/DESPLIEGUE_EC2.md).
Arquitectura y modelo de datos: ver [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md).

## Estructura

```
gaban-pos/
├── docs/          ARQUITECTURA.md · DESPLIEGUE_EC2.md
├── docker-compose.yml · .env.example
├── backend/       FastAPI (app/core, models, api/routers, services) + sql/
└── frontend/      React + Vite (páginas por módulo)
```

## Pruebas

```bash
cd backend
pip install -r requirements-dev.txt   # incluye pgserver (Postgres embebido)
python -m pytest                      # unitarias + integración + QA funcional
```

- **Unitarias** (sin BD): seguridad/JWT, validación contable, auditoría, exportadores y contrato de la API.
- **Integración y QA** (`tests/integration/`): levantan un PostgreSQL real en memoria con `pgserver` y ejercen flujos completos: venta→inventario→kardex, compra→recepción→cuentas por pagar, traslados entre sucursales, idempotencia offline, validaciones (stock insuficiente, pago corto, asiento descuadrado), permisos (master vs tenant), alertas y auditoría. Si `pgserver` no está instalado, las de integración se saltan automáticamente.

## Multi-tenant
Un **schema PostgreSQL por tenant** (`tenant_<slug>`). El schema `public` guarda tenants, sucursales, usuarios, roles y monedas. Cada request fija `search_path` al schema del usuario según su JWT.

## Roles
`MASTER_ADMIN` (todo el sistema) · `TENANT_ADMIN` (una empresa) · roles por módulo (`SALES`, `PURCHASES`, `INVENTORY`, `PRODUCTS`) definibles por scopes.

## Integración 360
Ventas y Compras mueven inventario a través de un único servicio (`services/inventory.py`) que además escribe el **kardex** inmutable, de modo que stock, movimientos y cuentas siempre cuadran.

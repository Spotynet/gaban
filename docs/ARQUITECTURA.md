# Arquitectura — Sistema POS multi-tenant (GabAn POS)

## 1. Resumen

Sistema de punto de venta en la nube, **multi-tenant** (varias empresas), con **varias sucursales por tenant**, **multi-moneda** (COP, MXN, USD) y cuatro módulos integrados 360°: Ventas, Compras, Productos e Inventarios.

| Capa | Tecnología | Motivo |
|------|-----------|--------|
| Backend / API | **Python 3.12 + FastAPI** | Async, rápido, documentación OpenAPI automática (`/docs`) |
| ORM / migraciones | SQLAlchemy 2.0 + Alembic | Estándar maduro, soporta multi-schema |
| Base de datos | **PostgreSQL 16** | Soporta múltiples *schemas* nativamente (clave para el multi-tenant) |
| Autenticación | JWT (OAuth2 password flow) + bcrypt | Sin estado, escalable horizontalmente |
| Frontend | **React 18 + Vite** | SPA moderna, build rápido |
| Estilos | TailwindCSS | Productividad de UI |
| Contenedores | Docker + Docker Compose | Igual en local y en EC2 |
| Reverse proxy | Nginx | TLS, sirve frontend estático, enruta `/api` |
| Cache/colas (futuro) | Redis / Celery | Reabastecimiento, reportes pesados, tareas async |

## 2. Estrategia multi-tenant: **un esquema (schema) por tenant**

Elegida según tu preferencia. Un solo servidor PostgreSQL con:

- **Schema `public` (global):** tablas compartidas — `tenants`, `branches` (sucursales), `users`, `roles`, `currencies`, `exchange_rates`. Aquí vive el **Administrador master**.
- **Un schema por cada tenant** (ej. `tenant_acme`, `tenant_zapatos_sur`): réplica de la misma plantilla de tablas de negocio (productos, inventario, ventas, compras…). Los datos de un tenant quedan **físicamente aislados** de los demás.

```
PostgreSQL
├── public            → tenants, branches, users, roles, currencies, exchange_rates
├── tenant_acme       → products, product_variants, inventory, kardex, sales, ...
├── tenant_zapatos    → products, product_variants, inventory, kardex, sales, ...
└── tenant_...        → (se crea automáticamente al dar de alta un tenant)
```

### ¿Cómo se resuelve el schema en cada request?

1. El usuario inicia sesión → recibe un **JWT** que incluye `tenant_id`, `schema`, `role` y `branch_id`.
2. Un **middleware de tenancy** lee el JWT (o el header `X-Tenant`) en cada petición y ejecuta:
   ```sql
   SET search_path TO tenant_acme, public;
   ```
   sobre la conexión de esa request. A partir de ahí, todas las consultas del ORM operan sobre el schema correcto sin cambiar el código de los módulos.
3. El **Administrador master** no tiene schema de negocio: opera solo sobre `public` para crear/gestionar tenants y sucursales.

### Alta de un nuevo tenant (aprovisionamiento)

Al crear un tenant, un servicio (`services/provisioning.py`) ejecuta:
1. `CREATE SCHEMA tenant_<slug>;`
2. Crea todas las tablas de negocio dentro de ese schema (a partir de la plantilla `sql/01_tenant_template.sql` o metadatos de SQLAlchemy).
3. Inserta datos semilla (categorías base, tipos de producto, roles del tenant, usuario administrador del tenant).

## 3. Roles y usuarios

Los usuarios viven en `public.users` con un `tenant_id` (nulo para el master). El acceso se controla con roles + permisos por módulo.

| Rol | Alcance | Puede |
|-----|---------|-------|
| **MASTER_ADMIN** | Todo el sistema | Crear/suspender tenants, ver métricas globales, gestionar monedas y tipos de cambio |
| **TENANT_ADMIN** | Un tenant | Configurar sucursales, usuarios, permisos, catálogos y ver todos los módulos de su tenant |
| **SALES** | Un tenant / sucursal | Módulo Ventas (POS, pedidos, promociones, cobros) |
| **PURCHASES** | Un tenant | Módulo Compras (proveedores, órdenes, cuentas por pagar) |
| **INVENTORY** | Un tenant / sucursal | Módulo Inventarios (ingresos, kardex, ajustes) |
| **PRODUCTS** | Un tenant | Alta y edición de productos y variantes |

Los permisos se guardan como lista de *scopes* (`sales:read`, `sales:write`, `inventory:write`, …) en la tabla `roles`, de modo que puedes crear tipos de usuario personalizados por tenant sin tocar código. La verificación se hace con una dependencia de FastAPI (`require_scope("sales:write")`).

## 4. Multi-moneda

- `public.currencies`: catálogo (COP, MXN, USD) con símbolo y decimales.
- Cada **sucursal** tiene una `default_currency`.
- `public.exchange_rates`: tipos de cambio con fecha (`base_currency`, `quote_currency`, `rate`, `valid_from`).
- Ventas y compras guardan el importe en la **moneda de la transacción** y, opcionalmente, el equivalente en la moneda base del tenant, junto con el `exchange_rate_id` usado. Así los reportes consolidados son correctos aunque cambien las tasas.

## 5. Integración 360° entre módulos

El corazón de la integración es el **inventario y el kardex**, actualizados por eventos de todos los módulos dentro de **transacciones de base de datos**:

```
Compras  ──(recepción de orden)──►  + Inventario  ──►  Kardex (entrada)
Ventas   ──(venta / entrega)────►  - Inventario  ──►  Kardex (salida)
Ajustes  ──(ingreso/salida manual)►  ± Inventario ──►  Kardex (ajuste)
Productos──(alta de variante)───►  crea fila de stock en cada sucursal
```

- Cada movimiento de stock escribe una fila inmutable en `kardex` (fecha, tipo, cantidad, costo, saldo resultante, referencia al documento origen).
- Las cuentas por pagar (Compras) y los cobros (Ventas) se enlazan a los documentos que los originan, por lo que estados de cuenta y saldos siempre cuadran.
- La función de **reabastecimiento** compara `stock_actual` vs `stock_minimo` por variante/sucursal y sugiere órdenes de compra por proveedor preferido.

## 6. Modelo de productos flexible (por tipo)

Para que un zapato tenga "corridas de tallas" y un alimento tenga "fecha de caducidad" sin inflar una sola tabla:

- `product_types` (zapatos, ropa, alimentos, electrónicos…) define un **esquema de atributos** (JSON) esperado.
- `products` = la referencia/modelo (con `sku` único, foto, categoría, marca, tipo).
- `product_variants` = cada combinación vendible (ej. modelo + talla + color), con su **código de barras EAN‑13 único** y su propio stock. Aquí se resuelven las corridas de tallas.
- `product_attributes` (JSONB) guarda los atributos específicos del tipo (caducidad, voltaje, material…).

El EAN se lee en el POS (Ventas) y en el ingreso de inventario para identificar la variante exacta.

## 7. Estructura del repositorio

```
gaban-pos/
├── docs/                → esta documentación y guía de despliegue
├── docker-compose.yml   → levanta postgres + backend + frontend (localhost)
├── .env.example         → variables de entorno
├── backend/
│   ├── app/
│   │   ├── core/        → config, database, security (JWT), tenancy (middleware)
│   │   ├── models/      → SQLAlchemy: global_models + tenant_models
│   │   ├── schemas/     → Pydantic (validación entrada/salida)
│   │   ├── api/routers/ → auth, ventas, compras, productos, inventarios, admin
│   │   └── services/    → provisioning (alta de tenant), inventario, reabasto
│   ├── sql/             → 00_global_schema.sql, 01_tenant_template.sql
│   └── alembic/         → migraciones
├── frontend/
│   └── src/             → React (login, layout, páginas por módulo, cliente API)
└── nginx/               → configuración del reverse proxy para producción
```

## 8. Seguridad (resumen)

- Contraseñas con bcrypt; JWT firmado (HS256) con expiración corta + refresh.
- Aislamiento de datos por schema + filtro por `search_path`.
- Validación de scopes por endpoint.
- Variables sensibles solo en `.env` (no en el repo). En EC2 usar AWS SSM Parameter Store / Secrets Manager.
- HTTPS obligatorio en producción (Nginx + Let's Encrypt).

## 9. Roadmap de lo que queda por implementar

Esta entrega es **arquitectura + esquema completo + scaffold con stubs**. Para llegar a producción faltaría: lógica de negocio completa de cada endpoint, reportes, impresión de tickets/facturas, pruebas automatizadas, panel de master admin, y facturación electrónica según país (DIAN en Colombia, CFDI/SAT en México).

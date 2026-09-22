-- ============================================================
-- GabAn POS — Esquema GLOBAL (schema public)
-- Tablas compartidas por todo el sistema.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- para gen_random_uuid()

-- ---------- Monedas y tipos de cambio ----------
CREATE TABLE IF NOT EXISTS currencies (
    code        CHAR(3) PRIMARY KEY,          -- COP, MXN, USD
    name        VARCHAR(60) NOT NULL,
    symbol      VARCHAR(6)  NOT NULL,
    decimals    SMALLINT    NOT NULL DEFAULT 2
);

INSERT INTO currencies (code, name, symbol, decimals) VALUES
    ('COP', 'Peso colombiano', '$',   2),
    ('MXN', 'Peso mexicano',   '$',   2),
    ('USD', 'Dólar estadounidense', 'US$', 2)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS exchange_rates (
    id             BIGSERIAL PRIMARY KEY,
    base_currency  CHAR(3) NOT NULL REFERENCES currencies(code),
    quote_currency CHAR(3) NOT NULL REFERENCES currencies(code),
    rate           NUMERIC(18,6) NOT NULL,       -- 1 base = rate quote
    valid_from     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_rate UNIQUE (base_currency, quote_currency, valid_from)
);

-- ---------- Tenants (empresas) ----------
CREATE TABLE IF NOT EXISTS tenants (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          VARCHAR(120) NOT NULL,
    slug          VARCHAR(63)  NOT NULL UNIQUE,     -- usado para el nombre del schema: tenant_<slug>
    schema_name   VARCHAR(63)  NOT NULL UNIQUE,     -- 'tenant_<slug>'
    base_currency CHAR(3) NOT NULL REFERENCES currencies(code) DEFAULT 'USD',
    country       VARCHAR(2),                       -- CO, MX, US
    status        VARCHAR(20) NOT NULL DEFAULT 'active',  -- active | suspended
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Sucursales ----------
CREATE TABLE IF NOT EXISTS branches (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code             VARCHAR(30) NOT NULL,
    name             VARCHAR(120) NOT NULL,
    address          TEXT,
    default_currency CHAR(3) NOT NULL REFERENCES currencies(code),
    is_active        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_branch_code UNIQUE (tenant_id, code)
);

-- ---------- Roles y permisos ----------
CREATE TABLE IF NOT EXISTS roles (
    id         BIGSERIAL PRIMARY KEY,
    tenant_id  UUID REFERENCES tenants(id) ON DELETE CASCADE,  -- NULL = rol global (MASTER)
    name       VARCHAR(60) NOT NULL,          -- MASTER_ADMIN, TENANT_ADMIN, SALES, ...
    scopes     JSONB NOT NULL DEFAULT '[]',   -- ["sales:read","sales:write",...]
    CONSTRAINT uq_role UNIQUE (tenant_id, name)
);

-- Rol global del master (tenant_id NULL)
INSERT INTO roles (tenant_id, name, scopes) VALUES
    (NULL, 'MASTER_ADMIN', '["*"]')
ON CONFLICT DO NOTHING;

-- ---------- Usuarios ----------
CREATE TABLE IF NOT EXISTS users (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id      UUID REFERENCES tenants(id) ON DELETE CASCADE,  -- NULL = usuario master
    branch_id      UUID REFERENCES branches(id) ON DELETE SET NULL,
    role_id        BIGINT NOT NULL REFERENCES roles(id),
    email          VARCHAR(160) NOT NULL,
    full_name      VARCHAR(160) NOT NULL,
    password_hash  VARCHAR(255) NOT NULL,
    is_active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_user_email UNIQUE (email)
);

-- Preferencias por usuario (modo claro/oscuro, etc.) — sigue al usuario entre dispositivos
ALTER TABLE users ADD COLUMN IF NOT EXISTS prefs JSONB NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS ix_users_tenant ON users(tenant_id);
CREATE INDEX IF NOT EXISTS ix_branches_tenant ON branches(tenant_id);

-- Configuración fiscal por tenant (razón social, NIT/RFC, régimen, resolución DIAN,
-- serie CFDI, IVA por defecto, etc.). Idempotente para bases ya creadas.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS fiscal_config JSONB NOT NULL DEFAULT '{}';

-- Preferencias de apariencia por tenant (tema de color, etc.)
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS ui_config JSONB NOT NULL DEFAULT '{}';

-- Bitácora de auditoría global (solo la ve el administrador master)
CREATE TABLE IF NOT EXISTS audit_log (
    id          BIGSERIAL PRIMARY KEY,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_id     UUID,
    user_email  VARCHAR(160),
    role        VARCHAR(60),
    tenant_id   UUID,
    action      VARCHAR(120),   -- etiqueta legible (ej. "Crear venta")
    method      VARCHAR(10),
    path        TEXT,
    status_code INT,
    ip          VARCHAR(60)
);
CREATE INDEX IF NOT EXISTS ix_audit_created ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS ix_audit_tenant ON audit_log(tenant_id);

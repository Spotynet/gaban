-- ============================================================
-- GabAn POS — PLANTILLA de esquema por TENANT
-- Se ejecuta dentro del schema del tenant al aprovisionarlo:
--   CREATE SCHEMA tenant_<slug>;
--   SET search_path TO tenant_<slug>;
--   \i 01_tenant_template.sql
-- Todas las tablas de negocio viven aquí, aisladas por tenant.
-- ============================================================

-- ============ PRODUCTOS ============

-- Tipos de producto: definen qué atributos extra necesita cada categoría
CREATE TABLE product_types (
    id            BIGSERIAL PRIMARY KEY,
    name          VARCHAR(80) NOT NULL UNIQUE,   -- Zapatos, Ropa, Alimentos, Electrónicos
    -- esquema esperado de atributos (JSON Schema simplificado)
    attr_schema   JSONB NOT NULL DEFAULT '{}',   -- p.ej. {"talla":"number","color":"string"}
    has_sizes     BOOLEAN NOT NULL DEFAULT FALSE, -- TRUE para calzado/ropa (corridas de tallas)
    has_expiry    BOOLEAN NOT NULL DEFAULT FALSE  -- TRUE para alimentos
);

CREATE TABLE categories (
    id         BIGSERIAL PRIMARY KEY,
    parent_id  BIGINT REFERENCES categories(id) ON DELETE SET NULL,
    name       VARCHAR(100) NOT NULL,
    UNIQUE (parent_id, name)
);

CREATE TABLE brands (
    id          BIGSERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL UNIQUE,
    supplier_id BIGINT  -- FK added after suppliers table via ALTER below
);

CREATE TABLE colors (
    id   BIGSERIAL PRIMARY KEY,
    code VARCHAR(30)  NOT NULL UNIQUE,
    name VARCHAR(80)  NOT NULL,
    hex  VARCHAR(7)
);

CREATE TABLE sizes (
    id         BIGSERIAL PRIMARY KEY,
    code       VARCHAR(30) NOT NULL UNIQUE,
    name       VARCHAR(80) NOT NULL,
    sort_order INT NOT NULL DEFAULT 0
);

-- Cartas (grupos) de colores y tallas para asignar a productos
CREATE TABLE color_charts (
    id          BIGSERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    description TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE color_chart_items (
    chart_id    BIGINT NOT NULL REFERENCES color_charts(id) ON DELETE CASCADE,
    color_id    BIGINT NOT NULL REFERENCES colors(id) ON DELETE CASCADE,
    PRIMARY KEY (chart_id, color_id)
);

CREATE TABLE size_charts (
    id          BIGSERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    description TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE size_chart_items (
    chart_id    BIGINT NOT NULL REFERENCES size_charts(id) ON DELETE CASCADE,
    size_id     BIGINT NOT NULL REFERENCES sizes(id) ON DELETE CASCADE,
    PRIMARY KEY (chart_id, size_id)
);

CREATE TABLE units (
    id   BIGSERIAL PRIMARY KEY,
    code VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(80) NOT NULL
);

-- Producto = referencia / modelo
CREATE TABLE products (
    id              BIGSERIAL PRIMARY KEY,
    sku             VARCHAR(60) NOT NULL UNIQUE,   -- código único por referencia
    name            VARCHAR(200) NOT NULL,
    description     TEXT,
    product_type_id BIGINT NOT NULL REFERENCES product_types(id),
    category_id     BIGINT REFERENCES categories(id),
    brand_id        BIGINT REFERENCES brands(id),
    unit_id         BIGINT REFERENCES units(id) ON DELETE SET NULL,
    photo_url       TEXT,
    attributes             JSONB NOT NULL DEFAULT '{}',   -- atributos según product_type.attr_schema
    color_chart_id         BIGINT REFERENCES color_charts(id) ON DELETE SET NULL,
    size_chart_id          BIGINT REFERENCES size_charts(id)  ON DELETE SET NULL,
    is_asset               BOOLEAN NOT NULL DEFAULT TRUE,
    available_for_purchase BOOLEAN NOT NULL DEFAULT TRUE,
    available_for_sale     BOOLEAN NOT NULL DEFAULT TRUE,
    price_mode             VARCHAR(20) NOT NULL DEFAULT 'fixed',
    currency               CHAR(3) NOT NULL DEFAULT 'USD',
    product_code           VARCHAR(12) UNIQUE,  -- formato YYYY-NNNNNN, auto-generado
    is_active              BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_products_type ON products(product_type_id);
CREATE INDEX ix_products_category ON products(category_id);

-- Variante = unidad vendible (modelo+talla+color). Aquí se resuelven las corridas de tallas.
CREATE TABLE product_variants (
    id           BIGSERIAL PRIMARY KEY,
    product_id   BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    variant_sku  VARCHAR(70) NOT NULL UNIQUE,     -- ej. SKU-42-NEGRO
    ean13        VARCHAR(100) UNIQUE,             -- código de barras (EAN-13, Code 128, QR, etc.)
    size         VARCHAR(20),                     -- talla (42, M, XL...) o NULL
    color        VARCHAR(40),
    attributes   JSONB NOT NULL DEFAULT '{}',     -- caducidad, voltaje, etc.
    cost_price   NUMERIC(18,4) NOT NULL DEFAULT 0,-- costo promedio (se actualiza con compras)
    sale_price   NUMERIC(18,4) NOT NULL DEFAULT 0,
    currency     CHAR(3) NOT NULL DEFAULT 'USD',
    is_active    BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX ix_variants_product ON product_variants(product_id);
CREATE INDEX ix_variants_ean ON product_variants(ean13);

-- Secuencias de códigos de barras por prefijo (país+empresa) para garantizar unicidad
CREATE TABLE IF NOT EXISTS barcode_sequences (
    prefix      VARCHAR(20) PRIMARY KEY,  -- prefijo país+empresa, ej. "7701234"
    last_seq    INTEGER NOT NULL DEFAULT 0
);

-- ============ INVENTARIO ============

-- Stock por variante y sucursal (branch_id referencia public.branches)
CREATE TABLE inventory (
    id          BIGSERIAL PRIMARY KEY,
    variant_id  BIGINT NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    branch_id   UUID NOT NULL,                    -- FK lógica a public.branches
    quantity    NUMERIC(18,3) NOT NULL DEFAULT 0,
    min_stock   NUMERIC(18,3) NOT NULL DEFAULT 0, -- punto de reorden
    max_stock   NUMERIC(18,3),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_inventory UNIQUE (variant_id, branch_id)
);
CREATE INDEX ix_inventory_branch ON inventory(branch_id);

-- Kardex: historial inmutable de todos los movimientos de stock
CREATE TABLE kardex (
    id            BIGSERIAL PRIMARY KEY,
    variant_id    BIGINT NOT NULL REFERENCES product_variants(id),
    branch_id     UUID NOT NULL,
    movement_type VARCHAR(20) NOT NULL,   -- entrada_compra | salida_venta | ajuste_positivo | ajuste_negativo | traslado
    quantity      NUMERIC(18,3) NOT NULL, -- + entra, - sale
    unit_cost     NUMERIC(18,4),
    balance_after NUMERIC(18,3) NOT NULL, -- saldo resultante
    ref_type      VARCHAR(30),            -- 'sale' | 'purchase' | 'adjustment'
    ref_id        BIGINT,                 -- id del documento origen
    note          TEXT,
    created_by    UUID,                   -- users.id
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_kardex_variant ON kardex(variant_id, branch_id, created_at);

-- Traslados de inventario entre sucursales
CREATE TABLE inventory_transfers (
    id          BIGSERIAL PRIMARY KEY,
    variant_id  BIGINT NOT NULL REFERENCES product_variants(id),
    from_branch UUID NOT NULL,
    to_branch   UUID NOT NULL,
    quantity    NUMERIC(18,3) NOT NULL,
    note        TEXT,
    created_by  UUID,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bodegas / ubicaciones dentro de una sucursal
CREATE TABLE warehouses (
    id          BIGSERIAL PRIMARY KEY,
    branch_id   UUID NOT NULL,
    code        VARCHAR(30) NOT NULL,
    name        VARCHAR(120) NOT NULL,
    description TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (branch_id, code)
);

-- Sesiones de inventario físico (conteo)
CREATE TABLE physical_inventories (
    id           BIGSERIAL PRIMARY KEY,
    branch_id    UUID NOT NULL,
    warehouse_id BIGINT REFERENCES warehouses(id),
    name         VARCHAR(120) NOT NULL,
    status       VARCHAR(20) NOT NULL DEFAULT 'draft',
    note         TEXT,
    created_by   UUID,
    closed_by    UUID,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_at    TIMESTAMPTZ
);

-- Líneas de conteo por sesión de inventario físico
CREATE TABLE physical_inventory_lines (
    id              BIGSERIAL PRIMARY KEY,
    physical_inv_id BIGINT NOT NULL REFERENCES physical_inventories(id) ON DELETE CASCADE,
    variant_id      BIGINT NOT NULL REFERENCES product_variants(id),
    system_qty      NUMERIC(18,3) NOT NULL DEFAULT 0,
    counted_qty     NUMERIC(18,3),
    difference      NUMERIC(18,3) GENERATED ALWAYS AS (counted_qty - system_qty) STORED,
    note            TEXT,
    UNIQUE (physical_inv_id, variant_id)
);

-- ============ PROVEEDORES / COMPRAS ============

CREATE TABLE suppliers (
    id                 BIGSERIAL PRIMARY KEY,
    name               VARCHAR(160) NOT NULL,
    fiscal_person_type VARCHAR(60),
    fiscal_id_type     VARCHAR(20),
    tax_id             VARCHAR(60),
    tax_dv             VARCHAR(5),
    email              VARCHAR(160),
    phone              VARCHAR(40),
    mobile             VARCHAR(40),
    city               VARCHAR(100),
    address            TEXT,
    currency           CHAR(3) NOT NULL DEFAULT 'USD',
    is_active          BOOLEAN NOT NULL DEFAULT TRUE
);

-- Vinculación marca ↔ proveedor (definida aquí porque suppliers viene después de brands)
ALTER TABLE brands ADD CONSTRAINT fk_brands_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL;

-- Proveedor preferido por variante (para reabastecimiento)
CREATE TABLE supplier_products (
    id            BIGSERIAL PRIMARY KEY,
    supplier_id   BIGINT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    variant_id    BIGINT NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    supplier_sku  VARCHAR(80),
    last_cost     NUMERIC(18,4),
    lead_time_days SMALLINT,
    is_preferred  BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (supplier_id, variant_id)
);

CREATE TABLE purchase_orders (
    id            BIGSERIAL PRIMARY KEY,
    supplier_id   BIGINT NOT NULL REFERENCES suppliers(id),
    branch_id     UUID NOT NULL,
    status        VARCHAR(20) NOT NULL DEFAULT 'draft', -- draft | sent | partial | received | cancelled
    currency      CHAR(3) NOT NULL,
    exchange_rate NUMERIC(18,6),
    subtotal      NUMERIC(18,2) NOT NULL DEFAULT 0,
    tax           NUMERIC(18,2) NOT NULL DEFAULT 0,
    total         NUMERIC(18,2) NOT NULL DEFAULT 0,
    expected_at   DATE,
    note          TEXT,
    created_by    UUID,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE purchase_order_items (
    id            BIGSERIAL PRIMARY KEY,
    po_id         BIGINT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    variant_id    BIGINT NOT NULL REFERENCES product_variants(id),
    qty_ordered   NUMERIC(18,3) NOT NULL,
    qty_received  NUMERIC(18,3) NOT NULL DEFAULT 0,
    unit_cost     NUMERIC(18,4) NOT NULL,
    line_total    NUMERIC(18,2) NOT NULL
);

-- Facturas de proveedor / cuentas por pagar
CREATE TABLE supplier_invoices (
    id            BIGSERIAL PRIMARY KEY,
    supplier_id   BIGINT NOT NULL REFERENCES suppliers(id),
    po_id         BIGINT REFERENCES purchase_orders(id),
    invoice_no    VARCHAR(60),
    currency      CHAR(3) NOT NULL,
    total         NUMERIC(18,2) NOT NULL,
    balance       NUMERIC(18,2) NOT NULL,      -- saldo pendiente
    status        VARCHAR(20) NOT NULL DEFAULT 'open', -- open | partial | paid | overdue
    issued_at     DATE,
    due_at        DATE
);

CREATE TABLE supplier_payments (
    id            BIGSERIAL PRIMARY KEY,
    invoice_id    BIGINT NOT NULL REFERENCES supplier_invoices(id) ON DELETE CASCADE,
    amount        NUMERIC(18,2) NOT NULL,
    method        VARCHAR(20) NOT NULL,   -- efectivo | transferencia | cheque | tarjeta
    paid_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    reference     VARCHAR(80)
);

-- ============ CLIENTES / VENTAS ============

CREATE TABLE customers (
    id         BIGSERIAL PRIMARY KEY,
    name       VARCHAR(160) NOT NULL,
    tax_id     VARCHAR(40),
    email      VARCHAR(160),
    phone      VARCHAR(40),
    address    TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Promociones
CREATE TABLE promotions (
    id           BIGSERIAL PRIMARY KEY,
    name         VARCHAR(120) NOT NULL,
    type         VARCHAR(20) NOT NULL,   -- percentage | fixed | 2x1 | bundle
    value        NUMERIC(18,4),          -- % o monto
    scope        VARCHAR(20) NOT NULL DEFAULT 'all', -- all | category | product | variant
    scope_ref_id BIGINT,
    starts_at    DATE,
    ends_at      DATE,
    is_active    BOOLEAN NOT NULL DEFAULT TRUE
);

-- Venta (a cliente final o como pedido)
CREATE TABLE sales (
    id            BIGSERIAL PRIMARY KEY,
    branch_id     UUID NOT NULL,
    customer_id   BIGINT REFERENCES customers(id),
    kind          VARCHAR(15) NOT NULL DEFAULT 'sale', -- sale (POS) | order (pedido)
    status        VARCHAR(20) NOT NULL DEFAULT 'completed', -- draft|completed|pending|delivered|cancelled
    currency      CHAR(3) NOT NULL,
    exchange_rate NUMERIC(18,6),
    subtotal      NUMERIC(18,2) NOT NULL DEFAULT 0,
    discount      NUMERIC(18,2) NOT NULL DEFAULT 0,
    tax           NUMERIC(18,2) NOT NULL DEFAULT 0,
    total         NUMERIC(18,2) NOT NULL DEFAULT 0,
    sold_by       UUID,                 -- users.id
    -- Campos fiscales (demo; el timbrado real requiere PAC/DIAN)
    fiscal_country VARCHAR(2),          -- CO | MX
    fiscal_serie   VARCHAR(20),         -- serie/prefijo
    fiscal_folio   BIGINT,              -- consecutivo por sucursal
    fiscal_uuid    VARCHAR(64),         -- CUFE (CO) / Folio Fiscal UUID (MX)  [placeholder]
    fiscal_status  VARCHAR(20) DEFAULT 'no_timbrado',
    client_uuid    VARCHAR(64) UNIQUE,  -- id generado en el cliente (idempotencia offline)
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_sales_branch_date ON sales(branch_id, created_at);

CREATE TABLE sale_items (
    id            BIGSERIAL PRIMARY KEY,
    sale_id       BIGINT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    variant_id    BIGINT NOT NULL REFERENCES product_variants(id),
    quantity      NUMERIC(18,3) NOT NULL,
    unit_price    NUMERIC(18,4) NOT NULL,
    discount      NUMERIC(18,2) NOT NULL DEFAULT 0,
    promotion_id  BIGINT REFERENCES promotions(id),
    line_total    NUMERIC(18,2) NOT NULL
);

-- Pagos de una venta (permite pago mixto)
CREATE TABLE sale_payments (
    id            BIGSERIAL PRIMARY KEY,
    sale_id       BIGINT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    method        VARCHAR(20) NOT NULL,  -- efectivo | tarjeta_credito | tarjeta_debito | transferencia | cheque
    amount        NUMERIC(18,2) NOT NULL,
    reference     VARCHAR(80),           -- autorización tarjeta, folio transferencia, no. cheque
    paid_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ CONTABILIDAD (partida doble) ============
CREATE TABLE chart_accounts (
    id        BIGSERIAL PRIMARY KEY,
    code      VARCHAR(20) NOT NULL UNIQUE,
    name      VARCHAR(160) NOT NULL,
    type      VARCHAR(20) NOT NULL,   -- activo | pasivo | patrimonio | ingreso | gasto
    nature    CHAR(1) NOT NULL,       -- D (deudora) | C (acreedora): saldo normal
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE journal_entries (
    id          BIGSERIAL PRIMARY KEY,
    entry_date  DATE NOT NULL DEFAULT current_date,
    description TEXT,
    reference   VARCHAR(80),
    created_by  UUID,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE journal_lines (
    id         BIGSERIAL PRIMARY KEY,
    entry_id   BIGINT NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
    account_id BIGINT NOT NULL REFERENCES chart_accounts(id),
    debit      NUMERIC(18,2) NOT NULL DEFAULT 0,
    credit     NUMERIC(18,2) NOT NULL DEFAULT 0,
    memo       TEXT
);
CREATE INDEX ix_jlines_account ON journal_lines(account_id);
CREATE INDEX ix_jlines_entry ON journal_lines(entry_id);

CREATE TABLE bank_accounts (
    id              BIGSERIAL PRIMARY KEY,
    name            VARCHAR(120) NOT NULL,
    bank            VARCHAR(120),
    account_number  VARCHAR(60),
    currency        CHAR(3) NOT NULL DEFAULT 'USD',
    account_id      BIGINT REFERENCES chart_accounts(id),   -- cuenta contable ligada
    opening_balance NUMERIC(18,2) NOT NULL DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE custom_catalogs (
    id          BIGSERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    description TEXT,
    icon        VARCHAR(10)  NOT NULL DEFAULT '📋',
    has_code    BOOLEAN      NOT NULL DEFAULT TRUE,
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  DEFAULT NOW()
);
CREATE TABLE custom_catalog_items (
    id          BIGSERIAL PRIMARY KEY,
    catalog_id  BIGINT NOT NULL REFERENCES custom_catalogs(id) ON DELETE CASCADE,
    code        VARCHAR(50),
    name        VARCHAR(100) NOT NULL,
    sort_order  INTEGER      NOT NULL DEFAULT 0,
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE product_code_sequences (
    year     SMALLINT PRIMARY KEY,
    last_seq INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE bank_movements (
    id              BIGSERIAL PRIMARY KEY,
    bank_account_id BIGINT NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
    movement_date   DATE NOT NULL DEFAULT current_date,
    type            VARCHAR(10) NOT NULL,   -- ingreso | egreso
    amount          NUMERIC(18,2) NOT NULL,
    description     TEXT,
    reference       VARCHAR(80),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Plan de cuentas base
INSERT INTO chart_accounts (code, name, type, nature) VALUES
    ('1',    'ACTIVO',                    'activo',     'D'),
    ('1105', 'Caja',                      'activo',     'D'),
    ('1110', 'Bancos',                    'activo',     'D'),
    ('1305', 'Clientes (CxC)',            'activo',     'D'),
    ('1435', 'Inventario de mercancías',  'activo',     'D'),
    ('2',    'PASIVO',                    'pasivo',     'C'),
    ('2205', 'Proveedores (CxP)',         'pasivo',     'C'),
    ('2408', 'Impuestos por pagar (IVA)', 'pasivo',     'C'),
    ('3',    'PATRIMONIO',                'patrimonio', 'C'),
    ('3105', 'Capital social',            'patrimonio', 'C'),
    ('4',    'INGRESOS',                  'ingreso',    'C'),
    ('4135', 'Ingresos por ventas',       'ingreso',    'C'),
    ('5',    'GASTOS',                    'gasto',      'D'),
    ('5135', 'Costo de mercancía vendida','gasto',      'D'),
    ('5205', 'Gastos de operación',       'gasto',      'D');

-- ============ DATOS SEMILLA MÍNIMOS ============
INSERT INTO product_types (name, attr_schema, has_sizes, has_expiry) VALUES
    ('Zapatos',      '{"material":"string"}', TRUE,  FALSE),
    ('Ropa',         '{"material":"string"}', TRUE,  FALSE),
    ('Alimentos',    '{"lote":"string"}',     FALSE, TRUE),
    ('Electrónicos', '{"voltaje":"string","garantia_meses":"number"}', FALSE, FALSE);

INSERT INTO categories (name) VALUES ('General');

INSERT INTO colors (code, name, hex) VALUES
  ('NEGRO','Negro','#000000'),('BLANCO','Blanco','#FFFFFF'),
  ('ROJO','Rojo','#EF4444'),('AZUL','Azul','#3B82F6'),
  ('VERDE','Verde','#22C55E'),('AMARILLO','Amarillo','#EAB308'),
  ('GRIS','Gris','#6B7280'),('CAFÉ','Café','#92400E'),
  ('ROSADO','Rosado','#EC4899'),('NARANJA','Naranja','#F97316');

INSERT INTO sizes (code, name, sort_order) VALUES
  ('XS','XS',1),('S','S',2),('M','M',3),('L','L',4),('XL','XL',5),('XXL','XXL',6),
  ('35','35',35),('36','36',36),('37','37',37),('38','38',38),('39','39',39),
  ('40','40',40),('41','41',41),('42','42',42),('43','43',43),('44','44',44);

INSERT INTO units (code, name) VALUES
  ('UND','Unidad'),('PAR','Par'),('KG','Kilogramo'),('GR','Gramo'),
  ('LT','Litro'),('ML','Mililitro'),('MT','Metro'),('CM','Centímetro'),
  ('CAJA','Caja'),('PQTE','Paquete'),('DOC','Docena');

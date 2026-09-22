"""Modelos SQLAlchemy de las tablas de negocio POR TENANT.

Nota: NO se declara schema fijo. El aislamiento se logra fijando el
search_path por request (ver core/tenancy.py y core/database.set_search_path).
Refleja backend/sql/01_tenant_template.sql.
"""
from sqlalchemy import (
    Column, String, Boolean, ForeignKey, SmallInteger, Numeric,
    DateTime, BigInteger, CHAR, Text, func
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship

from app.core.database import Base


class ProductType(Base):
    __tablename__ = "product_types"
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    name = Column(String(80), nullable=False, unique=True)
    attr_schema = Column(JSONB, nullable=False, default=dict)
    has_sizes = Column(Boolean, nullable=False, default=False)
    has_expiry = Column(Boolean, nullable=False, default=False)


class Category(Base):
    __tablename__ = "categories"
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    parent_id = Column(BigInteger)
    name = Column(String(100), nullable=False)


class Brand(Base):
    __tablename__ = "brands"
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False, unique=True)


class Product(Base):
    __tablename__ = "products"
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    sku = Column(String(60), nullable=False, unique=True)
    name = Column(String(200), nullable=False)
    description = Column(Text)
    product_type_id = Column(BigInteger, nullable=False)
    category_id = Column(BigInteger)
    brand_id = Column(BigInteger)
    unit_id = Column(BigInteger)
    photo_url = Column(Text)
    attributes = Column(JSONB, nullable=False, default=dict)
    color_chart_id = Column(BigInteger)
    size_chart_id = Column(BigInteger)
    is_asset = Column(Boolean, nullable=False, default=True)
    available_for_purchase = Column(Boolean, nullable=False, default=True)
    available_for_sale = Column(Boolean, nullable=False, default=True)
    price_mode = Column(String(20), nullable=False, default="fixed")
    currency = Column(CHAR(3), nullable=False, default="USD")
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    # No relationship declared — create_product uses raw SQL inserts for multitenancy compatibility


class ProductVariant(Base):
    __tablename__ = "product_variants"
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    product_id = Column(BigInteger, nullable=False)
    variant_sku = Column(String(70), nullable=False, unique=True)
    ean13 = Column(String(100), unique=True)
    size = Column(String(20))
    color = Column(String(40))
    attributes = Column(JSONB, nullable=False, default=dict)
    cost_price = Column(Numeric(18, 4), nullable=False, default=0)
    sale_price = Column(Numeric(18, 4), nullable=False, default=0)
    currency = Column(CHAR(3), nullable=False, default="USD")
    is_active = Column(Boolean, nullable=False, default=True)


class Inventory(Base):
    __tablename__ = "inventory"
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    variant_id = Column(BigInteger, ForeignKey("product_variants.id", ondelete="CASCADE"), nullable=False)
    branch_id = Column(UUID(as_uuid=True), nullable=False)  # FK lógica a public.branches
    quantity = Column(Numeric(18, 3), nullable=False, default=0)
    min_stock = Column(Numeric(18, 3), nullable=False, default=0)
    max_stock = Column(Numeric(18, 3))
    updated_at = Column(DateTime(timezone=True), server_default=func.now())


class Kardex(Base):
    __tablename__ = "kardex"
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    variant_id = Column(BigInteger, ForeignKey("product_variants.id"), nullable=False)
    branch_id = Column(UUID(as_uuid=True), nullable=False)
    movement_type = Column(String(20), nullable=False)
    quantity = Column(Numeric(18, 3), nullable=False)
    unit_cost = Column(Numeric(18, 4))
    balance_after = Column(Numeric(18, 3), nullable=False)
    ref_type = Column(String(30))
    ref_id = Column(BigInteger)
    note = Column(Text)
    created_by = Column(UUID(as_uuid=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class InventoryTransfer(Base):
    __tablename__ = "inventory_transfers"
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    variant_id = Column(BigInteger, ForeignKey("product_variants.id"), nullable=False)
    from_branch = Column(UUID(as_uuid=True), nullable=False)
    to_branch = Column(UUID(as_uuid=True), nullable=False)
    quantity = Column(Numeric(18, 3), nullable=False)
    note = Column(Text)
    created_by = Column(UUID(as_uuid=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Supplier(Base):
    __tablename__ = "suppliers"
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    name = Column(String(160), nullable=False)
    fiscal_person_type = Column(String(60))
    fiscal_id_type = Column(String(20))
    tax_id = Column(String(60))
    tax_dv = Column(String(5))
    email = Column(String(160))
    phone = Column(String(40))
    mobile = Column(String(40))
    city = Column(String(100))
    address = Column(Text)
    currency = Column(CHAR(3), nullable=False, default="USD")
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    supplier_id = Column(BigInteger, ForeignKey("suppliers.id"), nullable=False)
    branch_id = Column(UUID(as_uuid=True), nullable=False)
    status = Column(String(20), nullable=False, default="draft")
    currency = Column(CHAR(3), nullable=False)
    exchange_rate = Column(Numeric(18, 6))
    subtotal = Column(Numeric(18, 2), nullable=False, default=0)
    tax = Column(Numeric(18, 2), nullable=False, default=0)
    total = Column(Numeric(18, 2), nullable=False, default=0)
    expected_at = Column(DateTime(timezone=True))
    created_by = Column(UUID(as_uuid=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    items = relationship("PurchaseOrderItem", cascade="all, delete-orphan")


class PurchaseOrderItem(Base):
    __tablename__ = "purchase_order_items"
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    po_id = Column(BigInteger, ForeignKey("purchase_orders.id", ondelete="CASCADE"), nullable=False)
    variant_id = Column(BigInteger, ForeignKey("product_variants.id"), nullable=False)
    qty_ordered = Column(Numeric(18, 3), nullable=False)
    qty_received = Column(Numeric(18, 3), nullable=False, default=0)
    unit_cost = Column(Numeric(18, 4), nullable=False)
    line_total = Column(Numeric(18, 2), nullable=False)


class SupplierInvoice(Base):
    __tablename__ = "supplier_invoices"
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    supplier_id = Column(BigInteger, ForeignKey("suppliers.id"), nullable=False)
    po_id = Column(BigInteger, ForeignKey("purchase_orders.id"))
    invoice_no = Column(String(60))
    currency = Column(CHAR(3), nullable=False)
    total = Column(Numeric(18, 2), nullable=False)
    balance = Column(Numeric(18, 2), nullable=False)
    status = Column(String(20), nullable=False, default="open")
    issued_at = Column(DateTime(timezone=True))
    due_at = Column(DateTime(timezone=True))


class Customer(Base):
    __tablename__ = "customers"
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    name = Column(String(160), nullable=False)
    tax_id = Column(String(40))
    email = Column(String(160))
    phone = Column(String(40))
    address = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Promotion(Base):
    __tablename__ = "promotions"
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    name = Column(String(120), nullable=False)
    type = Column(String(20), nullable=False)
    value = Column(Numeric(18, 4))
    scope = Column(String(20), nullable=False, default="all")
    scope_ref_id = Column(BigInteger)
    starts_at = Column(DateTime(timezone=True))
    ends_at = Column(DateTime(timezone=True))
    is_active = Column(Boolean, nullable=False, default=True)


class Sale(Base):
    __tablename__ = "sales"
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    branch_id = Column(UUID(as_uuid=True), nullable=False)
    customer_id = Column(BigInteger, ForeignKey("customers.id"))
    kind = Column(String(15), nullable=False, default="sale")
    status = Column(String(20), nullable=False, default="completed")
    currency = Column(CHAR(3), nullable=False)
    exchange_rate = Column(Numeric(18, 6))
    subtotal = Column(Numeric(18, 2), nullable=False, default=0)
    discount = Column(Numeric(18, 2), nullable=False, default=0)
    tax = Column(Numeric(18, 2), nullable=False, default=0)
    total = Column(Numeric(18, 2), nullable=False, default=0)
    sold_by = Column(UUID(as_uuid=True))
    fiscal_country = Column(String(2))
    fiscal_serie = Column(String(20))
    fiscal_folio = Column(BigInteger)
    fiscal_uuid = Column(String(64))
    fiscal_status = Column(String(20), default="no_timbrado")
    client_uuid = Column(String(64), unique=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    items = relationship("SaleItem", cascade="all, delete-orphan")
    payments = relationship("SalePayment", cascade="all, delete-orphan")


class SaleItem(Base):
    __tablename__ = "sale_items"
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    sale_id = Column(BigInteger, ForeignKey("sales.id", ondelete="CASCADE"), nullable=False)
    variant_id = Column(BigInteger, ForeignKey("product_variants.id"), nullable=False)
    quantity = Column(Numeric(18, 3), nullable=False)
    unit_price = Column(Numeric(18, 4), nullable=False)
    discount = Column(Numeric(18, 2), nullable=False, default=0)
    promotion_id = Column(BigInteger, ForeignKey("promotions.id"))
    line_total = Column(Numeric(18, 2), nullable=False)


class SalePayment(Base):
    __tablename__ = "sale_payments"
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    sale_id = Column(BigInteger, ForeignKey("sales.id", ondelete="CASCADE"), nullable=False)
    method = Column(String(20), nullable=False)
    amount = Column(Numeric(18, 2), nullable=False)
    reference = Column(String(80))
    paid_at = Column(DateTime(timezone=True), server_default=func.now())


# ============ CONTABILIDAD ============
class ChartAccount(Base):
    __tablename__ = "chart_accounts"
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    code = Column(String(20), nullable=False, unique=True)
    name = Column(String(160), nullable=False)
    type = Column(String(20), nullable=False)
    nature = Column(CHAR(1), nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)


class JournalEntry(Base):
    __tablename__ = "journal_entries"
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    entry_date = Column(DateTime(timezone=True), server_default=func.now())
    description = Column(Text)
    reference = Column(String(80))
    created_by = Column(UUID(as_uuid=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    lines = relationship("JournalLine", cascade="all, delete-orphan")


class JournalLine(Base):
    __tablename__ = "journal_lines"
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    entry_id = Column(BigInteger, ForeignKey("journal_entries.id", ondelete="CASCADE"), nullable=False)
    account_id = Column(BigInteger, ForeignKey("chart_accounts.id"), nullable=False)
    debit = Column(Numeric(18, 2), nullable=False, default=0)
    credit = Column(Numeric(18, 2), nullable=False, default=0)
    memo = Column(Text)


class BankAccount(Base):
    __tablename__ = "bank_accounts"
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    name = Column(String(120), nullable=False)
    bank = Column(String(120))
    account_number = Column(String(60))
    currency = Column(CHAR(3), nullable=False, default="USD")
    account_id = Column(BigInteger, ForeignKey("chart_accounts.id"))
    opening_balance = Column(Numeric(18, 2), nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)


class BankMovement(Base):
    __tablename__ = "bank_movements"
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    bank_account_id = Column(BigInteger, ForeignKey("bank_accounts.id", ondelete="CASCADE"), nullable=False)
    movement_date = Column(DateTime(timezone=True), server_default=func.now())
    type = Column(String(10), nullable=False)
    amount = Column(Numeric(18, 2), nullable=False)
    description = Column(Text)
    reference = Column(String(80))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

"""Modelos SQLAlchemy del schema GLOBAL (public)."""
import uuid

from sqlalchemy import (
    Column, String, Boolean, ForeignKey, SmallInteger, Numeric,
    DateTime, BigInteger, CHAR, func
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship

from app.core.database import Base


class Currency(Base):
    __tablename__ = "currencies"
    __table_args__ = {"schema": "public"}
    code = Column(CHAR(3), primary_key=True)
    name = Column(String(60), nullable=False)
    symbol = Column(String(6), nullable=False)
    decimals = Column(SmallInteger, nullable=False, default=2)


class Tenant(Base):
    __tablename__ = "tenants"
    __table_args__ = {"schema": "public"}
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(120), nullable=False)
    slug = Column(String(63), nullable=False, unique=True)
    schema_name = Column(String(63), nullable=False, unique=True)
    base_currency = Column(CHAR(3), ForeignKey("public.currencies.code"), default="USD")
    country = Column(String(2))
    status = Column(String(20), nullable=False, default="active")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    branches = relationship("Branch", back_populates="tenant", cascade="all, delete-orphan")


class Branch(Base):
    __tablename__ = "branches"
    __table_args__ = {"schema": "public"}
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("public.tenants.id", ondelete="CASCADE"))
    code = Column(String(30), nullable=False)
    name = Column(String(120), nullable=False)
    address = Column(String)
    default_currency = Column(CHAR(3), ForeignKey("public.currencies.code"))
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    tenant = relationship("Tenant", back_populates="branches")


class Role(Base):
    __tablename__ = "roles"
    __table_args__ = {"schema": "public"}
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("public.tenants.id", ondelete="CASCADE"))
    name = Column(String(60), nullable=False)
    scopes = Column(JSONB, nullable=False, default=list)


class User(Base):
    __tablename__ = "users"
    __table_args__ = {"schema": "public"}
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("public.tenants.id", ondelete="CASCADE"))
    branch_id = Column(UUID(as_uuid=True), ForeignKey("public.branches.id", ondelete="SET NULL"))
    role_id = Column(BigInteger, ForeignKey("public.roles.id"), nullable=False)
    email = Column(String(160), nullable=False, unique=True)
    full_name = Column(String(160), nullable=False)
    password_hash = Column(String(255), nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    role = relationship("Role")

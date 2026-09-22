"""Registro de auditoría: convierte cada petición mutante en una fila legible."""
import re

from sqlalchemy import text

from app.core.database import SessionLocal
from app.core.security import decode_token

# Métodos que se auditan (mutaciones)
_AUDITED = {"POST", "PUT", "PATCH", "DELETE"}

# Etiquetas legibles según recurso base
_LABELS = {
    ("POST", "auth/login"): "Inicio de sesión",
    ("POST", "admin/tenants"): "Crear tenant",
    ("POST", "admin/branches"): "Crear sucursal",
    ("POST", "ventas"): "Crear venta/pedido",
    ("POST", "ventas/entregar"): "Entregar pedido",
    ("POST", "ventas/clientes"): "Crear cliente",
    ("POST", "ventas/promociones"): "Crear promoción",
    ("POST", "compras/proveedores"): "Crear proveedor",
    ("POST", "compras/ordenes"): "Crear orden de compra",
    ("POST", "compras/ordenes/recibir"): "Recibir orden de compra",
    ("POST", "compras/facturas/pagos"): "Pagar factura de proveedor",
    ("POST", "compras/reabastecimiento/generar"): "Generar órdenes (reabasto)",
    ("POST", "productos"): "Crear producto",
    ("POST", "inventarios/ajuste"): "Ajuste de inventario",
    ("POST", "inventarios/traslado"): "Traslado entre sucursales",
    ("POST", "usuarios"): "Crear usuario",
    ("PATCH", "usuarios"): "Editar usuario",
    ("POST", "roles"): "Crear rol",
    ("PATCH", "roles"): "Editar rol",
    ("PUT", "fiscal-config"): "Editar config. fiscal",
}


def _label(method: str, path: str) -> str:
    # normaliza: quita /api y descarta segmentos que sean ids numéricos o UUIDs
    p = path.replace("/api/", "").strip("/")
    segs = []
    for s in p.split("/"):
        if not s or s.isdigit():
            continue
        if re.fullmatch(r"[0-9a-fA-F-]{16,}", s):  # UUID
            continue
        segs.append(s)
    key = "/".join(segs)
    return _LABELS.get((method, key), f"{method} {key}")


async def audit_middleware(request, call_next):
    response = await call_next(request)
    try:
        method = request.method
        path = request.url.path
        if method in _AUDITED and path.startswith("/api"):
            claims = {}
            auth = request.headers.get("authorization", "")
            if auth.lower().startswith("bearer "):
                try:
                    claims = decode_token(auth[7:])
                except Exception:
                    claims = {}
            db = SessionLocal()
            try:
                db.execute(text("SET search_path TO public"))
                db.execute(text("""INSERT INTO public.audit_log
                    (user_id, user_email, role, tenant_id, action, method, path, status_code, ip)
                    VALUES (:uid,:em,:ro,:t,:ac,:m,:p,:sc,:ip)"""), {
                    "uid": claims.get("sub"),
                    "em": claims.get("email"),
                    "ro": claims.get("role"),
                    "t": claims.get("tenant_id"),
                    "ac": _label(method, path),
                    "m": method, "p": path,
                    "sc": response.status_code,
                    "ip": request.client.host if request.client else None,
                })
                db.commit()
            finally:
                db.close()
    except Exception:
        # La auditoría nunca debe romper la petición
        pass
    return response

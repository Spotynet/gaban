"""Punto de entrada FastAPI de GabAn POS."""
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from app.core.config import settings
from app.core.audit import audit_middleware
from app.api.routers import auth, admin, common, productos, ventas, compras, inventarios, reportes, usuarios, contabilidad, notificaciones, configuracion, gs1

app = FastAPI(title=settings.PROJECT_NAME, version="0.1.0")

app.middleware("http")(audit_middleware)


@app.middleware("http")
async def set_utf8_charset(request: Request, call_next):
    response = await call_next(request)
    ct = response.headers.get("content-type", "")
    if "application/json" in ct and "charset" not in ct:
        response.headers["content-type"] = "application/json; charset=utf-8"
    return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(common.router)
app.include_router(productos.router)
app.include_router(ventas.router)
app.include_router(compras.router)
app.include_router(inventarios.router)
app.include_router(reportes.router)
app.include_router(usuarios.router)
app.include_router(contabilidad.router)
app.include_router(notificaciones.router)
app.include_router(configuracion.router)
app.include_router(gs1.router)


@app.get("/api/health")
def health():
    return {"status": "ok", "service": settings.PROJECT_NAME}

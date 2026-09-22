"""GS1 — prefijos de país y secuencias de códigos de barras."""
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.tenancy import get_tenant_db, require_scope

router = APIRouter(prefix="/api/gs1", tags=["gs1"])

# Prefijos GS1 oficiales por país (subconjunto relevante)
GS1_PREFIXES = [
    # América Latina
    {"prefix": "740", "country": "Guatemala",             "flag": "🇬🇹", "region": "América Central"},
    {"prefix": "741", "country": "El Salvador",           "flag": "🇸🇻", "region": "América Central"},
    {"prefix": "742", "country": "Honduras",              "flag": "🇭🇳", "region": "América Central"},
    {"prefix": "743", "country": "Nicaragua",             "flag": "🇳🇮", "region": "América Central"},
    {"prefix": "744", "country": "Costa Rica",            "flag": "🇨🇷", "region": "América Central"},
    {"prefix": "745", "country": "Panamá",                "flag": "🇵🇦", "region": "América Central"},
    {"prefix": "746", "country": "República Dominicana",  "flag": "🇩🇴", "region": "Caribe"},
    {"prefix": "750", "country": "México",                "flag": "🇲🇽", "region": "América del Norte"},
    {"prefix": "759", "country": "Venezuela",             "flag": "🇻🇪", "region": "América del Sur"},
    {"prefix": "770", "country": "Colombia",              "flag": "🇨🇴", "region": "América del Sur"},
    {"prefix": "773", "country": "Uruguay",               "flag": "🇺🇾", "region": "América del Sur"},
    {"prefix": "775", "country": "Perú",                  "flag": "🇵🇪", "region": "América del Sur"},
    {"prefix": "777", "country": "Bolivia",               "flag": "🇧🇴", "region": "América del Sur"},
    {"prefix": "778", "country": "Argentina",             "flag": "🇦🇷", "region": "América del Sur"},
    {"prefix": "779", "country": "Argentina",             "flag": "🇦🇷", "region": "América del Sur"},
    {"prefix": "780", "country": "Chile",                 "flag": "🇨🇱", "region": "América del Sur"},
    {"prefix": "784", "country": "Paraguay",              "flag": "🇵🇾", "region": "América del Sur"},
    {"prefix": "786", "country": "Ecuador",               "flag": "🇪🇨", "region": "América del Sur"},
    {"prefix": "789", "country": "Brasil",                "flag": "🇧🇷", "region": "América del Sur"},
    {"prefix": "790", "country": "Brasil",                "flag": "🇧🇷", "region": "América del Sur"},
    # América del Norte
    {"prefix": "000", "country": "EE. UU. / Canadá",     "flag": "🇺🇸", "region": "América del Norte"},
    {"prefix": "001", "country": "EE. UU. / Canadá",     "flag": "🇺🇸", "region": "América del Norte"},
    # Europa
    {"prefix": "300", "country": "Francia",               "flag": "🇫🇷", "region": "Europa"},
    {"prefix": "400", "country": "Alemania",              "flag": "🇩🇪", "region": "Europa"},
    {"prefix": "500", "country": "Reino Unido",           "flag": "🇬🇧", "region": "Europa"},
    {"prefix": "560", "country": "Portugal",              "flag": "🇵🇹", "region": "Europa"},
    {"prefix": "840", "country": "España",                "flag": "🇪🇸", "region": "Europa"},
    {"prefix": "800", "country": "Italia",                "flag": "🇮🇹", "region": "Europa"},
    {"prefix": "870", "country": "Países Bajos",          "flag": "🇳🇱", "region": "Europa"},
    # Asia / Otros
    {"prefix": "450", "country": "Japón",                 "flag": "🇯🇵", "region": "Asia"},
    {"prefix": "690", "country": "China",                 "flag": "🇨🇳", "region": "Asia"},
    {"prefix": "880", "country": "Corea del Sur",         "flag": "🇰🇷", "region": "Asia"},
    {"prefix": "890", "country": "India",                 "flag": "🇮🇳", "region": "Asia"},
    # Uso interno (sin distribución comercial — estándar GS1)
    {"prefix": "200", "country": "Uso interno (no comercial)",  "flag": "🏢", "region": "Interno"},
    {"prefix": "201", "country": "Uso interno (no comercial)",  "flag": "🏢", "region": "Interno"},
    {"prefix": "299", "country": "Uso interno (no comercial)",  "flag": "🏢", "region": "Interno"},
]


@router.get("/prefixes")
def list_gs1_prefixes():
    """Retorna la lista de prefijos GS1 por país para configuración de EAN-13."""
    return GS1_PREFIXES


@router.get("/next-barcode-seq")
def next_barcode_seq(
    prefix: str,
    db: Session = Depends(get_tenant_db),
    _=Depends(require_scope("products:read")),
):
    """Retorna el próximo número de secuencia para un prefijo país+empresa.
    Garantiza unicidad atómica con upsert."""
    row = db.execute(text("""
        INSERT INTO barcode_sequences (prefix, last_seq)
        VALUES (:p, 1)
        ON CONFLICT (prefix) DO UPDATE
            SET last_seq = barcode_sequences.last_seq + 1
        RETURNING last_seq
    """), {"p": prefix}).first()
    db.commit()
    return {"seq": row[0], "prefix": prefix}

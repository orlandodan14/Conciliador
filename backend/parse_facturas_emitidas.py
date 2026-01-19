import json
import sqlite3
from pathlib import Path

import pandas as pd

# ==============================
# CONFIGURACIÓN DE ARCHIVOS Y CONSTANTES
# ==============================
BASE_DIR = Path(__file__).parent                          # Carpeta base del script

DB_PATH = BASE_DIR / "db" / "conciliador.db"              # Base de datos SQLite

PAIS = "MX"
MONEDA_DEFAULT = "MXN"

INPUT_FILE = (BASE_DIR / "Archivos ejemplos" / "CFS1808284P2-EMITIDOS-DEL-1-11-2025-AL-30-11-2025.xlsx")

INPUT_SHEET = 0                                           # índice o nombre de hoja

OUTPUT_FILE = BASE_DIR / "export_facturas_emitidas_mx.xlsx"

TABLE_NAME = "facturas_emitidas_mx"

# ==============================
# COLUMNAS Y MAPEOS
# ==============================
YELLOW_COLS = [
    "UUID",
    "Folio",
    "Tipo",
    "Fecha emision",
    "Fecha certificacion",
    "RFC receptor",
    "Razon receptor",
    "Claves de productos",
    "Uso CFDI",
    "Estado",
    "Fecha proceso cancelacion",
    "Estado cancelacion",
    "Moneda",
    "SubTotal",
    "IVA Trasladado",
    "Total",
]

MAP = {
    "UUID": "uuid",
    "Folio": "folio",
    "Tipo": "tipo",
    "Fecha emision": "fecha_emision",
    "Fecha certificacion": "fecha_certificacion",
    "RFC receptor": "rfc_receptor",
    "Razon receptor": "razon_receptor",
    "Claves de productos": "claves_de_productos",
    "Uso CFDI": "uso_cfdi",
    "Estado": "estado",
    "Fecha proceso cancelacion": "fecha_proceso_cancelacion",
    "Estado cancelacion": "estado_cancelacion",
    "Moneda": "moneda",
    "SubTotal": "subtotal",
    "IVA Trasladado": "iva_trasladado",
    "Total": "total",
}

# ==============================
# HELPERS
# ==============================
def to_iso_text(value):
    if pd.isna(value):
        return None
    try:
        return pd.to_datetime(value).strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        value = str(value).strip()
        return value if value else None


def to_float(value):
    if pd.isna(value):
        return None
    s = str(value).strip()
    if not s:
        return None
    s = s.replace("$", "").replace(" ", "")
    if "," in s and "." not in s:
        s = s.replace(".", "").replace(",", ".")
    else:
        s = s.replace(",", "")
    try:
        return float(s)
    except ValueError:
        return None


def norm_text(value):
    if pd.isna(value):
        return None
    s = str(value).strip()
    return s if s else None


# ==============================
# 1) LEER EXCEL
# ==============================
df = pd.read_excel(INPUT_FILE, sheet_name=INPUT_SHEET, dtype=object)

missing = [c for c in YELLOW_COLS if c not in df.columns]
if missing:
    raise ValueError(f"Faltan columnas en el Excel: {missing}")

# ==============================
# 2) FILTRAR SOLO INGRESOS
# ==============================
df["Tipo"] = df["Tipo"].astype(str).str.strip()
df_ingreso = df[df["Tipo"] == "I - Ingreso"].copy()

if df_ingreso.empty:
    print("No hay registros con Tipo = 'I - Ingreso'.")
    exit(0)

# ==============================
# 3) CONECTAR SQLITE
# ==============================
con = sqlite3.connect(DB_PATH)
con.execute("PRAGMA foreign_keys = ON;")

# ==============================
# 4) INSERTAR DATOS (UUID ÚNICO)
# ==============================
insert_sql = f"""
INSERT OR IGNORE INTO {TABLE_NAME} (
  uuid, folio, tipo, fecha_emision, fecha_certificacion,
  rfc_receptor, razon_receptor, claves_de_productos, uso_cfdi,
  estado, fecha_proceso_cancelacion, estado_cancelacion,
  moneda, subtotal, iva_trasladado, total,
  extras
) VALUES (
  ?, ?, ?, ?, ?,
  ?, ?, ?, ?,
  ?, ?, ?,
  ?, ?, ?, ?,
  ?
);
"""

rows = []

for _, row in df_ingreso.iterrows():
    uuid = norm_text(row.get("UUID"))
    if not uuid:
        continue

    extras = {
        col: (to_iso_text(row[col]) if "Fecha" in col else None if pd.isna(row[col]) else row[col])
        for col in df.columns
        if col not in YELLOW_COLS
    }

    rows.append((
        uuid,
        norm_text(row.get("Folio")),
        norm_text(row.get("Tipo")),
        to_iso_text(row.get("Fecha emision")),
        to_iso_text(row.get("Fecha certificacion")),
        norm_text(row.get("RFC receptor")),
        norm_text(row.get("Razon receptor")),
        norm_text(row.get("Claves de productos")),
        norm_text(row.get("Uso CFDI")),
        norm_text(row.get("Estado")),
        to_iso_text(row.get("Fecha proceso cancelacion")),
        norm_text(row.get("Estado cancelacion")),
        norm_text(row.get("Moneda")) or MONEDA_DEFAULT,
        to_float(row.get("SubTotal")),
        to_float(row.get("IVA Trasladado")),
        to_float(row.get("Total")),
        json.dumps(extras, ensure_ascii=False, default=str),
    ))

cur = con.cursor()
cur.executemany(insert_sql, rows)
con.commit()

print(f"Filas procesadas (Ingreso): {len(rows)}")
print(f"Filas insertadas nuevas: {con.total_changes}")

# ==============================
# 5) EXPORTAR COLUMNAS AMARILLAS
# ==============================
query_export = f"""
SELECT
  id,
  uuid,
  folio,
  tipo,
  fecha_emision,
  fecha_certificacion,
  rfc_receptor,
  razon_receptor,
  estado,
  estado_cancelacion,
  claves_de_productos,
  moneda,
  subtotal,
  iva_trasladado,
  total,
  created_at,
  updated_at
FROM {TABLE_NAME}
ORDER BY fecha_emision ASC;
"""

df_out = pd.read_sql_query(query_export, con)
df_out.to_excel(OUTPUT_FILE, index=False)

print(f"Archivo exportado: {OUTPUT_FILE}")

con.close()

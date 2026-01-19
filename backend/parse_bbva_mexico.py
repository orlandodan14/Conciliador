import pandas as pd          # Librería para manejar DataFrames
import re                    # Librería para expresiones regulares
from pathlib import Path     # Para manejar rutas de archivos de forma portable
import sqlite3               # Para conectarse a bases de datos SQLite

# ==============================
# CONFIGURACIÓN DE ARCHIVOS Y CONSTANTES
# ==============================
BASE_DIR = Path(__file__).parent  # Carpeta base donde está este script
DB_PATH = BASE_DIR / "db" / "conciliador.db"  # Ruta de la base de datos

BANCO = "BBVA"                   # Nombre del banco
MONEDA_DEFAULT = "MXN"            # Moneda por defecto

INPUT_FILE = BASE_DIR / "Archivos ejemplos" / "MOV BBVA 19122025.txt"  # Archivo de entrada
OUTPUT_FILE = BASE_DIR / "cartola_bbva_normalizada.xlsx"               # Archivo Excel de salida

# ==============================
# FUNCIONES AUXILIARES
# ==============================
def clean_amount(value):
    """
    Convierte un valor en número float. 
    Si es NaN o vacío, devuelve 0.0
    """
    if pd.isna(value) or value == "":
        return 0.0
    return float(str(value).replace(",", "").strip())

def parse_concepto(texto):
    """
    Analiza la columna 'concepto' y devuelve un diccionario con:
    - banco_origen
    - cuenta_origen
    - referencia_movimiento
    - comentario_movimiento
    - tipo_documento
    - descripcion original
    """
    banco_origen = None
    cuenta_origen = None
    referencia = None
    comentario = None
    tipo_documento = "CARGO BANCARIO"

    descripcion = texto.strip()  # Limpiar espacios al inicio y fin

    if texto.startswith("PAGO CUENTA DE TERCERO"):
        tipo_documento = "PAGO CUENTA DE TERCERO"
        banco_origen = "BBVA"

        # Buscar referencia numérica después de "/"
        ref = re.search(r"/\s*(\d+)", texto)
        # Buscar cuenta después de "BNET "
        cuenta = re.search(r"BNET\s+(\d+)", texto)

        if ref:
            referencia = ref.group(1)
        if cuenta:
            cuenta_origen = cuenta.group(1)
            # Tomar comentario como lo que queda después de la cuenta
            comentario = texto.split(cuenta_origen, 1)[-1]

    elif texto.startswith(("SPEI RECIBIDO", "TEF RECIBIDO")):
        tipo_documento = texto.split()[0] + " RECIBIDO"

        # Extraer banco de origen que está después de SPEI RECIBIDO y antes de "/"
        banco_match = re.match(r'(SPEI RECIBIDO|TEF RECIBIDO)([A-Z]+)', texto)
        if banco_match:
            banco_origen = banco_match.group(2)

        # Extraer referencia numérica después de "/"
        ref = re.search(r"/(\d+)", texto)
        if ref:
            referencia = ref.group(1)
            comentario = texto.split(referencia, 1)[-1]


    elif texto.startswith("DEPOSITO EFECTIVO"):
        tipo_documento = "DEPOSITO"
        banco_origen = "DEPOSITO"
        # Extraer referencia después de "FOLIO:"
        ref_match = re.search(r'FOLIO:(\d+)', texto)
        if ref_match:
            referencia = ref_match.group(1)
        # Extraer comentario entre PRACTIC/... y FOLIO
        comentario_part = re.sub(r'DEPOSITO EFECTIVO PRACTIC/\*+\d+\s*', '', texto)
        comentario_part = re.sub(r'FOLIO:\d+', '', comentario_part).strip()
        comentario = comentario_part

    elif texto.startswith("DEPOSITO DE TERCERO"):
        tipo_documento = "DEPOSITO DE TERCERO"
        banco_origen = "DEPOSITO"
        # Extraer referencia después de "REFBNTC"
        ref_match = re.search(r'REFBNTC(\d+)', texto)
        if ref_match:
            referencia = ref_match.group(1)
        # Extraer comentario entre referencia y "BMRCASH"
        comentario_part = re.sub(r'DEPOSITO DE TERCERO/REFBNTC\d+\s*', '', texto)
        comentario_part = re.sub(r'BMRCASH', '', comentario_part).strip()
        comentario = comentario_part

    # Limpiar posibles números o espacios al inicio del comentario
    if comentario:
        comentario = re.sub(r"^[\d\s]+", "", comentario).strip()

    return {
        "banco_origen": banco_origen,
        "cuenta_origen": cuenta_origen,
        "referencia_movimiento": referencia,
        "comentario_movimiento": comentario,
        "tipo_documento": tipo_documento,
        "descripcion": descripcion,
    }

# ==============================
# FUNCIONES PARA BASE DE DATOS
# ==============================
def save_to_db(df):
    """
    Inserta los movimientos en la base de datos SQLite.
    - Ignora duplicados
    - Imprime cuántos registros se insertaron y cuántos se ignoraron
    """
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    inserted = 0
    ignored = 0

    for _, row in df.iterrows():
        cursor.execute("""
            INSERT OR IGNORE INTO movimientos_bancarios (
                fecha, banco, cuenta, banco_origen, cuenta_origen,
                rut_pagador, nombre_contraparte, tipo_documento, moneda,
                descripcion, comentario_movimiento, referencia_movimiento,
                abonos, cargos, saldo, neto
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            row["fecha"].strftime("%Y-%m-%d"),
            row["banco"],
            row["cuenta"],
            row["banco_origen"],
            row["cuenta_origen"],
            row["rut_pagador"],
            row["nombre_contraparte"],
            row["tipo_documento"],
            row["moneda"],
            row["descripcion"],
            row["comentario_movimiento"],
            row["referencia_movimiento"],
            row["abonos"],
            row["cargos"],
            row["saldo"],
            row["neto"]
        ))

        if cursor.rowcount == 1:
            inserted += 1
        else:
            ignored += 1

    conn.commit()
    conn.close()

    print(f"🟢 Movimientos nuevos insertados: {inserted}")
    print(f"🟡 Movimientos duplicados ignorados: {ignored}")

def export_db_to_excel():
    """
    Extrae todos los movimientos de la DB y los exporta a un Excel
    """
    conn = sqlite3.connect(DB_PATH)
    df = pd.read_sql("""
        SELECT *
        FROM movimientos_bancarios
        ORDER BY fecha ASC, id ASC
    """, conn)
    conn.close()
    df.to_excel(OUTPUT_FILE, index=False)

# ==============================
# MAIN
# ==============================
def main():
    print("Leyendo archivo:", INPUT_FILE)

    # Leer CSV de BBVA
    df = pd.read_csv(INPUT_FILE, sep="\t", encoding="latin1")
    # Limpiar nombres de columnas
    df.columns = [c.strip().lower() for c in df.columns]

    # Detectar columna fecha automáticamente
    fecha_col = next(
        col for col in df.columns
        if df[col].astype(str).head(5).str.match(r"\d{2}-\d{2}-\d{4}").all()
    )

    # Renombrar columnas
    df = df.rename(columns={
        fecha_col: "fecha",
        "concepto / referencia": "concepto",
        "cargo": "cargos",
        "abono": "abonos",
        "saldo": "saldo"
    })

    # Limpiar valores numéricos
    for col in ["cargos", "abonos", "saldo"]:
        df[col] = df[col].apply(clean_amount)

    rows = []

    # Procesar cada fila y parsear el concepto
    for _, row in df.iterrows():
        parsed = parse_concepto(row["concepto"])

        rows.append({
            "fecha": pd.to_datetime(row["fecha"], dayfirst=True),
            "banco": BANCO,
            "cuenta": None,
            "banco_origen": parsed["banco_origen"],
            "cuenta_origen": parsed["cuenta_origen"],
            "rut_pagador": None,
            "nombre_contraparte": None,
            "tipo_documento": parsed["tipo_documento"],
            "moneda": MONEDA_DEFAULT,
            "descripcion": parsed["descripcion"],
            "comentario_movimiento": parsed["comentario_movimiento"],
            "referencia_movimiento": parsed["referencia_movimiento"],
            "abonos": row["abonos"],
            "cargos": row["cargos"],
            "saldo": row["saldo"],
            "neto": row["abonos"] - row["cargos"]
        })

    final_df = pd.DataFrame(rows)
    # Invertir filas para tener la más antigua primero
    final_df = final_df.iloc[::-1].reset_index(drop=True)

    # Guardar en DB y Excel
    save_to_db(final_df)
    export_db_to_excel()

    print("✅ Cartola cargada en BBDD y Excel generado")

if __name__ == "__main__":
    main()

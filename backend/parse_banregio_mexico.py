import pandas as pd
import re
from pathlib import Path
import sqlite3

# ==============================
# CONFIGURACIÓN
# ==============================
BASE_DIR = Path(__file__).parent
DB_PATH = BASE_DIR / "db" / "conciliador.db"

BANCO = "BANREGIO"
MONEDA_DEFAULT = "MXN"

INPUT_FILE = BASE_DIR / "Archivos ejemplos" / "MOV BANREGIO 19122025.xlsx"
OUTPUT_FILE = BASE_DIR / "cartola_banregio_normalizada.xlsx"

# ==============================
# FUNCIONES AUXILIARES
# ==============================
def clean_amount(value):
    if pd.isna(value) or value == "":
        return 0.0
    return float(str(value).replace(",", "").replace("$", "").strip())

def parse_concepto(texto):
    banco_origen = None
    cuenta_origen = None
    referencia = None
    comentario = None
    nombre_contraparte = None

    descripcion = texto.strip()

    # 🔹 Por defecto TODO es ABONO
    tipo_documento = "ABONO BANCARIO"

    # ----------------------------------
    # SPEI
    # ----------------------------------
    if texto and "." in texto:
        partes = [p.strip() for p in texto.split(".") if p.strip()]

        # Validar SPEI exactamente como el código antiguo
        if partes and partes[0][-4:] == "SPEI":

            tipo_documento = "ABONO BANCARIO"

            banco_origen = partes[1] if len(partes) > 1 else None
            cuenta_origen = partes[2] if len(partes) > 2 else None

            def es_referencia(p: str) -> bool:
                p = p.strip()
                # referencias típicas: BNET..., MBAN..., 036APPM..., 2025..., UUID, etc.
                if re.fullmatch(r"\d{10,}", p):  # solo números largos
                    return True
                if len(p) >= 10 and re.search(r"[A-Z]", p) and re.search(r"\d", p):  # alfanum largo
                    return True
                if re.fullmatch(r"[A-F0-9]{8}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{12}", p, re.I):
                    return True
                return False

            # Buscar índice donde comienza la referencia (después del nombre)
            ref_idx = None
            for i in range(3, len(partes)):
                if es_referencia(partes[i]):
                    ref_idx = i
                    break

            # Nombre = todo lo que está entre cuenta y referencia
            if ref_idx is not None and ref_idx > 3:
                nombre_contraparte = " ".join(partes[3:ref_idx]).strip()
            else:
                nombre_contraparte = partes[3] if len(partes) > 3 else None

            # Referencia = primer bloque "tipo referencia" detectado
            referencia = partes[ref_idx] if ref_idx is not None else None

            # Comentario = último fragmento
            comentario = partes[-1]



    # ----------------------------------
    # (NB) RECEPCION DE CUENTA
    # ----------------------------------
    elif texto.startswith("(NB)"):
        banco_origen = "BANREGIO"

        cuenta_match = re.search(r"cuenta:\s*(\d+)", texto, re.IGNORECASE)
        if cuenta_match:
            cuenta_origen = cuenta_match.group(1)

        partes = texto.split(".", 1)
        if len(partes) > 1:
            comentario = partes[1].strip()

    # ----------------------------------
    # DEPOSITO EFECTIVO
    # ----------------------------------
    elif texto.startswith("DEPOSITO EFECTIVO"):
        tipo_documento = "DEPOSITO"
        banco_origen = "EFECTIVO"

        ref = re.search(r"FOLIO:(\d+)", texto)
        if ref:
            referencia = ref.group(1)

        comentario = re.sub(
            r"DEPOSITO EFECTIVO PRACTIC/\*+\d+|\s*FOLIO:\d+",
            "",
            texto
        ).strip()

    # ----------------------------------
    # DEPOSITO DE TERCERO
    # ----------------------------------
    elif texto.startswith("DEPOSITO DE TERCERO"):
        tipo_documento = "DEPOSITO DE TERCERO"
        banco_origen = "TERCERO"

        ref = re.search(r"REFBNTC(\d+)", texto)
        if ref:
            referencia = ref.group(1)

        comentario = re.sub(
            r"DEPOSITO DE TERCERO/REFBNTC\d+|BMRCASH",
            "",
            texto
        ).strip()

    # ----------------------------------
    # CARGO BANCARIO (ÚNICA REGLA)
    # ----------------------------------
    elif texto.startswith("(BE)"):
        tipo_documento = "CARGO BANCARIO"

        # Extraer texto después del primer punto
        partes = texto.split(".", 1)
        if len(partes) > 1:
            comentario = partes[1].strip()
        else:
            comentario = descripcion


    # ----------------------------------
    # ABONO SIMPLE (CASOS GENÉRICOS)
    # ----------------------------------
    else:
        comentario = descripcion

    return {
        "banco_origen": banco_origen,
        "cuenta_origen": cuenta_origen,
        "nombre_contraparte": nombre_contraparte,
        "referencia_movimiento": referencia,
        "comentario_movimiento": comentario,
        "tipo_documento": tipo_documento,
        "descripcion": descripcion,
    }

# ==============================
# BASE DE DATOS
# ==============================
def save_to_db(df):
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
            row["rut_pagador"],          # o None si no lo usas
            row["nombre_contraparte"],   # ✅ ahora sí guarda el nombre
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

    print(f"🟢 Insertados: {inserted}")
    print(f"🟡 Duplicados ignorados: {ignored}")

def export_db_to_excel():
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
    print("📄 Leyendo archivo:", INPUT_FILE)

    raw = pd.read_excel(INPUT_FILE, header=None)

    header_row = raw[
        raw.apply(
            lambda r: r.astype(str).str.contains("Fecha").any()
            and r.astype(str).str.contains("Descripción").any(),
            axis=1
        )
    ].index[0]

    df = pd.read_excel(INPUT_FILE, header=header_row)
    df.columns = [c.strip().lower() for c in df.columns]

    df = df.rename(columns={
        "fecha": "fecha",
        "descripción": "concepto",
        "cargo": "cargos",
        "abonos": "abonos",
        "saldo": "saldo"
    })

    df = df[~df["concepto"].astype(str).str.contains("saldo inicial", case=False)]
    df = df.dropna(subset=["fecha"])

    for col in ["cargos", "abonos", "saldo"]:
        df[col] = df[col].apply(clean_amount)

    rows = []

    for _, row in df.iterrows():
        parsed = parse_concepto(str(row["concepto"]))

        # 🔹 Corrección SPEI: distinguir ABONO vs CARGO según montos
        tipo_documento = parsed["tipo_documento"]

        if " SPEI." in parsed["descripcion"]:
            if row["cargos"] > 0:
                tipo_documento = "CARGO BANCARIO"
            else:
                tipo_documento = "ABONO BANCARIO"


        rows.append({
            "fecha": pd.to_datetime(row["fecha"], dayfirst=True),
            "banco": BANCO,
            "cuenta": None,
            "banco_origen": parsed["banco_origen"],
            "cuenta_origen": parsed["cuenta_origen"],
            "rut_pagador": None,
            "nombre_contraparte": parsed["nombre_contraparte"],
            "tipo_documento": tipo_documento,
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

    save_to_db(final_df)
    export_db_to_excel()

    print("✅ BANREGIO cargado y normalizado correctamente")

if __name__ == "__main__":
    main()

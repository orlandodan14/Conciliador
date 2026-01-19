import sqlite3
from pathlib import Path

BASE_DIR = Path(__file__).parent
DB_PATH = BASE_DIR / "conciliador.db"

# Crear carpeta si no existe
DB_PATH.parent.mkdir(exist_ok=True)

conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

cursor.execute("""
CREATE TABLE IF NOT EXISTS movimientos_bancarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    fecha TEXT NOT NULL,

    banco TEXT,
    cuenta TEXT,

    banco_origen TEXT,
    cuenta_origen TEXT,

    rut_pagador TEXT,
    nombre_contraparte TEXT,

    tipo_documento TEXT,
    moneda TEXT,

    descripcion TEXT,
    comentario_movimiento TEXT,
    referencia_movimiento TEXT,

    abonos REAL DEFAULT 0,
    cargos REAL DEFAULT 0,
    saldo REAL,
    neto REAL,

    created_at TEXT DEFAULT CURRENT_TIMESTAMP,

    UNIQUE (
        fecha,
        banco,
        cuenta,
        tipo_documento,
        descripcion,
        comentario_movimiento,
        referencia_movimiento,
        abonos,
        cargos,
        saldo
    )
);
""")

conn.commit()
conn.close()

print("✅ Base de datos y tabla creadas correctamente")
print(f"📁 Ruta: {DB_PATH}")

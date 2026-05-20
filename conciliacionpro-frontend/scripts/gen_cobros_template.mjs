/**
 * Genera la plantilla Excel de carga masiva para "Cobros".
 *
 * Columnas de la hoja COBROS (21 cols, A-U):
 *   Grupo 1 — DATOS DEL COBRO        A-H  (cobro_type, payment_date, counterparty_identifier,
 *                                          currency_code, total_amount, payment_method,
 *                                          reference, description)
 *   Grupo 2 — PAGO ELECTRÓNICO       I-L  (card_kind, card_last4, auth_code, bank_id)
 *   Grupo 3 — DOCUMENTO A COBRAR     M-O  (alloc_doc_class, alloc_doc_number, alloc_amount)
 *   Grupo 4 — ASIENTO CONTABLE       P-U  (account_debe, account_haber,
 *                                          branch_code_debe, branch_code_haber,
 *                                          business_line_code_debe, business_line_code_haber)
 *
 * Estructura de filas:
 *   Fila 1 → banner de grupos (merged, fondo de color)
 *   Fila 2 → clave técnica (key) con color O / R / C + nota hover
 *   Fila 3+ → datos de ejemplo (5 filas)
 *
 * Ejecutar: node scripts/gen_cobros_template.mjs
 */
import ExcelJS from "exceljs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const OUT = join(__dirname, "..", "public", "templates", "Plantilla_carga_masiva_cobros.xlsx");

// ─── Paleta ───────────────────────────────────────────────────────────────────
const C = {
  azulOscuro:  "0B2B4F",
  azulMedio:   "123B63",
  azulClaro:   "D6E4F5",

  naranjaBg:   "FFF3CD",  naranjaFont: "7C3800",
  verdeBg:     "D1FAE5",  verdeFont:   "064E3B",
  moradoBg:    "EDE9FE",  moradoFont:  "3B0764",

  grpCobro:    "DBEAFE",  // azul pálido   — datos cobro
  grpPago:     "FEF3C7",  // ámbar pálido  — pago electrónico
  grpDoc:      "F0FDF4",  // verde pálido  — documento a cobrar
  grpAsiento:  "F3E8FF",  // morado pálido — asiento contable

  ejVerde:     "F0FDF4",
  ejAmbar:     "FFFBEB",
  ejCeleste:   "F0F9FF",
  ejRosa:      "FFF1F2",
  ejGris:      "F8FAFC",

  // NON_FISCAL rows — fondo índigo pálido para distinguirlos visualmente
  ejNF:        "EEF2FF",  // indigo-50: OTRO_INGRESO

  blanco:      "FFFFFF",
  grisClaro:   "F8FAFC",
  grisBorde:   "CBD5E1",
  textoOscuro: "1E293B",
  textoMedio:  "475569",
};

const fill = (hex) => ({ type: "pattern", pattern: "solid", fgColor: { argb: "FF" + hex } });
const fnt  = (hex, sz = 10, bold = false, italic = false) =>
  ({ name: "Calibri", size: sz, bold, italic, color: { argb: "FF" + hex } });
const bord = (hex = C.grisBorde) => {
  const s = { style: "thin", color: { argb: "FF" + hex } };
  return { top: s, bottom: s, left: s, right: s };
};
function colLetter(n) {
  let s = "";
  while (n > 0) { const m = (n-1)%26; s = String.fromCharCode(65+m)+s; n = Math.floor((n-1)/26); }
  return s;
}

// ─────────────────────────────────────────────────────────────────────────────
//  HOJA 1 — INSTRUCCIONES
// ─────────────────────────────────────────────────────────────────────────────
async function buildInstrucciones(wb) {
  const ws = wb.addWorksheet("INSTRUCCIONES", {
    properties: { tabColor: { argb: "FF" + C.azulMedio } },
    views: [{ showGridLines: false }],
  });
  ws.columns = [
    { width: 3 }, { width: 22 }, { width: 8 }, { width: 14 },
    { width: 40 }, { width: 22 }, { width: 44 },
  ];

  const cell  = (r, c) => ws.getCell(r, c);
  const block = (row, text, bg, fg, sz = 10, bold = false, wrap = false) => {
    ws.mergeCells(row, 2, row, 7);
    const c = cell(row, 2);
    c.value = text; c.fill = fill(bg); c.font = fnt(fg, sz, bold);
    c.alignment = { horizontal: "left", vertical: "middle", wrapText: wrap };
    ws.getRow(row).height = wrap ? 32 : (sz >= 13 ? 34 : 22);
  };

  let r = 2;

  block(r, "  PLANTILLA DE CARGA MASIVA — COBROS",
    C.azulOscuro, C.blanco, 14, true); r++;
  block(r, "  ConciliacionPro  ·  Módulo Gestión de Ventas  ·  Cada fila = un cobro completo",
    C.azulMedio, C.blanco); r++;
  r++;

  block(r, "  ¿Para qué sirve?", C.azulMedio, C.blanco, 11, true); r++;
  block(r,
    "Permite registrar cobros de clientes en forma masiva: transferencias, tarjetas, efectivo, cheques y ajustes.\n" +
    "Cada fila crea un cobro en estado BORRADOR con su asiento contable. Si incluyes la sección\n" +
    "DOCUMENTO A COBRAR, el cobro queda vinculado a la factura o documento de ingreso correspondiente.",
    C.azulClaro, C.azulOscuro, 10, false, true); r++;
  r++;

  block(r, "  Pasos para usar esta plantilla", C.azulMedio, C.blanco, 11, true); r++;
  [
    "1 ▶  Abre la hoja  COBROS  (pestaña verde).",
    "2 ▶  Rellena una fila por cobro desde la fila 2 en adelante. La fila 1 es el encabezado (claves técnicas), no la modifiques.",
    "3 ▶  Colores en la fila de claves:  🟠 Naranja = OBLIGATORIO  |  🟢 Verde = OPCIONAL  |  🟣 Morado = CONDICIONAL.",
    "4 ▶  PAGO ELECTRÓNICO (cols I-L): rellena solo si el método es TARJETA o TRANSFERENCIA/CHEQUE (banco).",
    "5 ▶  DOCUMENTO A COBRAR (cols M-O): indica a qué factura u otro documento se aplica este cobro.",
    "       — alloc_doc_class: escribe FISCAL (facturas/boletas) o NON_FISCAL (otros ingresos).",
    "       — alloc_doc_number: el folio exacto del documento tal como está en el sistema.",
    "       — alloc_amount: monto a aplicar. Si lo dejas vacío se aplica el total del cobro.",
    "6 ▶  ASIENTO CONTABLE (cols P-U): ingresa las cuentas contables. Ver CATÁLOGOS para ejemplos.",
    "7 ▶  Guarda el archivo y cárgalo desde el botón  ⬆ Cargar Excel  en el módulo Cobros.",
  ].forEach(p => { block(r, "   " + p, C.grisClaro, C.textoOscuro, 10, false, true); r++; });
  r++;

  // Leyenda tipo O/R/C
  block(r, "  Leyenda de colores en la fila de claves técnicas", C.azulMedio, C.blanco, 11, true); r++;
  [
    [C.naranjaBg, "🟠  OBLIGATORIO — debes rellenarlo siempre."],
    [C.verdeBg,   "🟢  OPCIONAL — puedes dejarlo en blanco si no aplica."],
    [C.moradoBg,  "🟣  CONDICIONAL — requerido solo en ciertos casos (tarjeta, banco, etc.)."],
  ].forEach(([bg, lbl]) => {
    ws.mergeCells(r, 2, r, 7);
    const c = cell(r, 2); c.value = lbl; c.fill = fill(bg);
    c.font = fnt(C.textoOscuro, 10);
    c.alignment = { horizontal: "left", vertical: "middle" }; c.border = bord();
    ws.getRow(r).height = 20; r++;
  });
  r++;

  // Leyenda grupos
  block(r, "  Grupos de columnas en la hoja COBROS", C.azulMedio, C.blanco, 11, true); r++;
  [
    [C.grpCobro,   "🔵 A – H   Datos del cobro (tipo, fecha, RUT, moneda, monto, método de pago, referencia, descripción)"],
    [C.grpPago,    "🟡 I – L   Pago electrónico: tipo tarjeta, últimos 4 dígitos, cód. autorización, banco (ID)"],
    [C.grpDoc,     "🟢 M – P   Documento a cobrar: clase (FISCAL/NON_FISCAL), folio, tipo (33/56/61 o OTRO_INGRESO) y monto a aplicar"],
    [C.grpAsiento, "🟣 Q – V   Asiento contable: cuenta DEBE, cuenta HABER, sucursal y centro de utilidad por línea"],
  ].forEach(([bg, lbl]) => {
    ws.mergeCells(r, 2, r, 7);
    const c = cell(r, 2); c.value = lbl; c.fill = fill(bg);
    c.font = fnt(C.textoOscuro, 10);
    c.alignment = { horizontal: "left", vertical: "middle" }; c.border = bord();
    ws.getRow(r).height = 20; r++;
  });
  r++;

  // Leyenda ejemplos
  block(r, "  Colores de las filas de ejemplo", C.azulMedio, C.blanco, 11, true); r++;
  [
    // ── FISCAL (facturas, doc_class = FISCAL, alloc_doc_type = 33) ─────────────
    [C.ejCeleste, "🔵  Fila 2  — [FISCAL] Efectivo — Folio 1    — Orlando Paredes            — $11.900"],
    [C.ejVerde,   "🟢  Fila 3  — [FISCAL] Transferencia — Folio 3 — Orlando Paredes          — $23.800"],
    [C.ejAmbar,   "🟡  Fila 4  — [FISCAL] Tarjeta crédito — Folio 5007 — Tecnología Urbana   — $71.400"],
    [C.ejRosa,    "🔴  Fila 5  — [FISCAL] Cheque — Folio 5005 — Operaciones Centro SpA       — $150.000"],
    [C.ejVerde,   "🟢  Fila 6  — [FISCAL] Transferencia — Folio 5004 — Inversiones Pacífico  — $43.300"],
    [C.ejCeleste, "🔵  Fila 7  — [FISCAL] Efectivo — Folio 5003 — Servicios Delta SpA        — $29.500 parcial"],
    [C.ejAmbar,   "🟡  Fila 8  — [FISCAL] Tarjeta débito — Folio 5002 — Comercial Ñuñoa      — $50.000 parcial"],
    // ── NON_FISCAL (otros ingresos, alloc_doc_type = OTRO_INGRESO) ─────────────
    [C.ejNF,      "🟣  Fila 9  — [NON_FISCAL] Efectivo — OTI 3 — Virginia Castillo           — $30.000"],
    [C.ejNF,      "🟣  Fila 10 — [NON_FISCAL] Transferencia — OTI 2013 — Grupo Andes Ltda    — $180.000"],
    [C.ejNF,      "🟣  Fila 11 — [NON_FISCAL] Tarjeta crédito — OTI 2009 — Operaciones Centro — $140.000"],
    [C.ejNF,      "🟣  Fila 12 — [NON_FISCAL] Cheque — OTI 2008 — Servicios Delta SpA        — $18.500"],
    [C.ejNF,      "🟣  Fila 13 — [NON_FISCAL] Transferencia — OTI 2005 — Grupo Andes Ltda    — $350.000 parcial"],
    [C.ejNF,      "🟣  Fila 14 — [NON_FISCAL] Tarjeta débito — OTI 2002 — Comercial Ñuñoa    — $280.000"],
  ].forEach(([bg, lbl]) => {
    ws.mergeCells(r, 2, r, 7);
    const c = cell(r, 2); c.value = lbl; c.fill = fill(bg);
    c.font = fnt(C.textoOscuro, 10);
    c.alignment = { horizontal: "left", vertical: "middle" }; c.border = bord();
    ws.getRow(r).height = 20; r++;
  });
  r++;

  // Tabla detalle columnas
  block(r, "  Descripción detallada de columnas", C.azulMedio, C.blanco, 11, true); r++;

  // Cabecera tabla
  [["", 1], ["Clave técnica", 2], ["Col.", 3], ["Tipo", 4],
   ["¿Qué significa?", 5], ["Ejemplo", 6], ["Notas", 7]].forEach(([h, ci]) => {
    if (ci === 1) return;
    const c = ws.getCell(r, ci);
    c.value = h; c.fill = fill(C.azulOscuro); c.font = fnt(C.blanco, 10, true);
    c.alignment = { horizontal: "center", vertical: "middle" };
  });
  ws.getRow(r).height = 22; r++;

  const TIPOS = {
    O: { bg: C.naranjaBg, bd: "F59E0B" },
    R: { bg: C.verdeBg,   bd: "10B981" },
    C: { bg: C.moradoBg,  bd: "8B5CF6" },
  };
  // [key, col, O/R/C, descripción, ejemplo, nota]
  const COLS_INFO = [
    // Grupo 1
    ["cobro_type",              "A","O","Tipo de cobro",                           "COBRO",             "COBRO (pago de cliente) o AJUSTE (nota de ajuste, puede ser negativo)."],
    ["payment_date",            "B","O","Fecha del cobro",                         "2026-04-30",        "Formato YYYY-MM-DD o fecha de Excel. Columna real en la tabla payments."],
    ["counterparty_identifier", "C","O","RUT / NIC del cliente",                   "76543210-9",        "Debe coincidir con el identificador en el sistema. El nombre se resuelve por FK."],
    ["currency_code",           "D","R","Código de moneda ISO",                    "CLP",               "CLP por defecto. También USD, EUR, UF. Ver CATÁLOGOS."],
    ["total_amount",            "E","O","Monto total del cobro",                   "500000",            "Solo número, sin puntos ni $. Para AJUSTE puede ser negativo: -50000."],
    ["payment_method",          "F","O","Forma de pago",                           "TRANSFERENCIA",     "EFECTIVO · TRANSFERENCIA · CHEQUE · TARJETA. Ver CATÁLOGOS."],
    ["reference",               "G","R","Referencia interna del cobro",            "COB-2026-001",      "Columna real reference en payments. Identificador interno o folio propio."],
    ["description",             "H","R","Descripción libre / glosa",               "Cobro fact. F-1001","Texto informativo. Se guarda en la columna notes de payments."],
    // Grupo 2
    ["card_kind",               "I","C","Tipo de tarjeta",                         "CREDITO",           "DEBITO o CREDITO. Solo cuando payment_method = TARJETA."],
    ["card_last4",              "J","C","Últimos 4 dígitos de la tarjeta",         "4321",              "Solo los 4 últimos dígitos. Nunca el número completo. Solo si TARJETA."],
    ["auth_code",               "K","C","Código de autorización del POS/plat.",    "TK88231",           "Código que aparece en el voucher o comprobante. Solo si TARJETA."],
    ["bank_id",                 "L","C","ID del banco en el sistema",              "uuid-banco-bci",    "FK futura al módulo Bancos. Por ahora déjalo en blanco o usa un ID provisional."],
    // Grupo 3
    ["alloc_doc_class",         "M","R","Clase del documento a cobrar",            "FISCAL",            "FISCAL (facturas/boletas/NC/ND) o NON_FISCAL (otros ingresos). Ver CATÁLOGOS."],
    ["alloc_doc_number",        "N","R","Folio / N° del documento a cobrar",       "F-1001",            "El número exacto del documento tal como aparece en el sistema (table trade_docs.number)."],
    ["alloc_amount",            "O","R","Monto a aplicar al documento",            "500000",            "Si está vacío, se aplica el total_amount completo al documento indicado."],
    // Grupo 4
    ["account_debe",            "P","O","Cuenta contable del DEBE",                "11010201",          "Código de la cuenta que recibe el cobro (caja, banco, CxC…)."],
    ["account_haber",           "Q","O","Cuenta contable del HABER",               "11030101",          "Código de la cuenta que se acredita (CxC, ingreso, anticipo…)."],
    ["branch_code_debe",        "R","C","Código de sucursal — línea DEBE",         "SUC01",             "Solo si la cuenta del DEBE requiere dimensión sucursal en el plan de cuentas."],
    ["branch_code_haber",       "S","C","Código de sucursal — línea HABER",        "SUC01",             "Solo si la cuenta del HABER requiere dimensión sucursal."],
    ["business_line_code_debe", "T","C","Código de unidad de negocio — DEBE",      "VEN",               "Centro de utilidad / línea de negocio. Solo si la cuenta lo requiere."],
    ["business_line_code_haber","U","C","Código de unidad de negocio — HABER",     "VEN",               "Igual que el anterior, para la línea del haber."],
  ];

  COLS_INFO.forEach(([key, col, tipo, desc, ej, nota]) => {
    const { bg, bd } = TIPOS[tipo];
    [["", 1], [key, 2], [col, 3], [tipo === "O" ? "Obligatorio" : tipo === "R" ? "Opcional" : "Condicional", 4],
     [desc, 5], [ej, 6], [nota, 7]].forEach(([v, ci]) => {
      const c = ws.getCell(r, ci);
      c.value = v;
      c.fill  = fill(ci === 1 ? C.blanco : bg);
      c.font  = fnt(C.textoOscuro, 10, ci === 2);
      c.alignment = { horizontal: [1, 3, 4].includes(ci) ? "center" : "left", vertical: "middle", wrapText: true };
      c.border = bord(ci === 1 ? C.blanco : bd);
    });
    ws.getRow(r).height = 30; r++;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  HOJA 2 — CATÁLOGOS
// ─────────────────────────────────────────────────────────────────────────────
async function buildCatalogos(wb) {
  const ws = wb.addWorksheet("CATÁLOGOS", {
    properties: { tabColor: { argb: "FF1E5C9B" } },
    views: [{ showGridLines: false }],
  });
  ws.columns = [{ width: 3 }, { width: 28 }, { width: 58 }, { width: 3 }];

  const addHead = (row, title) => {
    ws.mergeCells(row, 2, row, 3);
    const c = ws.getCell(row, 2);
    c.value = title; c.fill = fill(C.azulMedio); c.font = fnt(C.blanco, 11, true);
    c.alignment = { horizontal: "left", vertical: "middle" };
    ws.getRow(row).height = 24;
  };
  const addRow = (row, val, desc, bg = C.grisClaro) => {
    const c1 = ws.getCell(row, 2);
    c1.value = val; c1.fill = fill(bg); c1.font = fnt(C.textoOscuro, 10, true);
    c1.alignment = { horizontal: "center", vertical: "middle" }; c1.border = bord();
    const c2 = ws.getCell(row, 3);
    c2.value = desc; c2.fill = fill(C.blanco); c2.font = fnt(C.textoMedio, 10);
    c2.alignment = { horizontal: "left", vertical: "middle", wrapText: true }; c2.border = bord();
    ws.getRow(row).height = 22;
  };
  const sep = (row) => { ws.getRow(row).height = 10; };

  let r = 2;

  // Título
  ws.mergeCells(r, 2, r, 3);
  const t = ws.getCell(r, 2);
  t.value = "CATÁLOGOS — Valores válidos por columna";
  t.fill = fill(C.azulOscuro); t.font = fnt(C.blanco, 13, true);
  t.alignment = { horizontal: "left", vertical: "middle" };
  ws.getRow(r).height = 30; r++; r++;

  // cobro_type
  addHead(r, "cobro_type — Tipo de cobro  (col. A)"); r++;
  addRow(r, "COBRO",  "Ingreso recibido de un cliente (transferencia, efectivo, tarjeta, cheque).", C.ejVerde); r++;
  addRow(r, "AJUSTE", "Nota de ajuste. Puede ser positivo o negativo. No implica movimiento físico directo.", C.ejGris); r++;
  sep(r); r++;

  // payment_method
  addHead(r, "payment_method — Forma de pago  (col. F)"); r++;
  addRow(r, "EFECTIVO",      "Dinero en efectivo recibido en caja."); r++;
  addRow(r, "TRANSFERENCIA", "Transferencia electrónica o depósito bancario."); r++;
  addRow(r, "CHEQUE",        "Cheque bancario al portador o nominativo."); r++;
  addRow(r, "TARJETA",       "Pago con tarjeta débito/crédito vía POS o plataforma web."); r++;
  sep(r); r++;

  // card_kind
  addHead(r, "card_kind — Tipo de tarjeta  (col. I)  —  solo si payment_method = TARJETA"); r++;
  addRow(r, "DEBITO",  "Tarjeta de débito (cargo directo a cuenta corriente o vista)."); r++;
  addRow(r, "CREDITO", "Tarjeta de crédito (cargo diferido o en cuotas)."); r++;
  sep(r); r++;

  // currency_code
  addHead(r, "currency_code — Moneda ISO  (col. D)"); r++;
  addRow(r, "CLP", "Peso chileno — valor por defecto si se omite."); r++;
  addRow(r, "USD", "Dólar estadounidense."); r++;
  addRow(r, "EUR", "Euro."); r++;
  addRow(r, "UF",  "Unidad de Fomento (Chile)."); r++;
  sep(r); r++;

  // alloc_doc_class  ← NUEVO
  addHead(r, "alloc_doc_class — Clase del documento a cobrar  (col. M)"); r++;
  addRow(r, "FISCAL",
    "Documentos tributarios: facturas afectas/exentas, boletas, notas de crédito/débito. " +
    "Corresponde a doc_class = 'FISCAL' en la tabla trade_docs.",
    C.ejVerde); r++;
  addRow(r, "NON_FISCAL",
    "Otros documentos de ingresos no tributarios: OTRO_INGRESO, DEVOLUCION. " +
    "Corresponde a doc_class = 'NON_FISCAL' en la tabla trade_docs.",
    C.ejCeleste); r++;
  addRow(r, "(vacío)",
    "Si dejas alloc_doc_class vacío pero alloc_doc_number tiene valor, el sistema buscará " +
    "el documento solo por número en ambas clases. Puede dar resultado ambiguo si hay folios duplicados.",
    C.grisClaro); r++;
  sep(r); r++;

  // alloc_doc_type  ← NUEVO
  addHead(r, "alloc_doc_type — Tipo de documento a cobrar  (col. O)"); r++;
  addRow(r, "33",            "Factura Afecta (tipo SII 33). Usar con alloc_doc_class = FISCAL.",     C.ejVerde); r++;
  addRow(r, "34",            "Factura Exenta (tipo SII 34). Usar con alloc_doc_class = FISCAL.",     C.ejVerde); r++;
  addRow(r, "39",            "Boleta Electrónica (tipo SII 39). Usar con alloc_doc_class = FISCAL.", C.ejVerde); r++;
  addRow(r, "56",            "Nota de Débito (tipo SII 56). Usar con alloc_doc_class = FISCAL.",     C.ejAmbar); r++;
  addRow(r, "61",            "Nota de Crédito (tipo SII 61). Usar con alloc_doc_class = FISCAL.",    C.ejRosa); r++;
  addRow(r, "OTRO_INGRESO",  "Otro Ingreso. Usar con alloc_doc_class = NON_FISCAL. Ej: OTI-2013, OTI-3.",     C.ejNF); r++;
  addRow(r, "DEVOLUCION",    "Devolución. Usar con alloc_doc_class = NON_FISCAL. Ej: DEV-8006.",              C.ejNF); r++;
  addRow(r, "(vacío)",
    "Si lo dejas vacío el sistema no filtra por tipo y puede encontrar un doc incorrecto cuando " +
    "existen folios iguales con distintos tipos (p.ej. folio 1 como factura Y como nota de crédito). " +
    "Se recomienda siempre completar alloc_doc_type junto con alloc_doc_class.",
    C.grisClaro); r++;
  sep(r); r++;

  // Grupos referencia rápida
  addHead(r, "Grupos de columnas — Referencia rápida"); r++;
  [
    ["A – H",  "DATOS DEL COBRO: cobro_type, payment_date, counterparty_identifier, currency_code, total_amount, payment_method, reference, description"],
    ["I – L",  "PAGO ELECTRÓNICO: card_kind, card_last4, auth_code, bank_id"],
    ["M – P",  "DOCUMENTO A COBRAR: alloc_doc_class (FISCAL/NON_FISCAL), alloc_doc_number (folio), alloc_doc_type (33/34/56/61 o OTRO_INGRESO/DEVOLUCION), alloc_amount"],
    ["Q – V",  "ASIENTO CONTABLE: account_debe, account_haber, branch_code_debe, branch_code_haber, business_line_code_debe, business_line_code_haber"],
  ].forEach(([rango, desc]) => {
    const c1 = ws.getCell(r, 2);
    c1.value = rango; c1.fill = fill(C.azulClaro); c1.font = fnt(C.azulOscuro, 10, true);
    c1.alignment = { horizontal: "center", vertical: "middle" }; c1.border = bord();
    const c2 = ws.getCell(r, 3);
    c2.value = desc; c2.fill = fill(C.blanco); c2.font = fnt(C.textoMedio, 10);
    c2.alignment = { horizontal: "left", vertical: "middle", wrapText: true }; c2.border = bord();
    ws.getRow(r).height = 24; r++;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  HOJA 3 — COBROS  (hoja principal de datos)
// ─────────────────────────────────────────────────────────────────────────────
async function buildCobros(wb) {
  const ws = wb.addWorksheet("COBROS", {
    properties: { tabColor: { argb: "FF10B981" } },
    views: [{ state: "frozen", xSplit: 0, ySplit: 1, showGridLines: true }],
  });

  // ── Definición de columnas ────────────────────────────────────────────────
  // tipo: O = obligatorio, R = opcional, C = condicional
  const COLS = [
    // ── Grupo 1: Datos del cobro ──────────────────────────────────────────────
    { key: "cobro_type",              label: "Tipo",                   tip: "COBRO / AJUSTE",                       tipo:"O", grp:C.grpCobro,   w:14 },
    { key: "payment_date",            label: "Fecha cobro",            tip: "YYYY-MM-DD  (col. real: payment_date)",tipo:"O", grp:C.grpCobro,   w:15 },
    { key: "counterparty_identifier", label: "RUT / NIC",              tip: "Identificador del cliente",            tipo:"O", grp:C.grpCobro,   w:18 },
    { key: "currency_code",           label: "Moneda",                 tip: "CLP / USD / EUR / UF",                 tipo:"R", grp:C.grpCobro,   w:10 },
    { key: "total_amount",            label: "Monto cobro",            tip: "Número sin puntos (col. real: total_amount)", tipo:"O", grp:C.grpCobro, w:16 },
    { key: "payment_method",          label: "Forma de pago",          tip: "EFECTIVO/TRANSFERENCIA/CHEQUE/TARJETA",tipo:"O", grp:C.grpCobro,   w:18 },
    { key: "reference",               label: "Referencia interna",     tip: "Folio propio (col. real: reference)",  tipo:"R", grp:C.grpCobro,   w:18 },
    { key: "description",             label: "Descripción / glosa",    tip: "Texto libre (se guarda en notes)",     tipo:"R", grp:C.grpCobro,   w:30 },
    // ── Grupo 2: Pago electrónico ─────────────────────────────────────────────
    { key: "card_kind",               label: "Tipo tarjeta",           tip: "DEBITO / CREDITO — solo si TARJETA",  tipo:"C", grp:C.grpPago,    w:14 },
    { key: "card_last4",              label: "Últimos 4 dígitos",      tip: "4 dígitos de la tarjeta",             tipo:"C", grp:C.grpPago,    w:14 },
    { key: "auth_code",               label: "Cód. autorización",      tip: "Código del voucher/comprobante",      tipo:"C", grp:C.grpPago,    w:18 },
    { key: "bank_id",                 label: "ID banco",               tip: "FK al módulo Bancos (futuro)",        tipo:"C", grp:C.grpPago,    w:16 },
    // ── Grupo 3: Documento a cobrar ───────────────────────────────────────────
    { key: "alloc_doc_class",         label: "Clase doc.",             tip: "FISCAL o NON_FISCAL — ver CATÁLOGOS",                        tipo:"R", grp:C.grpDoc,     w:14 },
    { key: "alloc_doc_number",        label: "Folio / N° doc.",        tip: "Número exacto en trade_docs.number",                         tipo:"R", grp:C.grpDoc,     w:16 },
    { key: "alloc_doc_type",          label: "Tipo doc.",              tip: "FISCAL: 33/34/56/61. NON_FISCAL: OTRO_INGRESO/DEVOLUCION",   tipo:"R", grp:C.grpDoc,     w:14 },
    { key: "alloc_amount",            label: "Monto a aplicar",        tip: "Vacío = aplica total_amount completo",                       tipo:"R", grp:C.grpDoc,     w:16 },
    // ── Grupo 4: Asiento contable ─────────────────────────────────────────────
    { key: "account_debe",            label: "Cuenta DEBE",            tip: "Cód. cuenta que recibe el cobro",     tipo:"O", grp:C.grpAsiento, w:16 },
    { key: "account_haber",           label: "Cuenta HABER",           tip: "Cód. cuenta que se acredita",        tipo:"O", grp:C.grpAsiento, w:16 },
    { key: "branch_code_debe",        label: "Sucursal DEBE",          tip: "Si la cuenta exige sucursal",         tipo:"C", grp:C.grpAsiento, w:14 },
    { key: "branch_code_haber",       label: "Sucursal HABER",         tip: "Si la cuenta exige sucursal",         tipo:"C", grp:C.grpAsiento, w:14 },
    { key: "business_line_code_debe", label: "C.U. DEBE",              tip: "Centro de utilidad — línea DEBE",     tipo:"C", grp:C.grpAsiento, w:14 },
    { key: "business_line_code_haber",label: "C.U. HABER",             tip: "Centro de utilidad — línea HABER",    tipo:"C", grp:C.grpAsiento, w:14 },
  ];

  COLS.forEach((col, i) => { ws.getColumn(i + 1).width = col.w; });

  const BG = { O: C.naranjaBg, R: C.verdeBg, C: C.moradoBg };
  const FG = { O: C.naranjaFont, R: C.verdeFont, C: C.moradoFont };
  const BD = { O: "F59E0B", R: "10B981", C: "8B5CF6" };

  // ── Fila 1: claves técnicas con color O/R/C (única fila de encabezado) ────
  COLS.forEach((col, i) => {
    const c = ws.getCell(1, i + 1);
    c.value = col.key;
    c.fill  = fill(BG[col.tipo]);
    c.font  = fnt(FG[col.tipo], 10, true);
    c.alignment = { horizontal: "center", vertical: "middle" };
    c.border = bord(BD[col.tipo]);
    c.note  = `${col.label}\n${col.tip}`;
  });
  ws.getRow(1).height = 22;

  // ── Filas de ejemplo (fila 2 en adelante) ─────────────────────────────────
  // Cada ejemplo tiene _bg para el color de la fila y luego las columnas por key
  // ── Ejemplos con datos reales de facturas pendientes de cobro ────────────────
  // ⚠️  Reemplaza account_debe / account_haber con los códigos reales de tu plan de cuentas.
  // ⚠️  alloc_doc_number debe coincidir exactamente con trade_docs.number en el sistema.
  const EJEMPLOS = [
    // Fila 2 — Efectivo — Folio 1 — Orlando Paredes — saldo completo $11.900
    {
      _bg: C.ejCeleste,
      cobro_type: "COBRO", payment_date: "2026-05-13",
      counterparty_identifier: "26104839-6", currency_code: "CLP",
      total_amount: 11900, payment_method: "EFECTIVO",
      reference: "COB-2026-001", description: "Cobro efectivo factura folio 1",
      card_kind: "", card_last4: "", auth_code: "", bank_id: "",
      alloc_doc_class: "FISCAL", alloc_doc_number: "1", alloc_doc_type: "33", alloc_amount: 11900,
      account_debe: "1010101", account_haber: "1050101",
      branch_code_debe: "", branch_code_haber: "",
      business_line_code_debe: "", business_line_code_haber: "",
    },
    // Fila 3 — Transferencia — Folio 3 — Orlando Paredes — saldo completo $23.800
    {
      _bg: C.ejVerde,
      cobro_type: "COBRO", payment_date: "2026-05-13",
      counterparty_identifier: "26104839-6", currency_code: "CLP",
      total_amount: 23800, payment_method: "TRANSFERENCIA",
      reference: "COB-2026-002", description: "Cobro transferencia factura folio 3",
      card_kind: "", card_last4: "", auth_code: "", bank_id: "",
      alloc_doc_class: "FISCAL", alloc_doc_number: "3", alloc_doc_type: "33", alloc_amount: 23800,
      account_debe: "1020106", account_haber: "1050101",
      branch_code_debe: "", branch_code_haber: "",
      business_line_code_debe: "", business_line_code_haber: "",
    },
    // Fila 4 — Tarjeta crédito — Folio 5007 — Tecnología Urbana SpA — saldo completo $71.400
    {
      _bg: C.ejAmbar,
      cobro_type: "COBRO", payment_date: "2026-05-13",
      counterparty_identifier: "76777777-8", currency_code: "CLP",
      total_amount: 71400, payment_method: "TARJETA",
      reference: "COB-2026-003", description: "Cobro tarjeta crédito WebPay factura folio 5007",
      card_kind: "CREDITO", card_last4: "1234", auth_code: "WP55301", bank_id: "",
      alloc_doc_class: "FISCAL", alloc_doc_number: "5007", alloc_doc_type: "33", alloc_amount: 71400,
      account_debe: "1020101", account_haber: "1050101",
      branch_code_debe: "", branch_code_haber: "",
      business_line_code_debe: "", business_line_code_haber: "",
    },
    // Fila 5 — Cheque — Folio 5005 — Operaciones Centro SpA — saldo completo $150.000
    {
      _bg: C.ejRosa,
      cobro_type: "COBRO", payment_date: "2026-05-13",
      counterparty_identifier: "76555555-6", currency_code: "CLP",
      total_amount: 150000, payment_method: "CHEQUE",
      reference: "COB-2026-004", description: "Cobro cheque N°00789 factura folio 5005",
      card_kind: "", card_last4: "", auth_code: "", bank_id: "",
      alloc_doc_class: "FISCAL", alloc_doc_number: "5005", alloc_doc_type: "33", alloc_amount: 150000,
      account_debe: "1020102", account_haber: "1050101",
      branch_code_debe: "", branch_code_haber: "",
      business_line_code_debe: "", business_line_code_haber: "",
    },
    // Fila 6 — Transferencia — Folio 5004 — Inversiones Pacífico Ltda — saldo $43.300
    {
      _bg: C.ejVerde,
      cobro_type: "COBRO", payment_date: "2026-05-13",
      counterparty_identifier: "76444444-5", currency_code: "CLP",
      total_amount: 43300, payment_method: "TRANSFERENCIA",
      reference: "COB-2026-005", description: "Cobro transferencia factura folio 5004 (pago saldo)",
      card_kind: "", card_last4: "", auth_code: "", bank_id: "",
      alloc_doc_class: "FISCAL", alloc_doc_number: "5004", alloc_doc_type: "33", alloc_amount: 43300,
      account_debe: "1020106", account_haber: "1050101",
      branch_code_debe: "", branch_code_haber: "",
      business_line_code_debe: "", business_line_code_haber: "",
    },
    // Fila 7 — Efectivo — Folio 5003 — Servicios Delta SpA — cobro parcial $29.500 del saldo
    {
      _bg: C.ejCeleste,
      cobro_type: "COBRO", payment_date: "2026-05-13",
      counterparty_identifier: "76333333-4", currency_code: "CLP",
      total_amount: 29500, payment_method: "EFECTIVO",
      reference: "COB-2026-006", description: "Cobro parcial efectivo factura folio 5003",
      card_kind: "", card_last4: "", auth_code: "", bank_id: "",
      alloc_doc_class: "FISCAL", alloc_doc_number: "5003", alloc_doc_type: "33", alloc_amount: 29500,
      account_debe: "1010101", account_haber: "1050101",
      branch_code_debe: "", branch_code_haber: "",
      business_line_code_debe: "", business_line_code_haber: "",
    },
    // Fila 8 — Tarjeta débito — Folio 5002 — Comercial Ñuñoa Ltda — cobro parcial $50.000
    {
      _bg: C.ejAmbar,
      cobro_type: "COBRO", payment_date: "2026-05-13",
      counterparty_identifier: "76222222-3", currency_code: "CLP",
      total_amount: 50000, payment_method: "TARJETA",
      reference: "COB-2026-007", description: "Cobro parcial tarjeta débito factura folio 5002",
      card_kind: "DEBITO", card_last4: "5678", auth_code: "POS44102", bank_id: "",
      alloc_doc_class: "FISCAL", alloc_doc_number: "5002", alloc_doc_type: "33", alloc_amount: 50000,
      account_debe: "1020101", account_haber: "1050101",
      branch_code_debe: "", branch_code_haber: "",
      business_line_code_debe: "", business_line_code_haber: "",
    },

    // ── NON_FISCAL (Otros Documentos de Ingresos) ─────────────────────────────
    // Fila 9 — Efectivo — OTI 3 — Virginia Castillo — $30.000 total
    {
      _bg: C.ejNF,
      cobro_type: "COBRO", payment_date: "2026-05-13",
      counterparty_identifier: "268424490", currency_code: "CLP",
      total_amount: 30000, payment_method: "EFECTIVO",
      reference: "COB-2026-008", description: "Cobro efectivo otro ingreso OTI-3",
      card_kind: "", card_last4: "", auth_code: "", bank_id: "",
      alloc_doc_class: "NON_FISCAL", alloc_doc_number: "3", alloc_doc_type: "OTRO_INGRESO", alloc_amount: 30000,
      account_debe: "1010101", account_haber: "1050101",
      branch_code_debe: "", branch_code_haber: "",
      business_line_code_debe: "", business_line_code_haber: "",
    },
    // Fila 10 — Transferencia — OTI 2013 — Grupo Andes Ltda — $180.000 total
    {
      _bg: C.ejNF,
      cobro_type: "COBRO", payment_date: "2026-05-13",
      counterparty_identifier: "76666666-7", currency_code: "CLP",
      total_amount: 180000, payment_method: "TRANSFERENCIA",
      reference: "COB-2026-009", description: "Cobro transferencia otro ingreso OTI-2013",
      card_kind: "", card_last4: "", auth_code: "", bank_id: "",
      alloc_doc_class: "NON_FISCAL", alloc_doc_number: "2013", alloc_doc_type: "OTRO_INGRESO", alloc_amount: 180000,
      account_debe: "1020106", account_haber: "1050101",
      branch_code_debe: "", branch_code_haber: "",
      business_line_code_debe: "", business_line_code_haber: "",
    },
    // Fila 11 — Tarjeta crédito — OTI 2009 — Operaciones Centro SpA — $140.000 total
    {
      _bg: C.ejNF,
      cobro_type: "COBRO", payment_date: "2026-05-13",
      counterparty_identifier: "76555555-6", currency_code: "CLP",
      total_amount: 140000, payment_method: "TARJETA",
      reference: "COB-2026-010", description: "Cobro tarjeta crédito otro ingreso OTI-2009",
      card_kind: "CREDITO", card_last4: "9012", auth_code: "WP77402", bank_id: "",
      alloc_doc_class: "NON_FISCAL", alloc_doc_number: "2009", alloc_doc_type: "OTRO_INGRESO", alloc_amount: 140000,
      account_debe: "1020101", account_haber: "1050101",
      branch_code_debe: "", branch_code_haber: "",
      business_line_code_debe: "", business_line_code_haber: "",
    },
    // Fila 12 — Cheque — OTI 2008 — Servicios Delta SpA — $18.500 total
    {
      _bg: C.ejNF,
      cobro_type: "COBRO", payment_date: "2026-05-13",
      counterparty_identifier: "76333333-4", currency_code: "CLP",
      total_amount: 18500, payment_method: "CHEQUE",
      reference: "COB-2026-011", description: "Cobro cheque otro ingreso OTI-2008",
      card_kind: "", card_last4: "", auth_code: "", bank_id: "",
      alloc_doc_class: "NON_FISCAL", alloc_doc_number: "2008", alloc_doc_type: "OTRO_INGRESO", alloc_amount: 18500,
      account_debe: "1020102", account_haber: "1050101",
      branch_code_debe: "", branch_code_haber: "",
      business_line_code_debe: "", business_line_code_haber: "",
    },
    // Fila 13 — Transferencia — OTI 2005 — Grupo Andes Ltda — cobro parcial $350.000 de $690.000
    {
      _bg: C.ejNF,
      cobro_type: "COBRO", payment_date: "2026-05-13",
      counterparty_identifier: "76666666-7", currency_code: "CLP",
      total_amount: 350000, payment_method: "TRANSFERENCIA",
      reference: "COB-2026-012", description: "Cobro parcial transferencia otro ingreso OTI-2005",
      card_kind: "", card_last4: "", auth_code: "", bank_id: "",
      alloc_doc_class: "NON_FISCAL", alloc_doc_number: "2005", alloc_doc_type: "OTRO_INGRESO", alloc_amount: 350000,
      account_debe: "1020106", account_haber: "1050101",
      branch_code_debe: "", branch_code_haber: "",
      business_line_code_debe: "", business_line_code_haber: "",
    },
    // Fila 14 — Tarjeta débito — OTI 2002 — Comercial Ñuñoa Ltda — $280.000 total
    {
      _bg: C.ejNF,
      cobro_type: "COBRO", payment_date: "2026-05-13",
      counterparty_identifier: "76222222-3", currency_code: "CLP",
      total_amount: 280000, payment_method: "TARJETA",
      reference: "COB-2026-013", description: "Cobro tarjeta débito otro ingreso OTI-2002",
      card_kind: "DEBITO", card_last4: "3456", auth_code: "POS88203", bank_id: "",
      alloc_doc_class: "NON_FISCAL", alloc_doc_number: "2002", alloc_doc_type: "OTRO_INGRESO", alloc_amount: 280000,
      account_debe: "1020101", account_haber: "1050101",
      branch_code_debe: "", branch_code_haber: "",
      business_line_code_debe: "", business_line_code_haber: "",
    },
  ];

  EJEMPLOS.forEach((ej, ri) => {
    const rowIdx = ri + 2;          // datos desde fila 2 (fila 1 = encabezado)
    const { _bg, ...data } = ej;
    COLS.forEach((col, ci) => {
      const c  = ws.getCell(rowIdx, ci + 1);
      const v  = data[col.key];
      const isNum = typeof v === "number";
      c.value = isNum ? v : (v === "" ? null : v);
      c.fill  = fill(_bg);
      c.font  = { name: "Calibri", size: 10, color: { argb: "FF" + C.textoOscuro }, bold: col.key === "cobro_type" };
      c.alignment = { horizontal: isNum ? "right" : "left", vertical: "middle" };
      c.border = bord();
      if (isNum) c.numFmt = "#,##0";
    });
    ws.getRow(rowIdx).height = 20;
  });

  // ── Dropdowns (fila 2 hasta 5002) ─────────────────────────────────────────
  const DS = 2, DE = 5002;
  const VALIDATIONS = {
    cobro_type:      '"COBRO,AJUSTE"',
    payment_method:  '"EFECTIVO,TRANSFERENCIA,CHEQUE,TARJETA"',
    card_kind:       '"DEBITO,CREDITO"',
    currency_code:   '"CLP,USD,EUR,UF"',
    alloc_doc_class: '"FISCAL,NON_FISCAL"',   // ← nuevo dropdown
  };
  COLS.forEach((col, i) => {
    if (!VALIDATIONS[col.key]) return;
    const cl = colLetter(i + 1);
    ws.dataValidations.add(`${cl}${DS}:${cl}${DE}`, {
      type: "list", allowBlank: true,
      formulae: [VALIDATIONS[col.key]],
      showErrorMessage: true, errorStyle: "warning",
      errorTitle: "Valor no válido",
      error: "Selecciona un valor de la lista o déjalo vacío.",
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  MAIN
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  const wb = new ExcelJS.Workbook();
  wb.creator  = "ConciliacionPro";
  wb.created  = new Date();
  wb.modified = new Date();
  wb.title    = "Plantilla Carga Masiva Cobros";

  await buildInstrucciones(wb);
  await buildCatalogos(wb);
  await buildCobros(wb);

  await wb.xlsx.writeFile(OUT);
  console.log("✅ Plantilla generada en:", OUT);
}

main().catch(err => { console.error("❌ Error:", err); process.exit(1); });

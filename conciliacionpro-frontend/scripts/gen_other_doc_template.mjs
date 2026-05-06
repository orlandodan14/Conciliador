/**
 * Genera la plantilla Excel de carga masiva para "Otros Documentos de Ingresos".
 * Usa ExcelJS para formatos reales: colores, bordes, validaciones, drop-downs.
 *
 * Formato de la hoja DOCUMENTOS (igual que Documentos Tributarios):
 *   Fila 1  → claves técnicas (col.key) con color según tipo O/R/C
 *   Fila 2+ → datos (ejemplos)
 *
 * Ejecutar: node scripts/gen_other_doc_template.mjs
 */
import ExcelJS from "exceljs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const OUT = join(__dirname, "..", "public", "templates", "Plantilla_carga_masiva_otros_docs_ingresos.xlsx");

// ─── Paleta de colores ────────────────────────────────────────────────────────
const C = {
  azulOscuro:  "0B2B4F",
  azulMedio:   "123B63",
  azulClaro:   "D6E4F5",

  naranjaBg:   "FFF3CD",
  naranjaFont: "7C3800",
  verdeBg:     "D1FAE5",
  verdeFont:   "064E3B",
  moradoBg:    "EDE9FE",
  moradoFont:  "3B0764",

  ejVerde:     "F0FDF4",
  ejAmbar:     "FFFBEB",
  ejCeleste:   "F0F9FF",
  ejRojo:      "FFF1F2",

  blanco:      "FFFFFF",
  grisClaro:   "F8FAFC",
  grisBorde:   "CBD5E1",
  textoOscuro: "1E293B",
  textoMedio:  "475569",
};

const fill  = (hex) => ({ type: "pattern", pattern: "solid", fgColor: { argb: "FF" + hex } });
const fnt   = (hex, sz = 10, bold = false, italic = false) =>
  ({ name: "Calibri", size: sz, bold, italic, color: { argb: "FF" + hex } });
const bord  = (hex = C.grisBorde) => {
  const s = { style: "thin", color: { argb: "FF" + hex } };
  return { top: s, bottom: s, left: s, right: s };
};

// ─────────────────────────────────────────────────────────────────────────────
//  HOJA 1 — INSTRUCCIONES
// ─────────────────────────────────────────────────────────────────────────────
async function buildInstrucciones(wb) {
  const ws = wb.addWorksheet("INSTRUCCIONES", {
    properties: { tabColor: { argb: "FF" + C.azulMedio } },
    views: [{ showGridLines: false }],
  });

  ws.columns = [
    { width: 3  },
    { width: 26 },
    { width: 20 },
    { width: 38 },
    { width: 26 },
    { width: 36 },
    { width: 3  },
  ];

  const cell = (r, c) => ws.getCell(r, c);

  const block = (row, text, bg, fg, sz = 10, bold = false, wrap = false) => {
    ws.mergeCells(row, 2, row, 6);
    const c = cell(row, 2);
    c.value = text;
    c.fill  = fill(bg);
    c.font  = fnt(fg, sz, bold);
    c.alignment = { horizontal: "left", vertical: "middle", wrapText: wrap };
    ws.getRow(row).height = wrap ? 28 : (sz >= 13 ? 32 : 22);
  };

  let r = 2;
  block(r, "  PLANTILLA DE CARGA MASIVA — OTROS DOCUMENTOS DE INGRESOS",
    C.azulOscuro, C.blanco, 14, true); r++;
  block(r, "  ConciliacionPro  ·  Módulo Gestión de Ventas · Cada fila = un documento completo",
    C.azulMedio, C.blanco, 10, false); r++;
  r++;

  block(r, "  ¿Para qué sirve esta plantilla?", C.azulMedio, C.blanco, 11, true); r++;
  block(r,
    "Registra de forma masiva ingresos que NO son facturas (arriendos, comisiones, servicios, etc.) y devoluciones.\n" +
    "Los documentos se crean como BORRADORES. Puedes revisarlos y registrarlos luego en el sistema.",
    C.azulClaro, C.azulOscuro, 10, false, true); r++;
  r++;

  block(r, "  Pasos para completar el archivo", C.azulMedio, C.blanco, 11, true); r++;
  const pasos = [
    "1 ▶  Abre la hoja  DOCUMENTOS  (la de color verde en las pestañas).",
    "2 ▶  Rellena una fila por cada documento, desde la fila 2 en adelante.",
    "3 ▶  Respeta los colores:  🟠 Fondo naranja = OBLIGATORIO  |  🟢 Fondo verde = OPCIONAL  |  🟣 Fondo morado = CONDICIONAL.",
    "4 ▶  Si el doc. es DEVOLUCION → rellena las columnas de \"Documento origen\" (origin_fiscal_doc_code y origin_number).",
    "5 ▶  Si el cliente ya pagó → rellena las columnas de Pago. Si pagó con TARJETA, agrega también card_kind, card_last4 y auth_code.",
    "6 ▶  Las cuentas contables (account_debe / account_haber) deben ser códigos que existen en tu plan de cuentas.",
    "7 ▶  Guarda el archivo y cárgalo desde el botón  ⬆ Cargar Excel  en el módulo.",
  ];
  pasos.forEach(p => {
    block(r, "   " + p, C.grisClaro, C.textoOscuro, 10, false, true);
    r++;
  });
  r++;

  // Leyenda
  block(r, "  Leyenda de colores en la hoja DOCUMENTOS", C.azulMedio, C.blanco, 11, true); r++;
  const leyenda = [
    [C.naranjaBg, "🟠  CAMPO OBLIGATORIO — debes llenarlo siempre."],
    [C.verdeBg,   "🟢  CAMPO OPCIONAL — puedes dejarlo en blanco si no aplica."],
    [C.moradoBg,  "🟣  CAMPO CONDICIONAL — requerido solo en ciertos casos (DEVOLUCION, pago con TARJETA, etc.)."],
    [C.ejRojo,    "🔴  Fila ejemplo DEVOLUCION."],
    [C.ejVerde,   "🟢  Fila ejemplo OTRO_INGRESO cobrado."],
    [C.ejAmbar,   "🟡  Fila ejemplo OTRO_INGRESO pendiente de cobro."],
  ];
  leyenda.forEach(([bg, label]) => {
    ws.mergeCells(r, 2, r, 6);
    const c = cell(r, 2);
    c.value = label;
    c.fill  = fill(bg);
    c.font  = fnt(C.textoOscuro, 10);
    c.alignment = { horizontal: "left", vertical: "middle" };
    c.border = bord(C.grisBorde);
    ws.getRow(r).height = 20;
    r++;
  });
  r++;

  // Tabla de columnas
  block(r, "  Descripción detallada de cada columna", C.azulMedio, C.blanco, 11, true); r++;

  ["", "Clave técnica", "Tipo", "¿Qué significa?", "Ejemplo de valor", "Notas"].forEach((h, ci) => {
    const c = cell(r, ci + 1);
    c.value = h;
    c.fill  = fill(C.azulOscuro);
    c.font  = fnt(C.blanco, 10, true);
    c.alignment = { horizontal: "center", vertical: "middle" };
  });
  ws.getRow(r).height = 22; r++;

  const COL_INFO = [
    ["doc_type",                "Obligatorio",   "Tipo de documento",                                       "OTRO_INGRESO",        "OTRO_INGRESO (arriendo, comisión…) o DEVOLUCION"],
    ["issue_date",              "Obligatorio",   "Fecha de emisión del documento",                          "2026-04-30",          "Formato YYYY-MM-DD. También puedes ingresar fechas de Excel normales."],
    ["due_date",                "Opcional",      "Fecha de vencimiento del cobro",                          "2026-05-30",          "Si lo dejas vacío, se usa la fecha de emisión."],
    ["number",                  "Obligatorio",   "Número o folio del documento",                            "1001",                "Debe ser único."],
    ["currency_code",           "Opcional",      "Código de moneda ISO",                                    "CLP",                 "CLP por defecto. También USD, EUR, UF."],
    ["branch_code",             "Opcional",      "Código de la sucursal emisora",                           "CASA",                "Debe existir en el sistema. Si no tienes sucursales, déjalo vacío."],
    ["counterparty_identifier", "Obligatorio",   "RUT o identificador del cliente",                         "76543210-9",          "Escríbelo igual que está en el sistema (con guión)."],
    ["counterparty_name",       "Obligatorio",   "Nombre o razón social del cliente",                       "Comercial Ltda.",     "Si el cliente no existe, el sistema lo creará automáticamente."],
    ["grand_total",             "Obligatorio",   "Monto total del documento",                               "500000",              "Solo el número, sin puntos ni $. Ej: 500000, no $500.000"],
    ["reference",               "Opcional",      "Referencia o descripción libre",                          "Arriendo bodega abr", "Para identificar el documento."],
    ["origin_fiscal_doc_code",  "DEVOLUCION",    "Código fiscal del doc de origen",                         "61",                  "Ej: 61 para Nota de Crédito, 56 para Nota de Débito, 33 para Factura."],
    ["origin_number",           "DEVOLUCION",    "Número/folio del documento de origen",                    "4",                   "El folio del doc al que afecta la devolución."],
    ["payment_date",            "Si hay pago",   "Fecha en que se recibió el pago",                         "2026-04-30",          "Si el cliente no ha pagado aún, deja los 5 campos de pago en blanco."],
    ["payment_method",          "Si hay pago",   "Forma de pago",                                           "TRANSFERENCIA",       "EFECTIVO · TRANSFERENCIA · CHEQUE · TARJETA"],
    ["payment_amount",          "Si hay pago",   "Monto exacto del pago recibido",                          "500000",              "Puede ser igual o menor al total del documento."],
    ["payment_reference",       "Opcional",      "Referencia del pago (n° transf., cheque, etc.)",          "TRF-20260430-001",    "Útil para rastrear el pago en el banco."],
    ["card_kind",               "Solo TARJETA",  "Tipo de tarjeta usada",                                   "DEBITO",              "DEBITO o CREDITO. Solo si payment_method = TARJETA."],
    ["card_last4",              "Solo TARJETA",  "Últimos 4 dígitos del número de tarjeta",                 "4321",                "Solo los 4 últimos dígitos."],
    ["auth_code",               "Solo TARJETA",  "Código de autorización del POS",                          "ABC123",              "El código que aparece en el voucher del POS."],
    ["account_debe",            "Obligatorio",   "Código de cuenta contable del DEBE",                      "11010201",            "La cuenta que recibe el ingreso (banco, caja, CxC)."],
    ["account_haber",           "Obligatorio",   "Código de cuenta contable del HABER",                     "41010101",            "La cuenta de ingreso/ventas."],
    ["branch_code_debe",        "Condicional",   "Sucursal para la línea DEBE",                             "SUC01",               "Solo si la cuenta requiere sucursal."],
    ["branch_code_haber",       "Condicional",   "Sucursal para la línea HABER",                            "SUC01",               "Solo si la cuenta requiere sucursal."],
    ["business_line_code_debe", "Condicional",   "Centro de utilidad para la línea DEBE",                   "VEN",                 "Código del área/negocio. Solo si la cuenta lo requiere."],
    ["business_line_code_haber","Condicional",   "Centro de utilidad para la línea HABER",                  "VEN",                 "Igual que el anterior, para la línea del haber."],
  ];

  const obligColors = {
    "Obligatorio":  { bg: C.naranjaBg,  bd: "F59E0B" },
    "Opcional":     { bg: C.verdeBg,    bd: "10B981" },
    "DEVOLUCION":   { bg: C.moradoBg,   bd: "8B5CF6" },
    "Si hay pago":  { bg: C.moradoBg,   bd: "8B5CF6" },
    "Solo TARJETA": { bg: C.moradoBg,   bd: "8B5CF6" },
    "Condicional":  { bg: C.moradoBg,   bd: "8B5CF6" },
  };

  COL_INFO.forEach(([col, tipo, desc, ej, nota]) => {
    const { bg, bd } = obligColors[tipo] ?? { bg: C.grisClaro, bd: C.grisBorde };
    [["", 1], [col, 2], [tipo, 3], [desc, 4], [ej, 5], [nota, 6]].forEach(([v, ci]) => {
      const c = cell(r, ci);
      c.value = v;
      c.fill  = fill(ci === 1 ? C.blanco : bg);
      c.font  = fnt(C.textoOscuro, 10, ci === 2);
      c.alignment = { horizontal: ci >= 4 ? "left" : "center", vertical: "middle", wrapText: true };
      c.border = bord(ci === 1 ? C.blanco : bd);
    });
    ws.getRow(r).height = 30;
    r++;
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

  ws.columns = [{ width: 3 }, { width: 22 }, { width: 48 }, { width: 3 }];

  const addHead = (row, title) => {
    ws.mergeCells(row, 2, row, 3);
    const c = ws.getCell(row, 2);
    c.value = title;
    c.fill  = fill(C.azulMedio);
    c.font  = fnt(C.blanco, 11, true);
    c.alignment = { horizontal: "left", vertical: "middle" };
    ws.getRow(row).height = 24;
  };
  const addRow = (row, val, desc, bg = C.grisClaro) => {
    const c1 = ws.getCell(row, 2);
    c1.value = val; c1.fill = fill(bg);
    c1.font = fnt(C.textoOscuro, 10, true);
    c1.alignment = { horizontal: "center", vertical: "middle" };
    c1.border = bord();
    const c2 = ws.getCell(row, 3);
    c2.value = desc; c2.fill = fill(C.blanco);
    c2.font = fnt(C.textoMedio, 10);
    c2.alignment = { horizontal: "left", vertical: "middle" };
    c2.border = bord();
    ws.getRow(row).height = 20;
  };

  let r = 2;
  ws.mergeCells(r, 2, r, 3);
  const t = ws.getCell(r, 2);
  t.value = "CATÁLOGOS — Valores permitidos por columna";
  t.fill  = fill(C.azulOscuro);
  t.font  = fnt(C.blanco, 13, true);
  t.alignment = { horizontal: "left", vertical: "middle" };
  ws.getRow(r).height = 30; r++;
  r++;

  addHead(r, "doc_type — Tipo de documento"); r++;
  addRow(r, "OTRO_INGRESO", "Ingreso no fiscal: arriendo, comisión, servicio, honorario, etc.", C.ejVerde); r++;
  addRow(r, "DEVOLUCION",   "Devolución de dinero al cliente, generalmente ligada a una NC.",  C.ejRojo);  r++;
  r++;

  addHead(r, "payment_method — Método de pago"); r++;
  addRow(r, "EFECTIVO",      "Dinero en efectivo recibido directamente."); r++;
  addRow(r, "TRANSFERENCIA", "Transferencia bancaria o depósito en cuenta."); r++;
  addRow(r, "CHEQUE",        "Cheque bancario (al portador o nominativo)."); r++;
  addRow(r, "TARJETA",       "Pago con tarjeta de débito o crédito vía POS."); r++;
  r++;

  addHead(r, "card_kind — Tipo de tarjeta (solo si payment_method = TARJETA)"); r++;
  addRow(r, "DEBITO",  "Tarjeta de débito."); r++;
  addRow(r, "CREDITO", "Tarjeta de crédito."); r++;
  r++;

  addHead(r, "currency_code — Código de moneda ISO"); r++;
  addRow(r, "CLP", "Peso chileno (por defecto)."); r++;
  addRow(r, "USD", "Dólar estadounidense."); r++;
  addRow(r, "EUR", "Euro."); r++;
  addRow(r, "UF",  "Unidad de Fomento."); r++;
}

// ─────────────────────────────────────────────────────────────────────────────
//  HOJA 3 — DOCUMENTOS  (hoja principal)
//  Fila 1  = claves técnicas (con color O/R/C)
//  Fila 2+ = datos
// ─────────────────────────────────────────────────────────────────────────────
async function buildDocumentos(wb) {
  const ws = wb.addWorksheet("DOCUMENTOS", {
    properties: { tabColor: { argb: "FF10B981" } },
    views: [{
      state: "frozen",
      xSplit: 0,
      ySplit: 1,          // congela solo la fila de encabezados
      showGridLines: true,
    }],
  });

  // ── Definición de columnas ────────────────────────────────────────────────
  // tipo: O = obligatorio (naranja), R = opcional (verde), C = condicional (morado)
  const COLS = [
    { key: "doc_type",                label: "Tipo documento",           desc: "OTRO_INGRESO o DEVOLUCION",         tipo: "O", w: 18 },
    { key: "issue_date",              label: "Fecha emisión",             desc: "YYYY-MM-DD",                        tipo: "O", w: 15 },
    { key: "due_date",                label: "Vencimiento",              desc: "YYYY-MM-DD (vacío = emisión)",       tipo: "R", w: 15 },
    { key: "number",                  label: "Número / Folio",           desc: "Número único del documento",        tipo: "O", w: 14 },
    { key: "currency_code",           label: "Moneda",                   desc: "CLP / USD / EUR / UF",              tipo: "R", w: 10 },
    { key: "branch_code",             label: "Sucursal",                 desc: "Código de sucursal",                tipo: "R", w: 12 },
    { key: "counterparty_identifier", label: "RUT / Identificador",      desc: "RUT del cliente (con guión)",       tipo: "O", w: 18 },
    { key: "counterparty_name",       label: "Nombre cliente",           desc: "Razón social o nombre completo",    tipo: "O", w: 28 },
    { key: "grand_total",             label: "Monto total",              desc: "Número sin puntos (ej: 500000)",    tipo: "O", w: 16 },
    { key: "reference",               label: "Referencia / Descripción", desc: "Texto libre del documento",         tipo: "R", w: 26 },
    { key: "origin_fiscal_doc_code",  label: "Cód. fiscal origen",       desc: "Solo DEVOLUCION. Ej: 61",           tipo: "C", w: 16 },
    { key: "origin_number",           label: "Nro. origen",              desc: "Solo DEVOLUCION. Folio origen",     tipo: "C", w: 13 },
    { key: "payment_date",            label: "Fecha pago",               desc: "YYYY-MM-DD (si ya pagó)",           tipo: "C", w: 15 },
    { key: "payment_method",          label: "Forma de pago",            desc: "EFECTIVO/TRANSF./CHEQUE/TARJETA",  tipo: "C", w: 16 },
    { key: "payment_amount",          label: "Monto pago",               desc: "Número sin puntos",                 tipo: "C", w: 14 },
    { key: "payment_reference",       label: "Ref. pago",                desc: "N° transferencia, cheque, etc.",    tipo: "R", w: 20 },
    { key: "card_kind",               label: "Tipo tarjeta",             desc: "DEBITO o CREDITO (solo TARJETA)",   tipo: "C", w: 14 },
    { key: "card_last4",              label: "Últimos 4 dígitos",        desc: "4 dígitos (solo TARJETA)",          tipo: "C", w: 16 },
    { key: "auth_code",               label: "Cód. autorización",        desc: "Código voucher POS (solo TARJETA)", tipo: "C", w: 16 },
    { key: "account_debe",            label: "Cuenta DEBE",              desc: "Código cuenta contable DEBE",       tipo: "O", w: 16 },
    { key: "account_haber",           label: "Cuenta HABER",             desc: "Código cuenta contable HABER",      tipo: "O", w: 16 },
    { key: "branch_code_debe",        label: "Sucursal DEBE",            desc: "Si la cuenta exige sucursal",       tipo: "C", w: 14 },
    { key: "branch_code_haber",       label: "Sucursal HABER",           desc: "Si la cuenta exige sucursal",       tipo: "C", w: 14 },
    { key: "business_line_code_debe", label: "Centro util. DEBE",        desc: "Si la cuenta exige C.U.",           tipo: "C", w: 14 },
    { key: "business_line_code_haber",label: "Centro util. HABER",       desc: "Si la cuenta exige C.U.",           tipo: "C", w: 14 },
  ];

  COLS.forEach((col, i) => { ws.getColumn(i + 1).width = col.w; });

  const BG = { O: C.naranjaBg, R: C.verdeBg, C: C.moradoBg };
  const FG = { O: C.naranjaFont, R: C.verdeFont, C: C.moradoFont };
  const BD = { O: "F59E0B", R: "10B981", C: "8B5CF6" };

  // ── Fila 1: clave técnica con color ──────────────────────────────────────
  COLS.forEach((col, i) => {
    const c = ws.getCell(1, i + 1);
    c.value = col.key;
    c.fill  = fill(BG[col.tipo]);
    c.font  = fnt(FG[col.tipo], 10, true);
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: false };
    c.border = bord(BD[col.tipo]);
  });
  ws.getRow(1).height = 22;

  // ── Filas de ejemplo (desde fila 2) ──────────────────────────────────────
  const EJEMPLOS = [
    {
      _bg: C.ejVerde,
      doc_type:"OTRO_INGRESO",
      issue_date:"2026-04-30",    due_date:"2026-04-30",
      number:"1001",
      currency_code:"CLP",        branch_code:"CASA",
      counterparty_identifier:"76543210-9", counterparty_name:"Comercial Example Ltda.",
      grand_total:500000,         reference:"Arriendo bodega abril 2026",
      origin_fiscal_doc_code:"", origin_number:"",
      payment_date:"2026-04-30",  payment_method:"TRANSFERENCIA",
      payment_amount:500000,      payment_reference:"TRF-20260430-001",
      card_kind:"",               card_last4:"",    auth_code:"",
      account_debe:"11010201",    account_haber:"41010101",
      branch_code_debe:"",        branch_code_haber:"",
      business_line_code_debe:"", business_line_code_haber:"",
    },
    {
      _bg: C.ejAmbar,
      doc_type:"OTRO_INGRESO",
      issue_date:"2026-04-30",    due_date:"2026-05-30",
      number:"1002",
      currency_code:"CLP",        branch_code:"CASA",
      counterparty_identifier:"12345678-9", counterparty_name:"Servicios Del Norte S.A.",
      grand_total:250000,         reference:"Comisión gestión cobro Q1 2026",
      origin_fiscal_doc_code:"", origin_number:"",
      payment_date:"",            payment_method:"",
      payment_amount:"",          payment_reference:"",
      card_kind:"",               card_last4:"",    auth_code:"",
      account_debe:"11030101",    account_haber:"41020101",
      branch_code_debe:"",        branch_code_haber:"",
      business_line_code_debe:"", business_line_code_haber:"",
    },
    {
      _bg: C.ejCeleste,
      doc_type:"OTRO_INGRESO",
      issue_date:"2026-04-28",    due_date:"2026-05-28",
      number:"1003",
      currency_code:"CLP",        branch_code:"CASA",
      counterparty_identifier:"87654321-0", counterparty_name:"Clínica Centro Médico S.A.",
      grand_total:1200000,        reference:"Servicios médicos outsourcing marzo",
      origin_fiscal_doc_code:"", origin_number:"",
      payment_date:"2026-04-28",  payment_method:"TARJETA",
      payment_amount:1200000,     payment_reference:"POS-00892",
      card_kind:"CREDITO",        card_last4:"4321", auth_code:"TK88231",
      account_debe:"11010301",    account_haber:"41030101",
      branch_code_debe:"SUC02",   branch_code_haber:"SUC02",
      business_line_code_debe:"ADM", business_line_code_haber:"ADM",
    },
    {
      _bg: C.ejRojo,
      doc_type:"DEVOLUCION",
      issue_date:"2026-04-30",    due_date:"2026-04-30",
      number:"6001",
      currency_code:"CLP",        branch_code:"CASA",
      counterparty_identifier:"76543210-9", counterparty_name:"Comercial Example Ltda.",
      grand_total:50000,          reference:"Devolución NC 61-4 diferencia precio",
      origin_fiscal_doc_code:"61", origin_number:"4",
      payment_date:"",            payment_method:"",
      payment_amount:"",          payment_reference:"",
      card_kind:"",               card_last4:"",    auth_code:"",
      account_debe:"11030101",    account_haber:"11010201",
      branch_code_debe:"",        branch_code_haber:"",
      business_line_code_debe:"", business_line_code_haber:"",
    },
    {
      _bg: C.ejVerde,
      doc_type:"OTRO_INGRESO",
      issue_date:"2026-04-29",    due_date:"2026-04-29",
      number:"1004",
      currency_code:"CLP",        branch_code:"SUC02",
      counterparty_identifier:"11111111-1", counterparty_name:"Inversiones Sur Ltda.",
      grand_total:800000,         reference:"Arriendo oficina piso 3 abril 2026",
      origin_fiscal_doc_code:"", origin_number:"",
      payment_date:"2026-04-29",  payment_method:"CHEQUE",
      payment_amount:800000,      payment_reference:"CHQ-00456",
      card_kind:"",               card_last4:"",    auth_code:"",
      account_debe:"11010201",    account_haber:"41010201",
      branch_code_debe:"SUC02",   branch_code_haber:"SUC02",
      business_line_code_debe:"VEN", business_line_code_haber:"VEN",
    },
  ];

  EJEMPLOS.forEach((ej, ri) => {
    const rowIdx = ri + 2; // datos desde fila 2
    const { _bg, ...data } = ej;
    COLS.forEach((col, ci) => {
      const c = ws.getCell(rowIdx, ci + 1);
      const v = data[col.key];
      const isNum = typeof v === "number";
      c.value = isNum ? v : (v === "" ? null : v);
      c.fill  = fill(_bg);
      c.font  = { name: "Calibri", size: 10, color: { argb: "FF" + C.textoOscuro }, bold: col.key === "doc_type" };
      c.alignment = { horizontal: isNum ? "right" : "left", vertical: "middle" };
      c.border = bord();
      if (isNum) c.numFmt = "#,##0";
    });
    ws.getRow(rowIdx).height = 20;
  });

  // ── Validaciones drop-down (desde fila 2) ────────────────────────────────
  const DATA_START = 2;
  const DATA_END   = 5002;

  function colLetter(n) {
    let s = "";
    while (n > 0) {
      const m = (n - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  }

  const VALIDATIONS = {
    doc_type:       '"OTRO_INGRESO,DEVOLUCION"',
    payment_method: '"EFECTIVO,TRANSFERENCIA,CHEQUE,TARJETA"',
    currency_code:  '"CLP,USD,EUR,UF"',
    card_kind:      '"DEBITO,CREDITO"',
  };

  COLS.forEach((col, i) => {
    if (!VALIDATIONS[col.key]) return;
    const cl = colLetter(i + 1);
    ws.dataValidations.add(`${cl}${DATA_START}:${cl}${DATA_END}`, {
      type: "list",
      allowBlank: true,
      formulae: [VALIDATIONS[col.key]],
      showErrorMessage: true,
      errorStyle: "warning",
      errorTitle: "Valor no válido",
      error: "Por favor selecciona un valor de la lista.",
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
  wb.title    = "Plantilla Carga Masiva Otros Documentos de Ingresos";

  await buildInstrucciones(wb);
  await buildCatalogos(wb);
  await buildDocumentos(wb);

  await wb.xlsx.writeFile(OUT);
  console.log("✅ Plantilla generada en:", OUT);
}

main().catch(err => { console.error("❌ Error:", err); process.exit(1); });

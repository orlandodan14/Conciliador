/**
 * build-asientos-template.js
 * Genera public/templates/Formato_Asientos_Contables.xlsx
 * Hojas: INSTRUCCIONES, CATALOGOS, PLANTILLA
 *
 * Uso: node scripts/build-asientos-template.js
 */

"use strict";
const ExcelJS = require("exceljs");
const path    = require("path");

// ── Paleta ────────────────────────────────────────────────────────────────────
const C = {
  headerBg:   "1F4E78",
  headerFg:   "FFFFFF",
  sectionBg:  "D9EAF7",
  sectionFg:  "1F3864",
  colHdrBg:   "2E75B6",
  colHdrFg:   "FFFFFF",
  mandatBg:   "FFF2CC",
  mandatFg:   "7D5F00",
  optionalBg: "F2F2F2",
  optionalFg: "595959",
  warnBg:     "FCE4D6",
  warnFg:     "833C00",
  exBg1:      "E2EFDA",   // verde claro — línea impar del ejemplo
  exBg2:      "F0F9EC",   // verde muy claro — línea par del ejemplo
  exFg:       "1A4A00",
  rowAlt:     "F7FBFF",
  instrBg:    "FFF9F0",
  instrFg:    "7D4E00",
  white:      "FFFFFF",
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function fill(row, col, bg, fg, bold, value, wrap) {
  const cell = row.getCell(col);
  if (value !== undefined) cell.value = value === "" ? null : value;
  cell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + bg } };
  cell.font      = { color: { argb: "FF" + fg }, bold: !!bold, name: "Calibri", size: 10 };
  cell.alignment = { wrapText: !!wrap, vertical: "middle" };
}

function hdrRow(ws, r, text, nc) {
  ws.getRow(r).height = 24;
  for (let c = 1; c <= nc; c++) fill(ws.getRow(r), c, C.headerBg, C.headerFg, c === 1, c === 1 ? text : "");
  ws.mergeCells(r, 1, r, nc);
  Object.assign(ws.getCell(r, 1), {
    font: { color: { argb: "FFFFFFFF" }, bold: true, name: "Calibri", size: 13 },
    alignment: { horizontal: "center", vertical: "middle" },
  });
}

function secRow(ws, r, text, nc) {
  ws.getRow(r).height = 18;
  for (let c = 1; c <= nc; c++) fill(ws.getRow(r), c, C.sectionBg, C.sectionFg, c === 1, c === 1 ? text : "");
  ws.mergeCells(r, 1, r, nc);
  Object.assign(ws.getCell(r, 1), {
    font: { color: { argb: "FF" + C.sectionFg }, bold: true, name: "Calibri", size: 10 },
    alignment: { vertical: "middle" },
  });
}

function bulletRow(ws, r, text, nc, bg, fg) {
  bg = bg || C.white; fg = fg || "333333";
  ws.getRow(r).height = 28;
  for (let c = 1; c <= nc; c++) fill(ws.getRow(r), c, bg, fg, false, c === 1 ? text : "", true);
  ws.mergeCells(r, 1, r, nc);
  ws.getCell(r, 1).alignment = { wrapText: true, vertical: "middle" };
}

function emptyRow(ws, r, nc) {
  ws.getRow(r).height = 8;
  for (let c = 1; c <= nc; c++) fill(ws.getRow(r), c, C.white, C.white, false, "");
}

function tblHdr(ws, r, labels, widths) {
  ws.getRow(r).height = 18;
  labels.forEach((lbl, i) => {
    fill(ws.getRow(r), i + 1, C.colHdrBg, C.colHdrFg, true, lbl);
    ws.getCell(r, i + 1).alignment = { horizontal: "center", vertical: "middle" };
    if (widths && widths[i]) ws.getColumn(i + 1).width = widths[i];
  });
}

// ════════════════════════════════════════════════════════════════════════════════
// Datos reales de la base de datos (consultados vía Management API)
// ════════════════════════════════════════════════════════════════════════════════

// Cuentas nivel 4 — plan de cuentas real en la DB
const PLAN = {
  "1010101": "Caja",
  "1020101": "BCH CLP 9800",
  "1020102": "SCO CLP 6426",
  "1020103": "BCH USD 9805",
  "1020104": "BCH CLP 9600",
  "1020105": "SCO CLP 6162",
  "1020106": "BCI CLP 6438",
  "1030101": "Fondos por Rendir",
  "1040101": "Depósito a Plazo BCH CLP",
  "1050101": "Clientes Nacionales",
  "1050102": "Clientes Extranjeros",
  "1060101": "IVA Crédito Fiscal",
  "1060102": "Retenciones por Recuperar",
  "1070101": "Equipos Computacionales",
  "1070102": "Muebles y Equipos",
  "1070103": "Vehículos",
  "1080101": "Software",
  "1080102": "Licencias",
  "2010101": "Proveedores Nacionales",
  "2010102": "Proveedores Extranjeros",
  "2020101": "IVA Débito Fiscal",
  "2020102": "Impuesto a la Renta",
  "2030101": "Sueldos por Pagar",
  "2030102": "Cotizaciones Previsionales",
  "2040101": "Créditos Largo Plazo",
  "3010101": "Capital Social",
  "3020101": "Utilidades Retenidas",
  "3020102": "Pérdidas Acumuladas",
  "4010101": "Ventas Nacionales",    // ⚠ REQUIERE business_line + branch
  "4010102": "Ventas Exportación",   // ⚠ REQUIERE business_line + branch
  "4020101": "Intereses Ganados",
  "5010101": "Compras",
  "5010102": "Variación de Inventarios",
  "6010101": "Sueldos",
  "6010102": "Honorarios",
  "6010201": "Arriendos",
  "6010202": "Servicios Básicos",
  "6020101": "Publicidades",
  "7010101": "Utilidad o Pérdida del Ejercicio",
};

// Contrapartes reales de la DB (12 registros)
const CP = {
  "26104839-6": "Orlando Paredes",
  "26777666-9": "Cliente Prueba Otro",
  "268424490":  "Virginia Castillo",
  "76123456-7": "Cliente Prueba Carga Masiva",
  "76222222-3": "Comercial Ñuñoa Ltda",
  "76333333-4": "Servicios Delta SpA",
  "76444444-5": "Inversiones Pacífico Ltda",
  "76555555-6": "Operaciones Centro SpA",
  "76666666-7": "Grupo Andes Ltda",
  "76777777-8": "Tecnología Urbana SpA",
  "76911111-2": "Cliente Norte SpA",
  "77654654-9": "Proveedor de prueba",
};

// Sucursales reales (branches tabla — 2 registros)
const BRANCH = {
  "01020500": "Sucursal Ñuñoa",
  "0201020":  "Casa Matríz",
};

// Centros de costo reales (cost_centers — 2 registros)
const CC_CAT = {
  "010200100": "Casa Matríz",
  "010200101": "Prueba 2",
};

// Líneas de negocio reales (business_lines — 2 registros)
const BL_CAT = {
  "22100": "Payment",
  "22101": "SaaS",
};

// Políticas de imputación (account_imputation_policies):
//   4010101 Ventas Nacionales  → require_cu=true, require_suc=true
//   4010102 Ventas Exportación → require_cu=true, require_suc=true
//   1050101 Clientes Nac.      → todo false (sin obligatoriedad)
//   Resto de cuentas           → sin política activa

// ── Ejemplos: entry_date y description se repiten en TODAS las líneas ──
// columnas: entry_key, entry_date, description, line_no, account_code,
//           line_description, debit, credit, counterparty_identifier,
//           cost_center_code, business_line_code, branch_code

const DATE = "2026-05-18";

function row(ek, desc, ln, acc, glosa, db, cr, cp, cc, bl, br) {
  return [ek, DATE, desc, ln, acc, glosa,
          db === 0 ? "" : db,
          cr === 0 ? "" : cr,
          cp, cc, bl, br];
}

// Nota sobre RUT (counterparty_identifier):
// - Cuentas de Ingresos (CxC, Ventas) → sí llevan RUT del cliente
// - Cuentas de Gastos/Compras (CxP, Compras) → sí llevan RUT del proveedor
// - Cuentas de IVA, Banco, Caja, Remuneraciones por pagar → NO llevan RUT
//   (son cuentas de control fiscal/interno sin contraparte específica por línea)

const EJEMPLOS = [
  // ── Asiento 1: Venta contado con IVA ─────────────────────────────────────────
  // Caja no lleva RUT (movimiento de caja general)
  // 4010101 REQUIERE business_line + branch → usamos 22101 + 01020500
  row(1,"Venta contado con IVA — Cliente Norte SpA",  1,"1010101","Cobro en caja fac. venta", 1190000,0,"","","",""),
  row(1,"Venta contado con IVA — Cliente Norte SpA",  2,"4010101","Ingreso venta afecta",          0,1000000,"76911111-2","","22101","01020500"),
  row(1,"Venta contado con IVA — Cliente Norte SpA",  3,"2020101","IVA débito fiscal",              0,190000, "","","",""),

  // ── Asiento 2: Venta a crédito exenta ────────────────────────────────────────
  // 1050101 sin política → sin segmentación obligatoria
  // 4010101 REQUIERE business_line + branch
  row(2,"Venta crédito exenta — Comercial Ñuñoa Ltda",1,"1050101","CxC fac. exenta F-5002",  500000,0,"76222222-3","","",""),
  row(2,"Venta crédito exenta — Comercial Ñuñoa Ltda",2,"4010101","Ingreso venta exenta",         0,500000,"76222222-3","","22101","01020500"),

  // ── Asiento 3: Factura proveedor con IVA ──────────────────────────────────────
  // Compras y CxP llevan RUT del proveedor; IVA CF no lleva RUT
  row(3,"Factura proveedor — Servicios Delta SpA F-9981",1,"5010101","Compra mercadería fac. 9981", 200000,0,"76333333-4","","",""),
  row(3,"Factura proveedor — Servicios Delta SpA F-9981",2,"1060101","IVA crédito fiscal fac. 9981",  38000,0,"","","",""),
  row(3,"Factura proveedor — Servicios Delta SpA F-9981",3,"2010101","CxP Servicios Delta fac. 9981",     0,238000,"76333333-4","","",""),

  // ── Asiento 4: Pago a proveedor ───────────────────────────────────────────────
  // CxP lleva RUT del proveedor; Banco no lleva RUT
  row(4,"Pago proveedor — Servicios Delta SpA fac. 9981",1,"2010101","Cancelación CxP fac. 9981",238000,0,"76333333-4","","",""),
  row(4,"Pago proveedor — Servicios Delta SpA fac. 9981",2,"1020101","Débito banco BCH CLP 9800",     0,238000,"","","",""),

  // ── Asiento 5: Cobro de cliente ───────────────────────────────────────────────
  // Banco no lleva RUT; CxC lleva RUT del cliente
  row(5,"Cobro cliente — Inversiones Pacífico Ltda fac. 5004",1,"1020101","Abono banco cobro fac. 5004",83300,0,"","","",""),
  row(5,"Cobro cliente — Inversiones Pacífico Ltda fac. 5004",2,"1050101","Cancelación CxC fac. 5004",     0,83300,"76444444-5","","",""),

  // ── Asiento 6: Pago gastos con banco ──────────────────────────────────────────
  // Gasto arriendo lleva RUT del arrendador; Banco no lleva RUT
  row(6,"Pago arriendo oficina mayo 2026",1,"6010201","Gasto arriendo oficina mayo",450000,0,"76666666-7","010200100","",""),
  row(6,"Pago arriendo oficina mayo 2026",2,"1020101","Débito banco BCH CLP 9800",       0,450000,"","","",""),

  // ── Asiento 7: Provisión remuneraciones ───────────────────────────────────────
  // Remuneraciones por pagar y cotizaciones: no llevan RUT (son cuentas de control)
  row(7,"Provisión remuneraciones mayo 2026",1,"6010101","Gasto sueldos brutos mayo",   3200000,0,"","010200100","",""),
  row(7,"Provisión remuneraciones mayo 2026",2,"6010102","Honorarios Orlando Paredes",   180000,0,"26104839-6","010200100","",""),
  row(7,"Provisión remuneraciones mayo 2026",3,"2030101","Sueldos por pagar mayo",            0,3200000,"","","",""),
  row(7,"Provisión remuneraciones mayo 2026",4,"2030102","Cotizaciones previsionales",        0,180000,"","","",""),

  // ── Asiento 8: Depreciación mensual ───────────────────────────────────────────
  // Sin contraparte (movimiento 100% interno)
  row(8,"Depreciación activos fijos mayo 2026",1,"6010201","Depreciación equipos computo mayo",150000,0,"","010200100","",""),
  row(8,"Depreciación activos fijos mayo 2026",2,"1070101","Depreciación acumulada equipos",       0,150000,"","","",""),

  // ── Asiento 9: Pago servicios básicos ─────────────────────────────────────────
  // Servicios Básicos lleva CC; Banco no lleva RUT ni segmentación
  row(9,"Pago servicios básicos mayo 2026",1,"6010202","Gastos electricidad y telefonía mayo",85000,0,"","010200100","",""),
  row(9,"Pago servicios básicos mayo 2026",2,"1020101","Débito banco BCH CLP 9800",                0,85000,"","","",""),

  // ── Asiento 10: Intereses ganados depósito a plazo ────────────────────────────
  // 4020101 Intereses Ganados: sin política de imputación → sin segmentación obligatoria
  row(10,"Intereses ganados depósito a plazo mayo",1,"1020101","Abono intereses depósito BCH CLP",12500,0,"","","",""),
  row(10,"Intereses ganados depósito a plazo mayo",2,"4020101","Intereses ganados mayo 2026",           0,12500,"","","",""),

  // ── Asiento 11: Servicio SaaS facturado — cliente Grupo Andes ────────────────
  // 4010101 REQUIERE business_line (22101=SaaS) + branch (0201020=Casa Matríz)
  // CxC sin política → sin segmentación obligatoria
  row(11,"Factura servicio SaaS — Grupo Andes Ltda F-101",1,"1050101","CxC factura SaaS F-101",     95000,0,"76666666-7","","",""),
  row(11,"Factura servicio SaaS — Grupo Andes Ltda F-101",2,"4010101","Ingreso suscripción SaaS",        0,95000,"76666666-7","","22101","0201020"),

  // ── Asiento 12: Servicio Payment facturado — cliente Virginia Castillo ────────
  // 4010101 REQUIERE business_line (22100=Payment) + branch
  row(12,"Factura servicio Payment — Virginia Castillo F-102",1,"1050101","CxC factura Payment F-102",  119000,0,"268424490","","",""),
  row(12,"Factura servicio Payment — Virginia Castillo F-102",2,"4010101","Ingreso servicio Payment",         0,100000,"268424490","","22100","0201020"),
  row(12,"Factura servicio Payment — Virginia Castillo F-102",3,"2020101","IVA débito fiscal fac. 102",        0,19000,"","","",""),

  // ── Asiento 13: Compra activo fijo con IVA ────────────────────────────────────
  // CxP y Activos llevan RUT del proveedor; IVA CF no lleva RUT
  row(13,"Compra equipo computacional — Tecnología Urbana SpA",1,"1070101","Equipos computacionales adquiridos",500000,0,"76777777-8","","",""),
  row(13,"Compra equipo computacional — Tecnología Urbana SpA",2,"1060101","IVA crédito fiscal compra activo",   95000,0,"","","",""),
  row(13,"Compra equipo computacional — Tecnología Urbana SpA",3,"2010101","CxP Tecnología Urbana SpA",               0,595000,"76777777-8","","",""),
];

// ════════════════════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════════════════════
async function main() {
  const wb = new ExcelJS.Workbook();
  wb.creator = "ConciliaciónPro";
  wb.created = new Date();

  // ──────────────────────────────────────────────────────────────────────────────
  // HOJA 1: INSTRUCCIONES
  // ──────────────────────────────────────────────────────────────────────────────
  const wsI = wb.addWorksheet("INSTRUCCIONES", {
    properties: { tabColor: { argb: "FF1F4E78" } },
  });
  wsI.getColumn(1).width = 115;
  const NI = 1;
  let r = 1;

  hdrRow(wsI, r++, "PLANTILLA DE CARGA MASIVA – ASIENTOS CONTABLES", NI);
  emptyRow(wsI, r++, NI);

  secRow(wsI, r++, "Objetivo", NI);
  bulletRow(wsI, r++,
    "Esta plantilla permite registrar asientos contables manuales de forma masiva. " +
    "Al cargarla en ConciliaciónPro → Gestión Contable → Asientos se crearán borradores " +
    "que podrás revisar, ajustar y contabilizar individualmente.", NI);
  emptyRow(wsI, r++, NI);

  secRow(wsI, r++, "Reglas generales", NI);
  [
    "1.  Cada fila es una línea contable. Varias filas con el mismo entry_key forman un asiento.",
    "2.  entry_date y description deben repetirse en TODAS las filas del mismo asiento.",
    "3.  Cada línea lleva monto en debit O en credit, nunca en ambos y nunca ambos vacíos.",
    "4.  La suma de debit debe ser igual a la suma de credit dentro del mismo entry_key (tolerancia ±$1).",
    "5.  account_code debe existir y estar activo en el plan de cuentas. Se distinguen mayúsculas/minúsculas.",
    "6.  Los segmentos (cost_center_code, business_line_code, branch_code) son opcionales en la mayoría de cuentas.",
    "    Si la cuenta tiene política de imputación obligatoria para algún segmento, el sistema lo rechazará si está vacío.",
    "7.  counterparty_identifier es el RUT/NIC de la contraparte. Debe existir en el maestro de contrapartes si se informa.",
    "8.  Fecha obligatoria en formato YYYY-MM-DD. También se acepta fecha de Excel (serial numérico).",
    "9.  Los montos aceptan decimales con punto o coma (ej: 150000,25 = 150000.25).",
    "10. NO elimines ni renombres los encabezados de la fila 3 en la hoja PLANTILLA.",
  ].forEach((t) => bulletRow(wsI, r++, t, NI));
  emptyRow(wsI, r++, NI);

  secRow(wsI, r++, "Flujo de trabajo", NI);
  [
    "① Descarga el formato desde Gestión Contable → Asientos → «Descargar formato».",
    "② Rellena la hoja PLANTILLA desde la fila 4. Las filas 1-2 son informativas y la fila 3 son los encabezados del sistema.",
    "③ Guarda el archivo como .xlsx.",
    "④ En Asientos haz clic en «Cargar Excel», selecciona el archivo y espera la validación.",
    "⑤ Si no hay errores, confirma con «Crear borradores» — se crean todos los asientos como BORRADOR.",
    "⑥ Revisa, ajusta y contabiliza desde la lista de asientos.",
  ].forEach((t) => bulletRow(wsI, r++, t, NI, "E2EFDA", "1A4A00"));
  emptyRow(wsI, r++, NI);

  secRow(wsI, r++, "Errores frecuentes y cómo evitarlos", NI);
  [
    "✗  «Asiento no cuadra» — Suma de debit ≠ suma de credit para ese entry_key. Revisa línea a línea.",
    "✗  «Cuenta no encontrada» — account_code no existe o está inactivo en el plan de cuentas.",
    "✗  «Contraparte no encontrada» — El counterparty_identifier no coincide exactamente con el maestro.",
    "✗  «Código de segmento inválido» — cost_center_code, business_line_code o branch_code no existen en el sistema.",
    "✗  «Fecha inválida» — Revisa que el formato sea YYYY-MM-DD o que la celda sea fecha de Excel.",
    "✗  «Headers modificados» — Si se modificó la fila 3 de PLANTILLA el sistema no reconoce las columnas.",
  ].forEach((t) => bulletRow(wsI, r++, t, NI, C.warnBg, C.warnFg));
  emptyRow(wsI, r++, NI);

  secRow(wsI, r++, "Descripción de hojas", NI);
  bulletRow(wsI, r++, "INSTRUCCIONES  →  Esta hoja. Lee antes de llenar.", NI, C.sectionBg, C.sectionFg);
  bulletRow(wsI, r++, "CATALOGOS      →  Catálogo de todas las columnas, cuentas contables y contrapartes disponibles.", NI, C.sectionBg, C.sectionFg);
  bulletRow(wsI, r++, "PLANTILLA      →  La hoja de datos que debes rellenar y cargar al sistema.", NI, C.sectionBg, C.sectionFg);

  // ──────────────────────────────────────────────────────────────────────────────
  // HOJA 2: CATALOGOS
  // ──────────────────────────────────────────────────────────────────────────────
  const wsC = wb.addWorksheet("CATALOGOS", {
    properties: { tabColor: { argb: "FF2E75B6" } },
  });
  wsC.getColumn(1).width = 26;
  wsC.getColumn(2).width = 14;
  wsC.getColumn(3).width = 55;
  wsC.getColumn(4).width = 28;
  const NC = 4;
  let rc = 1;

  // Título
  hdrRow(wsC, rc++, "CATÁLOGOS DE APOYO — ASIENTOS CONTABLES", NC);
  emptyRow(wsC, rc++, NC);

  // ── Tabla de columnas ──────────────────────────────────────────────────────
  secRow(wsC, rc++, "Columnas de la hoja PLANTILLA", NC);
  tblHdr(wsC, rc++, ["Columna", "Obligatoriedad", "Descripción y reglas", "Ejemplo"], [26, 14, 55, 28]);

  const typeBg  = { "Obligatorio":"FFF2CC","Recomendado":"EBF5EB","Condicional":"FFF2CC","Opcional":C.optionalBg };
  const typeFg  = { "Obligatorio":C.mandatFg,"Recomendado":"1A6600","Condicional":"7D5F00","Opcional":C.optionalFg };
  const COLS = [
    ["entry_key",               "Obligatorio",  "Número o texto que identifica el asiento. Misma clave en todas las líneas del asiento. Debe ser único por asiento dentro del archivo.", "1 / 2 / AST-001"],
    ["entry_date",              "Obligatorio",  "Fecha contable YYYY-MM-DD. Repite en TODAS las filas del asiento.", "2026-05-18"],
    ["description",             "Obligatorio",  "Descripción del asiento. Repite en TODAS las filas del asiento.", "Venta contado Mayo"],
    ["line_no",                 "Obligatorio",  "Número de línea dentro del asiento (1, 2, 3…). Único por entry_key.", "1"],
    ["account_code",            "Obligatorio",  "Código de cuenta contable nivel 4 (7 dígitos). Debe existir en el plan de cuentas activo.", "1010101"],
    ["line_description",        "Recomendado",  "Glosa específica de la línea. Permite identificar el movimiento.", "Cobro caja fac. 5001"],
    ["debit",                   "Condicional",  "Monto al debe. Solo uno: debit o credit por línea. Acepta decimales.", "500000"],
    ["credit",                  "Condicional",  "Monto al haber. Solo uno: debit o credit por línea. Acepta decimales.", "500000"],
    ["counterparty_identifier", "Opcional",     "RUT/NIC de la contraparte. Debe existir en el maestro. Ver tabla de contrapartes en este catálogo.", "76911111-2"],
    ["cost_center_code",        "Opcional",     "Código del centro de costo. Obligatorio si la cuenta tiene política de imputación activa.", "ADM"],
    ["business_line_code",      "Opcional",     "Código de línea de negocio. Obligatorio si la cuenta lo requiere por política.", "VEN"],
    ["branch_code",             "Opcional",     "Código de sucursal. Obligatorio si la cuenta lo requiere por política.", "01020500"],
  ];
  COLS.forEach(([col, tipo, desc, ej], idx) => {
    const row = wsC.getRow(rc);
    row.height = 32;
    const bg = idx % 2 === 0 ? C.white : C.rowAlt;
    fill(row, 1, bg, "1F3864", true, col);
    fill(row, 2, typeBg[tipo] || C.optionalBg, typeFg[tipo] || C.optionalFg, true, tipo);
    wsC.getCell(rc, 2).alignment = { horizontal: "center", vertical: "middle" };
    fill(row, 3, bg, "333333", false, desc, true);
    fill(row, 4, bg, "375623", false, ej);
    rc++;
  });

  emptyRow(wsC, rc++, NC);

  // ── Reglas de validación ──────────────────────────────────────────────────
  secRow(wsC, rc++, "Reglas de validación del sistema", NC);
  tblHdr(wsC, rc++, ["Regla", "", "Descripción"], [26, 0, 55]);
  const REGLAS = [
    ["R1 — Partida doble",          "Suma debit = suma credit dentro de cada entry_key. Tolerancia ± $1."],
    ["R2 — Cuenta activa",          "account_code debe existir y estar activo en el plan de cuentas (nivel 4)."],
    ["R3 — Contraparte existente",  "Si se informa counterparty_identifier, debe coincidir exactamente con el maestro de contrapartes."],
    ["R4 — Segmentos válidos",       "cost_center_code, business_line_code y branch_code deben existir en sus catálogos si se informan."],
    ["R5 — Debit/credit excluyentes","No puede haber monto en debit y credit en la misma línea. Exactamente uno mayor que cero."],
    ["R6 — Fecha válida",            "entry_date debe ser YYYY-MM-DD o fecha serial de Excel."],
    ["R7 — line_no único",           "line_no debe ser único dentro de cada entry_key."],
  ];
  REGLAS.forEach(([reg, desc], idx) => {
    const row = wsC.getRow(rc);
    row.height = 24;
    const bg = idx % 2 === 0 ? C.white : C.rowAlt;
    fill(row, 1, bg, "1F3864", true, reg, true);
    fill(row, 2, bg, "333333", false, "");
    fill(row, 3, bg, "333333", false, desc, true);
    wsC.mergeCells(rc, 3, rc, NC);
    rc++;
  });

  emptyRow(wsC, rc++, NC);

  // ── Plan de cuentas ───────────────────────────────────────────────────────
  secRow(wsC, rc++, "Plan de cuentas disponible (nivel 4 — cuentas imputables)", NC);
  tblHdr(wsC, rc++, ["account_code", "Nombre de la cuenta", "Clase / Tipo", ""], [14, 38, 24, 0]);
  const CLASE = {
    "1":"Activo","2":"Pasivo","3":"Patrimonio","4":"Ingresos","5":"Costos","6":"Gastos","7":"Resultado",
  };
  Object.entries(PLAN).forEach(([code, name], idx) => {
    const row = wsC.getRow(rc);
    row.height = 15;
    const bg = idx % 2 === 0 ? C.white : C.rowAlt;
    fill(row, 1, bg, "1F3864", true, code);
    fill(row, 2, bg, "333333", false, name);
    fill(row, 3, bg, "595959", false, CLASE[code[0]] || "");
    fill(row, 4, bg, C.white, false, "");
    rc++;
  });

  emptyRow(wsC, rc++, NC);

  // ── Contrapartes ──────────────────────────────────────────────────────────
  secRow(wsC, rc++, "Contrapartes disponibles (counterparty_identifier)", NC);
  tblHdr(wsC, rc++, ["counterparty_identifier", "Nombre / Razón social", "Tipo", ""], [22, 36, 14, 0]);
  Object.entries(CP).forEach(([id, name], idx) => {
    const row = wsC.getRow(rc);
    row.height = 15;
    const bg = idx % 2 === 0 ? C.white : C.rowAlt;
    fill(row, 1, bg, "1F3864", true, id);
    fill(row, 2, bg, "333333", false, name);
    fill(row, 3, bg, "595959", false, id.includes("-") ? "Empresa/Persona" : "Otro");
    fill(row, 4, bg, C.white, false, "");
    rc++;
  });

  emptyRow(wsC, rc++, NC);

  // ── Sucursales ────────────────────────────────────────────────────────────
  secRow(wsC, rc++, "Sucursales disponibles (branch_code) — datos reales de la DB", NC);
  tblHdr(wsC, rc++, ["branch_code", "Nombre", "Nota", ""], [14, 30, 30, 0]);
  bulletRow(wsC, rc++,
    "⚠  Solo las cuentas con política de imputación require_suc=true necesitan branch_code. " +
    "Actualmente: 4010101 y 4010102 (Ventas). Para el resto es opcional.",
    NC, C.instrBg, C.instrFg);
  Object.entries(BRANCH).forEach(([code, desc], idx) => {
    const row = wsC.getRow(rc);
    row.height = 15;
    const bg = idx % 2 === 0 ? C.white : C.rowAlt;
    fill(row, 1, bg, "1F3864", true, code);
    fill(row, 2, bg, "333333", false, desc);
    fill(row, 3, bg, "595959", false, "");
    fill(row, 4, bg, C.white, false, "");
    rc++;
  });

  emptyRow(wsC, rc++, NC);

  // ── Centros de costo ──────────────────────────────────────────────────────
  secRow(wsC, rc++, "Centros de costo disponibles (cost_center_code) — datos reales de la DB", NC);
  tblHdr(wsC, rc++, ["cost_center_code", "Nombre", "Nota", ""], [18, 26, 26, 0]);
  bulletRow(wsC, rc++,
    "⚠  Ninguna cuenta tiene actualmente require_cc=true. El campo es opcional para todas.",
    NC, C.instrBg, C.instrFg);
  Object.entries(CC_CAT).forEach(([code, desc], idx) => {
    const row = wsC.getRow(rc);
    row.height = 15;
    const bg = idx % 2 === 0 ? C.white : C.rowAlt;
    fill(row, 1, bg, "1F3864", true, code);
    fill(row, 2, bg, "333333", false, desc);
    fill(row, 3, bg, "595959", false, "Opcional");
    fill(row, 4, bg, C.white, false, "");
    rc++;
  });

  emptyRow(wsC, rc++, NC);

  // ── Líneas de negocio ─────────────────────────────────────────────────────
  secRow(wsC, rc++, "Líneas de negocio disponibles (business_line_code) — datos reales de la DB", NC);
  tblHdr(wsC, rc++, ["business_line_code", "Nombre", "Nota", ""], [20, 22, 28, 0]);
  bulletRow(wsC, rc++,
    "⚠  Las cuentas 4010101 y 4010102 (Ventas) tienen require_cu=true: business_line_code es OBLIGATORIO para esas cuentas.",
    NC, C.warnBg, C.warnFg);
  Object.entries(BL_CAT).forEach(([code, desc], idx) => {
    const row = wsC.getRow(rc);
    row.height = 15;
    const bg = idx % 2 === 0 ? C.white : C.rowAlt;
    fill(row, 1, bg, "1F3864", true, code);
    fill(row, 2, bg, "333333", false, desc);
    fill(row, 3, bg, "595959", false, code === "22100" ? "Línea Payment" : "Línea SaaS");
    fill(row, 4, bg, C.white, false, "");
    rc++;
  });

  emptyRow(wsC, rc++, NC);

  // ── Políticas de imputación vigentes ────────────────────────────────────
  secRow(wsC, rc++, "Políticas de imputación activas (qué cuentas requieren qué segmentos)", NC);
  tblHdr(wsC, rc++, ["account_code", "Nombre cuenta", "require_cc", "require_cu (BL) / require_suc (SUC)"], [14, 28, 14, 36]);
  const POLICIES = [
    ["4010101", "Ventas Nacionales",  "No", "✅ require_cu=SI  |  ✅ require_suc=SI"],
    ["4010102", "Ventas Exportación", "No", "✅ require_cu=SI  |  ✅ require_suc=SI"],
    ["1050101", "Clientes Nacionales","No", "❌ require_cu=NO  |  ❌ require_suc=NO  (sin obligatoriedad)"],
    ["Resto",   "Todas las demás",   "No",  "Sin política activa — todos los campos son opcionales"],
  ];
  POLICIES.forEach(([code, name, cc, cuSuc], idx) => {
    const row = wsC.getRow(rc);
    row.height = 20;
    const bg = idx % 2 === 0 ? C.white : C.rowAlt;
    const flagBg = (code === "4010101" || code === "4010102") ? C.warnBg : bg;
    fill(row, 1, flagBg, "1F3864", true, code);
    fill(row, 2, flagBg, "333333", false, name);
    fill(row, 3, flagBg, "595959", false, cc);
    fill(row, 4, flagBg, "333333", false, cuSuc, true);
    rc++;
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // HOJA 3: PLANTILLA
  // ──────────────────────────────────────────────────────────────────────────────
  const wsP = wb.addWorksheet("PLANTILLA", {
    properties: { tabColor: { argb: "FF375623" } },
  });

  const HEADERS = [
    "entry_key","entry_date","description","line_no","account_code",
    "line_description","debit","credit","counterparty_identifier",
    "cost_center_code","business_line_code","branch_code",
  ];
  const widthsP = [13, 14, 48, 10, 14, 36, 14, 14, 22, 14, 18, 14];
  HEADERS.forEach((_, i) => { wsP.getColumn(i + 1).width = widthsP[i] || 14; });

  // Fila 1 — Título
  {
    const row = wsP.getRow(1);
    row.height = 22;
    fill(row, 1, C.headerBg, C.headerFg, true,
      "ConciliaciónPro — Plantilla Carga Masiva de Asientos Contables");
    for (let c = 2; c <= HEADERS.length; c++) fill(row, c, C.headerBg, C.headerFg, false, "");
    wsP.mergeCells(1, 1, 1, HEADERS.length);
    Object.assign(wsP.getCell(1, 1), {
      font: { color: { argb: "FFFFFFFF" }, bold: true, name: "Calibri", size: 12 },
      alignment: { horizontal: "center", vertical: "middle" },
    });
  }

  // Fila 2 — Aviso
  {
    const row = wsP.getRow(2);
    row.height = 28;
    const msg =
      "⚠  NO modificar ni eliminar esta fila. " +
      "Datos desde fila 4. Mismo entry_key = mismo asiento. " +
      "entry_date y description deben repetirse en TODAS las filas del asiento.";
    fill(row, 1, C.instrBg, C.instrFg, true, msg, true);
    for (let c = 2; c <= HEADERS.length; c++) fill(row, c, C.instrBg, C.instrFg, false, "");
    wsP.mergeCells(2, 1, 2, HEADERS.length);
    wsP.getCell(2, 1).alignment = { wrapText: true, vertical: "middle" };
  }

  // Fila 3 — Headers (leídos por range:2)
  {
    const row = wsP.getRow(3);
    row.height = 18;
    HEADERS.forEach((h, i) => {
      fill(row, i + 1, C.headerBg, C.headerFg, true, h);
      wsP.getCell(3, i + 1).alignment = { horizontal: "center", vertical: "middle" };
    });
  }

  // Filas 4+ — Ejemplos
  EJEMPLOS.forEach((rowData, idx) => {
    const excelRow = 4 + idx;
    const wsRow    = wsP.getRow(excelRow);
    wsRow.height   = 15;
    const bg       = idx % 2 === 0 ? C.exBg1 : C.exBg2;
    rowData.forEach((val, ci) => {
      const cell    = wsRow.getCell(ci + 1);
      cell.value    = val === "" ? null : val;
      cell.fill     = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + bg } };
      cell.font     = { name: "Calibri", size: 10, color: { argb: "FF" + C.exFg } };
      cell.alignment = { vertical: "middle" };
    });
  });

  // Filas vacías — hasta fila 203
  const startBlank = 4 + EJEMPLOS.length;
  for (let fila = startBlank; fila <= 203; fila++) {
    const wsRow = wsP.getRow(fila);
    wsRow.height = 15;
    const bg = fila % 2 === 0 ? C.rowAlt : C.white;
    for (let c = 1; c <= HEADERS.length; c++) {
      const cell     = wsRow.getCell(c);
      cell.value     = null;
      cell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + bg } };
      cell.font      = { name: "Calibri", size: 10 };
      cell.alignment = { vertical: "middle" };
    }
  }

  // Freeze fila 3
  wsP.views = [{ state: "frozen", xSplit: 0, ySplit: 3, activeCell: "A4" }];

  // ── Guardar ───────────────────────────────────────────────────────────────
  const outPath = path.resolve(
    __dirname, "..", "public", "templates", "Formato_Asientos_Contables.xlsx"
  );
  await wb.xlsx.writeFile(outPath);
  console.log("✅  Generado:", outPath);
  console.log("    Ejemplos:", EJEMPLOS.length, "líneas /", new Set(EJEMPLOS.map(r => r[0])).size, "asientos");
  console.log("    Cuentas en catálogo:", Object.keys(PLAN).length);
  console.log("    Contrapartes:", Object.keys(CP).length);
}

main().catch((e) => { console.error(e); process.exit(1); });

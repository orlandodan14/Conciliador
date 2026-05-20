import type { MovimientoRow } from "./types";

// ─── Helpers de cuentas contables ─────────────────────────────────────────────
//  bank_code  cuenta contable del banco en el libro mayor
const ACCT = {
  BCH: { code: "1110", name: "Banco de Chile CTE" },
  BCI: { code: "1120", name: "BCI CTE Operaciones" },
  SAN: { code: "1130", name: "Santander CTE Proveedores" },
  ITA: { code: "1140", name: "Itaú CTE Internacional" },
  CXC: { code: "1101", name: "Cuentas por Cobrar Clientes" },
  CXP: { code: "2101", name: "Cuentas por Pagar Proveedores" },
  ING: { code: "4110", name: "Ingresos por Ventas" },
  ARR: { code: "4210", name: "Ingresos Arriendo" },
  SRV: { code: "4220", name: "Ingresos por Servicios" },
  GBK: { code: "5310", name: "Gastos Bancarios" },
  IVA: { code: "2201", name: "IVA Débito Fiscal" },
  GAS: { code: "5210", name: "Gasto Arriendo Oficina" },
  DIF: { code: "5920", name: "Ajuste por Diferencia de Precio" },
};

export const MOCK_MOVIMIENTOS: MovimientoRow[] = [

  // ═══════════════════════════════════════════════════════════════════════════
  // GRUPO A — PENDIENTE + SIN_ASIENTO (5 rows)
  // Sin match, sin sugerencias, sin asiento
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "mov-001",
    date: "2026-05-15",
    bank_id: "bank-1", bank_name: "Banco de Chile",
    account_id: "acc-1", account_number: "001-123456-01", account_name: "CTA CTE Principal",
    currency: "CLP",
    description: "CARGO COMISION MANTENCION CUENTA",
    reference: "CMB-20260515",
    counterparty_rut: null, counterparty_name: "Banco de Chile",
    debit: 15_000, credit: null,
    statement_balance: 37_680_500,
    reconciliation_status: "PENDIENTE", accounting_status: "SIN_ASIENTO",
    matched_docs: [], suggested_matches: [], journal_entry: null,
  },

  {
    id: "mov-002",
    date: "2026-05-14",
    bank_id: "bank-3", bank_name: "Santander",
    account_id: "acc-4", account_number: "072-654321-04", account_name: "CTA CTE Proveedores",
    currency: "CLP",
    description: "CARGO EMISION CHEQUERA",
    reference: "CHQ-20260514",
    counterparty_rut: null, counterparty_name: "Santander",
    debit: 8_500, credit: null,
    statement_balance: 8_320_400,
    reconciliation_status: "PENDIENTE", accounting_status: "SIN_ASIENTO",
    matched_docs: [], suggested_matches: [], journal_entry: null,
  },

  {
    id: "mov-003",
    date: "2026-05-13",
    bank_id: "bank-2", bank_name: "BCI",
    account_id: "acc-3", account_number: "023-456789-03", account_name: "CTA CTE Operaciones",
    currency: "CLP",
    description: "ABONO INTERESES CUENTA CORRIENTE",
    reference: "INT-20260513",
    counterparty_rut: null, counterparty_name: "BCI",
    debit: null, credit: 125_000,
    statement_balance: 18_750_000,
    reconciliation_status: "PENDIENTE", accounting_status: "SIN_ASIENTO",
    matched_docs: [], suggested_matches: [], journal_entry: null,
  },

  {
    id: "mov-004",
    date: "2026-05-12",
    bank_id: "bank-1", bank_name: "Banco de Chile",
    account_id: "acc-1", account_number: "001-123456-01", account_name: "CTA CTE Principal",
    currency: "CLP",
    description: "TRANSFERENCIA RECIBIDA SIN GLOSA",
    reference: "TR-88821",
    counterparty_rut: null, counterparty_name: null,
    debit: null, credit: 2_800_000,
    statement_balance: 42_150_000,
    reconciliation_status: "PENDIENTE", accounting_status: "SIN_ASIENTO",
    matched_docs: [], suggested_matches: [], journal_entry: null,
  },

  {
    id: "mov-005",
    date: "2026-05-11",
    bank_id: "bank-4", bank_name: "Itaú",
    account_id: "acc-5", account_number: "076-987654-05", account_name: "CTA CTE Internacional",
    currency: "CLP",
    description: "CARGO SERVICIO COBRO ELECTRONICO",
    reference: "SRV-20260511",
    counterparty_rut: null, counterparty_name: "Itaú",
    debit: 25_000, credit: null,
    statement_balance: 6_440_000,
    reconciliation_status: "PENDIENTE", accounting_status: "SIN_ASIENTO",
    matched_docs: [], suggested_matches: [], journal_entry: null,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // GRUPO B — SUGERIDO + SIN_ASIENTO (5 rows)
  // Tiene sugerencias, no ha conciliado aún → sin asiento
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "mov-006",
    date: "2026-05-13",
    bank_id: "bank-1", bank_name: "Banco de Chile",
    account_id: "acc-1", account_number: "001-123456-01", account_name: "CTA CTE Principal",
    currency: "CLP",
    description: "ABONO INVERSIONES XYZ FACTURA",
    reference: null,
    counterparty_rut: "87.654.321-0", counterparty_name: "Inversiones XYZ SpA",
    debit: null, credit: 1_250_000,
    statement_balance: 39_780_500,
    reconciliation_status: "SUGERIDO", accounting_status: "SIN_ASIENTO",
    matched_docs: [],
    suggested_matches: [
      { key: "s06-a", type: "FISCAL", label: "Factura 001-456", amount: 1_250_000, date: "2026-05-08",
        status: "VIGENTE", counterparty_rut: "87.654.321-0", counterparty_name: "Inversiones XYZ SpA",
        confidence: 0.94, journal_entry: null },
    ],
    journal_entry: null,
  },

  {
    id: "mov-007",
    date: "2026-05-12",
    bank_id: "bank-2", bank_name: "BCI",
    account_id: "acc-3", account_number: "023-456789-03", account_name: "CTA CTE Operaciones",
    currency: "CLP",
    description: "COBRO CLIENTE COMERCIAL SUR",
    reference: "TR-44512",
    counterparty_rut: "11.222.333-4", counterparty_name: "Comercial Sur Ltda.",
    debit: null, credit: 3_500_000,
    statement_balance: 17_950_000,
    reconciliation_status: "SUGERIDO", accounting_status: "SIN_ASIENTO",
    matched_docs: [],
    suggested_matches: [
      { key: "s07-a", type: "PAYMENT", label: "Cobro #COB-2026-051", amount: 3_500_000, date: "2026-05-12",
        status: "VIGENTE", counterparty_rut: "11.222.333-4", counterparty_name: "Comercial Sur Ltda.",
        confidence: 0.87, journal_entry: null },
    ],
    journal_entry: null,
  },

  {
    id: "mov-008",
    date: "2026-05-11",
    bank_id: "bank-3", bank_name: "Santander",
    account_id: "acc-4", account_number: "072-654321-04", account_name: "CTA CTE Proveedores",
    currency: "CLP",
    description: "TRANSFERENCIA SERVICIOS INTEGRADOS",
    reference: "TR-29944",
    counterparty_rut: "33.444.555-6", counterparty_name: "Servicios Integrados SpA",
    debit: null, credit: 4_200_000,
    statement_balance: 10_500_000,
    reconciliation_status: "SUGERIDO", accounting_status: "SIN_ASIENTO",
    matched_docs: [],
    suggested_matches: [
      { key: "s08-a", type: "FISCAL", label: "Factura 002-789", amount: 4_200_000, date: "2026-05-05",
        status: "VIGENTE", counterparty_rut: "33.444.555-6", counterparty_name: "Servicios Integrados SpA",
        confidence: 0.75, journal_entry: null },
      { key: "s08-b", type: "PAYMENT", label: "Cobro #COB-2026-038", amount: 4_180_000, date: "2026-05-04",
        status: "VIGENTE", counterparty_rut: "33.444.555-6", counterparty_name: "Servicios Integrados SpA",
        confidence: 0.58, journal_entry: null },
    ],
    journal_entry: null,
  },

  {
    id: "mov-009",
    date: "2026-05-10",
    bank_id: "bank-1", bank_name: "Banco de Chile",
    account_id: "acc-1", account_number: "001-123456-01", account_name: "CTA CTE Principal",
    currency: "CLP",
    description: "ABONO MULTIPLE CLIENTE NORTE",
    reference: "TRF-BULK-0099",
    counterparty_rut: "54.321.098-7", counterparty_name: "Comercial Norte Ltda.",
    debit: null, credit: 7_800_000,
    statement_balance: 45_230_500,
    reconciliation_status: "SUGERIDO", accounting_status: "SIN_ASIENTO",
    matched_docs: [],
    suggested_matches: [
      { key: "s09-a", type: "PAYMENT",    label: "Cobro #COB-2026-070",        amount: 7_800_000, date: "2026-05-10",
        status: "VIGENTE", counterparty_rut: "54.321.098-7", counterparty_name: "Comercial Norte Ltda.", confidence: 0.91, journal_entry: null },
      { key: "s09-b", type: "FISCAL",     label: "Factura 003-112",             amount: 7_750_000, date: "2026-05-07",
        status: "VIGENTE", counterparty_rut: "54.321.098-7", counterparty_name: "Comercial Norte Ltda.", confidence: 0.68, journal_entry: null },
      { key: "s09-c", type: "NON_FISCAL", label: "Otro Ingreso #OT-2026-044",   amount: 7_820_000, date: "2026-05-06",
        status: "VIGENTE", counterparty_rut: "54.321.098-7", counterparty_name: "Comercial Norte Ltda.", confidence: 0.45, journal_entry: null },
    ],
    journal_entry: null,
  },

  {
    id: "mov-010",
    date: "2026-05-09",
    bank_id: "bank-4", bank_name: "Itaú",
    account_id: "acc-5", account_number: "076-987654-05", account_name: "CTA CTE Internacional",
    currency: "CLP",
    description: "DEPOSITO EFECTIVO SUCURSAL",
    reference: null,
    counterparty_rut: null, counterparty_name: null,
    debit: null, credit: 980_000,
    statement_balance: 6_465_000,
    reconciliation_status: "SUGERIDO", accounting_status: "SIN_ASIENTO",
    matched_docs: [],
    suggested_matches: [
      { key: "s10-a", type: "NON_FISCAL", label: "Otro Ingreso #OT-2026-031", amount: 980_000, date: "2026-05-09",
        status: "VIGENTE", counterparty_rut: null, counterparty_name: null, confidence: 0.63, journal_entry: null },
    ],
    journal_entry: null,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // GRUPO C — CONCILIADO + BORRADOR (5 rows)
  // Al menos un matched_doc tiene JE en estado DRAFT
  // ═══════════════════════════════════════════════════════════════════════════

  // C-1: 1 match PAYMENT, JE DRAFT
  {
    id: "mov-011",
    date: "2026-05-10",
    bank_id: "bank-2", bank_name: "BCI",
    account_id: "acc-3", account_number: "023-456789-03", account_name: "CTA CTE Operaciones",
    currency: "CLP",
    description: "COBRO EMPRESA ABC LTDA",
    reference: "TRF-2026-05-011",
    counterparty_rut: "12.345.678-9", counterparty_name: "Empresa ABC Ltda.",
    debit: null, credit: 2_150_000,
    statement_balance: 16_200_000,
    reconciliation_status: "CONCILIADO", accounting_status: "BORRADOR",
    matched_docs: [
      {
        key: "m11-a", type: "PAYMENT", label: "Cobro #COB-2026-045",
        amount: 2_150_000, date: "2026-05-10", status: "VIGENTE",
        counterparty_rut: "12.345.678-9", counterparty_name: "Empresa ABC Ltda.",
        journal_entry: { id: "je-011a", status: "DRAFT", date: "2026-05-10",
          description: "Cobro clientes - Empresa ABC",
          lines: [
            { account_code: ACCT.BCI.code, account_name: ACCT.BCI.name, debit: 2_150_000, credit: null },
            { account_code: ACCT.CXC.code, account_name: ACCT.CXC.name, debit: null, credit: 2_150_000 },
          ] },
      },
    ],
    suggested_matches: [], journal_entry: null,
  },

  // C-2: 1 match FISCAL, JE DRAFT
  {
    id: "mov-012",
    date: "2026-05-09",
    bank_id: "bank-1", bank_name: "Banco de Chile",
    account_id: "acc-1", account_number: "001-123456-01", account_name: "CTA CTE Principal",
    currency: "CLP",
    description: "PAGO FACTURA PROVEEDOR GENERICO",
    reference: "TRF-2026-05-012",
    counterparty_rut: "98.765.432-1", counterparty_name: "Proveedor Genérico Ltda.",
    debit: null, credit: 890_000,
    statement_balance: 38_890_000,
    reconciliation_status: "CONCILIADO", accounting_status: "BORRADOR",
    matched_docs: [
      {
        key: "m12-a", type: "FISCAL", label: "Factura 001-892",
        amount: 890_000, date: "2026-05-05", status: "VIGENTE",
        counterparty_rut: "98.765.432-1", counterparty_name: "Proveedor Genérico Ltda.",
        journal_entry: { id: "je-012a", status: "DRAFT", date: "2026-05-09",
          description: "Cobro Factura 001-892 - Proveedor Genérico",
          lines: [
            { account_code: ACCT.BCH.code, account_name: ACCT.BCH.name, debit: 890_000, credit: null },
            { account_code: ACCT.CXC.code, account_name: ACCT.CXC.name, debit: null, credit: 890_000 },
          ] },
      },
    ],
    suggested_matches: [], journal_entry: null,
  },

  // C-3: 2 matches (PAYMENT + FISCAL), ambos JE DRAFT
  {
    id: "mov-013",
    date: "2026-05-08",
    bank_id: "bank-3", bank_name: "Santander",
    account_id: "acc-4", account_number: "072-654321-04", account_name: "CTA CTE Proveedores",
    currency: "CLP",
    description: "ABONO DISTRIBUIDORA NACIONAL 2 DOCS",
    reference: "TRF-2026-05-013",
    counterparty_rut: "22.333.444-5", counterparty_name: "Distribuidora Nacional SpA",
    debit: null, credit: 3_400_000,
    statement_balance: 9_800_000,
    reconciliation_status: "CONCILIADO", accounting_status: "BORRADOR",
    matched_docs: [
      {
        key: "m13-a", type: "PAYMENT", label: "Cobro #COB-2026-052",
        amount: 1_900_000, date: "2026-05-08", status: "VIGENTE",
        counterparty_rut: "22.333.444-5", counterparty_name: "Distribuidora Nacional SpA",
        journal_entry: { id: "je-013a", status: "DRAFT", date: "2026-05-08",
          description: "Cobro COB-052 - Distribuidora Nacional",
          lines: [
            { account_code: ACCT.SAN.code, account_name: ACCT.SAN.name, debit: 1_900_000, credit: null },
            { account_code: ACCT.CXC.code, account_name: ACCT.CXC.name, debit: null, credit: 1_900_000 },
          ] },
      },
      {
        key: "m13-b", type: "FISCAL", label: "Factura 002-331",
        amount: 1_500_000, date: "2026-05-03", status: "VIGENTE",
        counterparty_rut: "22.333.444-5", counterparty_name: "Distribuidora Nacional SpA",
        journal_entry: { id: "je-013b", status: "DRAFT", date: "2026-05-08",
          description: "Cobro Factura 002-331 - Distribuidora Nacional",
          lines: [
            { account_code: ACCT.SAN.code, account_name: ACCT.SAN.name, debit: 1_500_000, credit: null },
            { account_code: ACCT.CXC.code, account_name: ACCT.CXC.name, debit: null, credit: 1_500_000 },
          ] },
      },
    ],
    suggested_matches: [], journal_entry: null,
  },

  // C-4: 2 matches — 1 POSTED + 1 DRAFT (estado mixto → BORRADOR)
  {
    id: "mov-014",
    date: "2026-05-07",
    bank_id: "bank-4", bank_name: "Itaú",
    account_id: "acc-5", account_number: "076-987654-05", account_name: "CTA CTE Internacional",
    currency: "CLP",
    description: "ABONO TECNOLOGIA EMPRESARIAL 2 DOCS",
    reference: "TRF-2026-05-014",
    counterparty_rut: "44.555.666-7", counterparty_name: "Tecnología Empresarial SA",
    debit: null, credit: 4_750_000,
    statement_balance: 7_100_000,
    reconciliation_status: "CONCILIADO", accounting_status: "BORRADOR",
    matched_docs: [
      {
        key: "m14-a", type: "PAYMENT", label: "Cobro #COB-2026-060",
        amount: 3_000_000, date: "2026-05-07", status: "VIGENTE",
        counterparty_rut: "44.555.666-7", counterparty_name: "Tecnología Empresarial SA",
        journal_entry: { id: "je-014a", status: "POSTED", date: "2026-05-07",
          description: "Cobro COB-060 - Tecnología Empresarial",
          lines: [
            { account_code: ACCT.ITA.code, account_name: ACCT.ITA.name, debit: 3_000_000, credit: null },
            { account_code: ACCT.CXC.code, account_name: ACCT.CXC.name, debit: null, credit: 3_000_000 },
          ] },
      },
      {
        key: "m14-b", type: "NON_FISCAL", label: "Otro Ingreso #OT-2026-035",
        amount: 1_750_000, date: "2026-05-06", status: "VIGENTE",
        counterparty_rut: "44.555.666-7", counterparty_name: "Tecnología Empresarial SA",
        journal_entry: { id: "je-014b", status: "DRAFT", date: "2026-05-07",
          description: "Ingreso servicios - Tecnología Empresarial",
          lines: [
            { account_code: ACCT.ITA.code, account_name: ACCT.ITA.name,  debit: 1_750_000, credit: null },
            { account_code: ACCT.SRV.code, account_name: ACCT.SRV.name,  debit: null, credit: 1_750_000 },
          ] },
      },
    ],
    suggested_matches: [], journal_entry: null,
  },

  // C-5: 3 matches (PAYMENT POSTED + FISCAL POSTED + NON_FISCAL DRAFT) → BORRADOR
  {
    id: "mov-015",
    date: "2026-05-06",
    bank_id: "bank-2", bank_name: "BCI",
    account_id: "acc-3", account_number: "023-456789-03", account_name: "CTA CTE Operaciones",
    currency: "CLP",
    description: "ABONO CONSULTORA ESTRATEGICA 3 DOCS",
    reference: "TRF-2026-05-015",
    counterparty_rut: "55.666.777-8", counterparty_name: "Consultora Estratégica Ltda.",
    debit: null, credit: 9_200_000,
    statement_balance: 13_400_000,
    reconciliation_status: "CONCILIADO", accounting_status: "BORRADOR",
    matched_docs: [
      {
        key: "m15-a", type: "PAYMENT", label: "Cobro #COB-2026-065",
        amount: 4_500_000, date: "2026-05-06", status: "VIGENTE",
        counterparty_rut: "55.666.777-8", counterparty_name: "Consultora Estratégica Ltda.",
        journal_entry: { id: "je-015a", status: "POSTED", date: "2026-05-06",
          description: "Cobro COB-065 - Consultora Estratégica",
          lines: [
            { account_code: ACCT.BCI.code, account_name: ACCT.BCI.name, debit: 4_500_000, credit: null },
            { account_code: ACCT.CXC.code, account_name: ACCT.CXC.name, debit: null, credit: 4_500_000 },
          ] },
      },
      {
        key: "m15-b", type: "FISCAL", label: "Factura 003-045",
        amount: 3_200_000, date: "2026-05-02", status: "VIGENTE",
        counterparty_rut: "55.666.777-8", counterparty_name: "Consultora Estratégica Ltda.",
        journal_entry: { id: "je-015b", status: "POSTED", date: "2026-05-06",
          description: "Cobro Factura 003-045 - Consultora Estratégica",
          lines: [
            { account_code: ACCT.BCI.code, account_name: ACCT.BCI.name, debit: 3_200_000, credit: null },
            { account_code: ACCT.CXC.code, account_name: ACCT.CXC.name, debit: null, credit: 3_200_000 },
          ] },
      },
      {
        key: "m15-c", type: "NON_FISCAL", label: "Otro Ingreso #OT-2026-028",
        amount: 1_500_000, date: "2026-05-01", status: "VIGENTE",
        counterparty_rut: "55.666.777-8", counterparty_name: "Consultora Estratégica Ltda.",
        journal_entry: { id: "je-015c", status: "DRAFT", date: "2026-05-06",
          description: "Ingreso servicios adicionales - Consultora Estratégica",
          lines: [
            { account_code: ACCT.BCI.code, account_name: ACCT.BCI.name, debit: 1_500_000, credit: null },
            { account_code: ACCT.SRV.code, account_name: ACCT.SRV.name, debit: null, credit: 1_500_000 },
          ] },
      },
    ],
    suggested_matches: [], journal_entry: null,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // GRUPO D — CONCILIADO + CONTABILIZADO (10 rows)
  // Todos los matched_docs tienen JE POSTED
  // ═══════════════════════════════════════════════════════════════════════════

  // D-1: 1 match PAYMENT, JE POSTED
  {
    id: "mov-016",
    date: "2026-05-09",
    bank_id: "bank-1", bank_name: "Banco de Chile",
    account_id: "acc-1", account_number: "001-123456-01", account_name: "CTA CTE Principal",
    currency: "CLP",
    description: "ABONO EMPRESA ABC LTDA COBRO",
    reference: "TRF-2026-05-016",
    counterparty_rut: "12.345.678-9", counterparty_name: "Empresa ABC Ltda.",
    debit: null, credit: 5_450_000,
    statement_balance: 45_230_500,
    reconciliation_status: "CONCILIADO", accounting_status: "CONTABILIZADO",
    matched_docs: [
      {
        key: "m16-a", type: "PAYMENT", label: "Cobro #COB-2026-045",
        amount: 5_450_000, date: "2026-05-09", status: "VIGENTE",
        counterparty_rut: "12.345.678-9", counterparty_name: "Empresa ABC Ltda.",
        journal_entry: { id: "je-016a", status: "POSTED", date: "2026-05-09",
          description: "Cobro clientes - Empresa ABC",
          lines: [
            { account_code: ACCT.BCH.code, account_name: ACCT.BCH.name, debit: 5_450_000, credit: null },
            { account_code: ACCT.CXC.code, account_name: ACCT.CXC.name, debit: null, credit: 5_450_000 },
          ] },
      },
    ],
    suggested_matches: [], journal_entry: null,
  },

  // D-2: 1 match FISCAL, JE POSTED
  {
    id: "mov-017",
    date: "2026-05-08",
    bank_id: "bank-1", bank_name: "Banco de Chile",
    account_id: "acc-1", account_number: "001-123456-01", account_name: "CTA CTE Principal",
    currency: "CLP",
    description: "ABONO ARRIENDO LOCAL COMERCIAL",
    reference: "TRF-PAGO-0088",
    counterparty_rut: "65.432.109-8", counterparty_name: "Arriendos Comerciales SpA",
    debit: null, credit: 1_850_000,
    statement_balance: 37_695_500,
    reconciliation_status: "CONCILIADO", accounting_status: "CONTABILIZADO",
    matched_docs: [
      {
        key: "m17-a", type: "FISCAL", label: "Factura 004-221",
        amount: 1_850_000, date: "2026-05-05", status: "VIGENTE",
        counterparty_rut: "65.432.109-8", counterparty_name: "Arriendos Comerciales SpA",
        journal_entry: { id: "je-017a", status: "POSTED", date: "2026-05-08",
          description: "Cobro Factura 004-221 - Arriendos Comerciales",
          lines: [
            { account_code: ACCT.BCH.code, account_name: ACCT.BCH.name, debit: 1_850_000, credit: null },
            { account_code: ACCT.CXC.code, account_name: ACCT.CXC.name, debit: null, credit: 1_850_000 },
          ] },
      },
    ],
    suggested_matches: [], journal_entry: null,
  },

  // D-3: 1 match NON_FISCAL, JE POSTED
  {
    id: "mov-018",
    date: "2026-05-07",
    bank_id: "bank-2", bank_name: "BCI",
    account_id: "acc-3", account_number: "023-456789-03", account_name: "CTA CTE Operaciones",
    currency: "CLP",
    description: "INGRESO ARRIENDO BODEGA NORTE",
    reference: "ARR-BOD-0044",
    counterparty_rut: "66.777.888-9", counterparty_name: "Constructora del Sur SA",
    debit: null, credit: 1_200_000,
    statement_balance: 14_200_000,
    reconciliation_status: "CONCILIADO", accounting_status: "CONTABILIZADO",
    matched_docs: [
      {
        key: "m18-a", type: "NON_FISCAL", label: "Otro Ingreso #OT-2026-020",
        amount: 1_200_000, date: "2026-05-07", status: "VIGENTE",
        counterparty_rut: "66.777.888-9", counterparty_name: "Constructora del Sur SA",
        journal_entry: { id: "je-018a", status: "POSTED", date: "2026-05-07",
          description: "Arriendo bodega norte - Constructora del Sur",
          lines: [
            { account_code: ACCT.BCI.code, account_name: ACCT.BCI.name, debit: 1_200_000, credit: null },
            { account_code: ACCT.ARR.code, account_name: ACCT.ARR.name, debit: null, credit: 1_200_000 },
          ] },
      },
    ],
    suggested_matches: [], journal_entry: null,
  },

  // D-4: 1 match JOURNAL_ENTRY (pago impuesto), JE POSTED
  {
    id: "mov-019",
    date: "2026-05-10",
    bank_id: "bank-3", bank_name: "Santander",
    account_id: "acc-4", account_number: "072-654321-04", account_name: "CTA CTE Proveedores",
    currency: "CLP",
    description: "PAGO SII IVA ABRIL 2026",
    reference: "SII-F29-042026",
    counterparty_rut: "60.805.000-0", counterparty_name: "Serv. Impuestos Internos",
    debit: 2_340_000, credit: null,
    statement_balance: 8_970_400,
    reconciliation_status: "CONCILIADO", accounting_status: "CONTABILIZADO",
    matched_docs: [
      {
        key: "m19-a", type: "JOURNAL_ENTRY", label: "Asiento #AST-2026-089",
        amount: 2_340_000, date: "2026-05-10", status: "POSTED",
        counterparty_rut: "60.805.000-0", counterparty_name: "Serv. Impuestos Internos",
        journal_entry: { id: "je-019a", status: "POSTED", date: "2026-05-10",
          description: "Pago IVA F29 abril 2026",
          lines: [
            { account_code: ACCT.IVA.code, account_name: ACCT.IVA.name, debit: 2_340_000, credit: null },
            { account_code: ACCT.SAN.code, account_name: ACCT.SAN.name, debit: null, credit: 2_340_000 },
          ] },
      },
    ],
    suggested_matches: [], journal_entry: null,
  },

  // D-5: 2 matches (PAYMENT + FISCAL), ambos POSTED
  {
    id: "mov-020",
    date: "2026-05-06",
    bank_id: "bank-1", bank_name: "Banco de Chile",
    account_id: "acc-1", account_number: "001-123456-01", account_name: "CTA CTE Principal",
    currency: "CLP",
    description: "ABONO SUPERMERCADOS UNIDOS 2 DOCS",
    reference: "TRF-2026-05-020",
    counterparty_rut: "77.888.999-0", counterparty_name: "Supermercados Unidos Ltda.",
    debit: null, credit: 6_700_000,
    statement_balance: 41_500_000,
    reconciliation_status: "CONCILIADO", accounting_status: "CONTABILIZADO",
    matched_docs: [
      {
        key: "m20-a", type: "PAYMENT", label: "Cobro #COB-2026-080",
        amount: 4_200_000, date: "2026-05-06", status: "VIGENTE",
        counterparty_rut: "77.888.999-0", counterparty_name: "Supermercados Unidos Ltda.",
        journal_entry: { id: "je-020a", status: "POSTED", date: "2026-05-06",
          description: "Cobro COB-080 - Supermercados Unidos",
          lines: [
            { account_code: ACCT.BCH.code, account_name: ACCT.BCH.name, debit: 4_200_000, credit: null },
            { account_code: ACCT.CXC.code, account_name: ACCT.CXC.name, debit: null, credit: 4_200_000 },
          ] },
      },
      {
        key: "m20-b", type: "FISCAL", label: "Factura 005-118",
        amount: 2_500_000, date: "2026-05-02", status: "VIGENTE",
        counterparty_rut: "77.888.999-0", counterparty_name: "Supermercados Unidos Ltda.",
        journal_entry: { id: "je-020b", status: "POSTED", date: "2026-05-06",
          description: "Cobro Factura 005-118 - Supermercados Unidos",
          lines: [
            { account_code: ACCT.BCH.code, account_name: ACCT.BCH.name, debit: 2_500_000, credit: null },
            { account_code: ACCT.CXC.code, account_name: ACCT.CXC.name, debit: null, credit: 2_500_000 },
          ] },
      },
    ],
    suggested_matches: [], journal_entry: null,
  },

  // D-6: 2 matches (PAYMENT + NON_FISCAL), ambos POSTED
  {
    id: "mov-021",
    date: "2026-05-05",
    bank_id: "bank-4", bank_name: "Itaú",
    account_id: "acc-5", account_number: "076-987654-05", account_name: "CTA CTE Internacional",
    currency: "CLP",
    description: "ABONO TRANSPORTE EXPRESS 2 DOCS",
    reference: "TRF-2026-05-021",
    counterparty_rut: "88.999.000-1", counterparty_name: "Transporte Express SpA",
    debit: null, credit: 4_500_000,
    statement_balance: 7_300_000,
    reconciliation_status: "CONCILIADO", accounting_status: "CONTABILIZADO",
    matched_docs: [
      {
        key: "m21-a", type: "PAYMENT", label: "Cobro #COB-2026-082",
        amount: 3_000_000, date: "2026-05-05", status: "VIGENTE",
        counterparty_rut: "88.999.000-1", counterparty_name: "Transporte Express SpA",
        journal_entry: { id: "je-021a", status: "POSTED", date: "2026-05-05",
          description: "Cobro COB-082 - Transporte Express",
          lines: [
            { account_code: ACCT.ITA.code, account_name: ACCT.ITA.name, debit: 3_000_000, credit: null },
            { account_code: ACCT.CXC.code, account_name: ACCT.CXC.name, debit: null, credit: 3_000_000 },
          ] },
      },
      {
        key: "m21-b", type: "NON_FISCAL", label: "Otro Ingreso #OT-2026-040",
        amount: 1_500_000, date: "2026-05-04", status: "VIGENTE",
        counterparty_rut: "88.999.000-1", counterparty_name: "Transporte Express SpA",
        journal_entry: { id: "je-021b", status: "POSTED", date: "2026-05-05",
          description: "Ingreso flete especial - Transporte Express",
          lines: [
            { account_code: ACCT.ITA.code, account_name: ACCT.ITA.name, debit: 1_500_000, credit: null },
            { account_code: ACCT.SRV.code, account_name: ACCT.SRV.name, debit: null, credit: 1_500_000 },
          ] },
      },
    ],
    suggested_matches: [], journal_entry: null,
  },

  // D-7: 3 matches (PAYMENT + FISCAL + NON_FISCAL), todos POSTED
  {
    id: "mov-022",
    date: "2026-05-05",
    bank_id: "bank-2", bank_name: "BCI",
    account_id: "acc-3", account_number: "023-456789-03", account_name: "CTA CTE Operaciones",
    currency: "CLP",
    description: "ABONO MULTIPLE COMERCIAL NORTE 3 DOCS",
    reference: "TRF-BULK-2026-05",
    counterparty_rut: "54.321.098-7", counterparty_name: "Comercial Norte Ltda.",
    debit: null, credit: 8_500_000,
    statement_balance: 14_750_000,
    reconciliation_status: "CONCILIADO", accounting_status: "CONTABILIZADO",
    matched_docs: [
      {
        key: "m22-a", type: "PAYMENT", label: "Cobro #COB-2026-038",
        amount: 4_700_000, date: "2026-05-05", status: "VIGENTE",
        counterparty_rut: "54.321.098-7", counterparty_name: "Comercial Norte Ltda.",
        journal_entry: { id: "je-022a", status: "POSTED", date: "2026-05-05",
          description: "Cobro COB-038 - Comercial Norte",
          lines: [
            { account_code: ACCT.BCI.code, account_name: ACCT.BCI.name, debit: 4_700_000, credit: null },
            { account_code: ACCT.CXC.code, account_name: ACCT.CXC.name, debit: null, credit: 4_700_000 },
          ] },
      },
      {
        key: "m22-b", type: "FISCAL", label: "Factura 002-790",
        amount: 2_500_000, date: "2026-05-02", status: "VIGENTE",
        counterparty_rut: "54.321.098-7", counterparty_name: "Comercial Norte Ltda.",
        journal_entry: { id: "je-022b", status: "POSTED", date: "2026-05-05",
          description: "Cobro Factura 002-790 - Comercial Norte",
          lines: [
            { account_code: ACCT.BCI.code, account_name: ACCT.BCI.name, debit: 2_500_000, credit: null },
            { account_code: ACCT.CXC.code, account_name: ACCT.CXC.name, debit: null, credit: 2_500_000 },
          ] },
      },
      {
        key: "m22-c", type: "NON_FISCAL", label: "Otro Ingreso #OT-2026-022",
        amount: 1_300_000, date: "2026-05-01", status: "VIGENTE",
        counterparty_rut: "54.321.098-7", counterparty_name: "Comercial Norte Ltda.",
        journal_entry: { id: "je-022c", status: "POSTED", date: "2026-05-05",
          description: "Ingreso servicios extra - Comercial Norte",
          lines: [
            { account_code: ACCT.BCI.code, account_name: ACCT.BCI.name, debit: 1_300_000, credit: null },
            { account_code: ACCT.SRV.code, account_name: ACCT.SRV.name, debit: null, credit: 1_300_000 },
          ] },
      },
    ],
    suggested_matches: [], journal_entry: null,
  },

  // D-8: 3 matches todos FISCAL, todos POSTED
  {
    id: "mov-023",
    date: "2026-05-04",
    bank_id: "bank-1", bank_name: "Banco de Chile",
    account_id: "acc-1", account_number: "001-123456-01", account_name: "CTA CTE Principal",
    currency: "CLP",
    description: "ABONO INVERSIONES XYZ 3 FACTURAS",
    reference: "TRF-2026-05-023",
    counterparty_rut: "87.654.321-0", counterparty_name: "Inversiones XYZ SpA",
    debit: null, credit: 7_200_000,
    statement_balance: 39_100_000,
    reconciliation_status: "CONCILIADO", accounting_status: "CONTABILIZADO",
    matched_docs: [
      {
        key: "m23-a", type: "FISCAL", label: "Factura 001-500",
        amount: 3_500_000, date: "2026-04-28", status: "VIGENTE",
        counterparty_rut: "87.654.321-0", counterparty_name: "Inversiones XYZ SpA",
        journal_entry: { id: "je-023a", status: "POSTED", date: "2026-05-04",
          description: "Cobro Factura 001-500 - Inversiones XYZ",
          lines: [
            { account_code: ACCT.BCH.code, account_name: ACCT.BCH.name, debit: 3_500_000, credit: null },
            { account_code: ACCT.CXC.code, account_name: ACCT.CXC.name, debit: null, credit: 3_500_000 },
          ] },
      },
      {
        key: "m23-b", type: "FISCAL", label: "Factura 001-501",
        amount: 2_200_000, date: "2026-04-25", status: "VIGENTE",
        counterparty_rut: "87.654.321-0", counterparty_name: "Inversiones XYZ SpA",
        journal_entry: { id: "je-023b", status: "POSTED", date: "2026-05-04",
          description: "Cobro Factura 001-501 - Inversiones XYZ",
          lines: [
            { account_code: ACCT.BCH.code, account_name: ACCT.BCH.name, debit: 2_200_000, credit: null },
            { account_code: ACCT.CXC.code, account_name: ACCT.CXC.name, debit: null, credit: 2_200_000 },
          ] },
      },
      {
        key: "m23-c", type: "FISCAL", label: "Factura 001-502",
        amount: 1_500_000, date: "2026-04-20", status: "VIGENTE",
        counterparty_rut: "87.654.321-0", counterparty_name: "Inversiones XYZ SpA",
        journal_entry: { id: "je-023c", status: "POSTED", date: "2026-05-04",
          description: "Cobro Factura 001-502 - Inversiones XYZ",
          lines: [
            { account_code: ACCT.BCH.code, account_name: ACCT.BCH.name, debit: 1_500_000, credit: null },
            { account_code: ACCT.CXC.code, account_name: ACCT.CXC.name, debit: null, credit: 1_500_000 },
          ] },
      },
    ],
    suggested_matches: [], journal_entry: null,
  },

  // D-9: 4 matches (pago múltiple grande), todos POSTED
  {
    id: "mov-024",
    date: "2026-05-03",
    bank_id: "bank-2", bank_name: "BCI",
    account_id: "acc-3", account_number: "023-456789-03", account_name: "CTA CTE Operaciones",
    currency: "CLP",
    description: "ABONO CONSTRUCTORA SUR 4 DOCUMENTOS",
    reference: "TRF-2026-05-024",
    counterparty_rut: "66.777.888-9", counterparty_name: "Constructora del Sur SA",
    debit: null, credit: 12_800_000,
    statement_balance: 11_050_000,
    reconciliation_status: "CONCILIADO", accounting_status: "CONTABILIZADO",
    matched_docs: [
      {
        key: "m24-a", type: "PAYMENT", label: "Cobro #COB-2026-020",
        amount: 5_000_000, date: "2026-05-03", status: "VIGENTE",
        counterparty_rut: "66.777.888-9", counterparty_name: "Constructora del Sur SA",
        journal_entry: { id: "je-024a", status: "POSTED", date: "2026-05-03",
          description: "Cobro COB-020 - Constructora del Sur",
          lines: [
            { account_code: ACCT.BCI.code, account_name: ACCT.BCI.name, debit: 5_000_000, credit: null },
            { account_code: ACCT.CXC.code, account_name: ACCT.CXC.name, debit: null, credit: 5_000_000 },
          ] },
      },
      {
        key: "m24-b", type: "FISCAL", label: "Factura 006-001",
        amount: 3_500_000, date: "2026-04-30", status: "VIGENTE",
        counterparty_rut: "66.777.888-9", counterparty_name: "Constructora del Sur SA",
        journal_entry: { id: "je-024b", status: "POSTED", date: "2026-05-03",
          description: "Cobro Factura 006-001 - Constructora del Sur",
          lines: [
            { account_code: ACCT.BCI.code, account_name: ACCT.BCI.name, debit: 3_500_000, credit: null },
            { account_code: ACCT.CXC.code, account_name: ACCT.CXC.name, debit: null, credit: 3_500_000 },
          ] },
      },
      {
        key: "m24-c", type: "FISCAL", label: "Factura 006-002",
        amount: 2_800_000, date: "2026-04-25", status: "VIGENTE",
        counterparty_rut: "66.777.888-9", counterparty_name: "Constructora del Sur SA",
        journal_entry: { id: "je-024c", status: "POSTED", date: "2026-05-03",
          description: "Cobro Factura 006-002 - Constructora del Sur",
          lines: [
            { account_code: ACCT.BCI.code, account_name: ACCT.BCI.name, debit: 2_800_000, credit: null },
            { account_code: ACCT.CXC.code, account_name: ACCT.CXC.name, debit: null, credit: 2_800_000 },
          ] },
      },
      {
        key: "m24-d", type: "NON_FISCAL", label: "Otro Ingreso #OT-2026-015",
        amount: 1_500_000, date: "2026-04-22", status: "VIGENTE",
        counterparty_rut: "66.777.888-9", counterparty_name: "Constructora del Sur SA",
        journal_entry: { id: "je-024d", status: "POSTED", date: "2026-05-03",
          description: "Ingreso otros servicios - Constructora del Sur",
          lines: [
            { account_code: ACCT.BCI.code, account_name: ACCT.BCI.name, debit: 1_500_000, credit: null },
            { account_code: ACCT.SRV.code, account_name: ACCT.SRV.name, debit: null, credit: 1_500_000 },
          ] },
      },
    ],
    suggested_matches: [], journal_entry: null,
  },

  // D-10: 3 matches (PAYMENT + JOURNAL_ENTRY + FISCAL), todos POSTED
  {
    id: "mov-025",
    date: "2026-05-02",
    bank_id: "bank-3", bank_name: "Santander",
    account_id: "acc-4", account_number: "072-654321-04", account_name: "CTA CTE Proveedores",
    currency: "CLP",
    description: "ABONO SERVICIOS INTEGRADOS 3 DOCS",
    reference: "TRF-2026-05-025",
    counterparty_rut: "33.444.555-6", counterparty_name: "Servicios Integrados SpA",
    debit: null, credit: 11_000_000,
    statement_balance: 9_600_000,
    reconciliation_status: "CONCILIADO", accounting_status: "CONTABILIZADO",
    matched_docs: [
      {
        key: "m25-a", type: "PAYMENT", label: "Cobro #COB-2026-010",
        amount: 6_000_000, date: "2026-05-02", status: "VIGENTE",
        counterparty_rut: "33.444.555-6", counterparty_name: "Servicios Integrados SpA",
        journal_entry: { id: "je-025a", status: "POSTED", date: "2026-05-02",
          description: "Cobro COB-010 - Servicios Integrados",
          lines: [
            { account_code: ACCT.SAN.code, account_name: ACCT.SAN.name, debit: 6_000_000, credit: null },
            { account_code: ACCT.CXC.code, account_name: ACCT.CXC.name, debit: null, credit: 6_000_000 },
          ] },
      },
      {
        key: "m25-b", type: "JOURNAL_ENTRY", label: "Asiento #AST-2026-055",
        amount: 3_000_000, date: "2026-05-01", status: "POSTED",
        counterparty_rut: "33.444.555-6", counterparty_name: "Servicios Integrados SpA",
        journal_entry: { id: "je-025b", status: "POSTED", date: "2026-05-02",
          description: "Regularización contable - Servicios Integrados",
          lines: [
            { account_code: ACCT.SAN.code, account_name: ACCT.SAN.name, debit: 3_000_000, credit: null },
            { account_code: ACCT.ING.code, account_name: ACCT.ING.name, debit: null, credit: 3_000_000 },
          ] },
      },
      {
        key: "m25-c", type: "FISCAL", label: "Factura 002-678",
        amount: 2_000_000, date: "2026-04-28", status: "VIGENTE",
        counterparty_rut: "33.444.555-6", counterparty_name: "Servicios Integrados SpA",
        journal_entry: { id: "je-025c", status: "POSTED", date: "2026-05-02",
          description: "Cobro Factura 002-678 - Servicios Integrados",
          lines: [
            { account_code: ACCT.SAN.code, account_name: ACCT.SAN.name, debit: 2_000_000, credit: null },
            { account_code: ACCT.CXC.code, account_name: ACCT.CXC.name, debit: null, credit: 2_000_000 },
          ] },
      },
    ],
    suggested_matches: [], journal_entry: null,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // GRUPO E — PARCIAL (4 rows)
  // Tiene matched_docs (conciliado parcialmente) + suggested_matches para la
  // diferencia restante. Los matched_docs siempre tienen journal_entry.
  // ═══════════════════════════════════════════════════════════════════════════

  // P-1: 1 match PAYMENT (POSTED) + 1 sugerencia para la diferencia
  {
    id: "mov-026",
    date: "2026-05-16",
    bank_id: "bank-1", bank_name: "Banco de Chile",
    account_id: "acc-1", account_number: "001-123456-01", account_name: "CTA CTE Principal",
    currency: "CLP",
    description: "ABONO PARCIAL COMERCIAL SUR LTDA",
    reference: "TRF-2026-05-026",
    counterparty_rut: "11.222.333-4", counterparty_name: "Comercial Sur Ltda.",
    debit: null, credit: 5_200_000,
    statement_balance: 44_880_000,
    reconciliation_status: "PARCIAL", accounting_status: "CONTABILIZADO",
    matched_docs: [
      {
        key: "m26-a", type: "PAYMENT", label: "Cobro #COB-2026-089",
        amount: 3_000_000, date: "2026-05-16", status: "VIGENTE",
        counterparty_rut: "11.222.333-4", counterparty_name: "Comercial Sur Ltda.",
        journal_entry: { id: "je-026a", status: "POSTED", date: "2026-05-16",
          description: "Cobro COB-089 - Comercial Sur",
          lines: [
            { account_code: ACCT.BCH.code, account_name: ACCT.BCH.name, debit: 3_000_000, credit: null },
            { account_code: ACCT.CXC.code, account_name: ACCT.CXC.name, debit: null, credit: 3_000_000 },
          ] },
      },
    ],
    // diferencia: $5.200.000 − $3.000.000 = $2.200.000
    suggested_matches: [
      { key: "s26-a", type: "FISCAL", label: "Factura 007-123", amount: 2_200_000, date: "2026-05-10",
        status: "VIGENTE", counterparty_rut: "11.222.333-4", counterparty_name: "Comercial Sur Ltda.",
        confidence: 0.88, journal_entry: null },
    ],
    journal_entry: null,
  },

  // P-2: 1 match FISCAL (DRAFT) + 2 sugerencias para la diferencia → BORRADOR
  {
    id: "mov-027",
    date: "2026-05-15",
    bank_id: "bank-2", bank_name: "BCI",
    account_id: "acc-3", account_number: "023-456789-03", account_name: "CTA CTE Operaciones",
    currency: "CLP",
    description: "ABONO INVERSIONES XYZ MULTIPLES DOCS",
    reference: "TRF-2026-05-027",
    counterparty_rut: "87.654.321-0", counterparty_name: "Inversiones XYZ SpA",
    debit: null, credit: 9_000_000,
    statement_balance: 19_100_000,
    reconciliation_status: "PARCIAL", accounting_status: "BORRADOR",
    matched_docs: [
      {
        key: "m27-a", type: "FISCAL", label: "Factura 001-600",
        amount: 5_500_000, date: "2026-05-12", status: "VIGENTE",
        counterparty_rut: "87.654.321-0", counterparty_name: "Inversiones XYZ SpA",
        journal_entry: { id: "je-027a", status: "DRAFT", date: "2026-05-15",
          description: "Cobro Factura 001-600 - Inversiones XYZ",
          lines: [
            { account_code: ACCT.BCI.code, account_name: ACCT.BCI.name, debit: 5_500_000, credit: null },
            { account_code: ACCT.CXC.code, account_name: ACCT.CXC.name, debit: null, credit: 5_500_000 },
          ] },
      },
    ],
    // diferencia: $9.000.000 − $5.500.000 = $3.500.000
    suggested_matches: [
      { key: "s27-a", type: "PAYMENT", label: "Cobro #COB-2026-095", amount: 3_500_000, date: "2026-05-15",
        status: "VIGENTE", counterparty_rut: "87.654.321-0", counterparty_name: "Inversiones XYZ SpA",
        confidence: 0.76, journal_entry: null },
      { key: "s27-b", type: "FISCAL", label: "Factura 001-601", amount: 3_480_000, date: "2026-05-10",
        status: "VIGENTE", counterparty_rut: "87.654.321-0", counterparty_name: "Inversiones XYZ SpA",
        confidence: 0.52, journal_entry: null },
    ],
    journal_entry: null,
  },

  // P-3: 2 matches (PAYMENT + FISCAL, ambos POSTED) + 2 sugerencias → CONTABILIZADO
  {
    id: "mov-028",
    date: "2026-05-14",
    bank_id: "bank-2", bank_name: "BCI",
    account_id: "acc-3", account_number: "023-456789-03", account_name: "CTA CTE Operaciones",
    currency: "CLP",
    description: "ABONO CONSTRUCTORA SUR PARCIAL",
    reference: "TRF-2026-05-028",
    counterparty_rut: "66.777.888-9", counterparty_name: "Constructora del Sur SA",
    debit: null, credit: 14_500_000,
    statement_balance: 28_250_000,
    reconciliation_status: "PARCIAL", accounting_status: "CONTABILIZADO",
    matched_docs: [
      {
        key: "m28-a", type: "PAYMENT", label: "Cobro #COB-2026-100",
        amount: 7_000_000, date: "2026-05-14", status: "VIGENTE",
        counterparty_rut: "66.777.888-9", counterparty_name: "Constructora del Sur SA",
        journal_entry: { id: "je-028a", status: "POSTED", date: "2026-05-14",
          description: "Cobro COB-100 - Constructora del Sur",
          lines: [
            { account_code: ACCT.BCI.code, account_name: ACCT.BCI.name, debit: 7_000_000, credit: null },
            { account_code: ACCT.CXC.code, account_name: ACCT.CXC.name, debit: null, credit: 7_000_000 },
          ] },
      },
      {
        key: "m28-b", type: "FISCAL", label: "Factura 008-010",
        amount: 4_500_000, date: "2026-05-08", status: "VIGENTE",
        counterparty_rut: "66.777.888-9", counterparty_name: "Constructora del Sur SA",
        journal_entry: { id: "je-028b", status: "POSTED", date: "2026-05-14",
          description: "Cobro Factura 008-010 - Constructora del Sur",
          lines: [
            { account_code: ACCT.BCI.code, account_name: ACCT.BCI.name, debit: 4_500_000, credit: null },
            { account_code: ACCT.CXC.code, account_name: ACCT.CXC.name, debit: null, credit: 4_500_000 },
          ] },
      },
    ],
    // diferencia: $14.500.000 − $11.500.000 = $3.000.000
    suggested_matches: [
      { key: "s28-a", type: "NON_FISCAL", label: "Otro Ingreso #OT-2026-055", amount: 3_000_000, date: "2026-05-14",
        status: "VIGENTE", counterparty_rut: "66.777.888-9", counterparty_name: "Constructora del Sur SA",
        confidence: 0.69, journal_entry: null },
      { key: "s28-b", type: "FISCAL", label: "Factura 008-011", amount: 2_980_000, date: "2026-05-05",
        status: "VIGENTE", counterparty_rut: "66.777.888-9", counterparty_name: "Constructora del Sur SA",
        confidence: 0.44, journal_entry: null },
    ],
    journal_entry: null,
  },

  // P-4: 1 match JOURNAL_ENTRY (POSTED), cargo/debit, 1 sugerencia para diferencia
  {
    id: "mov-029",
    date: "2026-05-13",
    bank_id: "bank-3", bank_name: "Santander",
    account_id: "acc-4", account_number: "072-654321-04", account_name: "CTA CTE Proveedores",
    currency: "CLP",
    description: "PAGO PARCIAL SERVICIOS INTEGRADOS",
    reference: "TRF-2026-05-029",
    counterparty_rut: "33.444.555-6", counterparty_name: "Servicios Integrados SpA",
    debit: 4_500_000, credit: null,
    statement_balance: 6_320_000,
    reconciliation_status: "PARCIAL", accounting_status: "CONTABILIZADO",
    matched_docs: [
      {
        key: "m29-a", type: "JOURNAL_ENTRY", label: "Asiento #AST-2026-120",
        amount: 3_000_000, date: "2026-05-13", status: "POSTED",
        counterparty_rut: "33.444.555-6", counterparty_name: "Servicios Integrados SpA",
        journal_entry: { id: "je-029a", status: "POSTED", date: "2026-05-13",
          description: "Pago parcial - Servicios Integrados",
          lines: [
            { account_code: ACCT.CXP.code, account_name: ACCT.CXP.name, debit: 3_000_000, credit: null },
            { account_code: ACCT.SAN.code, account_name: ACCT.SAN.name, debit: null, credit: 3_000_000 },
          ] },
      },
    ],
    // diferencia: $4.500.000 − $3.000.000 = $1.500.000
    suggested_matches: [
      { key: "s29-a", type: "FISCAL", label: "Factura 009-045", amount: 1_500_000, date: "2026-05-01",
        status: "VIGENTE", counterparty_rut: "33.444.555-6", counterparty_name: "Servicios Integrados SpA",
        confidence: 0.71, journal_entry: null },
    ],
    journal_entry: null,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // GRUPO F — CONCILIADO CON AJUSTE POR DIFERENCIA (5 rows)
  // El monto transferido no coincide exactamente con el documento;
  // la diferencia mínima se absorbe con un Otro Ingreso tipo "Ajuste".
  // Patrón de JE: cada documento tiene su propio asiento por su monto parcial
  // y juntos suman el total del movimiento bancario.
  // ═══════════════════════════════════════════════════════════════════════════

  // F-1: Factura $4.999 + Ajuste $1 → banco recibe $5.000 exactos
  {
    id: "mov-030",
    date: "2026-05-20",
    bank_id: "bank-1", bank_name: "Banco de Chile",
    account_id: "acc-1", account_number: "001-123456-01", account_name: "CTA CTE Principal",
    currency: "CLP",
    description: "ABONO EMPRESA ABC REDONDEADO",
    reference: "TRF-2026-05-030",
    counterparty_rut: "12.345.678-9", counterparty_name: "Empresa ABC Ltda.",
    debit: null, credit: 5_000,
    statement_balance: 37_695_500,
    reconciliation_status: "CONCILIADO", accounting_status: "CONTABILIZADO",
    matched_docs: [
      {
        key: "m30-a", type: "FISCAL", label: "Factura 010-001",
        amount: 4_999, date: "2026-05-15", status: "VIGENTE",
        counterparty_rut: "12.345.678-9", counterparty_name: "Empresa ABC Ltda.",
        journal_entry: { id: "je-030a", status: "POSTED", date: "2026-05-20",
          description: "Cobro Factura 010-001 - Empresa ABC",
          lines: [
            { account_code: ACCT.BCH.code, account_name: ACCT.BCH.name, debit: 4_999, credit: null },
            { account_code: ACCT.CXC.code, account_name: ACCT.CXC.name, debit: null, credit: 4_999 },
          ] },
      },
      {
        key: "m30-b", type: "NON_FISCAL", label: "Ajuste diferencia #ADJ-2026-001",
        amount: 1, date: "2026-05-20", status: "VIGENTE",
        counterparty_rut: "12.345.678-9", counterparty_name: "Empresa ABC Ltda.",
        journal_entry: { id: "je-030b", status: "POSTED", date: "2026-05-20",
          description: "Ajuste diferencia $1 - Empresa ABC",
          lines: [
            { account_code: ACCT.BCH.code, account_name: ACCT.BCH.name, debit: 1, credit: null },
            { account_code: ACCT.DIF.code, account_name: ACCT.DIF.name, debit: null, credit: 1 },
          ] },
      },
    ],
    suggested_matches: [], journal_entry: null,
  },

  // F-2: Factura $1.500.000 + Ajuste $500 → banco recibe $1.500.500
  {
    id: "mov-031",
    date: "2026-05-19",
    bank_id: "bank-2", bank_name: "BCI",
    account_id: "acc-3", account_number: "023-456789-03", account_name: "CTA CTE Operaciones",
    currency: "CLP",
    description: "PAGO INVERSIONES XYZ FACTURA DIFERENCIA",
    reference: "TRF-2026-05-031",
    counterparty_rut: "87.654.321-0", counterparty_name: "Inversiones XYZ SpA",
    debit: null, credit: 1_500_500,
    statement_balance: 16_200_000,
    reconciliation_status: "CONCILIADO", accounting_status: "CONTABILIZADO",
    matched_docs: [
      {
        key: "m31-a", type: "FISCAL", label: "Factura 010-002",
        amount: 1_500_000, date: "2026-05-12", status: "VIGENTE",
        counterparty_rut: "87.654.321-0", counterparty_name: "Inversiones XYZ SpA",
        journal_entry: { id: "je-031a", status: "POSTED", date: "2026-05-19",
          description: "Cobro Factura 010-002 - Inversiones XYZ",
          lines: [
            { account_code: ACCT.BCI.code, account_name: ACCT.BCI.name, debit: 1_500_000, credit: null },
            { account_code: ACCT.CXC.code, account_name: ACCT.CXC.name, debit: null, credit: 1_500_000 },
          ] },
      },
      {
        key: "m31-b", type: "NON_FISCAL", label: "Ajuste diferencia #ADJ-2026-002",
        amount: 500, date: "2026-05-19", status: "VIGENTE",
        counterparty_rut: "87.654.321-0", counterparty_name: "Inversiones XYZ SpA",
        journal_entry: { id: "je-031b", status: "POSTED", date: "2026-05-19",
          description: "Ajuste diferencia $500 - Inversiones XYZ",
          lines: [
            { account_code: ACCT.BCI.code, account_name: ACCT.BCI.name, debit: 500, credit: null },
            { account_code: ACCT.DIF.code, account_name: ACCT.DIF.name, debit: null, credit: 500 },
          ] },
      },
    ],
    suggested_matches: [], journal_entry: null,
  },

  // F-3: Cobro $849.850 + Ajuste $150 → banco recibe $850.000
  {
    id: "mov-032",
    date: "2026-05-18",
    bank_id: "bank-3", bank_name: "Santander",
    account_id: "acc-4", account_number: "072-654321-04", account_name: "CTA CTE Proveedores",
    currency: "CLP",
    description: "COBRO COMERCIAL SUR DIFERENCIA MENOR",
    reference: "TRF-2026-05-032",
    counterparty_rut: "11.222.333-4", counterparty_name: "Comercial Sur Ltda.",
    debit: null, credit: 850_000,
    statement_balance: 9_150_000,
    reconciliation_status: "CONCILIADO", accounting_status: "CONTABILIZADO",
    matched_docs: [
      {
        key: "m32-a", type: "PAYMENT", label: "Cobro #COB-2026-110",
        amount: 849_850, date: "2026-05-18", status: "VIGENTE",
        counterparty_rut: "11.222.333-4", counterparty_name: "Comercial Sur Ltda.",
        journal_entry: { id: "je-032a", status: "POSTED", date: "2026-05-18",
          description: "Cobro COB-110 - Comercial Sur",
          lines: [
            { account_code: ACCT.SAN.code, account_name: ACCT.SAN.name, debit: 849_850, credit: null },
            { account_code: ACCT.CXC.code, account_name: ACCT.CXC.name, debit: null, credit: 849_850 },
          ] },
      },
      {
        key: "m32-b", type: "NON_FISCAL", label: "Ajuste diferencia #ADJ-2026-003",
        amount: 150, date: "2026-05-18", status: "VIGENTE",
        counterparty_rut: "11.222.333-4", counterparty_name: "Comercial Sur Ltda.",
        journal_entry: { id: "je-032b", status: "POSTED", date: "2026-05-18",
          description: "Ajuste diferencia $150 - Comercial Sur",
          lines: [
            { account_code: ACCT.SAN.code, account_name: ACCT.SAN.name, debit: 150, credit: null },
            { account_code: ACCT.DIF.code, account_name: ACCT.DIF.name, debit: null, credit: 150 },
          ] },
      },
    ],
    suggested_matches: [], journal_entry: null,
  },

  // F-4: Dos facturas + Ajuste $2.000 → banco recibe $4.000.000
  //  Factura 010-003: $2.500.000  +  Factura 010-004: $1.498.000  +  Ajuste: $2.000 = $4.000.000
  {
    id: "mov-033",
    date: "2026-05-17",
    bank_id: "bank-1", bank_name: "Banco de Chile",
    account_id: "acc-1", account_number: "001-123456-01", account_name: "CTA CTE Principal",
    currency: "CLP",
    description: "ABONO CONSTRUCTORA SUR 2 FACTURAS AJUSTE",
    reference: "TRF-2026-05-033",
    counterparty_rut: "66.777.888-9", counterparty_name: "Constructora del Sur SA",
    debit: null, credit: 4_000_000,
    statement_balance: 41_695_500,
    reconciliation_status: "CONCILIADO", accounting_status: "CONTABILIZADO",
    matched_docs: [
      {
        key: "m33-a", type: "FISCAL", label: "Factura 010-003",
        amount: 2_500_000, date: "2026-05-10", status: "VIGENTE",
        counterparty_rut: "66.777.888-9", counterparty_name: "Constructora del Sur SA",
        journal_entry: { id: "je-033a", status: "POSTED", date: "2026-05-17",
          description: "Cobro Factura 010-003 - Constructora del Sur",
          lines: [
            { account_code: ACCT.BCH.code, account_name: ACCT.BCH.name, debit: 2_500_000, credit: null },
            { account_code: ACCT.CXC.code, account_name: ACCT.CXC.name, debit: null, credit: 2_500_000 },
          ] },
      },
      {
        key: "m33-b", type: "FISCAL", label: "Factura 010-004",
        amount: 1_498_000, date: "2026-05-08", status: "VIGENTE",
        counterparty_rut: "66.777.888-9", counterparty_name: "Constructora del Sur SA",
        journal_entry: { id: "je-033b", status: "POSTED", date: "2026-05-17",
          description: "Cobro Factura 010-004 - Constructora del Sur",
          lines: [
            { account_code: ACCT.BCH.code, account_name: ACCT.BCH.name, debit: 1_498_000, credit: null },
            { account_code: ACCT.CXC.code, account_name: ACCT.CXC.name, debit: null, credit: 1_498_000 },
          ] },
      },
      {
        key: "m33-c", type: "NON_FISCAL", label: "Ajuste diferencia #ADJ-2026-004",
        amount: 2_000, date: "2026-05-17", status: "VIGENTE",
        counterparty_rut: "66.777.888-9", counterparty_name: "Constructora del Sur SA",
        journal_entry: { id: "je-033c", status: "POSTED", date: "2026-05-17",
          description: "Ajuste diferencia $2.000 - Constructora del Sur",
          lines: [
            { account_code: ACCT.BCH.code, account_name: ACCT.BCH.name, debit: 2_000, credit: null },
            { account_code: ACCT.DIF.code, account_name: ACCT.DIF.name, debit: null, credit: 2_000 },
          ] },
      },
    ],
    suggested_matches: [], journal_entry: null,
  },

  // F-5: En BORRADOR — Factura $99.900 + Ajuste $100 → banco recibe $100.000
  {
    id: "mov-034",
    date: "2026-05-16",
    bank_id: "bank-4", bank_name: "Itaú",
    account_id: "acc-5", account_number: "076-987654-05", account_name: "CTA CTE Internacional",
    currency: "CLP",
    description: "ABONO SERVICIOS INTEGRADOS CON AJUSTE",
    reference: "TRF-2026-05-034",
    counterparty_rut: "33.444.555-6", counterparty_name: "Servicios Integrados SpA",
    debit: null, credit: 100_000,
    statement_balance: 6_540_000,
    reconciliation_status: "CONCILIADO", accounting_status: "BORRADOR",
    matched_docs: [
      {
        key: "m34-a", type: "FISCAL", label: "Factura 010-005",
        amount: 99_900, date: "2026-05-10", status: "VIGENTE",
        counterparty_rut: "33.444.555-6", counterparty_name: "Servicios Integrados SpA",
        journal_entry: { id: "je-034a", status: "DRAFT", date: "2026-05-16",
          description: "Cobro Factura 010-005 - Servicios Integrados",
          lines: [
            { account_code: ACCT.ITA.code, account_name: ACCT.ITA.name, debit: 99_900, credit: null },
            { account_code: ACCT.CXC.code, account_name: ACCT.CXC.name, debit: null, credit: 99_900 },
          ] },
      },
      {
        key: "m34-b", type: "NON_FISCAL", label: "Ajuste diferencia #ADJ-2026-005",
        amount: 100, date: "2026-05-16", status: "VIGENTE",
        counterparty_rut: "33.444.555-6", counterparty_name: "Servicios Integrados SpA",
        journal_entry: { id: "je-034b", status: "DRAFT", date: "2026-05-16",
          description: "Ajuste diferencia $100 - Servicios Integrados",
          lines: [
            { account_code: ACCT.ITA.code, account_name: ACCT.ITA.name, debit: 100, credit: null },
            { account_code: ACCT.DIF.code, account_name: ACCT.DIF.name, debit: null, credit: 100 },
          ] },
      },
    ],
    suggested_matches: [], journal_entry: null,
  },
];

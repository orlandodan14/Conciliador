// ─── Tipos principales ────────────────────────────────────────────────────────

export type CobrosType   = "COBRO" | "ANTICIPO" | "AJUSTE";
export type CobrosStatus = "BORRADOR" | "VIGENTE" | "CANCELADO";
export type PaymentMethod = "EFECTIVO" | "TRANSFERENCIA" | "CHEQUE" | "TARJETA";
export type CardKind = "" | "DEBITO" | "CREDITO";

/**
 * Tipo real en la columna payments.payment_type.
 * COBRO / ANTICIPO / AJUSTE_COBRO son los que maneja este módulo.
 * PAGO / AJUSTE_PAGO son para el módulo de pagos a proveedores (futuro).
 * ANTICIPO = pago recibido antes de emitir factura → pasivo (Anticipos de clientes).
 */
export type PaymentType = "COBRO" | "ANTICIPO" | "PAGO" | "AJUSTE_COBRO" | "AJUSTE_PAGO";
export type ReconciliationStatus = "PENDIENTE" | "CONCILIADO";

// ─── Fila de la tabla principal (cobros) ─────────────────────────────────────

export type CobrosRow = {
  id: string;
  company_id: string;
  /** Tipo de cobro para la UI (COBRO | AJUSTE). Mapeado desde payment_type del DB. */
  cobro_type: CobrosType;
  method: PaymentMethod | null;
  card_kind: CardKind | null;
  card_last4: string | null;
  auth_code: string | null;
  status: CobrosStatus;
  /** Estado de conciliación bancaria */
  reconciliation_status?: ReconciliationStatus;
  payment_date: string | null;
  number: string | null;
  reference: string | null;
  description: string | null;
  /** Monto del cobro — puede ser negativo para AJUSTE */
  total_amount: number;
  currency_code: string | null;
  branch_id: string | null;
  counterparty_id: string | null;
  counterparty_identifier_snapshot: string | null;
  counterparty_name_snapshot: string | null;
  journal_entry_id: string | null;
  /** Para asociación con movimientos bancarios */
  bank_movement_id: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string | null;
};

// ─── Allocation almacenada en DB ──────────────────────────────────────────────

export type CobrosAllocationRow = {
  id: string;
  payment_id: string;
  trade_doc_id: string;
  allocated_amount: number;
  // Campos JOIN de trade_docs (opcionales, presentes al cargar expanded row)
  doc_type?: string | null;
  doc_class?: string | null;
  fiscal_doc_code?: string | null;
  non_fiscal_doc_code?: string | null;
  series?: string | null;
  number?: string | null;
  issue_date?: string | null;
  counterparty_identifier_snapshot?: string | null;
  counterparty_name_snapshot?: string | null;
  grand_total?: number | null;
  balance?: number | null;
  currency_code?: string | null;
  /** Estado del documento asociado (BORRADOR | VIGENTE | CANCELADO) */
  doc_status?: string | null;
};

// ─── Cabecera en memoria (editor modal) ──────────────────────────────────────

export type CobrosHeader = {
  cobro_type: CobrosType;
  /** Solo aplica para COBRO */
  payment_method: PaymentMethod | "";
  card_kind: CardKind;
  card_last4: string;
  auth_code: string;
  status: CobrosStatus;
  issue_date: string;
  reference: string;
  description: string;
  /** Monto editable como string; negativo permitido en AJUSTE */
  amount: string;
  currency_code: string;
  branch_id: string;
  counterparty_id: string | null;
  counterparty_identifier: string;
  counterparty_name: string;
  /** Reservado para asociación futura con movimientos bancarios */
  bank_movement_id: string | null;
};

// ─── Allocation en memoria (editor modal) ────────────────────────────────────

export type CobrosAllocationDraft = {
  /** UUID local para gestión en memoria */
  id: string;
  trade_doc_id: string;
  doc_type: string | null;
  doc_class: string | null;
  fiscal_doc_code: string | null;
  non_fiscal_doc_code: string | null;
  series: string | null;
  number: string | null;
  issue_date: string | null;
  counterparty_name: string | null;
  grand_total: number | null;
  balance: number | null;
  currency_code: string | null;
  /** Monto asignado editable como string */
  allocated_amount: string;
};

// ─── Líneas del asiento contable ─────────────────────────────────────────────

export type JournalLine = {
  line_no: number;
  account_code: string;
  description: string;
  debit: string;
  credit: string;
  cost_center_id: string | null;
  business_line_id: string | null;
  branch_id: string | null;
  cost_center_code: string;
  business_line_code: string;
  branch_code: string;
};

// ─── Pestañas del editor ──────────────────────────────────────────────────────

export type EditorTab = "CABECERA" | "ASIENTO";

// ─── Filtros de lista ─────────────────────────────────────────────────────────

export type NumericFilterOperator =
  | ""
  | "between"
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte";

export type NumericFilterValue = {
  op: NumericFilterOperator;
  value1: string;
  value2: string;
};

export type CobrosListFilters = {
  issue_date_from: string;
  issue_date_to: string;
  cobro_type: string;
  payment_method: string;
  number: string;
  counterparty_identifier: string;
  counterparty_name: string;
  amount_filter: NumericFilterValue;
};

// ─── Datos de referencia ──────────────────────────────────────────────────────

export type BranchLite = {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  is_default: boolean;
};

export type BusinessLineLite = {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
};

export type CounterpartyLite = {
  id: string;
  identifier: string;
  identifier_normalized: string;
  name: string;
};

// ─── Modal de búsqueda de documentos ─────────────────────────────────────────

export type DocSearchResult = {
  id: string;
  doc_type: string | null;
  doc_class: string | null;
  fiscal_doc_code: string | null;
  non_fiscal_doc_code: string | null;
  series: string | null;
  number: string | null;
  issue_date: string | null;
  counterparty_identifier_snapshot: string | null;
  counterparty_name_snapshot: string | null;
  grand_total: number | null;
  balance: number | null;
  currency_code: string | null;
  status: string | null;
};

export type DocSearchFilters = {
  doc_class: string;   // "ALL" | "FISCAL" | "NON_FISCAL"
  number: string;
  issue_date_from: string;
  issue_date_to: string;
  counterparty_identifier: string;
  counterparty_name: string;
  only_open_balance: boolean;
};

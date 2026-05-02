export type OtherDocType = "OTRO_INGRESO" | "DEVOLUCION";
export type OtherDocStatus = "BORRADOR" | "VIGENTE" | "CANCELADO";

/** Cabecera que maneja el editor modal (en memoria) */
export type OtherDocHeader = {
  doc_type: OtherDocType;
  status: OtherDocStatus;
  /** Código libre del documento, ej: "OI", "DEV", "RECIBO" */
  non_fiscal_doc_code: string;
  issue_date: string;
  due_date: string;
  series: string;
  number: string;
  reference: string;
  currency_code: string;
  branch_id: string;
  /** ID de contraparte (buscado por identifier_normalized en counterparties) */
  counterparty_id: string | null;
  /** Identificador/RUT que escribe el usuario */
  counterparty_identifier: string;
  /** Nombre que escribe el usuario (o auto-rellenado desde el mapa) */
  counterparty_name: string;
  /** Monto total del documento */
  grand_total: string;
  origin_doc_id: string | null;
  origin_label: string;
  cancelled_at: string;
  cancel_reason: string;
};

/** Fila que devuelve la tabla trade_docs para este módulo */
export type OtherDocRow = {
  id: string;
  company_id: string;
  doc_type: OtherDocType;
  status: OtherDocStatus;
  non_fiscal_doc_code: string | null;
  issue_date: string | null;
  series: string | null;
  number: string | null;
  reference: string | null;
  counterparty_identifier_snapshot: string | null;
  counterparty_name_snapshot: string | null;
  grand_total: number;
  balance: number;
  origin_doc_id: string | null;
  journal_entry_id: string | null;
  created_at: string | null;
};

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

export type EditorTab = "CABECERA" | "PAGOS" | "ASIENTO";

export type PaymentMethod = "EFECTIVO" | "TRANSFERENCIA" | "TARJETA" | "CHEQUE" | "OTRO";

export type PaymentRow = {
  /** UUID generado en cliente para gestión local de filas */
  id: string;
  payment_date: string;
  method: PaymentMethod;
  amount: string;
  reference: string;
  card_kind: "" | "DEBITO" | "CREDITO";
  card_last4: string;
  auth_code: string;
};

export type OtherDocListFilters = {
  issue_date_from: string;
  issue_date_to: string;
  doc_type: string;
  number: string;
  counterparty_identifier: string;
  counterparty_name: string;
  amount_filter: NumericFilterValue;
};

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

/** Contraparte del mapa en memoria */
export type CounterpartyLite = {
  id: string;
  identifier: string;
  identifier_normalized: string;
  name: string;
};

// OriginOtherDocLite removed — use OriginDocLite from tributario types instead

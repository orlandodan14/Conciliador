export type DocType = "INVOICE" | "CREDIT_NOTE" | "DEBIT_NOTE";
export type DocStatus = "BORRADOR" | "VIGENTE" | "CANCELADO";

export type DocHeader = {
  doc_type: DocType;
  fiscal_doc_code: string;

  status: DocStatus;

  issue_date: string;
  due_date: string;

  series: string;
  number: string;

  currency_code: string;
  branch_id: string;

  counterparty_identifier: string;
  counterparty_name: string;

  reference: string;

  cancelled_at: string;
  cancel_reason: string;

  origin_doc_id: string | null;
  origin_label: string;

  origin_doc_type?: DocType | null;
  origin_fiscal_doc_code?: string | null;
  origin_issue_date?: string | null;
  origin_currency_code?: string | null;
  origin_net_taxable?: number | null;
  origin_net_exempt?: number | null;
  origin_tax_total?: number | null;
  origin_grand_total?: number | null;
  origin_balance?: number | null;
  origin_payment_status?: "PAGADO" | "PARCIAL" | "PENDIENTE" | null;
  origin_status?: DocStatus | "PAGADO" | "PARCIAL" | "PENDIENTE" | null;
};

export type FiscalDocTypeLite = {
  id: string;
  code: string;
  name: string;
  scope: "VENTA" | "COMPRA" | "AMBOS";
  is_active: boolean;
};

export type FiscalDocSettingsLite = {
  enabled: boolean;
  require_sales: boolean;
  default_sales_doc_type_id: string | null;
  default_sales_invoice_doc_type_id: string | null;
  default_sales_debit_note_doc_type_id: string | null;
  default_sales_credit_note_doc_type_id: string | null;
};

export type BranchLite = {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  is_default: boolean;
};

export type ItemLite = {
  id: string;
  sku: string;
  name: string;
  description?: string | null;
  price_sale: number;
  tax_exempt: boolean;
  is_active: boolean;
  business_line_id?: string | null;
};

export type DocLine = {
  line_no: number;
  item_id: string | null;
  sku: string;
  description: string;

  qty: string;
  unit_price: string;

  is_taxable: boolean;
  tax_rate: string;

  ex_override: string;
  af_override: string;
  iva_override: string;
  total_override: string;
};

export type PaymentRow = {
  id: string;
  payment_date: string;
  method: "EFECTIVO" | "TRANSFERENCIA" | "TARJETA" | "CHEQUE" | "OTRO";
  amount: string;

  card_kind: "" | "DEBITO" | "CREDITO";
  card_last4: string;
  auth_code: string;

  reference: string;

  source_amount?: number;
  source_is_primary?: boolean;
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

export type OriginDocLite = {
  id: string;
  doc_type?: DocType | null;
  fiscal_doc_code?: string | null;
  series?: string | null;
  number?: string | null;
  issue_date?: string | null;

  counterparty_identifier?: string | null;

  net_taxable?: number | null;
  net_exempt?: number | null;
  tax_total?: number | null;
  grand_total?: number | null;
  balance?: number | null;

  currency_code?: string | null;
  payment_status?: "PAGADO" | "PARCIAL" | "PENDIENTE" | null;
  status?: DocStatus | "PAGADO" | "PARCIAL" | "PENDIENTE" | null;
};

export type OriginSearchFilters = {
  fiscal_doc_code: string;
  folio: string;
  issue_date_from: string;
  issue_date_to: string;
  only_open_balance: boolean;
  only_vigente: boolean;
};

export type EditorTab = "CABECERA" | "LINEAS" | "PAGOS" | "ASIENTO";

export type Totals = {
  net_taxable: number;
  net_exempt: number;
  tax_total: number;
  grand_total: number;
  paid: number;
  balance: number;
};

export type DraftRow = {
  id: string;
  company_id: string;

  doc_type: DocType;
  fiscal_doc_code: string | null;

  status: DocStatus;

  issue_date: string | null;
  series: string | null;
  number: string | null;

  counterparty_identifier_snapshot: string | null;
  counterparty_name_snapshot: string | null;

  net_taxable: number | null;
  net_exempt: number | null;
  tax_total: number | null;
  grand_total: number | null;
  balance?: number | null;

  created_at: string | null;
};

export type AccountNodeLite = {
  id: string;
  code: string;
  name: string;
};

export type AccountDefaultRow = {
  id: string;
  company_id: string;
  process_key: string;
  account_node_id: string | null;
  is_active: boolean;
  notes: string | null;
};

export type BusinessLineLite = {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
};

export type AccountPostingPolicyLite = {
  id: string;
  company_id: string;
  account_node_id: string;
  require_cc: boolean;
  require_cu: boolean;
  require_suc: boolean;
  require_item: boolean;
  require_cp: boolean;
  enforcement: string;
  is_active: boolean;
  effective_from: string;
  effective_to: string | null;
};

export type TradeDocTimelineRow = {
  event_date: string | null;
  event_type: "DOC" | "PAYMENT";
  related_doc_id: string | null;
  payment_id: string | null;
  doc_type: string | null;
  fiscal_doc_code: string | null;
  series: string | null;
  number: string | null;
  display_folio: string | null;
  affects_label: string;
  amount: number | null;
  impact_sign: number;
  running_group: string;
  source_doc_id: string | null;
  sort_ts: string | null;
};

export type TradeDocListFilters = {
  issue_date_from: string;
  issue_date_to: string;
  doc_type: string;
  fiscal_doc_code: string;
  number: string;
  counterparty_identifier: string;
  counterparty_name: string;
  grand_total_filter: NumericFilterValue;
  balance_filter: NumericFilterValue;
  payment_state: string;
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
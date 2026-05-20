export type ReconciliationStatus = "CONCILIADO" | "PARCIAL" | "SUGERIDO" | "PENDIENTE";
export type AccountingStatus = "CONTABILIZADO" | "BORRADOR" | "SIN_ASIENTO";

export type JournalLine = {
  account_code: string;
  account_name: string;
  debit: number | null;
  credit: number | null;
};

export type JournalEntry = {
  id: string;
  status: "DRAFT" | "POSTED";
  date: string;
  description: string;
  lines: JournalLine[];
};

export type MatchedDoc = {
  key: string;
  type: "PAYMENT" | "FISCAL" | "NON_FISCAL" | "JOURNAL_ENTRY";
  label: string;
  amount: number;
  date: string;
  status: string;
  counterparty_rut: string | null;
  counterparty_name: string | null;
  journal_entry: JournalEntry | null;
};

export type SuggestedMatch = MatchedDoc & {
  confidence: number;
};

export type MovimientoRow = {
  id: string;
  date: string;
  bank_id: string;
  bank_name: string;
  account_id: string;
  account_number: string;
  account_name: string;
  currency: string;
  description: string;
  reference: string | null;
  counterparty_rut: string | null;
  counterparty_name: string | null;
  debit: number | null;
  credit: number | null;
  statement_balance: number;
  reconciliation_status: ReconciliationStatus;
  accounting_status: AccountingStatus;
  matched_docs: MatchedDoc[];
  suggested_matches: SuggestedMatch[];
  journal_entry: JournalEntry | null;
};

export type MovimientosFilters = {
  dateFrom: string;
  dateTo: string;
  bankId: string;
  accountId: string;
  reconciliationStatus: ReconciliationStatus | "";
  accountingStatus: AccountingStatus | "";
  search: string;
};

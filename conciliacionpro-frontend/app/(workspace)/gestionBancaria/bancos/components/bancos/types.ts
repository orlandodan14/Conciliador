export type BankAccount = {
  id: string;
  bank_id: string;
  account_number: string;
  account_name: string;
  currency: string;
  statement_balance: number;
  accounting_balance: number;
  difference: number;
  transactions_total: number;
  transactions_reconciled: number;
  transactions_pending: number;
  last_import_date: string | null;
  accounting_account_code: string | null;
  accounting_account_name: string | null;
};

export type BankRow = {
  id: string;
  name: string;
  code: string;
  accounts: BankAccount[];
};

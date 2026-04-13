import type {
  DocHeader,
  DocLine,
  DocType,
  FiscalDocSettingsLite,
  FiscalDocTypeLite,
  JournalLine,
  PaymentRow,
} from "@/app/(workspace)/gestionVentas/docs-tribut-ventas/components/tradeDocs/types";

export function cls(...a: Array<string | false | null | undefined>) {
  return a.filter(Boolean).join(" ");
}

export function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export function toNum(v: any) {
  const s = String(v ?? "").trim().replace(",", ".");
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

export function formatNumber(val: number, decimals: number) {
  try {
    return val.toLocaleString("es-CL", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  } catch {
    return String(val);
  }
}

export function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

export function folioLabel(series?: string | null, number?: string | null) {
  const s = String(series ?? "").trim();
  const n = String(number ?? "").trim();
  if (!s && !n) return "—";
  return s ? `${s}-${n}` : n;
}

export function normalizeFolioPart(value: string | null | undefined) {
  return String(value ?? "").trim().toUpperCase();
}

export function hasFiscalFolioData(h: DocHeader) {
  return (
    String(h.fiscal_doc_code || "").trim() !== "" &&
    String(h.number || "").trim() !== ""
  );
}

export function getJournalDocTypeLabel(docType: DocType) {
  if (docType === "DEBIT_NOTE") return "NOTA DE DÉBITO (INGRESO)";
  if (docType === "CREDIT_NOTE") return "NOTA DE CRÉDITO (REBAJA)";
  return "DOCUMENTO (INGRESO)";
}

export function isReverseNoteDocType(docType: DocType) {
  return docType === "CREDIT_NOTE";
}

export function buildJournalDescriptionFromHeader(h: DocHeader) {
  const typeLabel = getJournalDocTypeLabel(h.doc_type);
  const ownFolio = folioLabel(h.series, h.number);

  const parts: string[] = [typeLabel];

  if (ownFolio !== "—") {
    parts.push(`Folio ${ownFolio}`);
  }

  const isNote = h.doc_type === "DEBIT_NOTE" || h.doc_type === "CREDIT_NOTE";
  if (isNote && String(h.origin_label || "").trim()) {
    parts.push(`Afecta ${String(h.origin_label).trim()}`);
  }

  return parts.join(" - ");
}

export function ellipsis(s: string, max: number) {
  const t = String(s ?? "");
  if (t.length <= max) return t;
  return t.slice(0, Math.max(0, max - 1)) + "…";
}

export function normalizeIdentifier(raw: string) {
  return String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^0-9A-Z]+/g, "");
}

export function calcLineAmounts(l: DocLine) {
  const qty = Math.max(0, toNum(l.qty));
  const unit = Math.max(0, toNum(l.unit_price));
  const base = qty * unit;

  const rate = Math.max(0, toNum(l.tax_rate));

  const ex_o = String(l.ex_override || "").trim();
  const af_o = String(l.af_override || "").trim();
  const tot_o = String(l.total_override || "").trim();

  const ex = ex_o !== "" ? Math.max(0, toNum(ex_o)) : (l.is_taxable ? 0 : base);
  const af = af_o !== "" ? Math.max(0, toNum(af_o)) : (l.is_taxable ? base : 0);

  const iva = af > 0 && rate > 0 ? af * (rate / 100) : 0;

  const total_calc = ex + af + iva;
  const total_display = tot_o !== "" ? Math.max(0, toNum(tot_o)) : total_calc;

  return {
    qty,
    unit,
    base,
    rate,
    ex,
    af,
    iva,
    total: total_calc,
    total_display,
  };
}

export function normalizePeriodStatus(value: any): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

export function makeDocLine(no: number): DocLine {
  return {
    line_no: no,
    item_id: null,
    sku: "",
    description: "",
    qty: "1",
    unit_price: "",
    is_taxable: true,
    tax_rate: "19",
    ex_override: "",
    af_override: "",
    iva_override: "",
    total_override: "",
  };
}

export function makeJournalLine(no: number): JournalLine {
  return {
    line_no: no,
    account_code: "",
    description: "",
    debit: "",
    credit: "",
    cost_center_id: null,
    business_line_id: null,
    branch_id: null,
    cost_center_code: "",
    business_line_code: "",
    branch_code: "",
  };
}

export function makePaymentRow(paymentDate = todayISO()): PaymentRow {
  return {
    id: uid(),
    payment_date: paymentDate,
    method: "TRANSFERENCIA",
    amount: "",
    card_kind: "",
    card_last4: "",
    auth_code: "",
    reference: "",
    source_amount: 0,
    source_is_primary: false,
  };
}

export function renumber<T extends { line_no: number }>(arr: T[]) {
  return arr.map((x, i) => ({ ...x, line_no: i + 1 }));
}

export function getDefaultFiscalDocTypeIdByDocType(
  docType: DocType,
  cfg: FiscalDocSettingsLite
): string | null {
  if (docType === "INVOICE") {
    return cfg.default_sales_invoice_doc_type_id || cfg.default_sales_doc_type_id || null;
  }

  if (docType === "DEBIT_NOTE") {
    return cfg.default_sales_debit_note_doc_type_id || null;
  }

  if (docType === "CREDIT_NOTE") {
    return cfg.default_sales_credit_note_doc_type_id || null;
  }

  return null;
}

export function getDefaultFiscalDocCodeByDocType(
  docType: DocType,
  cfg: FiscalDocSettingsLite,
  types: FiscalDocTypeLite[]
): string {
  const id = getDefaultFiscalDocTypeIdByDocType(docType, cfg);
  if (!id) return "";

  const found = types.find((t) => t.id === id && t.is_active);
  return found?.code || "";
}

export function getTradeDocSuggestion(args: {
  status?: string | null;
  balance?: number | null;
}) {
  const status = String(args.status || "").trim().toUpperCase();
  const balance = Number(args.balance ?? 0);

  if (status === "CANCELADO") {
    return {
      text: "Documento cancelado",
      className: "bg-slate-100 text-slate-700",
    };
  }

  if (balance > 0) {
    return {
      text: "Requiere gestionar cobro",
      className: "bg-amber-100 text-amber-900",
    };
  }

  if (balance < 0) {
    return {
      text: "Requiere gestionar devolución",
      className: "bg-rose-100 text-rose-800",
    };
  }

  return {
    text: "OK",
    className: "bg-emerald-100 text-emerald-800",
  };
}
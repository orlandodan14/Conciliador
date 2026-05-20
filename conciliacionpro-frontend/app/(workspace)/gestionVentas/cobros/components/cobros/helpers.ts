// Re-exports de helpers compartidos con el módulo tributario
export {
  cls,
  todayISO,
  toNum,
  formatNumber,
  uid,
  ellipsis,
  normalizeIdentifier,
  normalizePeriodStatus,
  makeJournalLine,
  renumber,
} from "@/app/(workspace)/gestionVentas/docs-tribut-ventas/components/tradeDocs/helpers";

import type {
  CobrosType,
  PaymentMethod,
  CobrosListFilters,
  CobrosRow,
  NumericFilterValue,
} from "./types";

// ─── Etiquetas legibles ───────────────────────────────────────────────────────

export function cobrosTypeLabel(t: CobrosType | string): string {
  if (t === "AJUSTE")   return "Ajuste";
  if (t === "ANTICIPO") return "Anticipo de cliente";
  return "Cobro";
}

export function cobrosTypeShort(t: CobrosType | string): string {
  if (t === "AJUSTE")   return "AJU";
  if (t === "ANTICIPO") return "ANT";
  return "COB";
}

export function paymentMethodLabel(m: PaymentMethod | string | null): string {
  switch (m) {
    case "EFECTIVO":      return "Efectivo";
    case "TRANSFERENCIA": return "Transferencia";
    case "CHEQUE":        return "Cheque";
    case "TARJETA":       return "Tarjeta";
    default:              return m ? String(m) : "—";
  }
}

export function paymentMethodShort(m: PaymentMethod | string | null): string {
  switch (m) {
    case "EFECTIVO":      return "EFE";
    case "TRANSFERENCIA": return "TRF";
    case "CHEQUE":        return "CHQ";
    case "TARJETA":       return "TAR";
    default:              return "—";
  }
}

/** Etiqueta legible del tipo de documento para incluir en la glosa del asiento */
function docTypeGlosaLabel(doc_type: string | null | undefined): string {
  switch (String(doc_type || "").toUpperCase()) {
    case "INVOICE":           return "Factura";
    case "CREDIT_NOTE":       return "Nota de Crédito";
    case "DEBIT_NOTE":        return "Nota de Débito";
    case "OTRO_INGRESO":      return "Ingreso";
    case "DEVOLUCION":        return "Devolución";
    case "CUSTOMER_ADVANCE":  return "Anticipo";
    default:                  return "Documento";
  }
}

/** Genera la glosa automática para el asiento del cobro.
 *
 * ANTICIPO:               "Anticipo de cliente · REF-001 · Cliente"
 * Con una asignación:     "Cobro a Factura N°1234 · Cliente · Transferencia"
 * Con varias asignaciones:"Cobro a 3 documentos · Cliente · Transferencia"
 * Sin asignaciones:       "Cobro · Nro REF-001 · Cliente · Transferencia"
 */
export function buildCobrosJournalDescription(args: {
  cobro_type: CobrosType;
  number: string;
  counterparty_name: string;
  payment_method?: PaymentMethod | "" | null;
  /** Asignaciones del cobro (CobrosAllocationDraft o similar) */
  allocations?: Array<{
    doc_type?: string | null;
    fiscal_doc_code?: string | null;
    series?: string | null;
    number?: string | null;
  }>;
}): string {
  // ── Anticipo: glosa especial ──────────────────────────────────────────────
  if (args.cobro_type === "ANTICIPO") {
    const parts = ["Anticipo de cliente"];
    if (args.number)            parts.push(args.number);
    if (args.counterparty_name) parts.push(args.counterparty_name);
    return parts.join(" · ");
  }

  // ── Referencia al(los) documento(s) afectado(s) ──────────────────────────
  const allocs = (args.allocations ?? []).filter((a) => a.doc_type);

  let docRef = "";
  if (allocs.length === 1) {
    const a = allocs[0];
    const typeLabel = docTypeGlosaLabel(a.doc_type);
    const folio = a.series
      ? `${a.series}-${a.number}`
      : a.number
      ? `N°${a.number}`
      : "";
    docRef = folio ? `${typeLabel} ${folio}` : typeLabel;
  } else if (allocs.length > 1) {
    docRef = `${allocs.length} documentos`;
  }

  // ── Partes de la glosa ────────────────────────────────────────────────────
  let glosa = docRef
    ? `${cobrosTypeLabel(args.cobro_type)} a ${docRef}`
    : cobrosTypeLabel(args.cobro_type);

  if (args.number) glosa += ` - ${args.number}`;
  return glosa;
}

/** Etiqueta corta de un doc para mostrar en las allocations */
export function docAllocLabel(args: {
  doc_class?: string | null;
  fiscal_doc_code?: string | null;
  non_fiscal_doc_code?: string | null;
  series?: string | null;
  number?: string | null;
}): string {
  const code = String(args.fiscal_doc_code || args.non_fiscal_doc_code || "").trim();
  const folio = [args.series, args.number].filter(Boolean).join("-");
  return [code, folio].filter(Boolean).join(" ") || "—";
}

// ─── Filtros de lista ─────────────────────────────────────────────────────────

export const EMPTY_COBROS_FILTERS: CobrosListFilters = {
  issue_date_from: "",
  issue_date_to: "",
  cobro_type: "",
  payment_method: "",
  number: "",
  counterparty_identifier: "",
  counterparty_name: "",
  amount_filter: { op: "", value1: "", value2: "" },
};

function matchNumeric(val: number, filter: NumericFilterValue): boolean {
  if (!filter.op || !filter.value1) return true;
  const v1 = Number(filter.value1);
  const v2 = Number(filter.value2);
  switch (filter.op) {
    case "between": return val >= v1 && val <= v2;
    case "eq":      return val === v1;
    case "neq":     return val !== v1;
    case "gt":      return val > v1;
    case "gte":     return val >= v1;
    case "lt":      return val < v1;
    case "lte":     return val <= v1;
    default:        return true;
  }
}

export function applyCobrosFilters(
  rows: CobrosRow[],
  filters: CobrosListFilters
): CobrosRow[] {
  let out = rows;
  const lc = (s: string | null | undefined) => String(s || "").toLowerCase();

  if (filters.issue_date_from)
    out = out.filter((r) => (r.payment_date || "") >= filters.issue_date_from);
  if (filters.issue_date_to)
    out = out.filter((r) => (r.payment_date || "") <= filters.issue_date_to);
  if (filters.cobro_type)
    out = out.filter((r) => r.cobro_type === filters.cobro_type as CobrosType);
  if (filters.payment_method)
    out = out.filter((r) => r.method === filters.payment_method);
  if (filters.number)
    out = out.filter((r) =>
      lc(r.number).includes(lc(filters.number))
    );
  if (filters.counterparty_identifier)
    out = out.filter((r) =>
      lc(r.counterparty_identifier_snapshot).includes(lc(filters.counterparty_identifier))
    );
  if (filters.counterparty_name)
    out = out.filter((r) =>
      lc(r.counterparty_name_snapshot).includes(lc(filters.counterparty_name))
    );
  if (filters.amount_filter.op && filters.amount_filter.value1)
    out = out.filter((r) =>
      matchNumeric(Math.abs(Number(r.total_amount || 0)), filters.amount_filter)
    );

  return out;
}

/** Clave de proceso (account_defaults) para la forma de pago del cobro */
export function getCobroPaymentProcessKey(
  payment_method: PaymentMethod | "" | null,
  card_kind?: string | null
): string {
  switch (payment_method) {
    case "EFECTIVO":      return "SALE_PAYMENT_CASH";
    case "TRANSFERENCIA": return "SALE_PAYMENT_TRANSFER";
    case "CHEQUE":        return "SALE_PAYMENT_CHECK";
    case "TARJETA":
      if (card_kind === "DEBITO")  return "SALE_PAYMENT_CARD_DEBIT";
      if (card_kind === "CREDITO") return "SALE_PAYMENT_CARD_CREDIT";
      return "SALE_PAYMENT_CARD_CREDIT";
    default:              return "SALE_PAYMENT_CASH";
  }
}

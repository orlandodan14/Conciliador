// Re-exports de helpers compartidos con el módulo de docs tributarios
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

import type { OtherDocType, OtherDocListFilters, OtherDocRow, NumericFilterValue } from "./types";

export function otherDocTypeLabel(t: OtherDocType | string): string {
  if (t === "DEVOLUCION") return "Devolución";
  return "Otro Ingreso";
}

export function otherDocTypeShort(t: OtherDocType | string): string {
  if (t === "DEVOLUCION") return "DEV";
  return "OTI";
}

export const EMPTY_OTHER_DOC_FILTERS: OtherDocListFilters = {
  issue_date_from: "",
  issue_date_to: "",
  doc_type: "",
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

export function applyOtherDocFilters(
  rows: OtherDocRow[],
  filters: OtherDocListFilters
): OtherDocRow[] {
  let out = rows;
  const lc = (s: string | null | undefined) => String(s || "").toLowerCase();

  if (filters.issue_date_from)
    out = out.filter((r) => (r.issue_date || "") >= filters.issue_date_from);
  if (filters.issue_date_to)
    out = out.filter((r) => (r.issue_date || "") <= filters.issue_date_to);
  if (filters.doc_type)
    out = out.filter((r) => r.doc_type === filters.doc_type);
  if (filters.number)
    out = out.filter((r) => lc(r.number).includes(lc(filters.number)));
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
      matchNumeric(Number(r.grand_total || 0), filters.amount_filter)
    );

  return out;
}

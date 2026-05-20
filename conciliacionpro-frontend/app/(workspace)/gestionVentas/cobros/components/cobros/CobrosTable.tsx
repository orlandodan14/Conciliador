"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Pencil, Eye, CheckCircle2, Trash2, Ban,
  ChevronUp, ChevronDown, ChevronsUpDown,
} from "lucide-react";
import type { CobrosRow, CobrosAllocationRow } from "./types";
import { cls, formatNumber } from "./helpers";
import { cobrosTypeLabel, cobrosTypeShort, paymentMethodLabel } from "./helpers";
import { ExpandedTimelineTable, TimelineItem } from "@/app/(workspace)/gestionVentas/components/ExpandedTimelineTable";

type TabKey = "drafts" | "registered";
type SortKey =
  | "issue_date"
  | "cobro_type"
  | "number"
  | "payment_method"
  | "counterparty_identifier_snapshot"
  | "counterparty_name_snapshot"
  | "amount"
  | "status";
type SortDirection = "asc" | "desc";

type Props = {
  rows: CobrosRow[];
  loading: boolean;
  moneyDecimals: number;
  canEdit: boolean;
  tabKey: TabKey;
  selectedMap: Record<string, boolean>;
  allSelected: boolean;
  onToggleSelectAll: () => void;
  onToggleRow: (id: string, checked?: boolean) => void;
  onOpenRow: (id: string) => void;
  onDeleteRow?: (id: string) => void;
  onRegisterRow?: (row: CobrosRow) => Promise<void>;
  onCancelRow?: (row: CobrosRow) => void;
  onExpandRow?: (row: CobrosRow) => void;
  allocationsMap: Record<string, CobrosAllocationRow[]>;
  allocationsLoadingMap: Record<string, boolean>;
  useInternalScroll?: boolean;
  onReachEnd?: () => void;
  loadingMore?: boolean;
  hasMore?: boolean;
  /** Callback para ver un documento asociado desde la fila expandida */
  onViewDoc?: (recordId: string, recordType: "FISCAL" | "NON_FISCAL") => void;
};

function SortIcon({ active, direction }: { active: boolean; direction: SortDirection }) {
  if (!active) return <ChevronsUpDown className="h-3.5 w-3.5 text-slate-400" />;
  return direction === "asc"
    ? <ChevronUp className="h-3.5 w-3.5 text-[#123b63]" />
    : <ChevronDown className="h-3.5 w-3.5 text-[#123b63]" />;
}

function TableTh({ children, align, sortable = false, active = false, direction = "asc", onSort }: {
  children: React.ReactNode; align?: string; sortable?: boolean;
  active?: boolean; direction?: SortDirection; onSort?: () => void;
}) {
  return (
    <th className={cls(
      "px-2 py-3 font-extrabold text-[10px] uppercase tracking-[0.06em] text-[#0b2b4f] overflow-hidden",
      align ?? "text-left"
    )}>
      {sortable ? (
        <button type="button" onClick={onSort}
          className={cls(
            "inline-flex items-center gap-1 rounded-md px-1.5 py-1 transition-colors hover:bg-white/60",
            active && "bg-white/70"
          )}
          title="Ordenar">
          <span>{children}</span>
          <SortIcon active={active} direction={direction} />
        </button>
      ) : children}
    </th>
  );
}

function TableTd({ children, right, center, title, className }: {
  children: React.ReactNode; right?: boolean; center?: boolean; title?: string; className?: string;
}) {
  return (
    <td title={title}
      className={cls(
        "px-2 py-2 align-middle border-r last:border-r-0 border-slate-200/50",
        right && "text-right",
        center && "text-center",
        className
      )}>
      {children}
    </td>
  );
}

// ─── Helpers para convertir allocations → TimelineItem[] ─────────────────────

const DOC_TYPE_LABEL: Record<string, string> = {
  INVOICE: "Factura", CREDIT_NOTE: "Nota Crédito", DEBIT_NOTE: "Nota Débito",
  OTRO_INGRESO: "Otro Ingreso", DEVOLUCION: "Devolución",
  CUSTOMER_ADVANCE: "Anticipo",
};
function docTypeLabel(t: string | null | undefined) {
  return t ? (DOC_TYPE_LABEL[t] || t) : "Documento";
}
function comoAfecta(docType: string | null | undefined) {
  switch (docType) {
    case "INVOICE":      return "Reduce saldo de Factura";
    case "DEBIT_NOTE":   return "Reduce saldo de Nota Débito";
    case "CREDIT_NOTE":  return "Aplica Nota de Crédito";
    case "DEVOLUCION":   return "Aplica Devolución";
    case "OTRO_INGRESO": return "Reduce saldo de ingreso";
    default:             return "Aplicado al documento";
  }
}

function docStateBadge(docStatus: string | null | undefined, balance: number | null | undefined): { text: string; cls: string } {
  const status = String(docStatus || "").toUpperCase();
  const bal    = balance != null ? Number(balance) : null;

  if (status === "CANCELADO")
    return { text: "Cancelado",    cls: "bg-slate-100 text-slate-600" };
  if (bal == null)
    return { text: "—",            cls: "bg-slate-100 text-slate-500" };
  if (bal < 0)
    return { text: "Saldo a favor",cls: "bg-rose-100 text-rose-700" };
  if (bal === 0)
    return { text: "Pagado",       cls: "bg-emerald-100 text-emerald-800" };
  // bal > 0
  return { text: "Pendiente",      cls: "bg-amber-100 text-amber-800" };
}

function buildAllocationItems(
  allocations: CobrosAllocationRow[],
  cobroStatus: string
): TimelineItem[] {
  const isBorrador  = cobroStatus === "BORRADOR";
  const isCancelado = cobroStatus === "CANCELADO";

  return allocations.map((a): TimelineItem => {
    const docCode  = a.fiscal_doc_code || a.non_fiscal_doc_code || "";
    const folio    = [a.series, a.number].filter(Boolean).join("-") || "—";
    const docLabel = docCode ? `${docCode} · ${folio}` : folio;
    const isDevol  = a.doc_type === "DEVOLUCION" || a.doc_type === "CREDIT_NOTE";
    const bal      = a.balance != null ? Number(a.balance) : null;

    // Si el cobro padre aún no está registrado, la asignación no está aplicada
    const badge = isBorrador
      ? { text: "Pendiente de registro", cls: "bg-amber-100 text-amber-800" }
      : isCancelado
      ? { text: "Cancelado",             cls: "bg-slate-100 text-slate-600" }
      : docStateBadge(a.doc_status, bal);

    const affectsLabel = isBorrador
      ? `${comoAfecta(a.doc_type)} (borrador)`
      : comoAfecta(a.doc_type);

    const recordType: "FISCAL" | "NON_FISCAL" =
      a.doc_class === "FISCAL" ? "FISCAL" : "NON_FISCAL";
    return {
      key: a.id,
      date: a.issue_date ?? null,
      typeLabel: docTypeLabel(a.doc_type),
      docLabel,
      amount: Number(a.allocated_amount ?? 0),
      isNegative: isDevol,
      affectsLabel,
      badge,
      recordId: a.trade_doc_id,
      recordType,
    };
  });
}

function buildCobroSuggestion(row: CobrosRow): { text: string; cls: string } | null {
  if (row.status === "BORRADOR")
    return { text: "Registra este cobro para rebajar el saldo de los documentos asociados", cls: "bg-amber-100 text-amber-900" };
  if (row.status === "CANCELADO" && row.cancel_reason)
    return { text: `Cancelado — ${row.cancel_reason}`, cls: "bg-slate-100 text-slate-600" };
  return null;
}

// ─── Botones de acción ────────────────────────────────────────────────────────

const iconBtn        = "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50";
const iconBtnPrimary = "inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white hover:bg-slate-800";
const iconBtnDanger  = "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-rose-200 bg-white text-rose-700 hover:bg-rose-50";

// ─── Componente principal ─────────────────────────────────────────────────────

export default function CobrosTable({
  rows, loading, moneyDecimals, canEdit, tabKey,
  selectedMap, allSelected, onToggleSelectAll, onToggleRow,
  onOpenRow, onDeleteRow, onRegisterRow, onCancelRow, onExpandRow,
  allocationsMap, allocationsLoadingMap,
  useInternalScroll: _useInternalScroll = false,
  onReachEnd, loadingMore = false, hasMore = false,
  onViewDoc,
}: Props) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("issue_date");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore || loadingMore) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) onReachEnd?.(); },
      { rootMargin: "200px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, onReachEnd]);

  function handleSort(next: SortKey) {
    if (sortKey === next) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(next); setSortDir("asc"); }
  }

  function toggleExpand(row: CobrosRow) {
    const willExpand = expandedId !== row.id;
    setExpandedId((prev) => (prev === row.id ? null : row.id));
    if (willExpand) onExpandRow?.(row);
  }

  const sortedRows = useMemo(() => {
    const data = [...rows];
    data.sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      const get = (r: CobrosRow): string | number => {
        switch (sortKey) {
          case "issue_date":                       return String(r.payment_date || "");
          case "cobro_type":                       return String(r.cobro_type || "");
          case "number":                           return String(r.number || "").toUpperCase();
          case "payment_method":                   return String(r.method || "");
          case "counterparty_identifier_snapshot": return String(r.counterparty_identifier_snapshot || "").toUpperCase();
          case "counterparty_name_snapshot":       return String(r.counterparty_name_snapshot || "").toUpperCase();
          case "amount":                           return Number(r.total_amount || 0);
          case "status":                           return String(r.status || "").toUpperCase();
          default:                                 return "";
        }
      };
      const av = get(a), bv = get(b);
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv), "es", { numeric: true, sensitivity: "base" }) * dir;
    });
    return data;
  }, [rows, sortKey, sortDir]);

  // 10 columnas: ☑ | Fecha | Tipo | Número | F.Pago | RUT/NIC | Cliente | Monto | Estado | Acciones
  const COL_SPAN = 10;

  return (
    <div className="mt-0 rounded-2xl bg-white shadow-[0_8px_30px_rgba(20,12,70,0.12)] ring-1 ring-slate-200/60">
      <div className="w-full overflow-x-hidden rounded-2xl overflow-y-visible">
        <table className="w-full table-fixed text-[12px]">
          <colgroup>
            <col style={{ width: "3%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "7%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "11%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "25%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "8%" }} />
          </colgroup>

          {/* Cabecera */}
          <thead className={cls(
            "sticky top-0 z-20",
            "bg-gradient-to-b from-[#eaf2fb] via-[#dde9f7] to-[#d6e4f5]",
            "border-b-2 border-[#123b63]/40 shadow-[0_2px_0_rgba(18,59,99,0.35)]"
          )}>
            <tr>
              <TableTh align="text-center">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={onToggleSelectAll}
                  disabled={!canEdit || rows.length === 0}
                  className="h-4 w-4"
                  title="Seleccionar todo"
                />
              </TableTh>
              <TableTh sortable active={sortKey === "issue_date"} direction={sortDir} onSort={() => handleSort("issue_date")} align="text-center">
                Emisión
              </TableTh>
              <TableTh sortable active={sortKey === "cobro_type"} direction={sortDir} onSort={() => handleSort("cobro_type")} align="text-center">
                Tipo
              </TableTh>
              <TableTh sortable active={sortKey === "number"} direction={sortDir} onSort={() => handleSort("number")} align="text-center">
                Número
              </TableTh>
              <TableTh sortable active={sortKey === "payment_method"} direction={sortDir} onSort={() => handleSort("payment_method")} align="text-center">
                F. Pago
              </TableTh>
              <TableTh sortable active={sortKey === "counterparty_identifier_snapshot"} direction={sortDir} onSort={() => handleSort("counterparty_identifier_snapshot")} align="text-center">
                RUT / NIC
              </TableTh>
              <TableTh sortable active={sortKey === "counterparty_name_snapshot"} direction={sortDir} onSort={() => handleSort("counterparty_name_snapshot")} align="text-center">
                Nombre contraparte
              </TableTh>
              <TableTh sortable active={sortKey === "amount"} direction={sortDir} onSort={() => handleSort("amount")} align="text-center">
                Monto
              </TableTh>
              <TableTh sortable active={sortKey === "status"} direction={sortDir} onSort={() => handleSort("status")} align="text-center">
                Estado
              </TableTh>
              <TableTh align="text-center">Acciones</TableTh>
            </tr>
          </thead>

          {/* Cuerpo */}
          <tbody>
            {/* Vacío */}
            {!loading && sortedRows.length === 0 && (
              <tr>
                <td colSpan={COL_SPAN} className="py-14 text-center text-[13px] text-slate-400">
                  {tabKey === "drafts" ? "No hay borradores." : "No hay cobros registrados."}
                </td>
              </tr>
            )}

            {/* Filas */}
            {sortedRows.map((row, idx) => {
              const checked  = Boolean(selectedMap[row.id]);
              const expanded = expandedId === row.id;
              const isAjuste   = row.cobro_type === "AJUSTE";
              const isAnticipo = row.cobro_type === "ANTICIPO";
              const amountVal  = Number(row.total_amount || 0);
              const isNegative = amountVal < 0;

              return (
                <React.Fragment key={row.id}>
                  <tr
                    onClick={() => toggleExpand(row)}
                    className={cls(
                      "border-t transition-colors cursor-pointer select-none",
                      idx % 2 === 0 ? "bg-white" : "bg-slate-50/40",
                      "hover:bg-sky-50/50",
                      expanded && "bg-sky-50/80 border-l-2 border-l-[#123b63]"
                    )}
                  >
                    {/* Checkbox */}
                    <TableTd center>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!canEdit}
                        className="h-4 w-4"
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => { e.stopPropagation(); onToggleRow(row.id, e.target.checked); }}
                        title="Seleccionar"
                      />
                    </TableTd>

                    {/* Fecha */}
                    <TableTd>
                      <span className="text-slate-700">{row.payment_date || "—"}</span>
                    </TableTd>

                    {/* Tipo */}
                    <TableTd>
                      <span className={cls(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold",
                        isAnticipo
                          ? "bg-indigo-50 text-indigo-700"
                          : isAjuste
                          ? isNegative
                            ? "bg-rose-50 text-rose-700"
                            : "bg-amber-50 text-amber-700"
                          : "bg-blue-50 text-[#123b63]"
                      )}>
                        {cobrosTypeShort(row.cobro_type)}
                      </span>
                    </TableTd>

                    {/* Número */}
                    <TableTd title={row.number || ""}>
                      <span className="block truncate font-mono text-slate-700">
                        {row.number || "—"}
                      </span>
                    </TableTd>

                    {/* Forma de pago */}
                    <TableTd>
                      {row.cobro_type === "COBRO" && row.method ? (
                        <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold bg-slate-100 text-slate-700">
                          {paymentMethodLabel(row.method)}
                          {row.method === "TARJETA" && row.card_kind && (
                            <span className="ml-1 text-slate-400">· {row.card_kind.slice(0, 3)}</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </TableTd>

                    {/* RUT/NIC */}
                    <TableTd title={row.counterparty_identifier_snapshot || ""}>
                      <span className="block truncate text-slate-600">
                        {row.counterparty_identifier_snapshot || "—"}
                      </span>
                    </TableTd>

                    {/* Nombre contraparte */}
                    <TableTd title={row.counterparty_name_snapshot || ""}>
                      <span className="block truncate font-medium text-slate-800">
                        {row.counterparty_name_snapshot || "—"}
                      </span>
                    </TableTd>

                    {/* Monto */}
                    <TableTd right>
                      <span className={cls(
                        "font-semibold",
                        isNegative
                          ? "text-rose-700"
                          : isAjuste
                          ? "text-amber-700"
                          : "text-[#123b63]"
                      )}>
                        {isNegative ? "−" : ""}{formatNumber(Math.abs(amountVal), moneyDecimals)}
                      </span>
                    </TableTd>

                    {/* Estado */}
                    <TableTd center>
                      <span className={cls(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold whitespace-nowrap",
                        row.status === "BORRADOR"
                          ? "bg-amber-100 text-amber-800"
                          : row.status === "VIGENTE"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-slate-100 text-slate-600"
                      )}>
                        {row.status}
                      </span>
                    </TableTd>

                    {/* Acciones */}
                    <TableTd center>
                      <div
                        className="flex items-center justify-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {/* Ver / Editar */}
                        <button
                          type="button"
                          title={canEdit && row.status === "BORRADOR" ? "Editar" : "Ver detalle"}
                          className={iconBtn}
                          onClick={() => onOpenRow(row.id)}
                        >
                          {canEdit && row.status === "BORRADOR"
                            ? <Pencil className="h-4 w-4" />
                            : <Eye className="h-4 w-4" />}
                        </button>

                        {/* Registrar borrador */}
                        {tabKey === "drafts" && canEdit && onRegisterRow && (
                          <button
                            type="button"
                            title="Registrar cobro"
                            className={cls(iconBtnPrimary, !canEdit && "cursor-not-allowed opacity-60")}
                            onClick={() => onRegisterRow(row)}
                          >
                            <CheckCircle2 className="h-4 w-4" />
                          </button>
                        )}

                        {/* Eliminar borrador */}
                        {tabKey === "drafts" && canEdit && onDeleteRow && (
                          <button
                            type="button"
                            title="Eliminar borrador"
                            className={cls(iconBtnDanger, !canEdit && "cursor-not-allowed opacity-60")}
                            onClick={() => onDeleteRow(row.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}

                        {/* Cancelar vigente */}
                        {tabKey === "registered" && canEdit && row.status === "VIGENTE" && onCancelRow && (
                          <button
                            type="button"
                            title="Cancelar cobro"
                            className={cls(iconBtnDanger, !canEdit && "cursor-not-allowed opacity-60")}
                            onClick={() => onCancelRow(row)}
                          >
                            <Ban className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </TableTd>
                  </tr>

                  {/* Fila expandida: documentos asociados */}
                  {expanded && (
                    <tr className="border-t bg-white">
                      <td colSpan={COL_SPAN} className="p-0">
                        <ExpandedTimelineTable
                          items={buildAllocationItems(allocationsMap[row.id] ?? [], row.status)}
                          loading={Boolean(allocationsLoadingMap[row.id])}
                          loadingText="Cargando documentos asociados…"
                          suggestion={buildCobroSuggestion(row)}
                          moneyDecimals={moneyDecimals}
                          onViewRecord={onViewDoc
                            ? (id, type) => onViewDoc(id, type as "FISCAL" | "NON_FISCAL")
                            : undefined}
                        />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}

            {/* Cargando */}
            {loading && (
              <tr>
                <td colSpan={COL_SPAN} className="py-14 text-center text-[13px] text-slate-400 animate-pulse">
                  Cargando cobros…
                </td>
              </tr>
            )}

            {/* Sentinel infinite scroll */}
            {!loading && (
              <tr>
                <td colSpan={COL_SPAN} className="p-0">
                  <div ref={sentinelRef} className="h-1" />
                  {loadingMore && (
                    <div className="py-4 text-center text-[12px] text-slate-400 animate-pulse">
                      Cargando más…
                    </div>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

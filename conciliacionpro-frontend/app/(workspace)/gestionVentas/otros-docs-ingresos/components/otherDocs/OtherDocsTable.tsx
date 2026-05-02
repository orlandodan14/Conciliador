"use client";

import React, { useMemo, useRef, useState } from "react";
import {
  Pencil, Eye, CheckCircle2, Trash2, Ban,
  ChevronUp, ChevronDown, ChevronsUpDown,
} from "lucide-react";
import type { OtherDocRow } from "./types";
import { cls, formatNumber } from "./helpers";
import { otherDocTypeShort } from "./helpers";

type TabKey = "drafts" | "registered";

type SortKey =
  | "issue_date"
  | "doc_type"
  | "number"
  | "counterparty_identifier_snapshot"
  | "counterparty_name_snapshot"
  | "grand_total"
  | "balance"
  | "status";

type SortDirection = "asc" | "desc";

type Props = {
  rows: OtherDocRow[];
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
  onRegisterRow?: (row: OtherDocRow) => Promise<void>;
  onCancelRow?: (row: OtherDocRow) => void;
  onExpandRow?: (row: OtherDocRow) => void;
  renderExpandedContent?: (row: OtherDocRow) => React.ReactNode;
  useInternalScroll?: boolean;
  onReachEnd?: () => void;
  loadingMore?: boolean;
  hasMore?: boolean;
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
    <th className={cls("px-1.5 py-3 font-extrabold text-[10px] uppercase tracking-[0.06em] text-center text-[#0b2b4f] overflow-hidden", align)}>
      {sortable ? (
        <button type="button" onClick={onSort}
          className={cls("mx-auto inline-flex items-center gap-1 rounded-md px-1.5 py-1 transition-colors hover:bg-white/60", active && "bg-white/70")}
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
    <td title={title} className={cls("px-2 py-2 align-middle border-r last:border-r-0 border-slate-200/50", right && "text-right", center && "text-center", className)}>
      {children}
    </td>
  );
}

function ExpandedRow({ content }: { content?: React.ReactNode }) {
  return (
    <div className="w-full bg-slate-50/70 px-3 py-3">
      <div className="overflow-hidden rounded-xl bg-white/95 shadow-sm ring-1 ring-slate-200/70">
        <div className="px-3 py-3">
          {content || (
            <div className="text-[12px] text-slate-500">
              Sin detalle adicional disponible.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const iconBtn = "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50";
const iconBtnPrimary = "inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white hover:bg-slate-800";
const iconBtnDanger = "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-rose-200 bg-white text-rose-700 hover:bg-rose-50";

export default function OtherDocsTable({
  rows, loading, moneyDecimals, canEdit, tabKey,
  selectedMap, allSelected, onToggleSelectAll, onToggleRow,
  onOpenRow, onDeleteRow, onRegisterRow, onCancelRow, onExpandRow,
  renderExpandedContent,
  useInternalScroll = false, onReachEnd, loadingMore = false, hasMore = false,
}: Props) {
  const scrollWrapRef = useRef<HTMLDivElement | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("issue_date");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function handleSort(next: SortKey) {
    if (sortKey === next) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(next); setSortDir("asc"); }
  }

  function toggleExpand(row: OtherDocRow) {
    const willExpand = expandedId !== row.id;
    setExpandedId((prev) => (prev === row.id ? null : row.id));
    if (willExpand) onExpandRow?.(row);
  }

  const sortedRows = useMemo(() => {
    const data = [...rows];
    data.sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      const get = (r: OtherDocRow): string | number => {
        switch (sortKey) {
          case "issue_date":                       return String(r.issue_date || "");
          case "doc_type":                         return String(r.doc_type || "");
          case "number":                           return String(r.number || "").toUpperCase();
          case "counterparty_identifier_snapshot": return String(r.counterparty_identifier_snapshot || "").toUpperCase();
          case "counterparty_name_snapshot":       return String(r.counterparty_name_snapshot || "").toUpperCase();
          case "grand_total":                      return Number(r.grand_total || 0);
          case "balance":                          return Number(r.balance ?? r.grand_total ?? 0);
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

  function handleScrollWrap() {
    if (!useInternalScroll || !hasMore || loadingMore) return;
    const el = scrollWrapRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 120) onReachEnd?.();
  }

  // Colgroup total = 100%
  // checkbox 4 | fecha 8 | tipo 11 | número 10 | rut/nic 9 | nombre 22 | monto 10 | saldo 10 | estado 8 | acciones 8

  return (
    <div className="mt-0 rounded-2xl bg-white shadow-[0_8px_30px_rgba(20,12,70,0.12)] ring-1 ring-slate-200/60">
      <div
        ref={scrollWrapRef}
        onScroll={handleScrollWrap}
        className={cls("w-full overflow-x-hidden rounded-2xl",
          useInternalScroll ? "max-h-[calc(100vh-320px)] overflow-y-auto" : "overflow-y-visible"
        )}
      >
        <table className="w-full table-fixed">
          <colgroup>
            <col style={{ width: "4%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "11%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "22%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "8%" }} />
          </colgroup>
          <thead className={cls("sticky top-0 z-20",
            "bg-gradient-to-b from-[#eaf2fb] via-[#dde9f7] to-[#d6e4f5]",
            "border-b-2 border-[#123b63]/40 shadow-[0_2px_0_rgba(18,59,99,0.35)]"
          )}>
            <tr>
              <TableTh>
                <div className="flex items-center justify-center">
                  <input type="checkbox" checked={allSelected} onChange={onToggleSelectAll}
                    disabled={!canEdit || rows.length === 0} className="h-4 w-4" title="Seleccionar todo" />
                </div>
              </TableTh>
              <TableTh sortable active={sortKey === "issue_date"} direction={sortDir} onSort={() => handleSort("issue_date")}>Emisión</TableTh>
              <TableTh sortable active={sortKey === "doc_type"} direction={sortDir} onSort={() => handleSort("doc_type")}>Tipo</TableTh>
              <TableTh sortable active={sortKey === "number"} direction={sortDir} onSort={() => handleSort("number")}>Nro</TableTh>
              <TableTh sortable active={sortKey === "counterparty_identifier_snapshot"} direction={sortDir} onSort={() => handleSort("counterparty_identifier_snapshot")}>RUT/NIC</TableTh>
              <TableTh sortable active={sortKey === "counterparty_name_snapshot"} direction={sortDir} onSort={() => handleSort("counterparty_name_snapshot")}>Nombre contraparte</TableTh>
              <TableTh sortable active={sortKey === "grand_total"} direction={sortDir} onSort={() => handleSort("grand_total")}>Monto</TableTh>
              <TableTh sortable active={sortKey === "balance"} direction={sortDir} onSort={() => handleSort("balance")}>Saldo</TableTh>
              <TableTh sortable active={sortKey === "status"} direction={sortDir} onSort={() => handleSort("status")}>Estado</TableTh>
              <TableTh>Acciones</TableTh>
            </tr>
          </thead>

          <tbody className="text-[12px]">
            {!loading && sortedRows.length === 0 ? (
              <tr>
                <td colSpan={10} className="p-10 text-center text-slate-500">
                  {tabKey === "drafts" ? "No hay borradores." : "No hay documentos registrados."}
                </td>
              </tr>
            ) : (
              sortedRows.map((row, idx) => {
                const checked = Boolean(selectedMap[row.id]);
                const expanded = expandedId === row.id;
                const isReturn = row.doc_type === "DEVOLUCION";
                const amountVal = Number(row.grand_total || 0);
                const balanceVal = Number(row.balance ?? row.grand_total ?? 0);
                return (
                  <React.Fragment key={row.id}>
                    <tr
                      onClick={() => toggleExpand(row)}
                      className={cls(
                        "border-t transition-colors cursor-pointer",
                        idx % 2 === 0 ? "bg-white" : "bg-slate-50",
                        "hover:bg-sky-50/40",
                        expanded && "bg-sky-50/70"
                      )}
                    >
                      <TableTd center>
                        <input type="checkbox" checked={checked} disabled={!canEdit} className="h-4 w-4"
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => { e.stopPropagation(); onToggleRow(row.id, e.target.checked); }}
                          title="Seleccionar" />
                      </TableTd>
                      <TableTd>{row.issue_date || "—"}</TableTd>
                      <TableTd>
                        <span className={cls("font-semibold", isReturn ? "text-rose-700" : "text-emerald-700")}>
                          {otherDocTypeShort(row.doc_type)}
                        </span>
                      </TableTd>
                      <TableTd title={row.number || ""}>
                        <span className="block truncate">{row.number || "—"}</span>
                      </TableTd>
                      <TableTd title={row.counterparty_identifier_snapshot || ""}>
                        <span className="block truncate">{row.counterparty_identifier_snapshot || "—"}</span>
                      </TableTd>
                      <TableTd title={row.counterparty_name_snapshot || ""}>
                        <span className="block truncate">{row.counterparty_name_snapshot || "—"}</span>
                      </TableTd>
                      <TableTd right>
                        <span className={cls("font-semibold", isReturn ? "text-rose-700" : "text-emerald-700")}>
                          {isReturn ? "- " : ""}{formatNumber(Math.abs(amountVal), moneyDecimals)}
                        </span>
                      </TableTd>
                      <TableTd right>
                        <span className={cls("font-semibold",
                          balanceVal === 0
                            ? "text-sky-700"
                            : isReturn
                              // DEV: saldo > 0 = devolución pendiente (rojo); < 0 = inusual
                              ? "text-rose-700"
                              // OTI: saldo > 0 = cobro pendiente (verde); < 0 = inusual
                              : balanceVal > 0
                              ? "text-emerald-700"
                              : "text-rose-700"
                        )}>
                          {formatNumber(Math.abs(balanceVal), moneyDecimals)}
                        </span>
                      </TableTd>
                      <TableTd center>
                        <span className={cls("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold",
                          row.status === "BORRADOR" ? "bg-amber-100/70 text-amber-900"
                            : row.status === "VIGENTE" ? "bg-emerald-100/70 text-emerald-900"
                            : "bg-slate-100 text-slate-800")}>
                          {row.status}
                        </span>
                      </TableTd>
                      <TableTd center>
                        <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <button type="button" className={iconBtn} onClick={() => onOpenRow(row.id)} title={tabKey === "drafts" ? "Editar" : "Ver"}>
                            {tabKey === "drafts" ? <Pencil className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                          {tabKey === "drafts" && onRegisterRow ? (
                            <button type="button" className={cls(iconBtnPrimary, !canEdit && "cursor-not-allowed opacity-60")}
                              disabled={!canEdit} onClick={() => onRegisterRow(row)} title="Registrar">
                              <CheckCircle2 className="h-4 w-4" />
                            </button>
                          ) : null}
                          {tabKey === "drafts" && onDeleteRow ? (
                            <button type="button" className={cls(iconBtnDanger, !canEdit && "cursor-not-allowed opacity-60")}
                              disabled={!canEdit}
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDeleteRow(row.id); }}
                              title="Eliminar">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          ) : null}
                          {tabKey === "registered" && onCancelRow && row.status === "VIGENTE" ? (
                            <button type="button" className={cls(iconBtnDanger, !canEdit && "cursor-not-allowed opacity-60")}
                              disabled={!canEdit}
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onCancelRow(row); }}
                              title="Cancelar">
                              <Ban className="h-4 w-4" />
                            </button>
                          ) : null}
                        </div>
                      </TableTd>
                    </tr>

                    {expanded && (
                      <tr className="border-t bg-white">
                        <td colSpan={10} className="p-0">
                          <ExpandedRow content={renderExpandedContent?.(row)} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
        {loadingMore ? (
          <div className="border-t bg-white px-3 py-3 text-center text-[12px] text-slate-500">
            Cargando más documentos...
          </div>
        ) : null}
      </div>
    </div>
  );
}

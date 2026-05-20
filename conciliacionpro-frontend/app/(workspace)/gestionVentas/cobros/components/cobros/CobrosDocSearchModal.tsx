"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link2, Eye } from "lucide-react";
import type { DocSearchResult, DocSearchFilters, CobrosAllocationDraft } from "./types";
import { cls, formatNumber, uid } from "./helpers";
import {
  tradeDocsTheme,
  tradeDocsHeaderCell,
  tradeDocsHeaderSub,
  tradeDocsBodyCell,
} from "@/app/(workspace)/gestionVentas/docs-tribut-ventas/components/tradeDocs/ui";

// ─── Constantes de estilo ─────────────────────────────────────────────────────

const labelCls = "block text-xs font-medium text-slate-600";
const inputCls = "mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm";
const selectCls = "mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm";

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  open: boolean;
  onClose: () => void;
  moneyDecimals: number;
  /** IDs de docs ya añadidos para evitar duplicados */
  addedDocIds: Set<string>;
  onSearch: (filters: DocSearchFilters) => void;
  searching: boolean;
  results: DocSearchResult[];
  onAdd: (draft: CobrosAllocationDraft) => void;
  /** Abrir vista del documento en una ventana/tab nueva */
  onViewDoc?: (r: DocSearchResult) => void;
};

// ─── Helpers locales ──────────────────────────────────────────────────────────

const EMPTY_FILTERS: DocSearchFilters = {
  doc_class: "ALL",
  number: "",
  issue_date_from: "",
  issue_date_to: "",
  counterparty_identifier: "",
  counterparty_name: "",
  only_open_balance: true,
};

function docFolioLabel(r: DocSearchResult): string {
  const code = r.fiscal_doc_code || r.non_fiscal_doc_code || "";
  const folio = [r.series, r.number].filter(Boolean).join("-");
  return [code, folio].filter(Boolean).join(" ") || "—";
}

function docTypeLabel(r: DocSearchResult): string {
  const dc = r.doc_class === "FISCAL" ? "Fiscal" : "No Fiscal";
  const dt = (() => {
    switch (r.doc_type) {
      case "INVOICE":      return "Factura";
      case "CREDIT_NOTE":  return "NC";
      case "DEBIT_NOTE":   return "ND";
      case "OTRO_INGRESO": return "Otro Ing.";
      case "DEVOLUCION":   return "Devolución";
      default:             return r.doc_type || "Doc.";
    }
  })();
  return `${dc} · ${dt}`;
}

/** Colgroup compartido entre header y body para que columnas sean iguales */
function DocColgroup() {
  return (
    <colgroup>
      <col style={{ width: "14%" }} />
      <col style={{ width: "12%" }} />
      <col style={{ width: "9%" }} />
      <col style={{ width: "27%" }} />
      <col style={{ width: "12%" }} />
      <col style={{ width: "12%" }} />
      <col style={{ width: "14%" }} />
    </colgroup>
  );
}

// ─── Componente ──────────────────────────────────────────────────────────────

export default function CobrosDocSearchModal({
  open,
  onClose,
  moneyDecimals,
  addedDocIds,
  onSearch,
  searching,
  results,
  onAdd,
  onViewDoc,
}: Props) {
  const [filters, setFilters] = useState<DocSearchFilters>(EMPTY_FILTERS);
  const firstRun = useRef(true);

  // Búsqueda inicial al abrir
  useEffect(() => {
    if (!open) return;
    if (firstRun.current) {
      firstRun.current = false;
      onSearch(filters);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Reset al cerrar
  useEffect(() => {
    if (!open) {
      firstRun.current = true;
      setFilters(EMPTY_FILTERS);
    }
  }, [open]);

  const handleSearch = useCallback(() => {
    onSearch(filters);
  }, [filters, onSearch]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") handleSearch();
    },
    [handleSearch]
  );

  function handleAddDoc(r: DocSearchResult) {
    const draft: CobrosAllocationDraft = {
      id: uid(),
      trade_doc_id: r.id,
      doc_type: r.doc_type,
      doc_class: r.doc_class,
      fiscal_doc_code: r.fiscal_doc_code,
      non_fiscal_doc_code: r.non_fiscal_doc_code,
      series: r.series,
      number: r.number,
      issue_date: r.issue_date,
      counterparty_name: r.counterparty_name_snapshot,
      grand_total: r.grand_total,
      balance: r.balance,
      currency_code: r.currency_code,
      // Por defecto proponer saldo pendiente; si no, usar total
      allocated_amount:
        r.balance != null && Number(r.balance) > 0
          ? String(Number(r.balance))
          : String(Number(r.grand_total || 0)),
    };
    onAdd(draft);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70]">
      <div className="absolute inset-0 bg-black/45" onClick={onClose} />

      <div className="absolute left-1/2 top-1/2 w-[min(1180px,96vw)] -translate-x-1/2 -translate-y-1/2">
        <div className="flex h-[min(86vh,820px)] flex-col overflow-hidden rounded-[22px] bg-white shadow-xl ring-1 ring-black/5">

          {/* ── Header ── */}
          <div className={cls("relative px-5 py-4 shrink-0", tradeDocsTheme.header)}>
            <div className={tradeDocsTheme.glowA} />
            <div className={tradeDocsTheme.glowB} />
            <div className="relative flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-extrabold uppercase text-white/80">
                  Cobros • Documentos
                </div>
                <h3 className="truncate text-lg font-black text-white">
                  Buscar documentos a asociar
                </h3>
              </div>
              <button
                type="button"
                className="ml-3 rounded-xl px-3 py-1.5 text-sm font-extrabold text-white/90 hover:bg-white/10"
                onClick={onClose}
                title="Cerrar"
              >
                ✕
              </button>
            </div>
          </div>

          {/* ── Body ── */}
          <div className="flex flex-1 min-h-0 flex-col overflow-hidden p-5">

            {/* Panel de filtros */}
            <div className="shrink-0 rounded-2xl border bg-slate-50 p-4">

              {/* Fila 1: Clase · Nro/Folio · Fecha desde · Fecha hasta · Buscar */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3">

                <div className="md:col-span-3">
                  <label className={labelCls}>Clase</label>
                  <select
                    className={selectCls}
                    value={filters.doc_class}
                    onChange={(e) => setFilters((f) => ({ ...f, doc_class: e.target.value }))}
                    onKeyDown={handleKeyDown}
                  >
                    <option value="ALL">Todos</option>
                    <option value="FISCAL">Fiscales (DTE)</option>
                    <option value="NON_FISCAL">No Fiscales</option>
                  </select>
                </div>

                <div className="md:col-span-3">
                  <label className={labelCls}>Número / Folio</label>
                  <input
                    className={inputCls}
                    value={filters.number}
                    onChange={(e) => setFilters((f) => ({ ...f, number: e.target.value }))}
                    onKeyDown={handleKeyDown}
                    placeholder="Ej: 123"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className={labelCls}>Fecha desde</label>
                  <input
                    type="date"
                    className={inputCls}
                    value={filters.issue_date_from}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, issue_date_from: e.target.value }))
                    }
                  />
                </div>

                <div className="md:col-span-2">
                  <label className={labelCls}>Fecha hasta</label>
                  <input
                    type="date"
                    className={inputCls}
                    value={filters.issue_date_to}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, issue_date_to: e.target.value }))
                    }
                  />
                </div>

                <div className="md:col-span-2 flex items-end">
                  <button
                    type="button"
                    onClick={handleSearch}
                    disabled={searching}
                    className={cls(
                      tradeDocsTheme.btnPrimary,
                      "w-full",
                      searching && "opacity-60 cursor-not-allowed"
                    )}
                  >
                    {searching ? "Buscando..." : "Buscar"}
                  </button>
                </div>
              </div>

              {/* Fila 2: Solo con saldo · Limpiar */}
              <div className="mt-3 flex flex-wrap items-center gap-4">
                <label className="inline-flex cursor-pointer select-none items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={filters.only_open_balance}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, only_open_balance: e.target.checked }))
                    }
                  />
                  Solo con saldo
                </label>
                <button
                  type="button"
                  className={tradeDocsTheme.btnSoft}
                  onClick={() => setFilters(EMPTY_FILTERS)}
                >
                  Limpiar filtros
                </button>
              </div>

              {/* Banner informativo */}
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
                Esta búsqueda se limitará al mismo RUT/ID de la cabecera del cobro.
              </div>
            </div>

            {/* ── Resultados ── */}
            <div className={cls("mt-4 flex min-h-0 flex-1 flex-col", tradeDocsTheme.card)}>

              {/* Card header */}
              <div className="px-4 py-3 border-b flex flex-wrap items-start justify-between gap-2 shrink-0">
                <div>
                  <h2 className="font-semibold text-slate-900">Resultados</h2>
                  <div className="text-[11px] text-slate-500">
                    Facturas y documentos disponibles para asociar al cobro.
                  </div>
                </div>
                <div className="text-[11px] text-slate-500">
                  {results.length} resultado(s)
                </div>
              </div>

              <div className="border-t border-slate-200 overflow-hidden flex min-h-0 flex-1 flex-col">

                {/* Header fijo */}
                <div className="overflow-hidden shrink-0">
                  <table className="w-full table-fixed border-collapse text-sm">
                    <DocColgroup />
                    <thead>
                      <tr>
                        <th className={tradeDocsHeaderCell}>
                          <b>Tipo / Clase</b>
                          <span className={tradeDocsHeaderSub}>doc_class · type</span>
                        </th>
                        <th className={tradeDocsHeaderCell}>
                          <b>Folio</b>
                          <span className={tradeDocsHeaderSub}>serie / número</span>
                        </th>
                        <th className={tradeDocsHeaderCell}>
                          <b>Emisión</b>
                          <span className={tradeDocsHeaderSub}>issue_date</span>
                        </th>
                        <th className={tradeDocsHeaderCell}>
                          <b>Contraparte</b>
                          <span className={tradeDocsHeaderSub}>nombre · rut</span>
                        </th>
                        <th className={cls(tradeDocsHeaderCell, "text-right")}>
                          <b>Monto</b>
                          <span className={tradeDocsHeaderSub}>grand_total</span>
                        </th>
                        <th className={cls(tradeDocsHeaderCell, "text-right")}>
                          <b>Saldo</b>
                          <span className={tradeDocsHeaderSub}>balance</span>
                        </th>
                        <th className={cls(tradeDocsHeaderCell, "text-right")}>
                          <b>Acciones</b>
                          <span className={tradeDocsHeaderSub}>vincular / ver</span>
                        </th>
                      </tr>
                    </thead>
                  </table>
                </div>

                {/* Body scrollable */}
                <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
                  <table className="w-full table-fixed border-collapse text-sm">
                    <DocColgroup />
                    <tbody>
                      {results.length === 0 ? (
                        <tr>
                          <td className="p-4 text-sm text-slate-600" colSpan={7}>
                            {searching ? "Buscando…" : "Sin resultados. Ajusta los filtros y vuelve a buscar."}
                          </td>
                        </tr>
                      ) : (
                        results.map((r, idx) => {
                          const isAdded = addedDocIds.has(r.id);
                          const rowBg =
                            idx % 2 === 0 ? "bg-slate-50/80" : "bg-slate-100/50";
                          return (
                            <tr
                              key={r.id}
                              className={cls(
                                rowBg,
                                "hover:bg-sky-50/30",
                                isAdded && "opacity-60"
                              )}
                            >
                              <td className={tradeDocsBodyCell}>
                                <span className="font-medium text-slate-700">
                                  {docTypeLabel(r)}
                                </span>
                              </td>

                              <td className={cls(tradeDocsBodyCell, "font-mono text-xs")}>
                                {docFolioLabel(r)}
                              </td>

                              <td className={cls(tradeDocsBodyCell, "text-xs")}>
                                {r.issue_date || "—"}
                              </td>

                              <td className={tradeDocsBodyCell}>
                                <div className="truncate font-medium text-slate-800">
                                  {r.counterparty_name_snapshot || "—"}
                                </div>
                                <div className="truncate text-[10px] text-slate-400">
                                  {r.counterparty_identifier_snapshot || ""}
                                </div>
                              </td>

                              <td className={cls(tradeDocsBodyCell, "text-right font-medium")}>
                                {r.grand_total != null
                                  ? formatNumber(Number(r.grand_total), moneyDecimals)
                                  : "—"}
                              </td>

                              <td className={cls(tradeDocsBodyCell, "text-right")}>
                                {(() => {
                                  const bal = Number(r.balance ?? 0);
                                  const isCredit =
                                    r.doc_type === "DEVOLUCION" ||
                                    r.doc_type === "CREDIT_NOTE";
                                  const colorCls =
                                    bal === 0
                                      ? "text-slate-400"
                                      : isCredit
                                      ? "text-rose-600"
                                      : "text-emerald-700";
                                  return (
                                    <span className={cls("font-semibold", colorCls)}>
                                      {r.balance != null
                                        ? (isCredit && bal > 0 ? "−" : "") +
                                          formatNumber(Math.abs(bal), moneyDecimals)
                                        : "—"}
                                    </span>
                                  );
                                })()}
                              </td>

                              <td className={cls(tradeDocsBodyCell, "text-right")}>
                                {isAdded ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700">
                                    ✓ Añadido
                                  </span>
                                ) : (
                                  <div className="flex justify-end gap-1">
                                    <button
                                      type="button"
                                      onClick={() => handleAddDoc(r)}
                                      title="Vincular al cobro"
                                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white hover:bg-slate-700 transition-colors"
                                    >
                                      <Link2 className="h-4 w-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => onViewDoc?.(r)}
                                      title="Ver documento"
                                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors"
                                    >
                                      <Eye className="h-4 w-4" />
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

          {/* ── Footer ── */}
          <div className="shrink-0 border-t bg-white/95 backdrop-blur px-5 py-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-slate-500">
                {results.length > 0
                  ? `${results.length} resultado(s). Puedes agregar múltiples documentos.`
                  : "Ingresa los filtros y haz clic en Buscar para cargar resultados."}
              </div>
              <button
                type="button"
                className={tradeDocsTheme.btnSoft}
                onClick={onClose}
              >
                Cerrar
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

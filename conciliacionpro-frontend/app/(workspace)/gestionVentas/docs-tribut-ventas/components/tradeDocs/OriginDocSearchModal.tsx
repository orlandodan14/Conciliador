"use client";

import React from "react";
import { Eye, Link2 } from "lucide-react";

function cls(...a: Array<string | false | null | undefined>) {
  return a.filter(Boolean).join(" ");
}

const iconBtn =
  "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50";

const iconBtnPrimary =
  "inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white hover:bg-slate-800";

type DocType = "INVOICE" | "CREDIT_NOTE" | "DEBIT_NOTE";
type DocStatus = "BORRADOR" | "VIGENTE" | "CANCELADO";

export type OriginDocLite = {
  id: string;
  doc_type?: DocType | null;
  fiscal_doc_code?: string | null;
  series?: string | null;
  number?: string | null;
  issue_date?: string | null;

  net_taxable?: number | null;
  net_exempt?: number | null;
  tax_total?: number | null;
  grand_total?: number | null;
  balance?: number | null;

  currency_code?: string | null;
  status?: DocStatus | null;
};

export type OriginSearchFilters = {
  fiscal_doc_code: string;
  folio: string;
  issue_date_from: string;
  issue_date_to: string;
  only_open_balance: boolean;
  only_vigente: boolean;
};

export function OriginDocSearchModal(props: {
  open: boolean;
  onClose: () => void;
  canEdit: boolean;

  theme: {
    header: string;
    glowA: string;
    glowB: string;
    btnPrimary: string;
    btnSoft: string;
    card: string;
  };

  moneyDecimals: number;
  formatNumber: (val: number, decimals: number) => string;
  folioLabel: (series?: string | null, number?: string | null) => string;
  headerCell: string;
  headerSub: string;
  bodyCell: string;

  filters: OriginSearchFilters;
  setFilters: React.Dispatch<React.SetStateAction<OriginSearchFilters>>;

  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  results: OriginDocLite[];

  onSearch: () => Promise<void> | void;
  onLoadMore: () => Promise<void> | void;
  onClearFilters: () => void;
  onPick: (doc: OriginDocLite) => void;
  onViewDoc: (doc: OriginDocLite) => void;
}) {
    const {
      open,
      onClose,
      canEdit,
      theme,
      moneyDecimals,
      formatNumber,
      folioLabel,
      headerCell,
      headerSub,
      bodyCell,
      filters,
      setFilters,
      loading,
      results,
      onSearch,
      onClearFilters,
      onPick,
      onViewDoc,
      loadingMore,
      hasMore,
      onLoadMore,
    } = props;

  const handleResultsScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 120;

    if (nearBottom && !loading && !loadingMore && hasMore) {
      void onLoadMore();
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70]">
      <div className="absolute inset-0 bg-black/45" onClick={onClose} />
      <div className="absolute left-1/2 top-1/2 w-[min(1180px,96vw)] -translate-x-1/2 -translate-y-1/2">
        <div className="flex h-[min(86vh,820px)] flex-col overflow-hidden rounded-[22px] bg-white shadow-xl ring-1 ring-black/5">
          <div className={cls("relative px-5 py-4", theme.header)}>
            <div className={theme.glowA} />
            <div className={theme.glowB} />
            <div className="relative flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-extrabold uppercase text-white/80">
                  Ventas • Documento origen
                </div>
                <h3 className="truncate text-lg font-black text-white">
                  Buscar documento para Nota de Crédito / Débito
                </h3>
              </div>

              <button
                className="ml-3 rounded-xl px-3 py-1.5 text-sm font-extrabold text-white/90 hover:bg-white/10"
                onClick={onClose}
                title="Cerrar"
                aria-label="Cerrar"
                type="button"
              >
                ✕
              </button>
            </div>
          </div>

          <div className="flex flex-1 min-h-0 flex-col overflow-hidden p-5">
            <div className="rounded-2xl border bg-slate-50 p-4">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                <div className="md:col-span-3">
                  <label className="block text-xs font-medium text-slate-600">
                    Código fiscal
                  </label>
                  <input
                    className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm"
                    value={filters.fiscal_doc_code}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, fiscal_doc_code: e.target.value }))
                    }
                    placeholder="33, 34, 39..."
                    disabled={!canEdit}
                  />
                </div>

                <div className="md:col-span-3">
                  <label className="block text-xs font-medium text-slate-600">
                    Folio
                  </label>
                  <input
                    className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm"
                    value={filters.folio}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, folio: e.target.value }))
                    }
                    placeholder="Serie / número / folio"
                    disabled={!canEdit}
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-600">
                    Fecha desde
                  </label>
                  <input
                    type="date"
                    className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm"
                    value={filters.issue_date_from}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, issue_date_from: e.target.value }))
                    }
                    disabled={!canEdit}
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-600">
                    Fecha hasta
                  </label>
                  <input
                    type="date"
                    className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm"
                    value={filters.issue_date_to}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, issue_date_to: e.target.value }))
                    }
                    disabled={!canEdit}
                  />
                </div>

                <div className="md:col-span-2 flex items-end">
                  <button
                    className={cls(theme.btnPrimary, "w-full", !canEdit && "opacity-60 cursor-not-allowed")}
                    onClick={onSearch}
                    disabled={!canEdit || loading}
                    type="button"
                  >
                    {loading ? "Buscando..." : "Buscar"}
                  </button>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-4">
                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={filters.only_open_balance}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, only_open_balance: e.target.checked }))
                    }
                    disabled={!canEdit}
                  />
                  Solo con saldo
                </label>

                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={filters.only_vigente}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, only_vigente: e.target.checked }))
                    }
                    disabled={!canEdit}
                  />
                  Solo vigentes
                </label>

                <button
                  className={theme.btnSoft}
                  type="button"
                  onClick={onClearFilters}
                  disabled={!canEdit}
                >
                  Limpiar filtros
                </button>
              </div>

              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
                Esta búsqueda se limitará al mismo RUT/ID de la cabecera del documento actual.
              </div>
            </div>

            <div className={cls("mt-4 flex min-h-0 flex-1 flex-col", theme.card)}>
              <div className="px-4 py-3 border-b flex flex-wrap items-start justify-between gap-2 shrink-0">
                <div>
                  <h2 className="font-semibold text-slate-900">Resultados</h2>
                  <div className="text-[11px] text-slate-500">
                    Documentos vigentes del mismo RUT/ID para asociar como origen.
                  </div>
                </div>

                <div className="text-[11px] text-slate-500">
                  {results.length} resultado(s)
                </div>
              </div>

              <div className="border-t border-slate-200 overflow-hidden flex min-h-0 flex-1 flex-col">
                <div className="overflow-hidden shrink-0">
                  <table className="w-full table-fixed border-collapse text-sm">
                    <colgroup>
                      <col style={{ width: "12%" }} />
                      <col style={{ width: "10%" }} />
                      <col style={{ width: "18%" }} />
                      <col style={{ width: "11%" }} />
                      <col style={{ width: "11%" }} />
                      <col style={{ width: "11%" }} />
                      <col style={{ width: "11%" }} />
                      <col style={{ width: "16%" }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th className={headerCell}>
                          <b>Emisión</b>
                          <span className={headerSub}>issue_date</span>
                        </th>
                        <th className={headerCell}>
                          <b>Cód</b>
                          <span className={headerSub}>fiscal</span>
                        </th>
                        <th className={headerCell}>
                          <b>Folio</b>
                          <span className={headerSub}>serie / número</span>
                        </th>
                        <th className={cls(headerCell, "text-right")}>
                          <b>Afecto</b>
                          <span className={headerSub}>net</span>
                        </th>
                        <th className={cls(headerCell, "text-right")}>
                          <b>Exento</b>
                          <span className={headerSub}>ex</span>
                        </th>
                        <th className={cls(headerCell, "text-right")}>
                          <b>IVA</b>
                          <span className={headerSub}>iva</span>
                        </th>
                        <th className={cls(headerCell, "text-right")}>
                          <b>Total</b>
                          <span className={headerSub}>grand_total</span>
                        </th>
                        <th className={cls(headerCell, "text-right")}>
                          <b>Acciones</b>
                          <span className={headerSub}>asociar / ver</span>
                        </th>
                      </tr>
                    </thead>
                  </table>
                </div>

                <div
                  className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
                  onScroll={handleResultsScroll}
                >
                  <table className="w-full table-fixed border-collapse text-sm">
                    <colgroup>
                      <col style={{ width: "12%" }} />
                      <col style={{ width: "10%" }} />
                      <col style={{ width: "18%" }} />
                      <col style={{ width: "11%" }} />
                      <col style={{ width: "11%" }} />
                      <col style={{ width: "11%" }} />
                      <col style={{ width: "11%" }} />
                      <col style={{ width: "16%" }} />
                    </colgroup>

                    <tbody>
                      {results.length === 0 ? (
                        <tr>
                          <td className="p-4 text-sm text-slate-600" colSpan={8}>
                            {loading ? "Buscando..." : "Sin resultados."}
                          </td>
                        </tr>
                      ) : (
                        results.map((r, idx) => {
                          const rowBg = idx % 2 === 0 ? "bg-slate-50/80" : "bg-slate-100/50";

                          return (
                            <tr key={r.id} className={cls(rowBg, "hover:bg-sky-50/30")}>
                              <td className={cls(bodyCell, "text-xs")}>
                                {r.issue_date || "—"}
                              </td>

                              <td className={cls(bodyCell, "font-semibold")}>
                                {r.fiscal_doc_code || "—"}
                              </td>

                              <td className={bodyCell}>
                                <div
                                  className="truncate font-medium"
                                  title={folioLabel(r.series, r.number)}
                                >
                                  {folioLabel(r.series, r.number)}
                                </div>
                              </td>

                              <td className={cls(bodyCell, "text-right")}>
                                {formatNumber(Number(r.net_taxable || 0), moneyDecimals)}
                              </td>

                              <td className={cls(bodyCell, "text-right")}>
                                {formatNumber(Number(r.net_exempt || 0), moneyDecimals)}
                              </td>

                              <td className={cls(bodyCell, "text-right")}>
                                {formatNumber(Number(r.tax_total || 0), moneyDecimals)}
                              </td>

                              <td className={cls(bodyCell, "text-right font-semibold")}>
                                {formatNumber(Number(r.grand_total || 0), moneyDecimals)}
                              </td>

                              <td className={cls(bodyCell, "text-right")}>
                                <div className="flex justify-end gap-1">
                                  <button
                                    type="button"
                                    className={cls(iconBtnPrimary, !canEdit && "opacity-60 cursor-not-allowed")}
                                    onClick={() => onPick(r)}
                                    disabled={!canEdit}
                                    title="Asociar"
                                    aria-label="Asociar"
                                  >
                                    <Link2 className="h-4 w-4" />
                                  </button>

                                  <button
                                    type="button"
                                    className={iconBtn}
                                    onClick={() => onViewDoc(r)}
                                    title="Ver documento"
                                    aria-label="Ver documento"
                                  >
                                    <Eye className="h-4 w-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}

                      {loadingMore ? (
                        <tr>
                          <td className="p-4 text-center text-sm text-slate-500" colSpan={8}>
                            Cargando más documentos...
                          </td>
                        </tr>
                      ) : null}

                      {!hasMore && results.length > 0 ? (
                        <tr>
                          <td className="p-4 text-center text-xs text-slate-400" colSpan={8}>
                            No hay más resultados.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

          </div>

          <div className="shrink-0 border-t bg-white/95 px-5 py-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-slate-500">
                Diseño visual listo. Luego conectamos filtros y resultados reales a la BD.
              </div>

              <button className={theme.btnSoft} onClick={onClose} type="button">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
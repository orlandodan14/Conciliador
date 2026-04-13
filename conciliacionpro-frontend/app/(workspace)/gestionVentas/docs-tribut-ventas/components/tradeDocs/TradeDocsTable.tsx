"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pencil, Eye, CheckCircle2, Trash2 } from "lucide-react";
import type { DraftRow, DocHeader } from "@/app/(workspace)/gestionVentas/docs-tribut-ventas/components/tradeDocs/types";
import {
  cls,
  formatNumber,
  folioLabel,
  hasFiscalFolioData,
  todayISO,
} from "@/app/(workspace)/gestionVentas/docs-tribut-ventas/components/tradeDocs/helpers";

type TradeDocsTabKey = "drafts" | "registered";

type TradeDocsTableRow = DraftRow & {
  status: string;
};

type TradeDocsTableProps = {
  rows: TradeDocsTableRow[];
  loading: boolean;
  moneyDecimals: number;
  canEdit: boolean;
  baseCurrency: string;
  companyId: string;

  tabKey: TradeDocsTabKey;

  selectedMap: Record<string, boolean>;
  allSelected: boolean;
  onToggleSelectAll: () => void;
  onToggleRow: (id: string, checked?: boolean) => void;
  onClearSelection?: () => void;

  onOpenRow: (id: string) => void;
  onExpandRow?: (row: TradeDocsTableRow) => void;
  onDeleteRow?: (id: string) => void;
  onRegisterRow?: (row: TradeDocsTableRow) => Promise<void>;

  assertUniqueFiscalFolio: (args: {
    companyId: string;
    header: DocHeader;
    excludeDocId?: string | null;
  }) => Promise<void>;

  renderExpandedContent?: (row: TradeDocsTableRow) => React.ReactNode;

  useInternalScroll?: boolean;
  onReachEnd?: () => void;
  loadingMore?: boolean;
  hasMore?: boolean;
};

function TableTh({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: string;
}) {
  return (
    <th
      className={cls(
        "px-3 py-3 font-extrabold whitespace-nowrap",
        "text-[11px] uppercase tracking-[0.08em]",
        "text-center text-[#0b2b4f]",
        align
      )}
    >
      {children}
    </th>
  );
}

function TableTd({
  children,
  right,
  center,
  title,
  className,
}: {
  children: React.ReactNode;
  right?: boolean;
  center?: boolean;
  title?: string;
  className?: string;
}) {
  return (
    <td
      title={title}
      className={cls(
        "px-2 py-2 align-middle",
        "border-r last:border-r-0 border-slate-200/50",
        right && "text-right",
        center && "text-center",
        className
      )}
    >
      {children}
    </td>
  );
}

const COL_FALLBACK = [4, 8, 6, 10, 11, 17, 8, 8, 8, 9, 9, 8, 10];

function buildGridStyle(colWeights: number[] | null): React.CSSProperties {
  const base =
    colWeights && colWeights.length >= 13 ? colWeights.slice(0, 13) : COL_FALLBACK;

  return {
    gridTemplateColumns: base.map((w) => `${w}fr`).join(" "),
  };
}

function ExpandedRow({
  content,
}: {
  content?: React.ReactNode;
}) {

  return (
    <div className="w-full px-3 py-3 bg-slate-50/70">
      <div className="overflow-hidden rounded-xl bg-white/95 ring-1 ring-slate-200/70 shadow-sm">
        <div className="px-3 py-3">
          {content || (
            <div className="text-[12px] text-slate-500">
              Aquí irá el detalle expandido.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const iconBtn =
  "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50";

const iconBtnPrimary =
  "inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white hover:bg-slate-800";

const iconBtnDanger =
  "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-rose-200 bg-white text-rose-700 hover:bg-rose-50";

function buildRowHeaderForCheck(
  row: TradeDocsTableRow,
  baseCurrency: string
): DocHeader {
  return {
    doc_type: row.doc_type,
    fiscal_doc_code: String(row.fiscal_doc_code || ""),
    status: row.status as any,
    issue_date: row.issue_date || todayISO(),
    due_date: row.issue_date || todayISO(),
    series: String(row.series || ""),
    number: String(row.number || ""),
    currency_code: baseCurrency,
    branch_id: "",
    counterparty_identifier: String(row.counterparty_identifier_snapshot || ""),
    counterparty_name: String(row.counterparty_name_snapshot || ""),
    reference: "",
    cancelled_at: "",
    cancel_reason: "",
    origin_doc_id: null,
    origin_label: "",
    origin_doc_type: null,
    origin_fiscal_doc_code: null,
    origin_issue_date: null,
    origin_currency_code: null,
    origin_net_taxable: null,
    origin_net_exempt: null,
    origin_tax_total: null,
    origin_grand_total: null,
    origin_balance: null,
    origin_payment_status: null,
    origin_status: null,
  };
}

export default function TradeDocsTable({
  rows,
  loading,
  moneyDecimals,
  canEdit,
  baseCurrency,
  companyId,
  tabKey,
  selectedMap,
  allSelected,
  onToggleSelectAll,
  onToggleRow,
  onOpenRow,
  onExpandRow,
  onDeleteRow,
  onRegisterRow,
  assertUniqueFiscalFolio,
  renderExpandedContent,
  useInternalScroll = false,
  onReachEnd,
  loadingMore = false,
  hasMore = false,
}: TradeDocsTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const tableRef = useRef<HTMLTableElement | null>(null);
  const scrollWrapRef = useRef<HTMLDivElement | null>(null);
  const [colWeights, setColWeights] = useState<number[] | null>(null);

  function toggleExpand(row: TradeDocsTableRow) {
    const willExpand = expandedId !== row.id;
    setExpandedId(willExpand ? row.id : null);

    if (willExpand) {
      window.setTimeout(() => {
        onExpandRow?.(row);
      }, 0);
    }
  }

  function computeColWeights() {
    const table = tableRef.current;
    if (!table) return;

    const ths = Array.from(table.querySelectorAll("thead th")) as HTMLElement[];
    if (!ths.length) return;

    const widths = ths.map((th) =>
      Math.max(1, Math.round(th.getBoundingClientRect().width))
    );

    setColWeights(widths.slice(0, 13));
    }

    function handleScrollWrap() {
    if (!useInternalScroll) return;
    if (!hasMore || loadingMore) return;

    const el = scrollWrapRef.current;
    if (!el) return;

    const nearBottom =
      el.scrollTop + el.clientHeight >= el.scrollHeight - 120;

    if (nearBottom) {
      onReachEnd?.();
    }
  }

  useEffect(() => {
    computeColWeights();

    const table = tableRef.current;
    if (!table) return;

    const ro = new ResizeObserver(() => computeColWeights());
    ro.observe(table);

    const ths = Array.from(table.querySelectorAll("thead th")) as HTMLElement[];
    ths.forEach((th) => ro.observe(th));

    window.addEventListener("resize", computeColWeights);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", computeColWeights);
    };
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => computeColWeights(), 0);
    return () => window.clearTimeout(t);
  }, [rows.length, expandedId]);

  return (
    <div className="mt-0 rounded-2xl bg-white ring-1 ring-slate-200/60 shadow-[0_8px_30px_rgba(20,12,70,0.12)]">
      <div
        ref={scrollWrapRef}
        onScroll={handleScrollWrap}
        className={cls(
          "w-full overflow-x-hidden rounded-2xl",
          useInternalScroll
            ? "overflow-y-auto max-h-[calc(100vh-320px)]"
            : "overflow-y-visible"
        )}
      >
        <table ref={tableRef} className="w-full table-fixed">
          <colgroup>
            <col style={{ width: "4%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "5%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "18%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "10%" }} />
          </colgroup>

          <thead
            className={cls(
              "sticky top-0 z-20",
              "bg-gradient-to-b from-[#eaf2fb] via-[#dde9f7] to-[#d6e4f5]",
              "border-b-2 border-[#123b63]/40",
              "shadow-[0_2px_0_rgba(18,59,99,0.35)]"
            )}
          >
            <tr>
              <TableTh>
                <div className="flex items-center justify-center">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={onToggleSelectAll}
                    disabled={!canEdit || rows.length === 0}
                    className="h-4 w-4"
                    title="Seleccionar todo"
                  />
                </div>
              </TableTh>

              <TableTh>Emisión</TableTh>
              <TableTh>Cód</TableTh>
              <TableTh>Folio</TableTh>
              <TableTh>RUT/NIC</TableTh>
              <TableTh>Nombre contraparte</TableTh>
              <TableTh align="text-right">Afecto</TableTh>
              <TableTh align="text-right">Exento</TableTh>
              <TableTh align="text-right">IVA</TableTh>
              <TableTh align="text-right">Total</TableTh>
              <TableTh align="text-right">Saldo</TableTh>
              <TableTh align="text-center">Estado</TableTh>
              <TableTh align="text-center">Acciones</TableTh>
            </tr>
          </thead>

          <tbody className="text-[12px]">
            {!loading && rows.length === 0 ? (
              <tr>
                <td colSpan={13} className="p-10 text-center text-slate-500">
                  {tabKey === "drafts"
                    ? "No hay borradores."
                    : "No hay documentos registrados."}
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => {
                const expanded = expandedId === row.id;
                const checked = Boolean(selectedMap[row.id]);

                return (
                  <React.Fragment key={row.id}>
                    <tr
                      onClick={() => toggleExpand(row)}
                      className={cls(
                        "border-t cursor-pointer transition-colors",
                        idx % 2 === 0 ? "bg-white" : "bg-slate-50",
                        "hover:bg-sky-50/40",
                        expanded && "bg-sky-50/70"
                      )}
                    >
                      <TableTd center>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!canEdit}
                          className="h-4 w-4"
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            e.stopPropagation();
                            onToggleRow(row.id, e.target.checked);
                          }}
                          title="Seleccionar"
                        />
                      </TableTd>

                      <TableTd>{row.issue_date || "—"}</TableTd>

                      <TableTd>
                        <span className="font-semibold">{row.fiscal_doc_code || "—"}</span>
                      </TableTd>

                      <TableTd title={folioLabel(row.series, row.number)}>
                        <span className="block truncate">
                          {folioLabel(row.series, row.number)}
                        </span>
                      </TableTd>

                      <TableTd title={row.counterparty_identifier_snapshot || ""}>
                        <span className="block truncate">
                          {row.counterparty_identifier_snapshot || "—"}
                        </span>
                      </TableTd>

                      <TableTd title={row.counterparty_name_snapshot || ""}>
                        <span className="block truncate">
                          {row.counterparty_name_snapshot || "—"}
                        </span>
                      </TableTd>

                      <TableTd right>{formatNumber(Number(row.net_taxable || 0), moneyDecimals)}</TableTd>
                      <TableTd right>{formatNumber(Number(row.net_exempt || 0), moneyDecimals)}</TableTd>
                      <TableTd right>{formatNumber(Number(row.tax_total || 0), moneyDecimals)}</TableTd>

                      <TableTd right>
                        <span
                          className={cls(
                            "font-semibold",
                            row.doc_type === "CREDIT_NOTE" ? "text-rose-700" : "text-emerald-700"
                          )}
                        >
                          {row.doc_type === "CREDIT_NOTE" ? "- " : ""}
                          {formatNumber(Number(row.grand_total || 0), moneyDecimals)}
                        </span>
                      </TableTd>

                      <TableTd right>
                        {(() => {
                          const balanceValue = Number(row.balance ?? row.grand_total ?? 0);

                          return (
                            <span
                              className={cls(
                                "font-semibold",
                                balanceValue < 0
                                  ? "text-rose-700"
                                  : balanceValue > 0
                                  ? "text-emerald-700"
                                  : "text-sky-700"
                              )}
                            >
                              {formatNumber(balanceValue, moneyDecimals)}
                            </span>
                          );
                        })()}
                      </TableTd>

                      <TableTd center>
                        <span
                          className={cls(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold",
                            row.status === "BORRADOR"
                              ? "bg-amber-100/70 text-amber-900"
                              : row.status === "VIGENTE"
                              ? "bg-emerald-100/70 text-emerald-900"
                              : "bg-slate-100 text-slate-800"
                          )}
                        >
                          {row.status}
                        </span>
                      </TableTd>

                      <TableTd center>
                        <div
                          className="flex items-center justify-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            className={iconBtn}
                            onClick={() => onOpenRow(row.id)}
                            title={tabKey === "drafts" ? "Editar" : "Ver"}
                            aria-label={tabKey === "drafts" ? "Editar" : "Ver"}
                          >
                            {tabKey === "drafts" ? (
                              <Pencil className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>

                          {tabKey === "drafts" && onRegisterRow ? (
                            <button
                              type="button"
                              className={cls(iconBtnPrimary, !canEdit && "opacity-60 cursor-not-allowed")}
                              disabled={!canEdit}
                              onClick={async () => {
                                const rowHeaderForCheck = buildRowHeaderForCheck(row, baseCurrency);

                                if (hasFiscalFolioData(rowHeaderForCheck)) {
                                  await assertUniqueFiscalFolio({
                                    companyId,
                                    header: rowHeaderForCheck,
                                    excludeDocId: row.id,
                                  });
                                }

                                await onRegisterRow(row);
                              }}
                              title="Registrar"
                              aria-label="Registrar"
                            >
                              <CheckCircle2 className="h-4 w-4" />
                            </button>
                          ) : null}

                          {tabKey === "drafts" && onDeleteRow ? (
                            <button
                              type="button"
                              className={cls(iconBtnDanger, !canEdit && "opacity-60 cursor-not-allowed")}
                              disabled={!canEdit}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onDeleteRow(row.id);
                              }}
                              title="Eliminar"
                              aria-label="Eliminar"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          ) : null}
                        </div>
                      </TableTd>
                    </tr>

                    {expanded && (
                      <tr className="border-t bg-white">
                        <td colSpan={13} className="p-0">
                          <ExpandedRow
                            content={renderExpandedContent?.(row)}
                          />
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
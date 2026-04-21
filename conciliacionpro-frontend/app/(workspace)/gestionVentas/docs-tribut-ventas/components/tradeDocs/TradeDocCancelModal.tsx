"use client";

import React, { useMemo, useState } from "react";
import type { JournalLine } from "@/app/(workspace)/gestionVentas/docs-tribut-ventas/components/tradeDocs/types";
import { cls, toNum } from "@/app/(workspace)/gestionVentas/docs-tribut-ventas/components/tradeDocs/helpers";

function CancelShellModal({
  open,
  title,
  subtitle,
  children,
  onClose,
  footer,
  widthClass = "w-[min(1200px,96vw)]",
  zIndexClass = "z-[120]",
  headerClassName,
  glowAClassName,
  glowBClassName,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
  footer?: React.ReactNode;
  widthClass?: string;
  zIndexClass?: string;
  headerClassName: string;
  glowAClassName: string;
  glowBClassName: string;
}) {
  if (!open) return null;

  return (
    <div className={cls("fixed inset-0", zIndexClass)}>
      <div className="absolute inset-0 bg-black/45" onClick={onClose} />
      <div
        className={cls(
          "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
          widthClass
        )}
      >
        <div className="flex h-[min(84vh,780px)] flex-col overflow-hidden rounded-[22px] bg-white shadow-xl ring-1 ring-black/5">
          <div className={cls("relative px-5 py-4", headerClassName)}>
            <div className={glowAClassName} />
            <div className={glowBClassName} />
            <div className="relative flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-extrabold uppercase text-white/80">
                  {subtitle || "Ventas"}
                </div>
                <h3 className="truncate text-lg font-black text-white">{title}</h3>
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

          <div className="flex-1 overflow-y-auto overflow-x-hidden p-5">{children}</div>

          {footer ? (
            <div className="shrink-0 border-t bg-white/95 backdrop-blur px-5 py-3">
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

type CancelDocInfo = {
  doc_type: string;
  fiscal_doc_code: string;
  series: string;
  number: string;
  issue_date: string;
  counterparty_identifier: string;
  counterparty_name: string;
  currency_code: string;
  grand_total: number;
  status: string;
};

export default function TradeDocCancelModal(props: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  loading: boolean;
  loadingPreview: boolean;

  cancelDate: string;
  setCancelDate: (v: string) => void;
  cancelReason: string;
  setCancelReason: (v: string) => void;

  previewLines: JournalLine[];
  updatePreviewLine: (idx: number, patch: Partial<JournalLine>) => void;
  addPreviewLine: () => void;
  removePreviewLine: (idx: number) => void;

  moneyDecimals: number;
  formatNumber: (val: number, decimals: number) => string;

  theme: {
    header: string;
    glowA: string;
    glowB: string;
    btnPrimary: string;
    btnSoft: string;
    card: string;
  };

  headerCell: string;
  headerSub: string;
  bodyCell: string;
  cellInputBase: string;
  cellInputRight: string;

  canEdit: boolean;
  widthClass?: string;
  zIndexClass?: string;

  accByCode: Record<string, { id: string; code: string; name: string }>;
  branches: Array<{ id: string; code: string; name: string; is_active?: boolean; is_default?: boolean }>;
  businessLines: Array<{ id: string; code: string; name: string; is_active: boolean }>;

  docInfo: CancelDocInfo | null;
}) {
  const {
    open,
    onClose,
    onConfirm,
    loading,
    loadingPreview,
    cancelDate,
    setCancelDate,
    cancelReason,
    setCancelReason,
    previewLines,
    updatePreviewLine,
    addPreviewLine,
    removePreviewLine,
    moneyDecimals,
    formatNumber,
    theme,
    headerCell,
    headerSub,
    bodyCell,
    cellInputBase,
    cellInputRight,
    canEdit,
    accByCode,
    branches,
    businessLines,
    docInfo,
    widthClass = "w-[min(1200px,96vw)]",
    zIndexClass = "z-[120]",
  } = props;

  const [tab, setTab] = useState<"DATOS" | "ASIENTO">("DATOS");

  const journalAccountListId = "dl-cancel-journal-accounts";
  const branchDatalistId = "dl-cancel-branches";
  const businessLineDatalistId = "dl-cancel-business-lines";

  const branchList = useMemo(
    () =>
      [...branches]
        .filter((b) => b.is_active !== false)
        .sort((a, b) => `${a.code} ${a.name}`.localeCompare(`${b.code} ${b.name}`)),
    [branches]
  );

  const activeBusinessLines = useMemo(
    () =>
      [...businessLines]
        .filter((x) => x.is_active)
        .sort((a, b) => `${a.code} ${a.name}`.localeCompare(`${b.code} ${b.name}`)),
    [businessLines]
  );

  const usedJournalLines = useMemo(() => {
    return previewLines.filter((l) => {
      return (
        String(l.account_code || "").trim() ||
        String(l.description || "").trim() ||
        String(l.debit || "").trim() ||
        String(l.credit || "").trim() ||
        String(l.business_line_code || "").trim() ||
        String(l.branch_code || "").trim()
      );
    });
  }, [previewLines]);

  const journalSummary = useMemo(() => {
    const debit = usedJournalLines.reduce((s, l) => s + toNum(l.debit), 0);
    const credit = usedJournalLines.reduce((s, l) => s + toNum(l.credit), 0);
    const diff = debit - credit;
    const absDiff = Math.abs(diff);
    const isBalanced = absDiff < 0.5;

    return {
      debit,
      credit,
      diff,
      absDiff,
      isBalanced,
      usedCount: usedJournalLines.length,
    };
  }, [usedJournalLines]);

  const folio = [docInfo?.fiscal_doc_code || "", [docInfo?.series || "", docInfo?.number || ""].filter(Boolean).join(" - ")]
    .filter(Boolean)
    .join(" · ");

  return (
    <CancelShellModal
      open={open}
      title="Cancelar documento"
      subtitle="Ventas • Cancelación contable"
      onClose={onClose}
      widthClass={widthClass}
      zIndexClass={zIndexClass}
      headerClassName={theme.header}
      glowAClassName={theme.glowA}
      glowBClassName={theme.glowB}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2 text-xs text-slate-700">
            <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-900">
              Cancelación contable
            </span>

            <span
              className={cls(
                "inline-flex items-center rounded-full px-2 py-0.5",
                journalSummary.isBalanced
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-rose-100 text-rose-800"
              )}
            >
              {journalSummary.isBalanced ? (
                <>
                  Cuadrado: <b className="ml-1">Sí</b>
                </>
              ) : (
                <>
                  Descuadre: <b className="ml-1">{formatNumber(journalSummary.absDiff, moneyDecimals)}</b>
                </>
              )}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button className={theme.btnSoft} onClick={onClose} type="button" disabled={loading}>
              Cerrar
            </button>

            <button
              className={cls(
                theme.btnPrimary,
                (!canEdit || loading || loadingPreview || !cancelDate || !cancelReason.trim()) &&
                  "opacity-60 cursor-not-allowed"
              )}
              disabled={!canEdit || loading || loadingPreview || !cancelDate || !cancelReason.trim()}
              onClick={onConfirm}
              type="button"
            >
              {loading ? "Cancelando..." : "Confirmar cancelación"}
            </button>
          </div>
        </div>
      }
    >
      <datalist id={journalAccountListId}>
        {Object.values(accByCode).map((a) => (
          <option key={a.id} value={a.code}>
            {a.name}
          </option>
        ))}
      </datalist>

      <datalist id={branchDatalistId}>
        {branchList.map((b) => (
          <option key={b.id} value={b.code}>
            {b.name}
          </option>
        ))}
      </datalist>

      <datalist id={businessLineDatalistId}>
        {activeBusinessLines.map((bu) => (
          <option key={bu.id} value={bu.code}>
            {bu.name}
          </option>
        ))}
      </datalist>

      <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-2">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTab("DATOS")}
            className={cls(
              "rounded-2xl px-4 py-2 text-[12px] font-extrabold transition ring-1",
              tab === "DATOS"
                ? "bg-slate-900 text-white ring-slate-900"
                : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
            )}
          >
            Datos cancelación
          </button>

          <button
            type="button"
            onClick={() => setTab("ASIENTO")}
            className={cls(
              "rounded-2xl px-4 py-2 text-[12px] font-extrabold transition ring-1",
              tab === "ASIENTO"
                ? "bg-slate-900 text-white ring-slate-900"
                : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
            )}
          >
            Asiento contable
          </button>
        </div>
      </div>

      {tab === "DATOS" ? (
        <div className="space-y-4">
          <div className={theme.card}>
            <div className="px-4 py-3 border-b">
              <div className="text-sm font-semibold text-slate-900">Datos básicos del documento</div>
              <div className="text-[11px] text-slate-500">
                Documento que será cancelado y reversado contablemente.
              </div>
            </div>

            <div className="px-4 py-3 grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
              <div>
                <div className="text-[11px] text-slate-500">Folio</div>
                <div className="font-medium text-slate-900">{folio || "—"}</div>
              </div>

              <div>
                <div className="text-[11px] text-slate-500">Fecha emisión</div>
                <div className="font-medium text-slate-900">{docInfo?.issue_date || "—"}</div>
              </div>

              <div>
                <div className="text-[11px] text-slate-500">Contraparte</div>
                <div className="font-medium text-slate-900">
                  {docInfo?.counterparty_name || "—"}
                </div>
              </div>

              <div>
                <div className="text-[11px] text-slate-500">RUT / NIT / RFC</div>
                <div className="font-medium text-slate-900">
                  {docInfo?.counterparty_identifier || "—"}
                </div>
              </div>

              <div>
                <div className="text-[11px] text-slate-500">Tipo</div>
                <div className="font-medium text-slate-900">{docInfo?.doc_type || "—"}</div>
              </div>

              <div>
                <div className="text-[11px] text-slate-500">Moneda</div>
                <div className="font-medium text-slate-900">{docInfo?.currency_code || "—"}</div>
              </div>

              <div>
                <div className="text-[11px] text-slate-500">Total</div>
                <div className="font-medium text-slate-900">
                  {docInfo ? formatNumber(Number(docInfo.grand_total || 0), moneyDecimals) : "—"}
                </div>
              </div>

              <div>
                <div className="text-[11px] text-slate-500">Estatus actual</div>
                <div className="font-medium text-slate-900">{docInfo?.status || "—"}</div>
              </div>
            </div>
          </div>

          <div className={theme.card}>
            <div className="px-4 py-3 border-b">
              <div className="text-sm font-semibold text-slate-900">Datos de cancelación</div>
              <div className="text-[11px] text-slate-500">
                Define la fecha y el motivo de la reversa.
              </div>
            </div>

            <div className="px-4 py-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700">Fecha de cancelación</label>
                <input
                  type="date"
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                  value={cancelDate}
                  onChange={(e) => setCancelDate(e.target.value)}
                  disabled={loading}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Motivo</label>
                <input
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  disabled={loading}
                  placeholder="Motivo de cancelación"
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {tab === "ASIENTO" ? (
        <div className={theme.card}>
          <div className="px-4 py-3 border-b flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold text-slate-900">Distribución contable</h2>

              <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-bold bg-amber-100 text-amber-900">
                REVERSA
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                className={cls(theme.btnPrimary, !canEdit ? "opacity-60 cursor-not-allowed" : "")}
                disabled={!canEdit}
                onClick={addPreviewLine}
                type="button"
              >
                + Línea
              </button>
            </div>
          </div>

          <div className="px-4 py-3 border-t bg-white">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-slate-800">
                Debe: <b className="ml-1">{formatNumber(journalSummary.debit, moneyDecimals)}</b>
              </span>

              <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-slate-800">
                Haber: <b className="ml-1">{formatNumber(journalSummary.credit, moneyDecimals)}</b>
              </span>

              <span
                className={cls(
                  "inline-flex items-center rounded-full px-3 py-1",
                  journalSummary.isBalanced
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-rose-100 text-rose-800"
                )}
              >
                {journalSummary.isBalanced ? (
                  <>
                    Cuadrado: <b className="ml-1">Sí</b>
                  </>
                ) : (
                  <>
                    Descuadre: <b className="ml-1">{formatNumber(journalSummary.absDiff, moneyDecimals)}</b>
                  </>
                )}
              </span>
            </div>
          </div>

          <div className="border-t border-slate-200 overflow-x-hidden">
            <div className="overflow-hidden">
              <table className="w-full table-fixed border-collapse text-sm">
                <colgroup>
                  <col style={{ width: "5%" }} />
                  <col style={{ width: "16%" }} />
                  <col style={{ width: "30%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "11%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "4%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th className={headerCell}>N°<span className={headerSub}>line_no</span></th>
                    <th className={headerCell}><b>Cuenta</b><span className={headerSub}>account_code</span></th>
                    <th className={headerCell}><b>Glosa</b><span className={headerSub}>description</span></th>
                    <th className={cls(headerCell, "text-right")}><b>Debe</b><span className={headerSub}>debit</span></th>
                    <th className={cls(headerCell, "text-right")}><b>Haber</b><span className={headerSub}>credit</span></th>
                    <th className={headerCell}><b>CU</b><span className={headerSub}>bu</span></th>
                    <th className={headerCell}><b>SUC</b><span className={headerSub}>branch</span></th>
                    <th className={cls(headerCell, "text-right")}><span className={headerSub}> </span></th>
                  </tr>
                </thead>
              </table>
            </div>

            <div className="max-h-[380px] overflow-y-auto overflow-x-hidden">
              <table className="w-full table-fixed border-collapse text-sm">
                <colgroup>
                  <col style={{ width: "5%" }} />
                  <col style={{ width: "16%" }} />
                  <col style={{ width: "30%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "11%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "4%" }} />
                </colgroup>

                <tbody>
                  {loadingPreview ? (
                    <tr>
                      <td className="p-4 text-sm text-slate-500" colSpan={8}>
                        Cargando asiento origen...
                      </td>
                    </tr>
                  ) : previewLines.length === 0 ? (
                    <tr>
                      <td className="p-4 text-sm text-slate-500" colSpan={8}>
                        No hay líneas para reversar.
                      </td>
                    </tr>
                  ) : (
                    previewLines.map((l, idx) => {
                      const rowBg = idx % 2 === 0 ? "bg-slate-50/80" : "bg-slate-100/50";

                      return (
                        <tr key={idx} className={cls(rowBg, "hover:bg-sky-50/30")}>
                          <td className={cls(bodyCell, "text-slate-600 text-xs text-center")}>{l.line_no}</td>

                          <td className={bodyCell}>
                            <input
                              className={cellInputBase}
                              disabled={!canEdit}
                              value={l.account_code}
                              list={journalAccountListId}
                              onChange={(e) => updatePreviewLine(idx, { account_code: e.target.value })}
                              onBlur={(e) =>
                                updatePreviewLine(idx, {
                                  account_code: String(e.target.value || "").trim(),
                                })
                              }
                              placeholder="1020101"
                            />
                            <div className="text-[11px] text-slate-500 truncate">
                              {String(l.account_code || "").trim() ? (
                                accByCode[String(l.account_code || "").trim()]?.name ? (
                                  accByCode[String(l.account_code || "").trim()].name
                                ) : (
                                  <span className="text-amber-700">no existe</span>
                                )
                              ) : (
                                "—"
                              )}
                            </div>
                          </td>

                          <td className={bodyCell}>
                            <input
                              className={cellInputBase}
                              disabled={!canEdit}
                              value={l.description}
                              onChange={(e) => updatePreviewLine(idx, { description: e.target.value })}
                              placeholder="Glosa línea asiento"
                            />
                          </td>

                          <td className={bodyCell}>
                            <input
                              className={cls(cellInputBase, cellInputRight)}
                              disabled={!canEdit}
                              value={l.debit}
                              onChange={(e) => updatePreviewLine(idx, { debit: e.target.value })}
                              inputMode="decimal"
                              placeholder="0"
                            />
                          </td>

                          <td className={bodyCell}>
                            <input
                              className={cls(cellInputBase, cellInputRight)}
                              disabled={!canEdit}
                              value={l.credit}
                              onChange={(e) => updatePreviewLine(idx, { credit: e.target.value })}
                              inputMode="decimal"
                              placeholder="0"
                            />
                          </td>

                          <td className={bodyCell}>
                            <input
                              className={cellInputBase}
                              disabled={!canEdit}
                              value={l.business_line_code}
                              list={businessLineDatalistId}
                              onChange={(e) => updatePreviewLine(idx, { business_line_code: e.target.value })}
                              onBlur={(e) =>
                                updatePreviewLine(idx, {
                                  business_line_code: String(e.target.value || "").trim(),
                                })
                              }
                              placeholder="CU"
                            />
                          </td>

                          <td className={bodyCell}>
                            <input
                              className={cellInputBase}
                              disabled={!canEdit}
                              value={l.branch_code}
                              list={branchDatalistId}
                              onChange={(e) => updatePreviewLine(idx, { branch_code: e.target.value })}
                              onBlur={(e) =>
                                updatePreviewLine(idx, {
                                  branch_code: String(e.target.value || "").trim(),
                                })
                              }
                              placeholder="SUC"
                            />
                          </td>

                          <td className={cls(bodyCell, "text-right")}>
                            <button
                              className={cls(
                                "text-xs rounded border border-slate-200 px-2 py-1 hover:bg-white hover:text-rose-700",
                                !canEdit ? "opacity-60 cursor-not-allowed" : ""
                              )}
                              disabled={!canEdit}
                              onClick={() => removePreviewLine(idx)}
                              title="Eliminar"
                              type="button"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="px-4 py-2 border-t bg-white">
              {journalSummary.isBalanced ? (
                <div className="text-[11px] text-emerald-700">
                  <b>Validación:</b> asiento reverso correcto. No hay errores visuales.
                </div>
              ) : (
                <div className="text-[11px] text-rose-700">
                  <b>Validación:</b> Debe y Haber no cuadran.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </CancelShellModal>
  );
}
"use client";

/**
 * CobrosCancelModal
 * ─────────────────
 * Modal de cancelación de cobros. Diseño idéntico a TradeDocCancelModal:
 *   - Shell con header oscuro (tradeDocsTheme)
 *   - Dos tabs: "Datos cancelación" | "Asiento contable"
 *   - Tab datos: info del cobro + campos fecha y motivo
 *   - Tab asiento: tabla de líneas con Cuenta/Glosa/Debe/Haber/CU/SUC
 *   - Footer con badges de balance + botones Cerrar / Confirmar cancelación
 */

import React, { useMemo, useState } from "react";
import type { JournalLine } from "./types";
import { cls, toNum, formatNumber } from "./helpers";
import {
  tradeDocsTheme,
  tradeDocsHeaderCell,
  tradeDocsHeaderSub,
  tradeDocsBodyCell,
  tradeDocsCellInputBase,
  tradeDocsCellInputRight,
} from "@/app/(workspace)/gestionVentas/docs-tribut-ventas/components/tradeDocs/ui";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type CancelCobroInfo = {
  cobro_type: string;
  payment_method: string | null;
  issue_date: string | null;
  number: string | null;
  counterparty_name: string | null;
  counterparty_identifier: string | null;
  currency_code: string;
  total_amount: number;
  status: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  saving: boolean;

  cancelDate: string;
  setCancelDate: (v: string) => void;
  cancelReason: string;
  setCancelReason: (v: string) => void;

  journalLines: JournalLine[];
  setJournalLines: React.Dispatch<React.SetStateAction<JournalLine[]>>;

  accByCode: Record<string, { id: string; code: string; name: string }>;
  branches: Array<{ id: string; code: string; name: string; is_active: boolean; is_default: boolean }>;
  businessLines: Array<{ id: string; code: string; name: string; is_active: boolean }>;

  moneyDecimals: number;
  canEdit: boolean;
  docInfo: CancelCobroInfo | null;
  loadingPreview?: boolean;
};

// ─── Shell modal ──────────────────────────────────────────────────────────────

function CancelShellModal({
  open,
  title,
  subtitle,
  children,
  onClose,
  footer,
  widthClass = "w-[min(1200px,96vw)]",
  zIndexClass = "z-[120]",
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
  footer?: React.ReactNode;
  widthClass?: string;
  zIndexClass?: string;
}) {
  if (!open) return null;

  return (
    <div className={cls("fixed inset-0", zIndexClass)}>
      <div className="absolute inset-0 bg-black/45" onClick={onClose} />
      <div className={cls("absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2", widthClass)}>
        <div className="flex h-[min(84vh,780px)] flex-col overflow-hidden rounded-[22px] bg-white shadow-xl ring-1 ring-black/5">

          {/* Header */}
          <div className={cls("relative px-5 py-4", tradeDocsTheme.header)}>
            <div className={tradeDocsTheme.glowA} />
            <div className={tradeDocsTheme.glowB} />
            <div className="relative flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-extrabold uppercase text-white/80">
                  {subtitle || "Cobros"}
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

          {/* Body */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden p-5">{children}</div>

          {/* Footer */}
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

// ─── Colgroup del asiento (idéntico a TradeDocCancelModal) ────────────────────

function JournalColgroup() {
  return (
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
  );
}

// ─── Labels legibles ─────────────────────────────────────────────────────────

function cobroTypeLabel(t: string | null) {
  if (t === "COBRO") return "Cobro";
  if (t === "AJUSTE") return "Ajuste";
  return t || "—";
}

function methodLabel(m: string | null) {
  if (!m) return "—";
  const MAP: Record<string, string> = {
    EFECTIVO: "Efectivo",
    TRANSFERENCIA: "Transferencia",
    CHEQUE: "Cheque",
    TARJETA: "Tarjeta",
  };
  return MAP[m] ?? m;
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function CobrosCancelModal({
  open,
  onClose,
  onConfirm,
  saving,
  cancelDate,
  setCancelDate,
  cancelReason,
  setCancelReason,
  journalLines,
  setJournalLines,
  accByCode,
  branches,
  businessLines,
  moneyDecimals,
  canEdit,
  docInfo,
  loadingPreview = false,
}: Props) {
  const [tab, setTab] = useState<"DATOS" | "ASIENTO">("DATOS");

  const journalAccountListId = "dl-cobros-cancel-accounts";
  const branchDatalistId     = "dl-cobros-cancel-branches";
  const buDatalistId         = "dl-cobros-cancel-bu";

  const branchList = useMemo(
    () =>
      [...branches]
        .filter((b) => b.is_active !== false)
        .sort((a, b) => `${a.code} ${a.name}`.localeCompare(`${b.code} ${b.name}`)),
    [branches]
  );

  const activeBu = useMemo(
    () =>
      [...businessLines]
        .filter((x) => x.is_active)
        .sort((a, b) => `${a.code} ${a.name}`.localeCompare(`${b.code} ${b.name}`)),
    [businessLines]
  );

  const usedLines = useMemo(() => {
    return journalLines.filter((l) =>
      String(l.account_code || "").trim() ||
      String(l.description || "").trim() ||
      String(l.debit || "").trim() ||
      String(l.credit || "").trim() ||
      String(l.business_line_code || "").trim() ||
      String(l.branch_code || "").trim()
    );
  }, [journalLines]);

  const journalSummary = useMemo(() => {
    const debit   = usedLines.reduce((s, l) => s + toNum(l.debit),  0);
    const credit  = usedLines.reduce((s, l) => s + toNum(l.credit), 0);
    const absDiff = Math.abs(debit - credit);
    const isBalanced = absDiff < 0.5;
    return { debit, credit, absDiff, isBalanced };
  }, [usedLines]);

  function updateLine(idx: number, patch: Partial<JournalLine>) {
    setJournalLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }
  function addLine() {
    const nextNo = (journalLines[journalLines.length - 1]?.line_no ?? 0) + 1;
    setJournalLines((ls) => [
      ...ls,
      {
        line_no: nextNo, account_code: "", description: "", debit: "0", credit: "0",
        cost_center_id: null, business_line_id: null, branch_id: null,
        cost_center_code: "", business_line_code: "", branch_code: "",
      },
    ]);
  }
  function removeLine(idx: number) {
    setJournalLines((ls) => ls.filter((_, i) => i !== idx));
  }

  return (
    <CancelShellModal
      open={open}
      title="Cancelar cobro"
      subtitle="Cobros • Cancelación contable"
      onClose={onClose}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Badges izquierda */}
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
                <>Cuadrado: <b className="ml-1">Sí</b></>
              ) : (
                <>Descuadre: <b className="ml-1">{formatNumber(journalSummary.absDiff, moneyDecimals)}</b></>
              )}
            </span>
          </div>

          {/* Botones derecha */}
          <div className="flex flex-wrap items-center gap-2">
            <button className={tradeDocsTheme.btnSoft} onClick={onClose} type="button" disabled={saving}>
              Cerrar
            </button>
            <button
              className={cls(
                tradeDocsTheme.btnPrimary,
                (!canEdit || saving || loadingPreview || !cancelDate || !cancelReason.trim()) &&
                  "opacity-60 cursor-not-allowed"
              )}
              disabled={!canEdit || saving || loadingPreview || !cancelDate || !cancelReason.trim()}
              onClick={onConfirm}
              type="button"
            >
              {saving ? "Cancelando…" : "Confirmar cancelación"}
            </button>
          </div>
        </div>
      }
    >
      {/* Datalists */}
      <datalist id={journalAccountListId}>
        {Object.values(accByCode).map((a) => (
          <option key={a.id} value={a.code}>{a.name}</option>
        ))}
      </datalist>
      <datalist id={branchDatalistId}>
        {branchList.map((b) => (
          <option key={b.id} value={b.code}>{b.name}</option>
        ))}
      </datalist>
      <datalist id={buDatalistId}>
        {activeBu.map((bu) => (
          <option key={bu.id} value={bu.code}>{bu.name}</option>
        ))}
      </datalist>

      {/* ── Tabs ── */}
      <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-2">
        <div className="flex flex-wrap gap-2">
          {(["DATOS", "ASIENTO"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cls(
                "rounded-2xl px-4 py-2 text-[12px] font-extrabold transition ring-1",
                tab === t
                  ? "bg-slate-900 text-white ring-slate-900"
                  : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
              )}
            >
              {t === "DATOS" ? "Datos cancelación" : "Asiento contable"}
            </button>
          ))}
        </div>
      </div>

      {/* ═══════════ TAB DATOS ═══════════ */}
      {tab === "DATOS" && (
        <div className="space-y-4">

          {/* Card: info del cobro */}
          <div className={tradeDocsTheme.card}>
            <div className="px-4 py-3 border-b">
              <div className="text-sm font-semibold text-slate-900">Datos básicos del cobro</div>
              <div className="text-[11px] text-slate-500">
                Cobro que será cancelado y reversado contablemente.
              </div>
            </div>
            <div className="px-4 py-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div>
                <div className="text-[11px] text-slate-500">Número</div>
                <div className="font-medium text-slate-900">{docInfo?.number || "—"}</div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">Fecha emisión</div>
                <div className="font-medium text-slate-900">{docInfo?.issue_date || "—"}</div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">Contraparte</div>
                <div className="font-medium text-slate-900">{docInfo?.counterparty_name || "—"}</div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">RUT / NIC</div>
                <div className="font-medium text-slate-900">{docInfo?.counterparty_identifier || "—"}</div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">Tipo</div>
                <div className="font-medium text-slate-900">{cobroTypeLabel(docInfo?.cobro_type || null)}</div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">Método pago</div>
                <div className="font-medium text-slate-900">{methodLabel(docInfo?.payment_method || null)}</div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">Monto</div>
                <div className="font-medium text-slate-900">
                  {docInfo ? formatNumber(Number(docInfo.total_amount || 0), moneyDecimals) : "—"}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">Moneda</div>
                <div className="font-medium text-slate-900">{docInfo?.currency_code || "—"}</div>
              </div>
            </div>
          </div>

          {/* Card: datos de cancelación */}
          <div className={tradeDocsTheme.card}>
            <div className="px-4 py-3 border-b">
              <div className="text-sm font-semibold text-slate-900">Datos de cancelación</div>
              <div className="text-[11px] text-slate-500">
                Define la fecha y el motivo de la reversa. Esta acción no se puede deshacer.
              </div>
            </div>
            <div className="px-4 py-3 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700">Fecha de cancelación</label>
                <input
                  type="date"
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400/30"
                  value={cancelDate}
                  onChange={(e) => setCancelDate(e.target.value)}
                  disabled={saving}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Motivo</label>
                <input
                  className="mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400/30"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  disabled={saving}
                  placeholder="Motivo de cancelación"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ TAB ASIENTO ═══════════ */}
      {tab === "ASIENTO" && (
        <div className={tradeDocsTheme.card}>
          {/* Barra superior */}
          <div className="px-4 py-3 border-b flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold text-slate-900">Distribución contable</h2>
              <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-bold bg-amber-100 text-amber-900">
                REVERSA
              </span>
            </div>
            <button
              className={cls(tradeDocsTheme.btnPrimary, !canEdit ? "opacity-60 cursor-not-allowed" : "")}
              disabled={!canEdit}
              onClick={addLine}
              type="button"
            >
              + Línea
            </button>
          </div>

          {/* Pills de balance */}
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
                  <>Cuadrado: <b className="ml-1">Sí</b></>
                ) : (
                  <>Descuadre: <b className="ml-1">{formatNumber(journalSummary.absDiff, moneyDecimals)}</b></>
                )}
              </span>
            </div>
          </div>

          {/* Tabla split: header fijo + body scrollable */}
          <div className="border-t border-slate-200 overflow-x-hidden">
            {/* Header fijo */}
            <div className="overflow-hidden">
              <table className="w-full table-fixed border-collapse text-sm">
                <JournalColgroup />
                <thead>
                  <tr>
                    <th className={tradeDocsHeaderCell}>N°<span className={tradeDocsHeaderSub}>line_no</span></th>
                    <th className={tradeDocsHeaderCell}><b>Cuenta</b><span className={tradeDocsHeaderSub}>account_code</span></th>
                    <th className={tradeDocsHeaderCell}><b>Glosa</b><span className={tradeDocsHeaderSub}>description</span></th>
                    <th className={cls(tradeDocsHeaderCell, "text-right")}><b>Debe</b><span className={tradeDocsHeaderSub}>debit</span></th>
                    <th className={cls(tradeDocsHeaderCell, "text-right")}><b>Haber</b><span className={tradeDocsHeaderSub}>credit</span></th>
                    <th className={tradeDocsHeaderCell}><b>CU</b><span className={tradeDocsHeaderSub}>bu</span></th>
                    <th className={tradeDocsHeaderCell}><b>SUC</b><span className={tradeDocsHeaderSub}>branch</span></th>
                    <th className={cls(tradeDocsHeaderCell, "text-right")}><span className={tradeDocsHeaderSub}> </span></th>
                  </tr>
                </thead>
              </table>
            </div>

            {/* Body scrollable */}
            <div className="max-h-[340px] overflow-y-auto overflow-x-hidden">
              <table className="w-full table-fixed border-collapse text-sm">
                <JournalColgroup />
                <tbody>
                  {loadingPreview ? (
                    <tr>
                      <td className="p-4 text-sm text-slate-500" colSpan={8}>
                        Cargando asiento origen…
                      </td>
                    </tr>
                  ) : journalLines.length === 0 ? (
                    <tr>
                      <td className="p-4 text-sm text-slate-500" colSpan={8}>
                        No hay líneas para reversar.
                      </td>
                    </tr>
                  ) : (
                    journalLines.map((l, idx) => {
                      const rowBg = idx % 2 === 0 ? "bg-slate-50/80" : "bg-slate-100/50";
                      return (
                        <tr key={idx} className={cls(rowBg, "hover:bg-sky-50/30")}>
                          <td className={cls(tradeDocsBodyCell, "text-slate-600 text-xs text-center")}>{l.line_no}</td>

                          <td className={tradeDocsBodyCell}>
                            <input
                              className={tradeDocsCellInputBase}
                              disabled={!canEdit}
                              value={l.account_code}
                              list={journalAccountListId}
                              onChange={(e) => updateLine(idx, { account_code: e.target.value })}
                              onBlur={(e) => updateLine(idx, { account_code: String(e.target.value || "").trim() })}
                              placeholder="1020101"
                            />
                            <div className="text-[11px] text-slate-500 truncate">
                              {String(l.account_code || "").trim() ? (
                                accByCode[String(l.account_code || "").trim()]?.name ? (
                                  accByCode[String(l.account_code || "").trim()].name
                                ) : (
                                  <span className="text-amber-700">no existe</span>
                                )
                              ) : "—"}
                            </div>
                          </td>

                          <td className={tradeDocsBodyCell}>
                            <input
                              className={tradeDocsCellInputBase}
                              disabled={!canEdit}
                              value={l.description}
                              onChange={(e) => updateLine(idx, { description: e.target.value })}
                              placeholder="Glosa línea asiento"
                            />
                          </td>

                          <td className={tradeDocsBodyCell}>
                            <input
                              className={cls(tradeDocsCellInputBase, tradeDocsCellInputRight)}
                              disabled={!canEdit}
                              value={l.debit}
                              onChange={(e) => updateLine(idx, { debit: e.target.value })}
                              inputMode="decimal"
                              placeholder="0"
                            />
                          </td>

                          <td className={tradeDocsBodyCell}>
                            <input
                              className={cls(tradeDocsCellInputBase, tradeDocsCellInputRight)}
                              disabled={!canEdit}
                              value={l.credit}
                              onChange={(e) => updateLine(idx, { credit: e.target.value })}
                              inputMode="decimal"
                              placeholder="0"
                            />
                          </td>

                          <td className={tradeDocsBodyCell}>
                            <input
                              className={tradeDocsCellInputBase}
                              disabled={!canEdit}
                              value={l.business_line_code}
                              list={buDatalistId}
                              onChange={(e) => updateLine(idx, { business_line_code: e.target.value })}
                              onBlur={(e) => updateLine(idx, { business_line_code: String(e.target.value || "").trim() })}
                              placeholder="CU"
                            />
                          </td>

                          <td className={tradeDocsBodyCell}>
                            <input
                              className={tradeDocsCellInputBase}
                              disabled={!canEdit}
                              value={l.branch_code}
                              list={branchDatalistId}
                              onChange={(e) => updateLine(idx, { branch_code: e.target.value })}
                              onBlur={(e) => updateLine(idx, { branch_code: String(e.target.value || "").trim() })}
                              placeholder="SUC"
                            />
                          </td>

                          <td className={cls(tradeDocsBodyCell, "text-right")}>
                            <button
                              className={cls(
                                "text-xs rounded border border-slate-200 px-2 py-1 hover:bg-white hover:text-rose-700",
                                !canEdit ? "opacity-60 cursor-not-allowed" : ""
                              )}
                              disabled={!canEdit}
                              onClick={() => removeLine(idx)}
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

            {/* Pie de validación */}
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
      )}
    </CancelShellModal>
  );
}

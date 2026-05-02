"use client";

import React, { useEffect, useMemo, useState } from "react";
import type {
  OtherDocHeader,
  OtherDocType,
  EditorTab,
  JournalLine,
  BranchLite,
  BusinessLineLite,
  CounterpartyLite,
  PaymentRow,
} from "./types";
import { cls, toNum, formatNumber, normalizeIdentifier } from "./helpers";
import { otherDocTypeLabel } from "./helpers";
import {
  tradeDocsTheme,
  tradeDocsHeaderCell,
  tradeDocsHeaderSub,
  tradeDocsBodyCell,
  tradeDocsCellInputBase,
  tradeDocsCellInputRight,
} from "@/app/(workspace)/gestionVentas/docs-tribut-ventas/components/tradeDocs/ui";
import { LabelInline } from "@/app/(workspace)/gestionVentas/docs-tribut-ventas/components/tradeDocs/LabelInline";
import type {
  OriginDocLite,
  OriginSearchFilters,
} from "@/app/(workspace)/gestionVentas/docs-tribut-ventas/components/tradeDocs/types";
import { folioLabel } from "@/app/(workspace)/gestionVentas/docs-tribut-ventas/components/tradeDocs/helpers";
import { OriginDocSearchModal } from "@/app/(workspace)/gestionVentas/components/OriginDocSearchModal";

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  open: boolean;
  onClose: () => void;
  onSaveDraft: () => Promise<void>;
  onRegister: () => Promise<void>;
  saving: boolean;
  canEdit: boolean;
  isNew: boolean;
  readOnly: boolean;

  header: OtherDocHeader;
  setHeader: React.Dispatch<React.SetStateAction<OtherDocHeader>>;

  journalLines: JournalLine[];
  setJournalLines: React.Dispatch<React.SetStateAction<JournalLine[]>>;

  /** Formas de pago en memoria */
  payments: PaymentRow[];
  onAddPayment: () => void;
  onRemovePayment: (id: string) => void;
  onUpdatePayment: (id: string, patch: Partial<PaymentRow>) => void;

  activeTab: EditorTab;
  setActiveTab: React.Dispatch<React.SetStateAction<EditorTab>>;

  moneyDecimals: number;
  baseCurrency: string;
  branches: BranchLite[];
  businessLines: BusinessLineLite[];
  accByCode: Record<string, { id: string; code: string; name: string }>;

  counterpartyMap: Record<string, CounterpartyLite>;
  onCreateCounterparty?: (identifier: string) => void;

  originSearchResults: OriginDocLite[];
  originSearchLoading: boolean;
  originSearchLoadingMore: boolean;
  originSearchHasMore: boolean;
  onSearchOrigin: (filters: OriginSearchFilters) => void;
  onLoadMoreOrigin: () => Promise<void>;
  onPickOrigin: (doc: OriginDocLite) => void;
  onClearOrigin: () => void;
  /** Doc de origen ya cargado al abrir (para devoluciones existentes) */
  initialPickedOriginDoc?: OriginDocLite | null;

  /** Modo automático del asiento: true = AUTO (calculado), false = MANUAL (editado) */
  journalAutoMode: boolean;
  /** Vuelve al modo AUTO y recalcula el asiento */
  recalcJournalAuto: () => void;
  /** Llamar cuando el usuario edita manualmente una línea del asiento */
  onSwitchToManual: () => void;
  /** Políticas de segmentación: require_suc / require_cu por código de cuenta */
  accountPolicyByCode: Record<string, { require_suc: boolean; require_cu: boolean }>;
  /** Mensaje inline dentro del modal (errores de guardado / registro) */
  modalMsg?: { level: "error" | "success"; text: string } | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DOC_TYPES: { value: OtherDocType; label: string }[] = [
  { value: "OTRO_INGRESO", label: "OTRO INGRESO" },
  { value: "DEVOLUCION",   label: "DEVOLUCIÓN" },
];

const EMPTY_ORIGIN_FILTERS: OriginSearchFilters = {
  fiscal_doc_code: "",
  folio: "",
  issue_date_from: "",
  issue_date_to: "",
  only_open_balance: false,
  only_vigente: true,
};

function isLevel4Account(code: string): boolean {
  const c = String(code || "").trim();
  if (!c) return false;
  if (c.includes(".")) return (c.match(/\./g) || []).length >= 3;
  if (/^\d+$/.test(c)) return c.length >= 7;
  return true;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function OtherDocEditorModal({
  open, onClose, onSaveDraft, onRegister, saving, canEdit, isNew, readOnly,
  header, setHeader, journalLines, setJournalLines,
  payments, onAddPayment, onRemovePayment, onUpdatePayment,
  activeTab, setActiveTab,
  moneyDecimals, baseCurrency, branches, businessLines, accByCode,
  counterpartyMap, onCreateCounterparty,
  originSearchResults, originSearchLoading, originSearchLoadingMore, originSearchHasMore,
  onSearchOrigin, onLoadMoreOrigin, onPickOrigin, onClearOrigin,
  initialPickedOriginDoc,
  journalAutoMode, recalcJournalAuto, onSwitchToManual,
  accountPolicyByCode,
  modalMsg,
}: Props) {

  const isReturn   = header.doc_type === "DEVOLUCION";
  const disabled   = readOnly || !canEdit;
  const isViewMode = readOnly;

  const [originSearchModalOpen, setOriginSearchModalOpen] = useState(false);
  const [originSearchFilters, setOriginSearchFilters] = useState<OriginSearchFilters>(EMPTY_ORIGIN_FILTERS);
  // Stores the last picked origin doc so we can show it in a table
  const [pickedOriginDoc, setPickedOriginDoc] = useState<OriginDocLite | null>(initialPickedOriginDoc ?? null);

  // ── Branch text-input ────────────────────────────────────────────────────
  const [branchCodeInput, setBranchCodeInput] = useState("");

  useEffect(() => {
    if (!open) return;
    const found = branches.find((b) => b.id === header.branch_id);
    setBranchCodeInput(found?.code || "");
    setOriginSearchModalOpen(false);
    setOriginSearchFilters(EMPTY_ORIGIN_FILTERS);
    // Sync picked origin doc from prop (for existing DEVOLUCION records) or clear it
    if (initialPickedOriginDoc) setPickedOriginDoc(initialPickedOriginDoc);
    else if (!header.origin_doc_id) setPickedOriginDoc(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, header.branch_id, initialPickedOriginDoc]);

  // Auto-search cuando el modal de búsqueda de origen se abre
  useEffect(() => {
    if (originSearchModalOpen) {
      onSearchOrigin(originSearchFilters);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originSearchModalOpen]);

  // ── Derived lists ────────────────────────────────────────────────────────

  const branchList = useMemo(
    () =>
      [...branches]
        .filter((b) => b.is_active)
        .sort((a, b) => {
          if (a.is_default && !b.is_default) return -1;
          if (!a.is_default && b.is_default) return 1;
          return `${a.code} ${a.name}`.localeCompare(`${b.code} ${b.name}`);
        }),
    [branches]
  );

  const activeBusinessLines = useMemo(
    () =>
      businessLines
        .filter((b) => b.is_active)
        .sort((a, b) => a.code.localeCompare(b.code)),
    [businessLines]
  );

  const level4Accounts = useMemo(
    () =>
      Object.values(accByCode)
        .filter((a) => isLevel4Account(a.code))
        .sort((a, b) => a.code.localeCompare(b.code, "es", { numeric: true })),
    [accByCode]
  );

  // ── Payment summary ───────────────────────────────────────────────────────

  const paymentSummary = useMemo(() => {
    const total    = payments.reduce((s, p) => s + toNum(p.amount), 0);
    const docTotal = toNum(header.grand_total);
    const balance  = docTotal - total;
    return { total, balance, docTotal, hasPayments: payments.some((p) => toNum(p.amount) > 0) };
  }, [payments, header.grand_total]);

  // ── Journal summary ───────────────────────────────────────────────────────

  const journalSummary = useMemo(() => {
    const used = journalLines.filter(
      (l) => String(l.account_code || "").trim() || Number(l.debit) || Number(l.credit)
    );
    const debit  = used.reduce((s, l) => s + toNum(l.debit),  0);
    const credit = used.reduce((s, l) => s + toNum(l.credit), 0);
    const diff   = Math.abs(debit - credit);

    // Segmentación: detectar líneas con cuentas que exigen SUC/CU pero no lo tienen
    const missingSucRows: number[] = [];
    const missingCuRows:  number[] = [];
    used.forEach((l, i) => {
      const code = String(l.account_code || "").trim().toUpperCase();
      if (!code) return;
      const pol = accountPolicyByCode[code];
      if (!pol) return;
      if (pol.require_suc && !String(l.branch_code || "").trim()) missingSucRows.push(i);
      if (pol.require_cu  && !String(l.business_line_code || "").trim()) missingCuRows.push(i);
    });

    const hasSegmentErrors = missingSucRows.length > 0 || missingCuRows.length > 0;

    return {
      debit, credit, diff,
      isBalanced: diff < 0.5,
      hasData: used.length > 0,
      missingSucRows, missingCuRows, hasSegmentErrors,
    };
  }, [journalLines, accountPolicyByCode]);

  function handlePickFromSearchModal(doc: OriginDocLite) {
    handlePickOriginInternal(doc);
  }

  // ── Counterparty lookup ───────────────────────────────────────────────────

  const cpKey = useMemo(
    () => normalizeIdentifier(header.counterparty_identifier || "").toUpperCase(),
    [header.counterparty_identifier]
  );

  const counterpartyStatus = useMemo(() => {
    if (!cpKey) return "empty" as const;
    return counterpartyMap[cpKey] ? ("found" as const) : ("not_found" as const);
  }, [cpKey, counterpartyMap]);

  // ── Header errors (para badge en tab CABECERA) ────────────────────────────

  const headerErrors = useMemo(() => {
    const errs: string[] = [];
    if (!header.issue_date) errs.push("Fecha de emisión");
    if (!String(header.counterparty_identifier || "").trim()) errs.push("RUT/ID contraparte");
    if (counterpartyStatus === "not_found") errs.push("Contraparte no registrada");
    if (!(Number(header.grand_total) > 0)) errs.push("Total debe ser mayor a 0");
    return errs;
  }, [header.issue_date, header.counterparty_identifier, header.grand_total, counterpartyStatus]);

  function handleIdentifierBlur() {
    if (!cpKey) return;
    const cp = counterpartyMap[cpKey];
    if (cp) {
      setHeader((h) => ({
        ...h,
        counterparty_id:   cp.id,
        counterparty_name: cp.name,
      }));
    } else {
      setHeader((h) => ({ ...h, counterparty_id: null }));
    }
  }

  // ── Branch resolution ─────────────────────────────────────────────────────

  function handleBranchBlur(raw: string) {
    const code = raw.trim();
    setBranchCodeInput(code);
    const found = branchList.find(
      (b) => b.code.toUpperCase() === code.toUpperCase()
    );
    setHeader((h) => ({ ...h, branch_id: found?.id || "" }));
  }

  // ── Origin pick wrapper ───────────────────────────────────────────────────

  function handlePickOriginInternal(doc: OriginDocLite) {
    setPickedOriginDoc(doc);
    onPickOrigin(doc);
    setOriginSearchModalOpen(false);
  }

  function handleClearOriginInternal() {
    setPickedOriginDoc(null);
    onClearOrigin();
  }

  // ── Datalist IDs ──────────────────────────────────────────────────────────

  const journalAccountListId = "dl-otherdoc-accounts";
  const branchDatalistId     = "dl-otherdoc-branches";
  const buDatalistId         = "dl-otherdoc-bu";

  // ── Journal line helpers ──────────────────────────────────────────────────

  function updateLine(idx: number, patch: Partial<JournalLine>) {
    onSwitchToManual();
    setJournalLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }
  function addLine() {
    onSwitchToManual();
    setJournalLines((prev) => [
      ...prev,
      {
        line_no: prev.length + 1,
        account_code: "", description: "",
        debit: "0", credit: "0",
        cost_center_id: null, business_line_id: null, branch_id: null,
        cost_center_code: "", business_line_code: "", branch_code: "",
      },
    ]);
  }
  function removeLine(idx: number) {
    onSwitchToManual();
    setJournalLines((prev) =>
      prev.filter((_, i) => i !== idx).map((l, i) => ({ ...l, line_no: i + 1 }))
    );
  }

  // ── Arrow-key grid navigation ─────────────────────────────────────────────

  function focusGridCell(row: number, col: number) {
    if (row < 0 || col < 0) return;
    const el = document.querySelector(
      `[data-grid="asiento"][data-row="${row}"][data-col="${col}"]`
    ) as HTMLElement | null;
    if (!el) return;
    el.focus();
    if (el instanceof HTMLInputElement) {
      try { const len = el.value?.length ?? 0; el.setSelectionRange(len, len); } catch {}
    }
  }

  function handleGridKeyDown(
    e: React.KeyboardEvent<HTMLInputElement>,
    row: number,
    col: number
  ) {
    if      (e.key === "ArrowRight") { e.preventDefault(); focusGridCell(row, col + 1); }
    else if (e.key === "ArrowLeft")  { e.preventDefault(); focusGridCell(row, col - 1); }
    else if (e.key === "ArrowDown")  { e.preventDefault(); focusGridCell(row + 1, col); }
    else if (e.key === "ArrowUp")    { e.preventDefault(); focusGridCell(row - 1, col); }
  }

  // ── Guard ─────────────────────────────────────────────────────────────────

  if (!open) return null;

  // Shared input style — idéntico al módulo de referencia
  const fi =
    "mt-1 w-full rounded-lg border px-2 py-2 text-sm " +
    "disabled:bg-slate-50 disabled:text-slate-500";

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/45" onClick={onClose} />
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(1200px,96vw)]">
        <div className="flex h-[min(84vh,780px)] flex-col overflow-hidden rounded-[22px] bg-white shadow-xl ring-1 ring-black/5">

          {/* ── Header ──────────────────────────────────────────────────── */}
          <div className={cls("relative px-5 py-4", tradeDocsTheme.header)}>
            <div className={tradeDocsTheme.glowA} />
            <div className={tradeDocsTheme.glowB} />
            <div className="relative flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-extrabold uppercase text-white/80">
                  {isViewMode ? "Ventas \u2022 Consulta" : "Ventas \u2022 Editor"}
                </div>
                <h3 className="truncate text-lg font-black text-white">
                  {isNew ? "Nuevo documento" : isViewMode ? "Ver documento" : "Editar documento"}
                </h3>
              </div>
              <button
                className="ml-3 rounded-xl px-3 py-1.5 text-sm font-extrabold text-white/90 hover:bg-white/10"
                onClick={onClose}
                title="Cerrar"
                type="button"
              >
                ✕
              </button>
            </div>
          </div>

          {/* ── Scrollable body ──────────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden p-5">

            {/* Pill tabs */}
            <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-2">
              <div className="flex flex-wrap gap-2">
                {(["CABECERA", "PAGOS", "ASIENTO"] as EditorTab[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setActiveTab(t)}
                    className={cls(
                      "rounded-2xl px-4 py-2 text-[12px] font-extrabold transition ring-1",
                      activeTab === t
                        ? "bg-slate-900 text-white ring-slate-900"
                        : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
                    )}
                  >
                    {t === "CABECERA" ? (
                      <>
                        Cabecera
                        {headerErrors.length > 0 && (
                          <span className="ml-1 text-rose-400" title={headerErrors.join(" · ")}>&#9651;</span>
                        )}
                      </>
                    ) : t === "PAGOS" ? (
                      <>
                        Formas de pago
                        {paymentSummary.hasPayments && (
                          <span className="ml-1 text-emerald-400">●</span>
                        )}
                      </>
                    ) : (
                      <>
                        Asiento contable
                        {journalSummary.hasData && (!journalSummary.isBalanced || journalSummary.hasSegmentErrors) && (
                          <span className="ml-1 text-rose-400">&#9651;</span>
                        )}
                      </>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* ═══════════════════ CABECERA ═══════════════════ */}
            {activeTab === "CABECERA" ? (
              <div className="space-y-4">
                <div className={tradeDocsTheme.card}>

                  {/* Card title */}
                  <div className="px-4 py-3 border-b">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">Cabecera</div>
                        <div className="text-[11px] text-slate-500">Datos generales del documento.</div>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Moneda base: <b className="text-slate-700">{baseCurrency}</b>
                      </div>
                    </div>
                  </div>

                  <div className="px-4 py-3 grid grid-cols-1 md:grid-cols-4 gap-3">

                    {/* ─ Row 1: Tipo | Emisión | Vencimiento | Moneda ─ */}
                    <div className="md:col-span-4">
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-3">

                        {/* Tipo documento */}
                        <div className="md:col-span-3">
                          <LabelInline label="Tipo documento" field="doc_type" />
                          <select
                            className={fi}
                            disabled={disabled}
                            value={header.doc_type}
                            onChange={(e) =>
                              setHeader((h) => ({ ...h, doc_type: e.target.value as OtherDocType }))
                            }
                          >
                            {DOC_TYPES.map((d) => (
                              <option key={d.value} value={d.value}>{d.label}</option>
                            ))}
                          </select>
                        </div>

                        {/* Emisión */}
                        <div className="md:col-span-3">
                          <LabelInline label="Emisión" field="issue_date" />
                          <input
                            type="date"
                            className={fi}
                            disabled={disabled}
                            value={header.issue_date}
                            onChange={(e) => setHeader((h) => ({ ...h, issue_date: e.target.value }))}
                          />
                        </div>

                        {/* Vencimiento */}
                        <div className="md:col-span-3">
                          <LabelInline label="Vencimiento" field="due_date" />
                          <input
                            type="date"
                            className={fi}
                            disabled={disabled}
                            value={header.due_date}
                            onChange={(e) => setHeader((h) => ({ ...h, due_date: e.target.value }))}
                          />
                        </div>

                        {/* Moneda */}
                        <div className="md:col-span-3">
                          <LabelInline label="Moneda" field="currency_code" />
                          <input
                            className={fi}
                            disabled={disabled}
                            value={header.currency_code}
                            onChange={(e) =>
                              setHeader((h) => ({
                                ...h,
                                currency_code: e.target.value.toUpperCase(),
                              }))
                            }
                            placeholder={baseCurrency}
                          />
                        </div>
                      </div>
                    </div>

                    {/* ─ Row 2: Sucursal | Número | Referencia ─ */}
                    <div className="md:col-span-4">
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-3">

                        {/* Sucursal — text input + datalist */}
                        <div className="md:col-span-3">
                          <LabelInline label="Sucursal" field="branch_id" />
                          <datalist id={branchDatalistId}>
                            {branchList.map((b) => (
                              <option key={b.id} value={b.code}>{b.name}</option>
                            ))}
                          </datalist>
                          <input
                            className={fi}
                            disabled={disabled}
                            value={branchCodeInput}
                            list={branchDatalistId}
                            onChange={(e) => setBranchCodeInput(e.target.value)}
                            onBlur={(e) => handleBranchBlur(e.target.value)}
                            placeholder="Codigo sucursal"
                          />
                          <div className="mt-1 text-[11px] text-slate-500 truncate">
                            {branchCodeInput.trim()
                              ? branchList.find(
                                  (b) =>
                                    b.code.toUpperCase() === branchCodeInput.trim().toUpperCase()
                                )?.name || "\u2014"
                              : "\u2014"}
                          </div>
                        </div>

                        {/* Número */}
                        <div className="md:col-span-5">
                          <LabelInline label="Número / Correlativo" field="number" />
                          <input
                            className={fi}
                            disabled={disabled}
                            value={header.number}
                            onChange={(e) => setHeader((h) => ({ ...h, number: e.target.value }))}
                            placeholder="000123 / UUID / Folio"
                          />
                        </div>

                        {/* Referencia */}
                        <div className="md:col-span-4">
                          <LabelInline label="Referencia" field="reference" />
                          <input
                            className={fi}
                            disabled={disabled}
                            value={header.reference}
                            onChange={(e) => setHeader((h) => ({ ...h, reference: e.target.value }))}
                            placeholder="OC-123 / Pedido-456"
                          />
                        </div>
                      </div>
                    </div>

                    {/* ─ Row 3: RUT/NIT | Nombre | Monto ─ */}

                    {/* RUT/NIT/RFC — no border color change, "Crear" button on not-found */}
                    <div>
                      <LabelInline label="RUT / NIT / RFC" field="counterparty_identifier" />
                      {(() => {
                        const raw   = header.counterparty_identifier || "";
                        const found = counterpartyStatus === "found";
                        return (
                          <>
                            <div className="mt-1 flex items-center gap-2">
                              <input
                                className="w-full rounded-lg border px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-[#123b63]/30 focus:border-[#123b63] disabled:bg-slate-50 disabled:text-slate-500"
                                disabled={disabled}
                                value={raw}
                                onChange={(e) =>
                                  setHeader((h) => ({
                                    ...h,
                                    counterparty_identifier: e.target.value,
                                    counterparty_id: null,
                                  }))
                                }
                                onBlur={handleIdentifierBlur}
                                placeholder="Identificador"
                              />
                              {/* "Crear" button when not found — same as TradeDocEditorModal */}
                              {!disabled && raw.trim() && !found && (
                                <button
                                  type="button"
                                  className="shrink-0 rounded-lg border px-3 py-2 text-sm hover:bg-slate-50"
                                  onClick={() =>
                                    onCreateCounterparty
                                      ? onCreateCounterparty(raw)
                                      : window.open("/gestionVentas/clientes", "_blank")
                                  }
                                  title="Registrar contraparte"
                                >
                                  Crear
                                </button>
                              )}
                            </div>
                          </>
                        );
                      })()}
                    </div>

                    {/* Nombre titular */}
                    <div className="md:col-span-2">
                      <LabelInline label="Nombre titular" field="counterparty_name" />
                      <input
                        className={fi}
                        disabled={disabled}
                        value={header.counterparty_name}
                        onChange={(e) =>
                          setHeader((h) => ({ ...h, counterparty_name: e.target.value }))
                        }
                        placeholder="Razon social"
                      />
                    </div>

                    {/* Total documento — same row as Nombre */}
                    <div className="md:col-span-1">
                      <LabelInline
                        label={isReturn ? "Monto devolución" : "Total documento"}
                        field="grand_total"
                      />
                      <input
                        type="number"
                        className={cls(
                          "mt-1 w-full rounded-lg border px-2 py-2 text-right text-base font-semibold",
                          "outline-none focus:ring-2 focus:ring-[#123b63]/30 focus:border-[#123b63]",
                          "disabled:bg-slate-50 disabled:text-slate-500"
                        )}
                        disabled={disabled}
                        value={header.grand_total}
                        onChange={(e) => setHeader((h) => ({ ...h, grand_total: e.target.value }))}
                        placeholder="0"
                        min="0"
                        step="1"
                        inputMode="decimal"
                      />
                      {Number(header.grand_total) > 0 && (
                        <div className="mt-1 text-[11px] text-slate-500">
                          {formatNumber(Number(header.grand_total), moneyDecimals)}{" "}
                          {header.currency_code || baseCurrency}
                        </div>
                      )}
                    </div>

                  </div>

                  {/* ─ Documento origen — solo DEVOLUCION ────────────────── */}
                  {isReturn && (
                    <div className="px-4 pb-4">
                      <div className="rounded-2xl border bg-slate-50 p-4">

                        {/* Section header + buttons */}
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-slate-900">
                              Documento origen (para devoluciones)
                            </div>
                            <div className="text-[11px] text-slate-600">
                              La nota solo puede afectar documentos del mismo RUT/ID de la cabecera.
                            </div>
                          </div>

                          <div className="flex gap-2">
                            <button
                              type="button"
                              className={cls(
                                tradeDocsTheme.btnSoft,
                                (disabled || !header.counterparty_identifier.trim()) &&
                                  "opacity-60 cursor-not-allowed"
                              )}
                              disabled={disabled || !header.counterparty_identifier.trim()}
                              onClick={() => setOriginSearchModalOpen(true)}
                            >
                              {header.origin_doc_id ? "Cambiar documento" : "Buscar documento"}
                            </button>

                            {!header.counterparty_identifier.trim() && !disabled ? (
                              <div className="mt-2 text-[11px] text-amber-700">
                                Primero debes ingresar el RUT/ID de la contraparte para habilitar la búsqueda del documento origen.
                              </div>
                            ) : null}

                            {header.origin_doc_id && !disabled ? (
                              <button
                                type="button"
                                className={cls(
                                  tradeDocsTheme.btnSoft,
                                  "hover:bg-white hover:text-rose-700"
                                )}
                                onClick={handleClearOriginInternal}
                              >
                                Quitar
                              </button>
                            ) : null}
                          </div>
                        </div>

                        {/* No origin selected */}
                        {!header.origin_doc_id ? (
                          <div className="mt-3 rounded-xl border border-dashed bg-white px-4 py-4 text-sm text-slate-500">
                            Sin documento origen asignado.
                          </div>
                        ) : (
                          /* Origin selected — table display like TradeDocEditorModal */
                          <div className="mt-3 rounded-xl border bg-white overflow-hidden">
                            <div className="border-t border-slate-200 overflow-x-hidden">
                              <div className="overflow-hidden">
                                <table className="w-full table-fixed border-collapse text-sm">
                                  <colgroup>
                                    <col style={{ width: "10%" }} />
                                    <col style={{ width: "10%" }} />
                                    <col style={{ width: "14%" }} />
                                    <col style={{ width: "22%" }} />
                                    <col style={{ width: "16%" }} />
                                    <col style={{ width: "14%" }} />
                                    <col style={{ width: "14%" }} />
                                  </colgroup>
                                  <thead>
                                    <tr>
                                      <th className={tradeDocsHeaderCell}>
                                        <b>Emisi\u00f3n</b>
                                        <span className={tradeDocsHeaderSub}>issue_date</span>
                                      </th>
                                      <th className={tradeDocsHeaderCell}>
                                        <b>Tipo doc</b>
                                        <span className={tradeDocsHeaderSub}>doc_type</span>
                                      </th>
                                      <th className={tradeDocsHeaderCell}>
                                        <b>C\u00f3d. tributario</b>
                                        <span className={tradeDocsHeaderSub}>fiscal_doc_code</span>
                                      </th>
                                      <th className={tradeDocsHeaderCell}>
                                        <b>Folio / N\u00famero</b>
                                        <span className={tradeDocsHeaderSub}>series + number</span>
                                      </th>
                                      <th className={tradeDocsHeaderCell}>
                                        <b>RUT / ID</b>
                                        <span className={tradeDocsHeaderSub}>counterparty</span>
                                      </th>
                                      <th className={cls(tradeDocsHeaderCell, "text-right")}>
                                        <b>Total</b>
                                        <span className={tradeDocsHeaderSub}>grand_total</span>
                                      </th>
                                      <th className={cls(tradeDocsHeaderCell, "text-right")}>
                                        <b>Saldo</b>
                                        <span className={tradeDocsHeaderSub}>balance</span>
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    <tr className="bg-slate-50/80 hover:bg-sky-50/30">
                                      <td className={cls(tradeDocsBodyCell, "text-xs")}>
                                        {pickedOriginDoc?.issue_date || "\u2014"}
                                      </td>
                                      <td className={cls(tradeDocsBodyCell, "font-semibold text-slate-700 text-xs")}>
                                        {pickedOriginDoc?.doc_type || "\u2014"}
                                      </td>
                                      <td className={cls(tradeDocsBodyCell, "font-semibold text-sky-700 text-xs")}>
                                        {pickedOriginDoc?.fiscal_doc_code || "\u2014"}
                                      </td>
                                      <td className={tradeDocsBodyCell}>
                                        <div className="truncate font-medium" title={header.origin_label || ""}>
                                          {pickedOriginDoc
                                            ? folioLabel(pickedOriginDoc.series ?? undefined, pickedOriginDoc.number ?? undefined)
                                            : header.origin_label || "\u2014"}
                                        </div>
                                      </td>
                                      <td className={cls(tradeDocsBodyCell, "text-xs")}>
                                        {pickedOriginDoc?.counterparty_identifier || "\u2014"}
                                      </td>
                                      <td className={cls(tradeDocsBodyCell, "text-right font-semibold")}>
                                        {pickedOriginDoc?.grand_total != null
                                          ? formatNumber(Number(pickedOriginDoc.grand_total), moneyDecimals)
                                          : "\u2014"}
                                      </td>
                                      <td className={cls(tradeDocsBodyCell, "text-right font-semibold",
                                        pickedOriginDoc?.balance != null && pickedOriginDoc.balance > 0
                                          ? "text-emerald-700"
                                          : "text-slate-700"
                                      )}>
                                        {pickedOriginDoc?.balance != null
                                          ? formatNumber(Number(pickedOriginDoc.balance), moneyDecimals)
                                          : "\u2014"}
                                      </td>
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                            </div>
                            <div className="border-t bg-amber-50 px-4 py-2 text-[11px] text-amber-900">
                              La devolucion afectara el saldo del documento origen seleccionado.
                            </div>
                          </div>
                        )}


                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {/* ═══════════════════ PAGOS ═══════════════════ */}
            {activeTab === "PAGOS" ? (
              <div className={tradeDocsTheme.card}>

                <div className="px-4 py-3 border-b flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="font-semibold text-slate-900">Formas de pago</h2>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Registra los pagos recibidos. El documento puede nacer ya pagado.
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {paymentSummary.hasPayments && (
                      <span className="text-sm text-slate-700">
                        <b>Pagado:</b>{" "}
                        {formatNumber(paymentSummary.total, moneyDecimals)}
                        <span className="mx-2 text-slate-300">|</span>
                        <b className={paymentSummary.balance < -0.5 ? "text-rose-700" : paymentSummary.balance < 0.5 ? "text-emerald-700" : ""}>
                          Saldo: {formatNumber(paymentSummary.balance, moneyDecimals)}
                        </b>
                      </span>
                    )}
                    {!disabled && (
                      <button
                        type="button"
                        className={tradeDocsTheme.btnPrimary}
                        onClick={onAddPayment}
                      >
                        + Forma
                      </button>
                    )}
                  </div>
                </div>

                {/* Tabla de pagos */}
                <div className="border-t border-slate-200 overflow-x-hidden">
                  <div className="overflow-hidden">
                    <table className="w-full table-fixed border-collapse text-sm">
                      <colgroup>
                        <col style={{ width: "14%" }} />
                        <col style={{ width: "15%" }} />
                        <col style={{ width: "28%" }} />
                        <col style={{ width: "14%" }} />
                        <col style={{ width: "22%" }} />
                        <col style={{ width: "7%" }} />
                      </colgroup>
                      <thead>
                        <tr>
                          <th className={tradeDocsHeaderCell}><b>Fecha</b><span className={tradeDocsHeaderSub}>payment_date</span></th>
                          <th className={tradeDocsHeaderCell}><b>Método</b><span className={tradeDocsHeaderSub}>method</span></th>
                          <th className={tradeDocsHeaderCell}><b>Tarjeta</b><span className={tradeDocsHeaderSub}>tipo/4dig/aut</span></th>
                          <th className={cls(tradeDocsHeaderCell, "text-right")}><b>Monto</b><span className={tradeDocsHeaderSub}>amount</span></th>
                          <th className={tradeDocsHeaderCell}><b>Referencia</b><span className={tradeDocsHeaderSub}>reference</span></th>
                          <th className={cls(tradeDocsHeaderCell, "text-right")}><span className={tradeDocsHeaderSub}>&nbsp;</span></th>
                        </tr>
                      </thead>
                    </table>
                  </div>

                  <div className="max-h-[340px] overflow-y-auto overflow-x-hidden">
                    <table className="w-full table-fixed border-collapse text-sm">
                      <colgroup>
                        <col style={{ width: "14%" }} />
                        <col style={{ width: "15%" }} />
                        <col style={{ width: "28%" }} />
                        <col style={{ width: "14%" }} />
                        <col style={{ width: "22%" }} />
                        <col style={{ width: "7%" }} />
                      </colgroup>
                      <tbody>
                        {payments.length === 0 ? (
                          <tr>
                            <td className="p-4 text-sm text-slate-600" colSpan={6}>
                              <b>Crédito</b> (sin formas de pago registradas).
                            </td>
                          </tr>
                        ) : (
                          payments.map((p, idx) => {
                            const rowBg = idx % 2 === 0 ? "bg-slate-50/80" : "bg-slate-100/50";
                            const isCard = p.method === "TARJETA";
                            return (
                              <tr key={p.id} className={cls(rowBg, "hover:bg-sky-50/30")}>
                                {/* Fecha */}
                                <td className={tradeDocsBodyCell}>
                                  <input
                                    type="date"
                                    className={cls(tradeDocsCellInputBase, "h-[30px]")}
                                    disabled={disabled}
                                    value={p.payment_date}
                                    onChange={(e) => onUpdatePayment(p.id, { payment_date: e.target.value })}
                                  />
                                </td>
                                {/* Método */}
                                <td className={tradeDocsBodyCell}>
                                  <select
                                    className={cls(tradeDocsCellInputBase, "h-[30px]")}
                                    disabled={disabled}
                                    value={p.method}
                                    onChange={(e) =>
                                      onUpdatePayment(p.id, {
                                        method: e.target.value as PaymentRow["method"],
                                        card_kind: "",
                                        card_last4: "",
                                        auth_code: "",
                                      })
                                    }
                                  >
                                    <option value="EFECTIVO">EFECTIVO</option>
                                    <option value="TRANSFERENCIA">TRANSFERENCIA</option>
                                    <option value="TARJETA">TARJETA</option>
                                    <option value="CHEQUE">CHEQUE</option>
                                    <option value="OTRO">OTRO</option>
                                  </select>
                                </td>
                                {/* Tarjeta (solo si método=TARJETA) */}
                                <td className={tradeDocsBodyCell}>
                                  {isCard ? (
                                    <div className="grid grid-cols-3 gap-1">
                                      <select
                                        className={cls(tradeDocsCellInputBase, "h-[30px]")}
                                        disabled={disabled}
                                        value={p.card_kind}
                                        onChange={(e) => onUpdatePayment(p.id, { card_kind: e.target.value as PaymentRow["card_kind"] })}
                                      >
                                        <option value="">Tipo</option>
                                        <option value="DEBITO">Débito</option>
                                        <option value="CREDITO">Crédito</option>
                                      </select>
                                      <input
                                        className={tradeDocsCellInputBase}
                                        disabled={disabled}
                                        value={p.card_last4}
                                        onChange={(e) => onUpdatePayment(p.id, { card_last4: e.target.value.replace(/\D/g, "").slice(0, 4) })}
                                        placeholder="Últ.4"
                                        maxLength={4}
                                        inputMode="numeric"
                                      />
                                      <input
                                        className={tradeDocsCellInputBase}
                                        disabled={disabled}
                                        value={p.auth_code}
                                        onChange={(e) => onUpdatePayment(p.id, { auth_code: e.target.value })}
                                        placeholder="Aut."
                                      />
                                    </div>
                                  ) : (
                                    <span className="px-1 text-[11px] text-slate-400">—</span>
                                  )}
                                </td>
                                {/* Monto */}
                                <td className={tradeDocsBodyCell}>
                                  <input
                                    type="number"
                                    className={cls(tradeDocsCellInputBase, tradeDocsCellInputRight)}
                                    disabled={disabled}
                                    value={p.amount}
                                    onChange={(e) => onUpdatePayment(p.id, { amount: e.target.value })}
                                    min="0"
                                    step="1"
                                    inputMode="decimal"
                                    placeholder="0"
                                  />
                                </td>
                                {/* Referencia */}
                                <td className={tradeDocsBodyCell}>
                                  <input
                                    className={tradeDocsCellInputBase}
                                    disabled={disabled}
                                    value={p.reference}
                                    onChange={(e) => onUpdatePayment(p.id, { reference: e.target.value })}
                                    placeholder="N° operación / voucher / referencia"
                                  />
                                </td>
                                {/* Eliminar */}
                                <td className={cls(tradeDocsBodyCell, "text-right")}>
                                  <button
                                    type="button"
                                    className={cls(
                                      "rounded border border-slate-200 px-2 py-1 text-xs hover:bg-white hover:text-rose-700",
                                      disabled && "cursor-not-allowed opacity-60"
                                    )}
                                    disabled={disabled}
                                    onClick={() => onRemovePayment(p.id)}
                                    title="Eliminar fila"
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

                </div>

              </div>
            ) : null}

            {/* ═══════════════════ ASIENTO ═══════════════════ */}
            {activeTab === "ASIENTO" ? (
              <div className={tradeDocsTheme.card}>

                <div className="px-4 py-3 border-b flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold text-slate-900">Distribución contable</h2>
                    <span
                      className={cls(
                        "inline-flex items-center rounded-full px-3 py-1 text-xs font-bold",
                        journalAutoMode
                          ? "bg-sky-100 text-sky-800"
                          : "bg-amber-100 text-amber-900"
                      )}
                    >
                      {journalAutoMode ? "AUTO" : "MANUAL"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {!journalAutoMode && !disabled && (
                      <button
                        type="button"
                        className={cls(tradeDocsTheme.btnSoft, "text-sky-700 border-sky-200 hover:bg-sky-50")}
                        onClick={recalcJournalAuto}
                        title="Vuelve al asiento automático calculado desde los pagos y el total del documento."
                      >
                        Volver a automático
                      </button>
                    )}
                    {!disabled && (
                      <button
                        type="button"
                        className={tradeDocsTheme.btnPrimary}
                        onClick={addLine}
                      >
                        + Línea
                      </button>
                    )}
                  </div>
                </div>

                {/* Summary */}
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
                        <>
                          Descuadre:{" "}
                          <b className="ml-1">{formatNumber(journalSummary.diff, moneyDecimals)}</b>
                        </>
                      )}
                    </span>
                    {journalSummary.hasData && !journalSummary.isBalanced && (
                      <span className="font-medium text-rose-700">
                        {journalSummary.debit > journalSummary.credit
                          ? "El Debe es mayor que el Haber."
                          : "El Haber es mayor que el Debe."}
                      </span>
                    )}
                    {journalSummary.missingSucRows.length > 0 && (
                      <span className="font-medium text-rose-700">
                        {`Hay ${journalSummary.missingSucRows.length} línea(s) con cuentas que exigen sucursal (SUC) y no la tienen.`}
                      </span>
                    )}
                    {journalSummary.missingCuRows.length > 0 && (
                      <span className="font-medium text-rose-700">
                        {`Hay ${journalSummary.missingCuRows.length} línea(s) con cuentas que exigen centro de utilidad (CU) y no lo tienen.`}
                      </span>
                    )}
                  </div>
                </div>

                {/* Datalists */}
                <datalist id={journalAccountListId}>
                  {level4Accounts.map((a) => (
                    <option key={a.id} value={a.code}>{a.name}</option>
                  ))}
                </datalist>
                <datalist id={branchDatalistId}>
                  {branchList.map((b) => (
                    <option key={b.id} value={b.code}>{b.name}</option>
                  ))}
                </datalist>
                <datalist id={buDatalistId}>
                  {activeBusinessLines.map((b) => (
                    <option key={b.id} value={b.code}>{b.name}</option>
                  ))}
                </datalist>

                {/* Table */}
                <div className="border-t border-slate-200 overflow-x-hidden">
                  <div className="overflow-hidden">
                    <table className="w-full table-fixed border-collapse text-sm">
                      <colgroup>
                        <col style={{ width: "5%"  }} />
                        <col style={{ width: "16%" }} />
                        <col style={{ width: "30%" }} />
                        <col style={{ width: "12%" }} />
                        <col style={{ width: "12%" }} />
                        <col style={{ width: "11%" }} />
                        <col style={{ width: "10%" }} />
                        <col style={{ width: "4%"  }} />
                      </colgroup>
                      <thead>
                        <tr>
                          <th className={tradeDocsHeaderCell}>N°<span className={tradeDocsHeaderSub}>line_no</span></th>
                          <th className={tradeDocsHeaderCell}><b>Cuenta</b><span className={tradeDocsHeaderSub}>account_code</span></th>
                          <th className={tradeDocsHeaderCell}><b>Glosa</b><span className={tradeDocsHeaderSub}>description</span></th>
                          <th className={cls(tradeDocsHeaderCell, "text-right")}><b>Debe</b><span className={tradeDocsHeaderSub}>debit</span></th>
                          <th className={cls(tradeDocsHeaderCell, "text-right")}><b>Haber</b><span className={tradeDocsHeaderSub}>credit</span></th>
                          <th className={tradeDocsHeaderCell}><b>CU</b><span className={tradeDocsHeaderSub}>bu</span></th>
                          <th className={tradeDocsHeaderCell}><b>SUC</b><span className={tradeDocsHeaderSub}>branch</span></th>
                          <th className={cls(tradeDocsHeaderCell, "text-right")}><span className={tradeDocsHeaderSub}>&nbsp;</span></th>
                        </tr>
                      </thead>
                    </table>
                  </div>

                  <div className="max-h-[380px] overflow-y-auto overflow-x-hidden">
                    <table className="w-full table-fixed border-collapse text-sm">
                      <colgroup>
                        <col style={{ width: "5%"  }} />
                        <col style={{ width: "16%" }} />
                        <col style={{ width: "30%" }} />
                        <col style={{ width: "12%" }} />
                        <col style={{ width: "12%" }} />
                        <col style={{ width: "11%" }} />
                        <col style={{ width: "10%" }} />
                        <col style={{ width: "4%"  }} />
                      </colgroup>
                      <tbody>
                        {journalLines.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="p-4 text-center text-sm text-slate-400">
                              Sin líneas. Haz clic en &ldquo;+ Línea&rdquo; para agregar.
                            </td>
                          </tr>
                        ) : (
                          journalLines.map((l, idx) => {
                            const rowBg = idx % 2 === 0 ? "bg-slate-50/80" : "bg-slate-100/50";
                            const accountCode = String(l.account_code || "").trim().toUpperCase();
                            const pol = accountPolicyByCode[accountCode];
                            const missingSuc = Boolean(
                              journalSummary.hasData && pol?.require_suc && !String(l.branch_code || "").trim()
                            );
                            const missingCu = Boolean(
                              journalSummary.hasData && pol?.require_cu && !String(l.business_line_code || "").trim()
                            );
                            return (
                              <tr key={idx} className={cls(rowBg, "hover:bg-sky-50/30")}>
                                <td className={cls(tradeDocsBodyCell, "text-center text-xs text-slate-500")}>{l.line_no}</td>
                                <td className={tradeDocsBodyCell}>
                                  <input
                                    className={tradeDocsCellInputBase}
                                    disabled={disabled}
                                    value={l.account_code}
                                    list={journalAccountListId}
                                    data-grid="asiento"
                                    data-row={idx}
                                    data-col={0}
                                    onKeyDown={(e) => handleGridKeyDown(e, idx, 0)}
                                    onChange={(e) => updateLine(idx, { account_code: e.target.value })}
                                    onBlur={(e) => updateLine(idx, { account_code: e.target.value.trim() })}
                                    placeholder="Codigo cta."
                                  />
                                  <div className="text-[11px] text-slate-500 truncate">
                                    {l.account_code.trim() ? (
                                      accByCode[l.account_code.trim()]?.name
                                        ? accByCode[l.account_code.trim()].name
                                        : <span className="text-amber-700">no existe</span>
                                    ) : "\u2014"}
                                  </div>
                                </td>
                                <td className={tradeDocsBodyCell}>
                                  <input
                                    className={tradeDocsCellInputBase}
                                    disabled={disabled}
                                    value={l.description}
                                    data-grid="asiento"
                                    data-row={idx}
                                    data-col={1}
                                    onKeyDown={(e) => handleGridKeyDown(e, idx, 1)}
                                    onChange={(e) => updateLine(idx, { description: e.target.value })}
                                    placeholder="Glosa linea"
                                  />
                                </td>
                                <td className={tradeDocsBodyCell}>
                                  <input
                                    className={cls(
                                      tradeDocsCellInputBase, tradeDocsCellInputRight,
                                      journalSummary.hasData && !journalSummary.isBalanced &&
                                        "border-rose-300 bg-rose-50 text-rose-900"
                                    )}
                                    disabled={disabled}
                                    value={l.debit}
                                    data-grid="asiento"
                                    data-row={idx}
                                    data-col={2}
                                    onKeyDown={(e) => handleGridKeyDown(e, idx, 2)}
                                    onChange={(e) => updateLine(idx, { debit: e.target.value })}
                                    inputMode="decimal"
                                    placeholder="0"
                                  />
                                </td>
                                <td className={tradeDocsBodyCell}>
                                  <input
                                    className={cls(
                                      tradeDocsCellInputBase, tradeDocsCellInputRight,
                                      journalSummary.hasData && !journalSummary.isBalanced &&
                                        "border-rose-300 bg-rose-50 text-rose-900"
                                    )}
                                    disabled={disabled}
                                    value={l.credit}
                                    data-grid="asiento"
                                    data-row={idx}
                                    data-col={3}
                                    onKeyDown={(e) => handleGridKeyDown(e, idx, 3)}
                                    onChange={(e) => updateLine(idx, { credit: e.target.value })}
                                    inputMode="decimal"
                                    placeholder="0"
                                  />
                                </td>
                                <td className={tradeDocsBodyCell}>
                                  <input
                                    className={cls(
                                      tradeDocsCellInputBase,
                                      missingCu && "border-rose-300 bg-rose-50 text-rose-900"
                                    )}
                                    disabled={disabled}
                                    value={l.business_line_code}
                                    list={buDatalistId}
                                    data-grid="asiento"
                                    data-row={idx}
                                    data-col={4}
                                    onKeyDown={(e) => handleGridKeyDown(e, idx, 4)}
                                    onChange={(e) => updateLine(idx, { business_line_code: e.target.value })}
                                    onBlur={(e) => updateLine(idx, { business_line_code: e.target.value.trim() })}
                                    placeholder={missingCu ? "⚠ CU requerido" : "CU"}
                                    title={missingCu ? "Esta cuenta exige Centro de Utilidad" : undefined}
                                  />
                                </td>
                                <td className={tradeDocsBodyCell}>
                                  <input
                                    className={cls(
                                      tradeDocsCellInputBase,
                                      missingSuc && "border-rose-300 bg-rose-50 text-rose-900"
                                    )}
                                    disabled={disabled}
                                    value={l.branch_code}
                                    list={branchDatalistId}
                                    data-grid="asiento"
                                    data-row={idx}
                                    data-col={5}
                                    onKeyDown={(e) => handleGridKeyDown(e, idx, 5)}
                                    onChange={(e) => updateLine(idx, { branch_code: e.target.value })}
                                    onBlur={(e) => updateLine(idx, { branch_code: e.target.value.trim() })}
                                    placeholder={missingSuc ? "⚠ SUC requerida" : "SUC"}
                                    title={missingSuc ? "Esta cuenta exige Sucursal" : undefined}
                                  />
                                </td>
                                <td className={cls(tradeDocsBodyCell, "text-right")}>
                                  <button
                                    type="button"
                                    className={cls(
                                      "rounded border border-slate-200 px-2 py-1 text-xs hover:bg-white hover:text-rose-700",
                                      disabled && "cursor-not-allowed opacity-60"
                                    )}
                                    disabled={disabled}
                                    onClick={() => removeLine(idx)}
                                    title="Eliminar linea"
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

                  <div className="border-t bg-white px-4 py-2">
                    {!journalSummary.hasData ? (
                      <div className="text-[11px] text-slate-500">
                        <b>Validacion:</b> cuando el asiento tenga datos, se revisara el cuadre de Debe/Haber.
                      </div>
                    ) : journalSummary.isBalanced ? (
                      <div className="text-[11px] text-emerald-700">
                        <b>Validacion:</b> asiento correcto. No hay errores.
                      </div>
                    ) : (
                      <div className="text-[11px] text-rose-700">
                        <b>Descuadre:</b> diferencia de {formatNumber(journalSummary.diff, moneyDecimals)}.{" "}
                        {journalSummary.debit > journalSummary.credit
                          ? "El Debe es mayor."
                          : "El Haber es mayor."}{" "}
                        <span className="text-rose-600">Corrige antes de registrar.</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : null}

          </div>

          {/* ── Footer ──────────────────────────────────────────────────── */}
          <div className="shrink-0 border-t bg-white/95 px-5 py-3 backdrop-blur">

            {/* Mensaje inline de error / éxito */}
            {modalMsg && (
              <div
                className={cls(
                  "mb-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-sm font-medium",
                  modalMsg.level === "error"
                    ? "border-rose-200 bg-rose-50 text-rose-800"
                    : "border-emerald-200 bg-emerald-50 text-emerald-800"
                )}
              >
                <span className="mt-0.5 shrink-0 text-base leading-none">
                  {modalMsg.level === "error" ? "⚠" : "✓"}
                </span>
                <span>{modalMsg.text}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2">

              <div className="flex flex-wrap gap-2 text-xs text-slate-700">
                <span
                  className={cls(
                    "inline-flex items-center rounded-full px-2 py-0.5 font-semibold",
                    isReturn ? "bg-rose-100 text-rose-900" : "bg-emerald-100 text-emerald-900"
                  )}
                >
                  Tipo: <b className="ml-1">{otherDocTypeLabel(header.doc_type)}</b>
                </span>

                {header.status && (
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-slate-800">
                    Estatus: <b className="ml-1">{header.status}</b>
                  </span>
                )}

                {Number(header.grand_total) > 0 && (
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">
                    Total:{" "}
                    <b className="ml-1">
                      {formatNumber(Number(header.grand_total), moneyDecimals)}{" "}
                      {header.currency_code || baseCurrency}
                    </b>
                  </span>
                )}

                {counterpartyStatus === "not_found" && !readOnly && (
                  <span className="inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 font-semibold text-rose-800">
                    &#9651; Contraparte no registrada
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className={tradeDocsTheme.btnSoft}
                  onClick={onClose}
                  disabled={saving}
                >
                  Cerrar
                </button>

                {!isViewMode && canEdit && (
                  <>
                    <button
                      type="button"
                      className={cls(
                        tradeDocsTheme.btnSoft,
                        saving && "cursor-not-allowed opacity-60"
                      )}
                      disabled={saving}
                      onClick={onSaveDraft}
                    >
                      {saving ? "Guardando..." : "Guardar borrador"}
                    </button>
                    <button
                      type="button"
                      className={cls(
                        tradeDocsTheme.btnPrimary,
                        saving && "cursor-not-allowed opacity-60"
                      )}
                      disabled={saving}
                      onClick={onRegister}
                    >
                      {saving ? "Registrando..." : "Registrar"}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* ── Origin doc search modal (DEVOLUCION) ──────────────────────────── */}
      <OriginDocSearchModal
        open={originSearchModalOpen}
        onClose={() => setOriginSearchModalOpen(false)}
        canEdit={canEdit && !readOnly}
        title="Buscar documento tributario (para Devolución)"
        theme={tradeDocsTheme}
        moneyDecimals={moneyDecimals}
        formatNumber={formatNumber}
        folioLabel={folioLabel}
        headerCell={tradeDocsHeaderCell}
        headerSub={tradeDocsHeaderSub}
        bodyCell={tradeDocsBodyCell}
        filters={originSearchFilters}
        setFilters={setOriginSearchFilters}
        loading={originSearchLoading}
        loadingMore={originSearchLoadingMore}
        hasMore={originSearchHasMore}
        results={originSearchResults}
        onSearch={() => onSearchOrigin(originSearchFilters)}
        onLoadMore={onLoadMoreOrigin}
        onClearFilters={() => setOriginSearchFilters(EMPTY_ORIGIN_FILTERS)}
        onPick={handlePickFromSearchModal}
        onViewDoc={() => {}}
      />
    </div>
  );
}

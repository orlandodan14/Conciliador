"use client";

import React, { useMemo, useState } from "react";
import { PlusCircle, Search, AlertTriangle } from "lucide-react";
import type {
  CobrosHeader,
  CobrosAllocationDraft,
  EditorTab,
  JournalLine,
  BranchLite,
  BusinessLineLite,
  CounterpartyLite,
  DocSearchFilters,
  DocSearchResult,
} from "./types";
import { cls, toNum, formatNumber, normalizeIdentifier } from "./helpers";
import { cobrosTypeLabel, docAllocLabel } from "./helpers";
import CobrosDocSearchModal from "./CobrosDocSearchModal";
import {
  tradeDocsTheme,
  tradeDocsHeaderCell,
  tradeDocsHeaderSub,
  tradeDocsBodyCell,
  tradeDocsCellInputBase,
  tradeDocsCellInputRight,
} from "@/app/(workspace)/gestionVentas/docs-tribut-ventas/components/tradeDocs/ui";
import { LabelInline } from "@/app/(workspace)/gestionVentas/docs-tribut-ventas/components/tradeDocs/LabelInline";

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  open: boolean;
  onClose: () => void;
  onSaveDraft: () => Promise<void>;
  onRegister: () => Promise<void>;
  onCancelDoc?: () => void;
  saving: boolean;
  canEdit: boolean;
  isNew: boolean;
  readOnly: boolean;

  header: CobrosHeader;
  setHeader: React.Dispatch<React.SetStateAction<CobrosHeader>>;

  allocations: CobrosAllocationDraft[];
  onAddAllocation: (draft: CobrosAllocationDraft) => void;
  onRemoveAllocation: (id: string) => void;
  onUpdateAllocationAmount: (id: string, amount: string) => void;

  journalLines: JournalLine[];
  setJournalLines: React.Dispatch<React.SetStateAction<JournalLine[]>>;

  activeTab: EditorTab;
  setActiveTab: React.Dispatch<React.SetStateAction<EditorTab>>;

  moneyDecimals: number;
  baseCurrency: string;
  branches: BranchLite[];
  businessLines: BusinessLineLite[];
  accByCode: Record<string, { id: string; code: string; name: string }>;

  counterpartyMap: Record<string, CounterpartyLite>;
  onCreateCounterparty?: (identifier: string) => void;

  docSearchResults: DocSearchResult[];
  docSearching: boolean;
  onSearchDocs: (filters: DocSearchFilters) => void;
  onAddDocToAllocation: (draft: CobrosAllocationDraft) => void;

  journalAutoMode: boolean;
  recalcJournalAuto: () => void;
  onSwitchToManual: () => void;
  accountPolicyByCode: Record<string, { require_suc: boolean; require_cu: boolean }>;

  modalMsg?: { level: "error" | "success"; text: string } | null;
};

// ─── Clases de input (igual a TradeDocEditorModal) ────────────────────────────

const inputCls = "mt-1 w-full rounded-lg border px-2 py-2 text-sm";
const selectCls = "mt-1 w-full rounded-lg border px-2 py-2 text-sm";

// ─── Colgroup del asiento (idéntico a TradeDocEditorModal) ────────────────────

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

// ─── Componente principal ─────────────────────────────────────────────────────

export default function CobrosEditorModal({
  open, onClose, onSaveDraft, onRegister, onCancelDoc,
  saving, canEdit, isNew, readOnly,
  header, setHeader,
  allocations, onAddAllocation: _onAddAllocation, onRemoveAllocation, onUpdateAllocationAmount,
  journalLines, setJournalLines,
  activeTab, setActiveTab,
  moneyDecimals, baseCurrency, branches, businessLines, accByCode,
  counterpartyMap, onCreateCounterparty: _onCreateCounterparty,
  docSearchResults, docSearching, onSearchDocs, onAddDocToAllocation,
  journalAutoMode, recalcJournalAuto, onSwitchToManual,
  accountPolicyByCode,
  modalMsg,
}: Props) {
  const [docSearchOpen, setDocSearchOpen] = useState(false);

  const canEditLocal = canEdit && !readOnly;
  const isAjuste   = header.cobro_type === "AJUSTE";
  const isAnticipo = header.cobro_type === "ANTICIPO";
  const isTarjeta  = !isAjuste && header.payment_method === "TARJETA";

  const addedDocIds = useMemo(
    () => new Set(allocations.map((a) => a.trade_doc_id)),
    [allocations]
  );

  const totalAllocated = useMemo(
    () => allocations.reduce((s, a) => s + toNum(a.allocated_amount), 0),
    [allocations]
  );
  const cobrosAmount = toNum(header.amount);
  const allocationDiff = Math.abs(cobrosAmount) - totalAllocated;
  const allocationOk = Math.abs(allocationDiff) < 0.01;

  const totalDebit = useMemo(
    () => journalLines.reduce((s, l) => s + toNum(l.debit), 0),
    [journalLines]
  );
  const totalCredit = useMemo(
    () => journalLines.reduce((s, l) => s + toNum(l.credit), 0),
    [journalLines]
  );
  const jeBalanced = Math.abs(totalDebit - totalCredit) < 0.01;

  function handleCounterpartySearch() {
    const key = normalizeIdentifier(header.counterparty_identifier).toUpperCase();
    if (!key) return;
    const found = counterpartyMap[key];
    if (found) {
      setHeader((h) => ({ ...h, counterparty_name: found.name, counterparty_id: found.id }));
    } else {
      setHeader((h) => ({ ...h, counterparty_id: null }));
    }
  }

  function addJournalLine() {
    const nextNo = (journalLines[journalLines.length - 1]?.line_no ?? 0) + 1;
    setJournalLines((ls) => [
      ...ls,
      {
        line_no: nextNo,
        account_code: "",
        description: "",
        debit: "0",
        credit: "0",
        cost_center_id: null,
        business_line_id: null,
        branch_id: null,
        cost_center_code: "",
        business_line_code: "",
        branch_code: "",
      },
    ]);
  }

  function removeJournalLine(idx: number) {
    setJournalLines((ls) => ls.filter((_, i) => i !== idx));
    onSwitchToManual();
  }

  function updateJournalLine(idx: number, patch: Partial<JournalLine>) {
    setJournalLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
    onSwitchToManual();
  }

  if (!open) return null;

  const subtitle = readOnly ? "Ventas · Consulta" : "Ventas · Editor";

  return (
    <>
      {/* ── Overlay ───────────────────────────────────────────────────────────── */}
      <div className="fixed inset-0 z-50">
        <div className="absolute inset-0 bg-black/45" onClick={onClose} />

        {/* ── Shell (mismo tamaño que TradeDocEditorModal) ── */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(1200px,96vw)]">
          <div className="flex h-[min(84vh,780px)] flex-col overflow-hidden rounded-[22px] bg-white shadow-xl ring-1 ring-black/5">

            {/* ── Header oscuro ─────────────────────────────────────────────── */}
            <div className={cls("relative px-5 py-4", tradeDocsTheme.header)}>
              <div className={tradeDocsTheme.glowA} />
              <div className={tradeDocsTheme.glowB} />
              <div className="relative flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] font-extrabold uppercase text-white/80">{subtitle}</div>
                  <h3 className="truncate text-lg font-black text-white">
                    {isNew
                      ? `Nuevo ${cobrosTypeLabel(header.cobro_type)}`
                      : readOnly
                        ? `Ver ${cobrosTypeLabel(header.cobro_type)}`
                        : `Editar ${cobrosTypeLabel(header.cobro_type)}`}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="ml-3 rounded-xl px-3 py-1.5 text-sm font-extrabold text-white/90 hover:bg-white/10"
                  title="Cerrar"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* ── Contenido scrollable ──────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden p-5">

              {/* Mensaje inline */}
              {modalMsg && (
                <div className={cls(
                  "mb-4 rounded-2xl border p-3 text-sm font-semibold",
                  modalMsg.level === "error"
                    ? "border-rose-200 bg-rose-50 text-rose-900"
                    : "border-emerald-200 bg-emerald-50 text-emerald-900"
                )}>
                  {modalMsg.text}
                </div>
              )}

              {/* ── Tabs – igual a TradeDocEditorModal ── */}
              <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-2">
                <div className="flex flex-wrap gap-2">
                  {(["CABECERA", "ASIENTO"] as EditorTab[]).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setActiveTab(tab)}
                      className={cls(
                        "rounded-2xl px-4 py-2 text-[12px] font-extrabold transition ring-1",
                        activeTab === tab
                          ? "bg-slate-900 text-white ring-slate-900"
                          : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
                      )}
                    >
                      {tab === "CABECERA" ? "Cabecera" : "Asiento contable"}
                      {tab === "ASIENTO" && !journalAutoMode && (
                        <span className="ml-1 text-[9px] font-bold text-amber-400 uppercase">Manual</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* ════════════════ TAB CABECERA ════════════════ */}
              {activeTab === "CABECERA" && (
                <div className="space-y-4">

                  {/* ── Card de datos del cobro ── */}
                  <div className={tradeDocsTheme.card}>
                    {/* Card header */}
                    <div className="px-4 py-3 border-b">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-semibold text-slate-900">Cabecera</div>
                          <div className="text-[11px] text-slate-500">Datos generales del cobro.</div>
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Moneda base: <b className="text-slate-700">{baseCurrency}</b>
                        </div>
                      </div>
                    </div>

                    {/* Grid de campos */}
                    <div className="px-4 py-3 grid grid-cols-1 md:grid-cols-4 gap-3">

                      {/* ── Fila 1: Tipo | Fecha | Moneda | Monto ── */}
                      <div className="md:col-span-4">
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">

                          {/* Tipo (3) */}
                          <div className="md:col-span-3">
                            <label className="block">
                              <LabelInline label="Tipo" field="cobro_type" />
                            </label>
                            <select
                              className={selectCls}
                              value={header.cobro_type}
                              disabled={!canEditLocal || !isNew}
                              onChange={(e) =>
                                setHeader((h) => ({ ...h, cobro_type: e.target.value as any }))
                              }
                            >
                              <option value="COBRO">Cobro</option>
                              <option value="ANTICIPO">Anticipo de cliente</option>
                              <option value="AJUSTE">Ajuste</option>
                            </select>
                          </div>

                          {/* Fecha (3) */}
                          <div className="md:col-span-3">
                            <label className="block">
                              <LabelInline label="Fecha" field="payment_date" />
                            </label>
                            <input
                              type="date"
                              className={inputCls}
                              value={header.issue_date}
                              disabled={!canEditLocal}
                              onChange={(e) =>
                                setHeader((h) => ({ ...h, issue_date: e.target.value }))
                              }
                            />
                          </div>

                          {/* Moneda (2) */}
                          <div className="md:col-span-2">
                            <label className="block">
                              <LabelInline label="Moneda" field="currency_code" />
                            </label>
                            <input
                              className={inputCls}
                              value={header.currency_code}
                              disabled
                            />
                          </div>

                          {/* Monto (4) */}
                          <div className="md:col-span-4">
                            <label className="block">
                              <LabelInline
                                label={isAjuste ? "Monto (± ajuste)" : "Monto"}
                                field="total_amount"
                              />
                            </label>
                            <input
                              type="number"
                              className={cls(inputCls, "text-right")}
                              value={header.amount}
                              disabled={!canEditLocal}
                              onChange={(e) =>
                                setHeader((h) => ({ ...h, amount: e.target.value }))
                              }
                              step="1"
                              placeholder={isAjuste ? "Ej: -500 o 500" : "Ej: 12000"}
                            />
                            {isAjuste && (
                              <p className="mt-0.5 text-[10px] text-slate-400">
                                Negativo reduce saldo; positivo aumenta
                              </p>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* ── Fila 2: Forma de cobro + campos dinámicos (solo COBRO) ── */}
                      {!isAjuste && (
                        <div className="md:col-span-4">
                          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">

                            {/* Forma de cobro (3) */}
                            <div className="md:col-span-3">
                              <label className="block">
                                <LabelInline label="Forma de cobro" field="method" />
                              </label>
                              <select
                                className={selectCls}
                                value={header.payment_method}
                                disabled={!canEditLocal}
                                onChange={(e) =>
                                  setHeader((h) => ({
                                    ...h,
                                    payment_method: e.target.value as any,
                                    card_kind: e.target.value !== "TARJETA" ? "" : h.card_kind,
                                    card_last4: e.target.value !== "TARJETA" ? "" : h.card_last4,
                                    auth_code: e.target.value !== "TARJETA" ? "" : h.auth_code,
                                  }))
                                }
                              >
                                <option value="">— Seleccionar —</option>
                                <option value="EFECTIVO">Efectivo</option>
                                <option value="TRANSFERENCIA">Transferencia</option>
                                <option value="CHEQUE">Cheque</option>
                                <option value="TARJETA">Tarjeta</option>
                              </select>
                            </div>

                            {/* Vincular transacción (2) — todas las formas de pago */}
                            <div className="md:col-span-2 flex flex-col justify-end">
                              <button
                                type="button"
                                disabled
                                title="Próximamente — Gestión Bancaria"
                                className={cls(
                                  tradeDocsTheme.btnSoft,
                                  "w-full opacity-50 cursor-not-allowed text-xs"
                                )}
                              >
                                <Search className="mr-1 inline-block h-3.5 w-3.5" />
                                Vincular transacción
                              </button>
                            </div>

                            {!isTarjeta ? (
                              /* Efectivo / Transferencia / Cheque: Banco(4) + Referencia(3) */
                              <>
                                {/* Banco (4) – disabled para desarrollo */}
                                <div className="md:col-span-4">
                                  <label className="block">
                                    <LabelInline label="Banco" field="bank_id" />
                                  </label>
                                  <select className={selectCls} disabled>
                                    <option value="">— Para desarrollo (Gestión Bancaria) —</option>
                                  </select>
                                </div>

                                {/* N° / Referencia (3) */}
                                <div className="md:col-span-3">
                                  <label className="block">
                                    <LabelInline label="N° / Referencia" field="reference" />
                                  </label>
                                  <input
                                    className={inputCls}
                                    value={header.reference}
                                    disabled={!canEditLocal}
                                    onChange={(e) =>
                                      setHeader((h) => ({ ...h, reference: e.target.value }))
                                    }
                                    placeholder="N° cobro / Ref. transferencia"
                                  />
                                </div>
                              </>
                            ) : (
                              /* Tarjeta: Tipo(2) + Dígitos(1) + Auth(2) + Referencia(2) = 7 */
                              <>
                                {/* Tipo tarjeta (2) */}
                                <div className="md:col-span-2">
                                  <label className="block">
                                    <LabelInline label="Tipo tarjeta" field="card_kind" />
                                  </label>
                                  <select
                                    className={selectCls}
                                    value={header.card_kind}
                                    disabled={!canEditLocal}
                                    onChange={(e) =>
                                      setHeader((h) => ({ ...h, card_kind: e.target.value as any }))
                                    }
                                  >
                                    <option value="">— Tipo —</option>
                                    <option value="DEBITO">Débito</option>
                                    <option value="CREDITO">Crédito</option>
                                  </select>
                                </div>

                                {/* Últimos 4 dígitos (1) */}
                                <div className="md:col-span-1">
                                  <label className="block">
                                    <LabelInline label="4 dígitos" field="card_last4" />
                                  </label>
                                  <input
                                    maxLength={4}
                                    className={inputCls}
                                    value={header.card_last4}
                                    disabled={!canEditLocal}
                                    onChange={(e) =>
                                      setHeader((h) => ({ ...h, card_last4: e.target.value }))
                                    }
                                    placeholder="1234"
                                  />
                                </div>

                                {/* Cód. autorización (2) */}
                                <div className="md:col-span-2">
                                  <label className="block">
                                    <LabelInline label="Cód. autorización" field="auth_code" />
                                  </label>
                                  <input
                                    className={inputCls}
                                    value={header.auth_code}
                                    disabled={!canEditLocal}
                                    onChange={(e) =>
                                      setHeader((h) => ({ ...h, auth_code: e.target.value }))
                                    }
                                    placeholder="Auth code"
                                  />
                                </div>

                                {/* N° / Referencia / Orden de compra (2) */}
                                <div className="md:col-span-2">
                                  <label className="block">
                                    <LabelInline label="N° / Referencia" field="reference" />
                                  </label>
                                  <input
                                    className={inputCls}
                                    value={header.reference}
                                    disabled={!canEditLocal}
                                    onChange={(e) =>
                                      setHeader((h) => ({ ...h, reference: e.target.value }))
                                    }
                                    placeholder="N° cobro / Orden de compra"
                                  />
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      )}

                      {/* ── Fila 3: RUT+buscar+crear(3) | Nombre(4) | Descripción(5) ── */}
                      <div className="md:col-span-4">
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">

                          {/* RUT / NIC + botón Buscar (3) — Buscar junto al RUT */}
                          <div className="md:col-span-3">
                            <label className="block">
                              <LabelInline label="RUT / NIC" field="counterparty_identifier" />
                            </label>
                            <div className="mt-1 flex gap-1">
                              <input
                                className="flex-1 min-w-0 rounded-lg border px-2 py-2 text-sm"
                                value={header.counterparty_identifier}
                                disabled={!canEditLocal}
                                onChange={(e) =>
                                  setHeader((h) => ({
                                    ...h,
                                    counterparty_identifier: e.target.value,
                                    counterparty_id: null,
                                  }))
                                }
                                onBlur={handleCounterpartySearch}
                                placeholder="Ej: 12.345.678-9"
                              />
                              {/* Buscar — aparece cuando hay texto */}
                              {canEditLocal && header.counterparty_identifier.trim() && (
                                <button
                                  type="button"
                                  onClick={handleCounterpartySearch}
                                  className={cls(tradeDocsTheme.btnSoft, "shrink-0 px-2")}
                                  title="Buscar contraparte"
                                >
                                  <Search className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                            {header.counterparty_id && (
                              <div className="mt-0.5 text-[10px] text-emerald-600 truncate">
                                ✓ Encontrada
                              </div>
                            )}
                            {!header.counterparty_id && header.counterparty_identifier.trim() && (
                              <div className="mt-0.5 text-[10px] text-slate-400">
                                No registrada
                              </div>
                            )}
                          </div>

                          {/* Nombre contraparte (4) */}
                          <div className="md:col-span-4">
                            <label className="block">
                              <LabelInline label="Nombre contraparte" field="counterparty_name" />
                            </label>
                            <input
                              className={cls(inputCls, "disabled:bg-slate-50 disabled:text-slate-400")}
                              value={header.counterparty_name}
                              disabled={!canEditLocal}
                              onChange={(e) =>
                                setHeader((h) => ({ ...h, counterparty_name: e.target.value }))
                              }
                              placeholder="Razón social del cliente"
                            />
                          </div>

                          {/* Descripción (5) */}
                          <div className="md:col-span-5">
                            <label className="block">
                              <LabelInline label="Descripción" field="description" />
                            </label>
                            <input
                              className={inputCls}
                              value={header.description}
                              disabled={!canEditLocal}
                              onChange={(e) =>
                                setHeader((h) => ({ ...h, description: e.target.value }))
                              }
                              placeholder="Descripción libre del cobro"
                            />
                          </div>
                        </div>
                      </div>

                    </div>
                  </div>

                  {/* ── Banner informativo para ANTICIPO ── */}
                  {isAnticipo && (
                    <div className="rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
                      <p className="font-semibold">Anticipo de cliente</p>
                      <p className="mt-0.5 text-[12px] text-indigo-700">
                        Este cobro es un pago recibido antes de emitir la factura o aplicarlo a un documento.
                        El asiento registrará el dinero en la cuenta bancaria y un pasivo en <b>Anticipos de clientes</b>.
                        Cuando exista la factura, crea un <b>Ajuste</b> para aplicar el anticipo al documento.
                      </p>
                    </div>
                  )}

                  {/* ── Card: Documentos asociados (oculto para ANTICIPO) ── */}
                  {!isAnticipo && <div className={tradeDocsTheme.card}>
                    <div className="flex items-center justify-between border-b px-4 py-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">Documentos asociados</div>
                        <div className="text-[11px] text-slate-500">
                          Facturas y documentos que cubre este cobro.
                        </div>
                      </div>
                      {canEditLocal && (
                        <button
                          type="button"
                          onClick={() => setDocSearchOpen(true)}
                          className={tradeDocsTheme.btnFilter}
                        >
                          <PlusCircle className="mr-1 inline-block h-3.5 w-3.5" />
                          Vincular documento
                        </button>
                      )}
                    </div>

                    {allocations.length === 0 ? (
                      <div className="px-4 py-6 text-center text-[12px] text-slate-400">
                        {canEditLocal
                          ? 'Sin documentos asociados. Usa "Vincular documento" para agregar.'
                          : "Sin documentos asociados."}
                      </div>
                    ) : (
                      <div className="overflow-x-hidden">
                        <table className="w-full table-fixed border-collapse text-sm">
                          <colgroup>
                            <col style={{ width: "22%" }} />
                            <col style={{ width: "15%" }} />
                            <col style={{ width: "9%" }} />
                            <col style={{ width: "14%" }} />
                            <col style={{ width: "12%" }} />
                            <col style={{ width: "20%" }} />
                            {canEditLocal && <col style={{ width: "8%" }} />}
                          </colgroup>
                          <thead>
                            <tr>
                              <th className={tradeDocsHeaderCell}>
                                <b>Tipo / Clase</b>
                                <span className={tradeDocsHeaderSub}>doc_class · type</span>
                              </th>
                              <th className={tradeDocsHeaderCell}>
                                <b>Folio</b>
                                <span className={tradeDocsHeaderSub}>cód · serie / nro</span>
                              </th>
                              <th className={tradeDocsHeaderCell}>
                                <b>Emisión</b>
                                <span className={tradeDocsHeaderSub}>issue_date</span>
                              </th>
                              <th className={cls(tradeDocsHeaderCell, "text-right")}>
                                <b>Monto doc.</b>
                                <span className={tradeDocsHeaderSub}>grand_total</span>
                              </th>
                              <th className={cls(tradeDocsHeaderCell, "text-right")}>
                                <b>Saldo</b>
                                <span className={tradeDocsHeaderSub}>balance</span>
                              </th>
                              <th className={cls(tradeDocsHeaderCell, "text-right")}>
                                <b>Aplicar</b>
                                <span className={tradeDocsHeaderSub}>allocated</span>
                              </th>
                              {canEditLocal && (
                                <th className={tradeDocsHeaderCell}>
                                  <b>Acciones</b>
                                  <span className={tradeDocsHeaderSub}>quitar</span>
                                </th>
                              )}
                            </tr>
                          </thead>
                          <tbody>
                            {allocations.map((a, idx) => (
                              <tr
                                key={a.id}
                                className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/60"}
                              >
                                {/* Tipo / Clase */}
                                <td className={tradeDocsBodyCell}>
                                  <div className="font-semibold text-slate-700 text-[12px]">
                                    {a.doc_class === "FISCAL" ? "Fiscal" : "No Fiscal"}
                                  </div>
                                  <div className={tradeDocsHeaderSub}>
                                    {(() => {
                                      switch (a.doc_type) {
                                        case "INVOICE":      return "Factura";
                                        case "CREDIT_NOTE":  return "Nota de Crédito";
                                        case "DEBIT_NOTE":   return "Nota de Débito";
                                        case "OTRO_INGRESO": return "Otro Ingreso";
                                        case "DEVOLUCION":   return "Devolución";
                                        default:             return a.doc_type || "—";
                                      }
                                    })()}
                                  </div>
                                </td>

                                {/* Folio */}
                                <td className={cls(tradeDocsBodyCell, "font-mono font-medium text-slate-800 text-[12px]")}>
                                  {docAllocLabel(a)}
                                </td>

                                {/* Emisión */}
                                <td className={cls(tradeDocsBodyCell, "text-xs text-slate-600")}>
                                  {a.issue_date || "—"}
                                </td>

                                {/* Monto doc. */}
                                <td className={cls(tradeDocsBodyCell, "text-right text-slate-700")}>
                                  {a.grand_total != null
                                    ? formatNumber(Number(a.grand_total), moneyDecimals)
                                    : "—"}
                                </td>

                                {/* Saldo */}
                                <td className={cls(tradeDocsBodyCell, "text-right")}>
                                  <span className={cls(
                                    "font-medium",
                                    Number(a.balance ?? 0) > 0
                                      ? "text-emerald-700"
                                      : "text-slate-400"
                                  )}>
                                    {a.balance != null
                                      ? formatNumber(Number(a.balance), moneyDecimals)
                                      : "—"}
                                  </span>
                                </td>

                                {/* Aplicar */}
                                <td className={cls(tradeDocsBodyCell, "text-right")}>
                                  <input
                                    type="number"
                                    value={a.allocated_amount}
                                    disabled={!canEditLocal}
                                    onChange={(e) =>
                                      onUpdateAllocationAmount(a.id, e.target.value)
                                    }
                                    step="1"
                                    min="0"
                                    className="w-full bg-transparent text-right text-sm outline-none px-1 py-0.5 disabled:text-slate-400"
                                  />
                                </td>

                                {/* Acciones */}
                                {canEditLocal && (
                                  <td className={cls(tradeDocsBodyCell, "text-center")}>
                                    <button
                                      type="button"
                                      onClick={() => onRemoveAllocation(a.id)}
                                      className="rounded border border-slate-200 px-2 py-1 text-xs hover:bg-white hover:text-rose-700"
                                      title="Quitar documento"
                                    >
                                      ✕
                                    </button>
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="border-t-2 border-slate-200 bg-slate-50">
                              <td
                                colSpan={canEditLocal ? 5 : 5}
                                className="px-3 py-2 text-right text-[11px] font-bold text-slate-600"
                              >
                                Total aplicado:
                              </td>
                              <td className="border border-slate-200 px-2 py-1 text-right">
                                <span
                                  className={cls(
                                    "font-bold text-sm",
                                    allocationOk ? "text-emerald-700" : "text-amber-700"
                                  )}
                                >
                                  {formatNumber(totalAllocated, moneyDecimals)}
                                </span>
                              </td>
                              {canEditLocal && <td className="border border-slate-200" />}
                            </tr>
                            {!allocationOk && cobrosAmount !== 0 && (
                              <tr>
                                <td colSpan={canEditLocal ? 7 : 6} className="px-3 py-1.5">
                                  <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-1.5 text-[11px] text-amber-700">
                                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                    Diferencia de{" "}
                                    {formatNumber(Math.abs(allocationDiff), moneyDecimals)} entre el
                                    monto del cobro y los documentos aplicados.
                                  </div>
                                </td>
                              </tr>
                            )}
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </div>}

                </div>
              )}

              {/* ════════════════ TAB ASIENTO ════════════════ */}
              {activeTab === "ASIENTO" && (
                <div className={tradeDocsTheme.card}>

                  {/* Barra superior */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
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
                      {!journalAutoMode && (
                        <button
                          type="button"
                          className={cls(
                            tradeDocsTheme.btnSoft,
                            !canEditLocal && "opacity-60 cursor-not-allowed"
                          )}
                          disabled={!canEditLocal}
                          onClick={recalcJournalAuto}
                        >
                          Volver a automático
                        </button>
                      )}
                      {canEditLocal && (
                        <button
                          type="button"
                          className={tradeDocsTheme.btnPrimary}
                          onClick={addJournalLine}
                        >
                          + Línea
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Pills: Debe / Haber / Balance */}
                  <div className="border-b bg-white px-4 py-3">
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-slate-800">
                        Debe: <b className="ml-1">{formatNumber(totalDebit, moneyDecimals)}</b>
                      </span>
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-slate-800">
                        Haber: <b className="ml-1">{formatNumber(totalCredit, moneyDecimals)}</b>
                      </span>
                      <span
                        className={cls(
                          "inline-flex items-center rounded-full px-3 py-1",
                          jeBalanced
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-rose-100 text-rose-800"
                        )}
                      >
                        {jeBalanced ? (
                          <>
                            <span>Cuadrado:</span>
                            <b className="ml-1">Sí</b>
                          </>
                        ) : (
                          <>
                            <span>Descuadre:</span>
                            <b className="ml-1">
                              {formatNumber(
                                Math.abs(totalDebit - totalCredit),
                                moneyDecimals
                              )}
                            </b>
                          </>
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Tabla split: header fijo + body scrollable */}
                  <div className="overflow-x-hidden border-t border-slate-200">
                    {/* Header fijo */}
                    <div className="overflow-hidden">
                      <table className="w-full table-fixed border-collapse text-sm">
                        <JournalColgroup />
                        <thead>
                          <tr>
                            <th className={tradeDocsHeaderCell}>
                              N°<span className={tradeDocsHeaderSub}>line_no</span>
                            </th>
                            <th className={tradeDocsHeaderCell}>
                              <b>Cuenta</b>
                              <span className={tradeDocsHeaderSub}>account_code</span>
                            </th>
                            <th className={tradeDocsHeaderCell}>
                              <b>Glosa</b>
                              <span className={tradeDocsHeaderSub}>description</span>
                            </th>
                            <th className={cls(tradeDocsHeaderCell, "text-right")}>
                              <b>Debe</b>
                              <span className={tradeDocsHeaderSub}>debit</span>
                            </th>
                            <th className={cls(tradeDocsHeaderCell, "text-right")}>
                              <b>Haber</b>
                              <span className={tradeDocsHeaderSub}>credit</span>
                            </th>
                            <th className={tradeDocsHeaderCell}>
                              <b>CU</b>
                              <span className={tradeDocsHeaderSub}>bu</span>
                            </th>
                            <th className={tradeDocsHeaderCell}>
                              <b>SUC</b>
                              <span className={tradeDocsHeaderSub}>branch</span>
                            </th>
                            <th className={cls(tradeDocsHeaderCell, "text-right")}>
                              <span className={tradeDocsHeaderSub}>&nbsp;</span>
                            </th>
                          </tr>
                        </thead>
                      </table>
                    </div>

                    {/* Body scrollable */}
                    <div className="max-h-[340px] overflow-y-auto overflow-x-hidden">
                      <table className="w-full table-fixed border-collapse text-sm">
                        <JournalColgroup />
                        <tbody>
                          {journalLines.map((line, idx) => {
                            const rowBg =
                              idx % 2 === 0 ? "bg-slate-50/80" : "bg-slate-100/50";
                            return (
                              <tr key={idx} className={cls(rowBg, "hover:bg-sky-50/30")}>
                                <td
                                  className={cls(
                                    tradeDocsBodyCell,
                                    "text-center text-slate-500 text-xs"
                                  )}
                                >
                                  {line.line_no}
                                </td>
                                <td className={tradeDocsBodyCell}>
                                  <input
                                    className={tradeDocsCellInputBase}
                                    value={line.account_code}
                                    disabled={!canEditLocal}
                                    onChange={(e) =>
                                      updateJournalLine(idx, {
                                        account_code: e.target.value,
                                      })
                                    }
                                    onBlur={(e) =>
                                      updateJournalLine(idx, {
                                        account_code: e.target.value.trim(),
                                      })
                                    }
                                    placeholder="1020101"
                                    list="cobros-accounts-list"
                                  />
                                  <div className="truncate text-[11px] text-slate-500">
                                    {line.account_code.trim()
                                      ? accByCode[line.account_code.trim()]?.name
                                        ? accByCode[line.account_code.trim()].name
                                        : (
                                          <span className="text-amber-700">no existe</span>
                                        )
                                      : "—"}
                                  </div>
                                </td>
                                <td className={tradeDocsBodyCell}>
                                  <input
                                    className={tradeDocsCellInputBase}
                                    value={line.description}
                                    disabled={!canEditLocal}
                                    onChange={(e) =>
                                      updateJournalLine(idx, { description: e.target.value })
                                    }
                                    placeholder="Glosa línea"
                                  />
                                </td>
                                <td className={tradeDocsBodyCell}>
                                  <input
                                    type="number"
                                    className={cls(tradeDocsCellInputBase, tradeDocsCellInputRight)}
                                    value={line.debit}
                                    disabled={!canEditLocal}
                                    onChange={(e) =>
                                      updateJournalLine(idx, { debit: e.target.value })
                                    }
                                    min="0"
                                  />
                                </td>
                                <td className={tradeDocsBodyCell}>
                                  <input
                                    type="number"
                                    className={cls(tradeDocsCellInputBase, tradeDocsCellInputRight)}
                                    value={line.credit}
                                    disabled={!canEditLocal}
                                    onChange={(e) =>
                                      updateJournalLine(idx, { credit: e.target.value })
                                    }
                                    min="0"
                                  />
                                </td>
                                <td className={tradeDocsBodyCell}>
                                  <input
                                    className={tradeDocsCellInputBase}
                                    value={line.business_line_code}
                                    disabled={!canEditLocal}
                                    onChange={(e) =>
                                      updateJournalLine(idx, {
                                        business_line_code: e.target.value,
                                      })
                                    }
                                    placeholder="C.U."
                                    list="cobros-bu-list"
                                  />
                                </td>
                                <td className={tradeDocsBodyCell}>
                                  <input
                                    className={tradeDocsCellInputBase}
                                    value={line.branch_code}
                                    disabled={!canEditLocal}
                                    onChange={(e) =>
                                      updateJournalLine(idx, { branch_code: e.target.value })
                                    }
                                    placeholder="Suc."
                                    list="cobros-branch-list"
                                  />
                                </td>
                                <td className={cls(tradeDocsBodyCell, "text-center")}>
                                  {canEditLocal && (
                                    <button
                                      type="button"
                                      onClick={() => removeJournalLine(idx)}
                                      className="rounded border border-slate-200 px-2 py-1 text-xs hover:bg-white hover:text-rose-700"
                                      title="Eliminar línea"
                                    >
                                      ✕
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Datalists */}
                  <datalist id="cobros-accounts-list">
                    {Object.values(accByCode)
                      .slice(0, 300)
                      .map((a) => (
                        <option key={a.code} value={a.code}>
                          {a.name}
                        </option>
                      ))}
                  </datalist>
                  <datalist id="cobros-bu-list">
                    {businessLines.map((b) => (
                      <option key={b.id} value={b.code}>
                        {b.name}
                      </option>
                    ))}
                  </datalist>
                  <datalist id="cobros-branch-list">
                    {branches.map((b) => (
                      <option key={b.id} value={b.code}>
                        {b.name}
                      </option>
                    ))}
                  </datalist>

                </div>
              )}

            </div>

            {/* ── Footer – igual a TradeDocEditorModal ─────────────────────────── */}
            <div className="shrink-0 border-t bg-white/95 backdrop-blur px-5 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">

                {/* Badges de estado (izquierda) */}
                <div className="flex flex-wrap gap-2 text-xs text-slate-700">
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5">
                    Tipo: <b className="ml-1">{cobrosTypeLabel(header.cobro_type)}</b>
                  </span>
                  <span
                    className={cls(
                      "inline-flex items-center rounded-full px-2 py-0.5",
                      header.status === "BORRADOR"
                        ? "bg-amber-100 text-amber-800"
                        : header.status === "VIGENTE"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-rose-100 text-rose-800"
                    )}
                  >
                    Estatus: <b className="ml-1">{header.status}</b>
                  </span>
                </div>

                {/* Botones de acción (derecha) */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className={tradeDocsTheme.btnSoft}
                  >
                    Cerrar
                  </button>

                  {/* Cancelar — al lado de Cerrar, visible aunque sea readOnly */}
                  {canEdit && !isNew && header.status === "VIGENTE" && onCancelDoc && (
                    <button
                      type="button"
                      onClick={onCancelDoc}
                      disabled={saving}
                      className="inline-flex items-center rounded-xl border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60 transition-all"
                    >
                      Cancelar cobro
                    </button>
                  )}

                  {canEditLocal && header.status === "BORRADOR" && (
                    <>
                      <button
                        type="button"
                        onClick={onSaveDraft}
                        disabled={saving}
                        className={cls(tradeDocsTheme.btnSoft, "disabled:opacity-60")}
                      >
                        {saving ? "Guardando…" : isNew ? "Guardar borrador" : "Actualizar borrador"}
                      </button>

                      <button
                        type="button"
                        onClick={onRegister}
                        disabled={saving}
                        className={cls(tradeDocsTheme.btnPrimary, "disabled:opacity-60")}
                      >
                        {saving ? "Registrando…" : "Registrar cobro"}
                      </button>
                    </>
                  )}
                </div>

              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Sub-modal: búsqueda de documentos */}
      <CobrosDocSearchModal
        open={docSearchOpen}
        onClose={() => setDocSearchOpen(false)}
        moneyDecimals={moneyDecimals}
        addedDocIds={addedDocIds}
        onSearch={onSearchDocs}
        searching={docSearching}
        results={docSearchResults}
        onAdd={(draft) => {
          onAddDocToAllocation(draft);
        }}
      />
    </>
  );
}

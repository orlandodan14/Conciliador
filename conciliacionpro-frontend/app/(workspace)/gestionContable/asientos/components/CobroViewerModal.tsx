"use client";

/**
 * CobroViewerModal
 * Visualización de sólo lectura de un Cobro / Ajuste desde el módulo de Asientos.
 * Diseño idéntico al CobrosEditorModal original.
 */

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  cls,
  formatNumber,
} from "@/app/(workspace)/gestionVentas/docs-tribut-ventas/components/tradeDocs/helpers";
import {
  tradeDocsTheme,
  tradeDocsHeaderCell,
  tradeDocsBodyCell,
} from "@/app/(workspace)/gestionVentas/docs-tribut-ventas/components/tradeDocs/ui";
import { LabelInline } from "@/app/(workspace)/gestionVentas/docs-tribut-ventas/components/tradeDocs/LabelInline";

// ── Tipos internos ────────────────────────────────────────────────────────────

type Tab = "CABECERA" | "ASIGNACIONES" | "ASIENTO";

type CobroData = {
  id: string;
  payment_type: string | null;
  status: string;
  payment_date: string | null;
  method: string | null;
  card_kind: string | null;
  card_last4: string | null;
  auth_code: string | null;
  reference: string | null;
  notes: string | null;
  total_amount: number;
  currency_code: string;
  journal_entry_id: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  counterparties: { identifier: string; name: string } | null;
};

type Allocation = {
  id: string;
  allocated_amount: number;
  trade_docs: {
    doc_type: string | null;
    fiscal_doc_code: string | null;
    series: string | null;
    number: string | null;
    issue_date: string | null;
    counterparty_identifier_snapshot: string | null;
    counterparty_name_snapshot: string | null;
    grand_total: number | null;
    currency_code: string | null;
    status: string | null;
  } | null;
};

type JELine = {
  line_no: number;
  line_description: string | null;
  debit: number;
  credit: number;
  account_nodes: { code: string; name: string } | null;
  counterparties: { identifier: string; name: string } | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const DEC = 0;
function fmtN(n: number) { return formatNumber(n, DEC); }

function methodLabel(m: string | null) {
  if (!m) return "—";
  const MAP: Record<string, string> = {
    EFECTIVO: "Efectivo", CHEQUE: "Cheque",
    TRANSFERENCIA: "Transferencia", TARJETA: "Tarjeta",
    DEPOSITO: "Depósito", OTRO: "Otro",
  };
  return MAP[m] || m;
}

function docLabel(doc: Allocation["trade_docs"]) {
  if (!doc) return "Documento";
  const tipo = doc.doc_type === "CREDIT_NOTE" ? "N/C"
    : doc.doc_type === "DEBIT_NOTE" ? "N/D"
    : "Factura";
  const folio = [doc.series, doc.number].filter(Boolean).join("-") || doc.number || "";
  return `${tipo} ${folio}`.trim();
}

function statusLabel(s: string) {
  if (s === "VIGENTE")   return "Vigente";
  if (s === "BORRADOR")  return "Borrador";
  if (s === "CANCELADO") return "Cancelado";
  return s;
}

function badgeStatusClass(status: string) {
  if (status === "VIGENTE")   return "bg-emerald-100 text-emerald-800";
  if (status === "BORRADOR")  return "bg-amber-100 text-amber-700";
  if (status === "CANCELADO") return "bg-rose-100 text-rose-700";
  return "bg-slate-100 text-slate-600";
}

// ── Componente ────────────────────────────────────────────────────────────────

type Props = {
  open: boolean;
  onClose: () => void;
  cobroId: string | null;
  companyId: string | null;
};

export default function CobroViewerModal({ open, onClose, cobroId, companyId }: Props) {
  const [tab, setTab]         = useState<Tab>("CABECERA");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [cobro, setCobro]     = useState<CobroData | null>(null);
  const [allocs, setAllocs]   = useState<Allocation[]>([]);
  const [jeLines, setJeLines] = useState<JELine[]>([]);

  useEffect(() => {
    if (!open || !cobroId || !companyId) return;
    setTab("CABECERA");
    setError(null);
    setCobro(null);
    setAllocs([]);
    setJeLines([]);
    setLoading(true);

    (async () => {
      try {
        const { data: cobroData, error: cobroErr } = await supabase
          .from("payments")
          .select(`
            id, payment_type, status, payment_date,
            method, card_kind, card_last4, auth_code,
            reference, notes, total_amount, currency_code,
            journal_entry_id, cancelled_at, cancel_reason,
            counterparties(identifier, name)
          `)
          .eq("company_id", companyId)
          .eq("id", cobroId)
          .maybeSingle();

        if (cobroErr) throw cobroErr;
        if (!cobroData) throw new Error("No se encontró el cobro.");
        setCobro(cobroData as any);

        const { data: allocData, error: allocErr } = await supabase
          .from("payment_allocations")
          .select(`
            id, allocated_amount,
            trade_docs(
              doc_type, fiscal_doc_code, series, number, issue_date,
              counterparty_identifier_snapshot, counterparty_name_snapshot,
              grand_total, currency_code, status
            )
          `)
          .eq("company_id", companyId)
          .eq("payment_id", cobroId)
          .order("created_at", { ascending: true });

        if (allocErr) throw allocErr;
        setAllocs(((allocData as any[]) ?? []) as Allocation[]);

        const jeId = (cobroData as any).journal_entry_id;
        if (jeId) {
          const { data: jlData, error: jlErr } = await supabase
            .from("journal_entry_lines")
            .select(`
              line_no, line_description, debit, credit,
              account_nodes(code, name),
              counterparties(identifier, name)
            `)
            .eq("company_id", companyId)
            .eq("journal_entry_id", jeId)
            .order("line_no", { ascending: true });

          if (jlErr) throw jlErr;
          setJeLines(((jlData as any[]) ?? []) as JELine[]);
        }
      } catch (e: any) {
        setError(e?.message || "Error al cargar el cobro.");
      } finally {
        setLoading(false);
      }
    })();
  }, [open, cobroId, companyId]);

  if (!open) return null;

  const isAjuste  = cobro?.payment_type === "AJUSTE" || cobro?.payment_type === "AJUSTE_COBRO";
  const isTarjeta = !isAjuste && cobro?.method === "TARJETA";
  const cpIdent   = (cobro as any)?.counterparties?.identifier || "—";
  const cpName    = (cobro as any)?.counterparties?.name        || "—";
  const debeTotal  = jeLines.reduce((s, l) => s + Number(l.debit  || 0), 0);
  const haberTotal = jeLines.reduce((s, l) => s + Number(l.credit || 0), 0);
  const totalAllocated = allocs.reduce((s, a) => s + Number(a.allocated_amount), 0);

  const TABS: { key: Tab; label: string }[] = [
    { key: "CABECERA",     label: "Cabecera" },
    { key: "ASIGNACIONES", label: `Asignaciones (${allocs.length})` },
    { key: "ASIENTO",      label: "Asiento contable" },
  ];

  const title = isAjuste ? "Ajuste de Cobro" : "Cobro";

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/45" onClick={onClose} />

      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(1200px,96vw)]">
        <div className="flex h-[min(84vh,780px)] flex-col overflow-hidden rounded-[22px] bg-white shadow-xl ring-1 ring-black/5">

          {/* ── Header ───────────────────────────────────────────────────── */}
          <div className={cls("relative px-5 py-4", tradeDocsTheme.header)}>
            <div className={tradeDocsTheme.glowA} />
            <div className={tradeDocsTheme.glowB} />
            <div className="relative flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-extrabold uppercase text-white/80">
                  Ventas · Solo lectura
                </div>
                <h3 className="truncate text-lg font-black text-white">
                  {loading ? "Cargando…" : `Ver ${title}`}
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

          {/* ── Contenido ────────────────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden p-5">
            {loading ? (
              <div className="flex items-center justify-center py-20 text-sm text-slate-400">
                Cargando cobro…
              </div>
            ) : error ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            ) : !cobro ? null : (
              <div className="space-y-4">

                {/* Tabs */}
                <div className="rounded-2xl border border-slate-200 bg-white p-2">
                  <div className="flex flex-wrap gap-2">
                    {TABS.map((t) => (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => setTab(t.key)}
                        className={cls(
                          "rounded-2xl px-4 py-2 text-[12px] font-extrabold transition ring-1",
                          tab === t.key
                            ? "bg-slate-900 text-white ring-slate-900"
                            : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
                        )}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* ══════════════ TAB CABECERA ══════════════ */}
                {tab === "CABECERA" && (
                  <div className="space-y-4">

                    <div className={tradeDocsTheme.card}>
                      <div className="px-4 py-3 border-b">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm font-semibold text-slate-900">Cabecera</div>
                            <div className="text-[11px] text-slate-500">Datos generales del cobro.</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800">
                              {isAjuste ? "Ajuste" : "Cobro"}
                            </span>
                            {cobro.status && (
                              <span className={cls("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold", badgeStatusClass(cobro.status))}>
                                {statusLabel(cobro.status)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="px-4 py-3 grid grid-cols-1 md:grid-cols-12 gap-3">
                        {/* Tipo */}
                        <div className="md:col-span-3">
                          <LabelInline label="Tipo" field="cobro_type" />
                          <div className="mt-1 rounded-lg border bg-slate-50 px-2 py-2 text-sm text-slate-700">
                            {isAjuste ? "Ajuste" : "Cobro"}
                          </div>
                        </div>

                        {/* Fecha */}
                        <div className="md:col-span-3">
                          <LabelInline label="Fecha" field="payment_date" />
                          <div className="mt-1 rounded-lg border bg-slate-50 px-2 py-2 text-sm text-slate-700">
                            {cobro.payment_date || "—"}
                          </div>
                        </div>

                        {/* Moneda */}
                        <div className="md:col-span-2">
                          <LabelInline label="Moneda" field="currency_code" />
                          <div className="mt-1 rounded-lg border bg-slate-50 px-2 py-2 text-sm text-slate-700">
                            {cobro.currency_code}
                          </div>
                        </div>

                        {/* Monto */}
                        <div className="md:col-span-4">
                          <LabelInline label={isAjuste ? "Monto (± ajuste)" : "Monto"} field="total_amount" />
                          <div className="mt-1 rounded-lg border bg-slate-50 px-2 py-2 text-sm font-mono font-black text-right text-slate-900">
                            {fmtN(Number(cobro.total_amount))}
                          </div>
                        </div>

                        {/* Forma de cobro */}
                        {!isAjuste && (
                          <div className="md:col-span-3">
                            <LabelInline label="Forma de cobro" field="method" />
                            <div className="mt-1 rounded-lg border bg-slate-50 px-2 py-2 text-sm text-slate-700">
                              {methodLabel(cobro.method)}
                            </div>
                          </div>
                        )}

                        {/* Tarjeta */}
                        {isTarjeta && cobro.card_kind && (
                          <div className="md:col-span-3">
                            <LabelInline label="Tipo tarjeta" field="card_kind" />
                            <div className="mt-1 rounded-lg border bg-slate-50 px-2 py-2 text-sm text-slate-700">
                              {cobro.card_kind === "DEBITO" ? "Débito" : "Crédito"}
                            </div>
                          </div>
                        )}
                        {isTarjeta && cobro.card_last4 && (
                          <div className="md:col-span-2">
                            <LabelInline label="Últimos 4" field="card_last4" />
                            <div className="mt-1 rounded-lg border bg-slate-50 px-2 py-2 text-sm font-mono text-slate-700">
                              •••• {cobro.card_last4}
                            </div>
                          </div>
                        )}
                        {isTarjeta && cobro.auth_code && (
                          <div className="md:col-span-3">
                            <LabelInline label="Cód. autorización" field="auth_code" />
                            <div className="mt-1 rounded-lg border bg-slate-50 px-2 py-2 text-sm font-mono text-slate-700">
                              {cobro.auth_code}
                            </div>
                          </div>
                        )}

                        {/* Referencia */}
                        {cobro.reference && (
                          <div className="md:col-span-4">
                            <LabelInline label="N° / Referencia" field="reference" />
                            <div className="mt-1 rounded-lg border bg-slate-50 px-2 py-2 text-sm text-slate-700">
                              {cobro.reference}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Card contraparte */}
                    <div className={tradeDocsTheme.card}>
                      <div className="px-4 py-3 border-b">
                        <div className="text-sm font-semibold text-slate-900">Contraparte</div>
                        <div className="text-[11px] text-slate-500">Cliente asociado al cobro.</div>
                      </div>
                      <div className="px-4 py-3 grid grid-cols-1 md:grid-cols-12 gap-3">
                        <div className="md:col-span-4">
                          <LabelInline label="RUT / Identificador" field="counterparty_identifier" />
                          <div className="mt-1 rounded-lg border bg-slate-50 px-2 py-2 text-sm font-mono text-slate-700">
                            {cpIdent}
                          </div>
                        </div>
                        <div className="md:col-span-8">
                          <LabelInline label="Nombre / Razón social" field="counterparty_name" />
                          <div className="mt-1 rounded-lg border bg-slate-50 px-2 py-2 text-sm text-slate-700">
                            {cpName}
                          </div>
                        </div>
                      </div>
                    </div>

                    {cobro.notes && (
                      <div className={tradeDocsTheme.card}>
                        <div className="px-4 py-3 border-b">
                          <div className="text-sm font-semibold text-slate-900">Notas</div>
                        </div>
                        <div className="px-4 py-3 text-sm text-slate-700 whitespace-pre-wrap">{cobro.notes}</div>
                      </div>
                    )}
                  </div>
                )}

                {/* ══════════════ TAB ASIGNACIONES ══════════════ */}
                {tab === "ASIGNACIONES" && (
                  <div className="space-y-3">
                    <div className={tradeDocsTheme.card}>
                      <div className="px-4 py-3 border-b">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm font-semibold text-slate-900">Documentos asignados</div>
                            <div className="text-[11px] text-slate-500">Facturas / notas cubiertas por este cobro.</div>
                          </div>
                          <div className="text-[11px] text-slate-500">
                            Total asignado:{" "}
                            <b className={cls("text-sm font-black font-mono", Math.abs(totalAllocated - Number(cobro.total_amount)) < 0.01 ? "text-emerald-700" : "text-amber-700")}>
                              {fmtN(totalAllocated)}
                            </b>
                            {" / "}
                            <b className="text-sm font-mono text-slate-800">{fmtN(Number(cobro.total_amount))}</b>
                          </div>
                        </div>
                      </div>
                      {allocs.length === 0 ? (
                        <div className="px-4 py-8 text-center text-sm text-slate-400 italic">Sin asignaciones.</div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="min-w-full text-xs border-collapse">
                            <thead>
                              <tr>
                                <th className={cls(tradeDocsHeaderCell, "min-w-[120px]")}>Documento</th>
                                <th className={cls(tradeDocsHeaderCell, "w-24")}>Fecha</th>
                                <th className={cls(tradeDocsHeaderCell, "min-w-[200px]")}>Contraparte</th>
                                <th className={cls(tradeDocsHeaderCell, "w-28 text-right")}>Total doc.</th>
                                <th className={cls(tradeDocsHeaderCell, "w-28 text-right")}>Asignado</th>
                                <th className={cls(tradeDocsHeaderCell, "w-20")}>Estado</th>
                              </tr>
                            </thead>
                            <tbody>
                              {allocs.map((a) => (
                                <tr key={a.id} className="hover:bg-slate-50/60">
                                  <td className={cls(tradeDocsBodyCell, "font-semibold text-slate-800")}>{docLabel(a.trade_docs)}</td>
                                  <td className={cls(tradeDocsBodyCell, "text-slate-600")}>{a.trade_docs?.issue_date || "—"}</td>
                                  <td className={tradeDocsBodyCell}>
                                    <div className="font-mono text-slate-700">{a.trade_docs?.counterparty_identifier_snapshot || "—"}</div>
                                    <div className="text-[9px] text-slate-400 truncate max-w-[180px]">{a.trade_docs?.counterparty_name_snapshot}</div>
                                  </td>
                                  <td className={cls(tradeDocsBodyCell, "text-right font-mono text-slate-700")}>
                                    {a.trade_docs?.grand_total != null ? fmtN(Number(a.trade_docs.grand_total)) : "—"}
                                  </td>
                                  <td className={cls(tradeDocsBodyCell, "text-right font-mono font-semibold text-slate-900")}>
                                    {fmtN(Number(a.allocated_amount))}
                                  </td>
                                  <td className={tradeDocsBodyCell}>
                                    {a.trade_docs?.status ? (
                                      <span className={cls("inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-bold", badgeStatusClass(a.trade_docs.status))}>
                                        {statusLabel(a.trade_docs.status)}
                                      </span>
                                    ) : "—"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="bg-slate-50 border-t-2 border-slate-300">
                                <td colSpan={4} className="px-2 py-2 text-xs font-bold text-slate-500 uppercase tracking-wide text-right">Total asignado</td>
                                <td className="px-2 py-2 text-right font-mono font-black text-slate-900">{fmtN(totalAllocated)}</td>
                                <td />
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ══════════════ TAB ASIENTO ══════════════ */}
                {tab === "ASIENTO" && (
                  <div className="space-y-3">
                    <div className={tradeDocsTheme.card}>
                      <div className="px-4 py-3 border-b">
                        <div className="text-sm font-semibold text-slate-900">Asiento contable</div>
                        <div className="text-[11px] text-slate-500">Líneas contables asociadas a este cobro.</div>
                      </div>
                      {jeLines.length === 0 ? (
                        <div className="px-4 py-8 text-center text-sm text-slate-400 italic">Sin asiento contable asociado.</div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="min-w-full text-xs border-collapse">
                            <thead>
                              <tr>
                                <th className={cls(tradeDocsHeaderCell, "w-8 text-center")}>N°</th>
                                <th className={cls(tradeDocsHeaderCell, "min-w-[200px]")}>Cuenta contable</th>
                                <th className={cls(tradeDocsHeaderCell, "min-w-[130px]")}>RUT Contraparte</th>
                                <th className={cls(tradeDocsHeaderCell, "min-w-[150px]")}>Glosa</th>
                                <th className={cls(tradeDocsHeaderCell, "w-28 text-right")}>Debe</th>
                                <th className={cls(tradeDocsHeaderCell, "w-28 text-right")}>Haber</th>
                              </tr>
                            </thead>
                            <tbody>
                              {jeLines.map((l) => {
                                const acc = (l as any).account_nodes;
                                const cp  = (l as any).counterparties;
                                return (
                                  <tr key={l.line_no} className="hover:bg-slate-50/60">
                                    <td className={cls(tradeDocsBodyCell, "text-center text-slate-400 font-mono")}>{l.line_no}</td>
                                    <td className={tradeDocsBodyCell}>
                                      {acc ? (
                                        <span>
                                          <b className="text-slate-800">{acc.code}</b>
                                          <span className="ml-1 text-slate-500">— {acc.name}</span>
                                        </span>
                                      ) : <span className="text-slate-300">—</span>}
                                    </td>
                                    <td className={tradeDocsBodyCell}>
                                      {cp ? (
                                        <div>
                                          <div className="font-mono text-slate-700">{cp.identifier}</div>
                                          <div className="text-[9px] text-slate-400">{cp.name}</div>
                                        </div>
                                      ) : <span className="text-slate-300">—</span>}
                                    </td>
                                    <td className={cls(tradeDocsBodyCell, "text-slate-600")}>{l.line_description || "—"}</td>
                                    <td className={cls(tradeDocsBodyCell, "text-right font-mono font-semibold text-slate-800")}>
                                      {Number(l.debit  || 0) > 0 ? fmtN(Number(l.debit))  : ""}
                                    </td>
                                    <td className={cls(tradeDocsBodyCell, "text-right font-mono font-semibold text-slate-800")}>
                                      {Number(l.credit || 0) > 0 ? fmtN(Number(l.credit)) : ""}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            <tfoot>
                              <tr className="bg-slate-50 border-t-2 border-slate-300">
                                <td colSpan={4} className="px-2 py-2 text-xs font-bold text-slate-500 uppercase tracking-wide text-right">Total</td>
                                <td className="px-2 py-2 text-right font-mono font-black text-slate-900">{fmtN(debeTotal)}</td>
                                <td className="px-2 py-2 text-right font-mono font-black text-slate-900">{fmtN(haberTotal)}</td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}
                    </div>
                    {jeLines.length > 0 && Math.abs(debeTotal - haberTotal) > 0.01 && (
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                        ⚠ El asiento no cuadra — diferencia: {fmtN(Math.abs(debeTotal - haberTotal))}
                      </div>
                    )}
                  </div>
                )}

              </div>
            )}
          </div>

          {/* ── Footer ───────────────────────────────────────────────────── */}
          <div className="shrink-0 border-t bg-white/95 backdrop-blur px-5 py-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-wrap gap-2 text-xs text-slate-700">
                <span className="inline-flex items-center rounded-full bg-sky-100 px-2 py-0.5 font-semibold text-sky-800">
                  Solo visualización
                </span>
                {cobro && (
                  <>
                    <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 font-semibold text-blue-800">
                      {isAjuste ? "Ajuste" : "Cobro"}
                    </span>
                    <span className={cls("inline-flex items-center rounded-full px-2 py-0.5 font-semibold", badgeStatusClass(cobro.status))}>
                      {statusLabel(cobro.status)}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5">
                      Monto: <b className="ml-1 font-mono">{fmtN(Number(cobro.total_amount))}</b>
                    </span>
                  </>
                )}
              </div>
              <button type="button" className={tradeDocsTheme.btnSoft} onClick={onClose}>
                Cerrar
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

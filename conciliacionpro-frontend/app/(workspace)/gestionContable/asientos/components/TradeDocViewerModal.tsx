"use client";

/**
 * TradeDocViewerModal
 * Visualización de sólo lectura de un Doc Tributario (FISCAL) o
 * Otro Ingreso (NON_FISCAL) desde el módulo de Asientos Contables.
 *
 * Diseño idéntico al TradeDocEditorModal original.
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

type Tab = "CABECERA" | "LINEAS" | "ASIENTO";

type TradeDocData = {
  id: string;
  doc_class: string;
  doc_type: string;
  fiscal_doc_code: string | null;
  non_fiscal_doc_code: string | null;
  series: string | null;
  number: string | null;
  issue_date: string | null;
  due_date: string | null;
  currency_code: string;
  status: string;
  reference: string | null;
  notes: string | null;
  net_taxable: number;
  net_exempt: number;
  tax_total: number;
  grand_total: number;
  counterparty_identifier_snapshot: string | null;
  counterparty_name_snapshot: string | null;
  journal_entry_id: string | null;
  counterparties: { identifier: string; name: string } | null;
  branches: { code: string; name: string } | null;
};

type TradeLine = {
  line_no: number;
  sku: string | null;
  description: string | null;
  qty: number;
  unit_price: number;
  taxable_amount: number;
  exempt_amount: number;
  tax_amount: number;
  line_total: number;
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

function fmtN(n: number) {
  return formatNumber(n, DEC);
}

function docTypeLabel(doc_type: string, doc_class: string) {
  if (doc_class === "NON_FISCAL") {
    return doc_type === "DEVOLUCION" ? "Devolución" : "Otro Ingreso";
  }
  if (doc_type === "CREDIT_NOTE") return "Nota de Crédito";
  if (doc_type === "DEBIT_NOTE")  return "Nota de Débito";
  return "Factura / Documento";
}

function statusLabel(s: string) {
  if (s === "VIGENTE")   return "Vigente";
  if (s === "BORRADOR")  return "Borrador";
  if (s === "CANCELADO") return "Cancelado";
  return s;
}

function badgeTypeClass(doc_type: string) {
  if (doc_type === "CREDIT_NOTE") return "bg-sky-100 text-sky-800";
  if (doc_type === "DEBIT_NOTE")  return "bg-amber-100 text-amber-800";
  return "bg-violet-100 text-violet-800";
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
  tradeDocId: string | null;
  companyId: string | null;
};

export default function TradeDocViewerModal({ open, onClose, tradeDocId, companyId }: Props) {
  const [tab, setTab]         = useState<Tab>("CABECERA");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [doc, setDoc]         = useState<TradeDocData | null>(null);
  const [lines, setLines]     = useState<TradeLine[]>([]);
  const [jeLines, setJeLines] = useState<JELine[]>([]);

  useEffect(() => {
    if (!open || !tradeDocId || !companyId) return;
    setTab("CABECERA");
    setError(null);
    setDoc(null);
    setLines([]);
    setJeLines([]);
    setLoading(true);

    (async () => {
      try {
        const { data: docData, error: docErr } = await supabase
          .from("trade_docs")
          .select(`
            id, doc_class, doc_type,
            fiscal_doc_code, non_fiscal_doc_code,
            series, number, issue_date, due_date,
            currency_code, status, reference, notes,
            net_taxable, net_exempt, tax_total, grand_total,
            counterparty_identifier_snapshot, counterparty_name_snapshot,
            journal_entry_id,
            counterparties(identifier, name),
            branches(code, name)
          `)
          .eq("company_id", companyId)
          .eq("id", tradeDocId)
          .maybeSingle();

        if (docErr) throw docErr;
        if (!docData) throw new Error("No se encontró el documento.");
        setDoc(docData as any);

        // Líneas solo para docs FISCALES
        if ((docData as any).doc_class === "FISCAL") {
          const { data: linesData, error: linesErr } = await supabase
            .from("trade_doc_lines")
            .select("line_no, sku, description, qty, unit_price, taxable_amount, exempt_amount, tax_amount, line_total")
            .eq("company_id", companyId)
            .eq("trade_doc_id", tradeDocId)
            .order("line_no", { ascending: true });
          if (linesErr) throw linesErr;
          setLines(((linesData as any[]) ?? []) as TradeLine[]);
        }

        // Líneas del asiento
        const jeId = (docData as any).journal_entry_id;
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
        setError(e?.message || "Error al cargar el documento.");
      } finally {
        setLoading(false);
      }
    })();
  }, [open, tradeDocId, companyId]);

  if (!open) return null;

  const isFiscal  = doc?.doc_class === "FISCAL";
  const docCode   = isFiscal ? doc?.fiscal_doc_code : doc?.non_fiscal_doc_code;
  const folio     = [doc?.series, doc?.number].filter(Boolean).join("-") || doc?.number || "—";
  const cpIdent   = (doc as any)?.counterparties?.identifier || doc?.counterparty_identifier_snapshot || "—";
  const cpName    = (doc as any)?.counterparties?.name        || doc?.counterparty_name_snapshot        || "—";
  const branchName = (doc as any)?.branches?.name || "—";
  const title      = doc
    ? (isFiscal ? `${docTypeLabel(doc.doc_type, doc.doc_class)} ${folio}` : docTypeLabel(doc.doc_type, doc.doc_class))
    : "Documento";

  const debeTotal  = jeLines.reduce((s, l) => s + Number(l.debit  || 0), 0);
  const haberTotal = jeLines.reduce((s, l) => s + Number(l.credit || 0), 0);

  const TABS: { key: Tab; label: string }[] = [
    { key: "CABECERA", label: "Cabecera" },
    ...(isFiscal ? [{ key: "LINEAS" as Tab, label: `Líneas (${lines.length})` }] : []),
    { key: "ASIENTO", label: "Asiento contable" },
  ];

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
                  {isFiscal ? "Doc Tributario · Solo lectura" : "Otro Ingreso · Solo lectura"}
                </div>
                <h3 className="truncate text-lg font-black text-white">
                  {loading ? "Cargando…" : title}
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
                Cargando documento…
              </div>
            ) : error ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            ) : !doc ? null : (
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

                    {/* Card cabecera */}
                    <div className={tradeDocsTheme.card}>
                      <div className="px-4 py-3 border-b">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm font-semibold text-slate-900">Cabecera</div>
                            <div className="text-[11px] text-slate-500">Datos generales del documento.</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={cls("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold", badgeTypeClass(doc.doc_type))}>
                              {docTypeLabel(doc.doc_type, doc.doc_class)}
                            </span>
                            <span className={cls("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold", badgeStatusClass(doc.status))}>
                              {statusLabel(doc.status)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="px-4 py-3 grid grid-cols-1 md:grid-cols-12 gap-3">
                        {isFiscal && (
                          <>
                            <div className="md:col-span-3">
                              <LabelInline label="Tipo doc. fiscal" field="fiscal_doc_code" />
                              <div className="mt-1 rounded-lg border bg-slate-50 px-2 py-2 text-sm text-slate-700">
                                {docCode || "—"}
                              </div>
                            </div>
                            <div className="md:col-span-3">
                              <LabelInline label="Folio" field="series / number" />
                              <div className="mt-1 rounded-lg border bg-slate-50 px-2 py-2 text-sm font-mono text-slate-700">
                                {folio}
                              </div>
                            </div>
                          </>
                        )}
                        {!isFiscal && docCode && (
                          <div className="md:col-span-4">
                            <LabelInline label="Tipo doc." field="non_fiscal_doc_code" />
                            <div className="mt-1 rounded-lg border bg-slate-50 px-2 py-2 text-sm text-slate-700">
                              {docCode}
                            </div>
                          </div>
                        )}
                        <div className="md:col-span-3">
                          <LabelInline label="Fecha emisión" field="issue_date" />
                          <div className="mt-1 rounded-lg border bg-slate-50 px-2 py-2 text-sm text-slate-700">
                            {doc.issue_date || "—"}
                          </div>
                        </div>
                        {doc.due_date && (
                          <div className="md:col-span-3">
                            <LabelInline label="Fecha vencimiento" field="due_date" />
                            <div className="mt-1 rounded-lg border bg-slate-50 px-2 py-2 text-sm text-slate-700">
                              {doc.due_date}
                            </div>
                          </div>
                        )}
                        <div className="md:col-span-2">
                          <LabelInline label="Moneda" field="currency_code" />
                          <div className="mt-1 rounded-lg border bg-slate-50 px-2 py-2 text-sm text-slate-700">
                            {doc.currency_code}
                          </div>
                        </div>
                        <div className="md:col-span-3">
                          <LabelInline label="Sucursal" field="branch" />
                          <div className="mt-1 rounded-lg border bg-slate-50 px-2 py-2 text-sm text-slate-700">
                            {branchName}
                          </div>
                        </div>
                        {doc.reference && (
                          <div className="md:col-span-4">
                            <LabelInline label="Referencia" field="reference" />
                            <div className="mt-1 rounded-lg border bg-slate-50 px-2 py-2 text-sm text-slate-700">
                              {doc.reference}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Card contraparte */}
                    <div className={tradeDocsTheme.card}>
                      <div className="px-4 py-3 border-b">
                        <div className="text-sm font-semibold text-slate-900">Contraparte</div>
                        <div className="text-[11px] text-slate-500">RUT / identificador y razón social.</div>
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

                    {/* Card totales */}
                    <div className={tradeDocsTheme.card}>
                      <div className="px-4 py-3 border-b">
                        <div className="text-sm font-semibold text-slate-900">Totales</div>
                      </div>
                      <div className="px-4 py-3">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          {Number(doc.net_taxable) > 0 && (
                            <div>
                              <LabelInline label="Neto afecto" field="net_taxable" />
                              <div className="mt-1 text-right rounded-lg border bg-slate-50 px-2 py-2 text-sm font-mono text-slate-700">
                                {fmtN(Number(doc.net_taxable))}
                              </div>
                            </div>
                          )}
                          {Number(doc.net_exempt) > 0 && (
                            <div>
                              <LabelInline label="Neto exento" field="net_exempt" />
                              <div className="mt-1 text-right rounded-lg border bg-slate-50 px-2 py-2 text-sm font-mono text-slate-700">
                                {fmtN(Number(doc.net_exempt))}
                              </div>
                            </div>
                          )}
                          {Number(doc.tax_total) > 0 && (
                            <div>
                              <LabelInline label="IVA" field="tax_total" />
                              <div className="mt-1 text-right rounded-lg border bg-slate-50 px-2 py-2 text-sm font-mono text-slate-700">
                                {fmtN(Number(doc.tax_total))}
                              </div>
                            </div>
                          )}
                          <div>
                            <LabelInline label="Total" field="grand_total" />
                            <div className="mt-1 text-right rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm font-black font-mono text-slate-900">
                              {fmtN(Number(doc.grand_total))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {doc.notes && (
                      <div className={tradeDocsTheme.card}>
                        <div className="px-4 py-3 border-b">
                          <div className="text-sm font-semibold text-slate-900">Notas</div>
                        </div>
                        <div className="px-4 py-3 text-sm text-slate-700 whitespace-pre-wrap">{doc.notes}</div>
                      </div>
                    )}
                  </div>
                )}

                {/* ══════════════ TAB LÍNEAS ══════════════ */}
                {tab === "LINEAS" && (
                  <div className={tradeDocsTheme.card}>
                    <div className="px-4 py-3 border-b">
                      <div className="text-sm font-semibold text-slate-900">Líneas del documento</div>
                      <div className="text-[11px] text-slate-500">Detalle de productos / servicios.</div>
                    </div>
                    {lines.length === 0 ? (
                      <div className="px-4 py-8 text-center text-sm text-slate-400 italic">Sin líneas registradas.</div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-xs border-collapse">
                          <thead>
                            <tr>
                              <th className={cls(tradeDocsHeaderCell, "w-8 text-center")}>N°</th>
                              <th className={cls(tradeDocsHeaderCell, "w-24")}>SKU</th>
                              <th className={cls(tradeDocsHeaderCell, "min-w-[200px]")}>Descripción</th>
                              <th className={cls(tradeDocsHeaderCell, "w-16 text-right")}>Cant.</th>
                              <th className={cls(tradeDocsHeaderCell, "w-24 text-right")}>P. Unit.</th>
                              <th className={cls(tradeDocsHeaderCell, "w-24 text-right")}>Afecto</th>
                              <th className={cls(tradeDocsHeaderCell, "w-24 text-right")}>Exento</th>
                              <th className={cls(tradeDocsHeaderCell, "w-24 text-right")}>IVA</th>
                              <th className={cls(tradeDocsHeaderCell, "w-24 text-right")}>Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {lines.map((l) => (
                              <tr key={l.line_no} className="hover:bg-slate-50/60">
                                <td className={cls(tradeDocsBodyCell, "text-center text-slate-400 font-mono")}>{l.line_no}</td>
                                <td className={cls(tradeDocsBodyCell, "font-mono text-slate-500")}>{l.sku || "—"}</td>
                                <td className={cls(tradeDocsBodyCell, "text-slate-700")}>{l.description || "—"}</td>
                                <td className={cls(tradeDocsBodyCell, "text-right font-mono")}>{formatNumber(Number(l.qty), 2)}</td>
                                <td className={cls(tradeDocsBodyCell, "text-right font-mono")}>{fmtN(Number(l.unit_price))}</td>
                                <td className={cls(tradeDocsBodyCell, "text-right font-mono")}>{Number(l.taxable_amount) > 0 ? fmtN(Number(l.taxable_amount)) : "—"}</td>
                                <td className={cls(tradeDocsBodyCell, "text-right font-mono")}>{Number(l.exempt_amount)  > 0 ? fmtN(Number(l.exempt_amount))  : "—"}</td>
                                <td className={cls(tradeDocsBodyCell, "text-right font-mono")}>{Number(l.tax_amount)     > 0 ? fmtN(Number(l.tax_amount))     : "—"}</td>
                                <td className={cls(tradeDocsBodyCell, "text-right font-mono font-semibold text-slate-800")}>{fmtN(Number(l.line_total))}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="bg-slate-50 border-t-2 border-slate-300">
                              <td colSpan={8} className="px-2 py-2 text-xs font-bold text-slate-500 uppercase tracking-wide text-right">Total</td>
                              <td className="px-2 py-2 text-right font-mono font-black text-slate-900">
                                {fmtN(lines.reduce((s, l) => s + Number(l.line_total), 0))}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* ══════════════ TAB ASIENTO ══════════════ */}
                {tab === "ASIENTO" && (
                  <div className="space-y-3">
                    <div className={tradeDocsTheme.card}>
                      <div className="px-4 py-3 border-b">
                        <div className="text-sm font-semibold text-slate-900">Asiento contable</div>
                        <div className="text-[11px] text-slate-500">Líneas contables asociadas a este documento.</div>
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
                {doc && (
                  <>
                    <span className={cls("inline-flex items-center rounded-full px-2 py-0.5 font-semibold", badgeTypeClass(doc.doc_type))}>
                      {docTypeLabel(doc.doc_type, doc.doc_class)}
                    </span>
                    <span className={cls("inline-flex items-center rounded-full px-2 py-0.5 font-semibold", badgeStatusClass(doc.status))}>
                      {statusLabel(doc.status)}
                    </span>
                    {isFiscal && (
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5">
                        Total: <b className="ml-1">{fmtN(Number(doc.grand_total))}</b>
                      </span>
                    )}
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

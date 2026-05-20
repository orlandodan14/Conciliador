"use client";

import React, { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import * as XLSX from "xlsx";
import { cls, formatNumber } from "./helpers";
import { cobrosTypeLabel, paymentMethodLabel } from "./helpers";

// ─── Columnas disponibles ─────────────────────────────────────────────────────

type ColKey =
  | "issue_date"
  | "cobro_type_label"
  | "payment_method_label"
  | "number"
  | "reference"
  | "status_label"
  | "counterparty_identifier_snapshot"
  | "counterparty_name_snapshot"
  | "currency_code"
  | "amount"
  | "created_at";

interface ColDef { key: ColKey; label: string; defaultOn: boolean; group: string; }

const ALL_COLUMNS: ColDef[] = [
  // Identificación
  { key: "issue_date",                       label: "Fecha",              defaultOn: true,  group: "Identificación" },
  { key: "cobro_type_label",                 label: "Tipo",               defaultOn: true,  group: "Identificación" },
  { key: "payment_method_label",             label: "Forma de pago",      defaultOn: true,  group: "Identificación" },
  { key: "number",                           label: "Número",             defaultOn: true,  group: "Identificación" },
  { key: "status_label",                     label: "Estado",             defaultOn: true,  group: "Identificación" },
  // Contraparte
  { key: "counterparty_identifier_snapshot", label: "RUT / NIC",          defaultOn: true,  group: "Contraparte" },
  { key: "counterparty_name_snapshot",       label: "Nombre cliente",     defaultOn: true,  group: "Contraparte" },
  // Montos
  { key: "currency_code",                    label: "Moneda",             defaultOn: false, group: "Montos" },
  { key: "amount",                           label: "Monto",              defaultOn: true,  group: "Montos" },
  // Detalle
  { key: "reference",                        label: "Referencia",         defaultOn: false, group: "Detalle" },
  { key: "created_at",                       label: "Fecha registro",     defaultOn: false, group: "Detalle" },
];

const GROUPS = ["Identificación", "Contraparte", "Montos", "Detalle"];

// ─── Filtros del reporte ──────────────────────────────────────────────────────

type Source = "all" | "drafts" | "registered";

interface ReportFilters {
  source:                  Source;
  issue_date_from:         string;
  issue_date_to:           string;
  cobro_type:              string;
  payment_method:          string;
  counterparty_identifier: string;
  counterparty_name:       string;
}

const EMPTY_REPORT_FILTERS: ReportFilters = {
  source:                  "all",
  issue_date_from:         (() => {
    const d = new Date(); d.setDate(1);
    return d.toISOString().slice(0, 10);
  })(),
  issue_date_to:           (() => {
    const d = new Date(); d.setMonth(d.getMonth() + 1, 0);
    return d.toISOString().slice(0, 10);
  })(),
  cobro_type:              "",
  payment_method:          "",
  counterparty_identifier: "",
  counterparty_name:       "",
};

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  companyId: string;
  moneyDecimals: number;
};

// ─── Componente ──────────────────────────────────────────────────────────────

export default function CobrosReportTab({ companyId, moneyDecimals }: Props) {
  const defaultCols = new Set<ColKey>(
    ALL_COLUMNS.filter((c) => c.defaultOn).map((c) => c.key)
  );
  const [enabledCols, setEnabledCols] = useState<Set<ColKey>>(defaultCols);
  const [filters, setFilters] = useState<ReportFilters>(EMPTY_REPORT_FILTERS);
  const [colsExpanded, setColsExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewRows, setPreviewRows] = useState<any[]>([]);

  function toggleCol(key: ColKey) {
    setEnabledCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function setF<K extends keyof ReportFilters>(k: K, v: ReportFilters[K]) {
    setFilters((f) => ({ ...f, [k]: v }));
  }

  // ─── Fetch de datos ───────────────────────────────────────────────────────

  async function fetchRows(): Promise<any[]> {
    let q = supabase
      .from("payments")
      .select(
        "payment_date,payment_type,method,reference,status," +
        "counterparty_id,counterparties(identifier,name),currency_code,total_amount,created_at"
      )
      .eq("company_id", companyId)
      .order("payment_date", { ascending: false });

    if (filters.source === "drafts")     q = q.eq("status", "BORRADOR");
    if (filters.source === "registered") q = q.in("status", ["VIGENTE", "CANCELADO"]);

    if (filters.issue_date_from) q = q.gte("payment_date", filters.issue_date_from);
    if (filters.issue_date_to)   q = q.lte("payment_date", filters.issue_date_to);
    if (filters.cobro_type)      q = q.eq("payment_type", filters.cobro_type);
    if (filters.payment_method)  q = q.eq("method", filters.payment_method);
    if (filters.counterparty_identifier?.trim())
      q = q.ilike("counterparty_identifier_snapshot", `%${filters.counterparty_identifier.trim()}%`);
    if (filters.counterparty_name?.trim())
      q = q.ilike("counterparty_name_snapshot", `%${filters.counterparty_name.trim()}%`);

    const { data, error: err } = await q;
    if (err) throw err;
    return (data as any[]) ?? [];
  }

  function mapRow(r: any): Record<string, any> {
    return {
      issue_date:                       r.payment_date ?? "",
      cobro_type_label:                 cobrosTypeLabel(r.payment_type ?? ""),
      payment_method_label:             paymentMethodLabel(r.method),
      number:                           r.reference ?? "",
      reference:                        r.reference ?? "",
      status_label:                     r.status ?? "",
      counterparty_identifier_snapshot: (r.counterparties as any)?.identifier ?? "",
      counterparty_name_snapshot:       (r.counterparties as any)?.name ?? "",
      currency_code:                    r.currency_code ?? "",
      amount:                           Number(r.total_amount ?? 0),
      created_at:                       r.created_at ? String(r.created_at).slice(0, 10) : "",
    };
  }

  async function handlePreview() {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const raw = await fetchRows();
      setPreviewRows(raw.map(mapRow));
    } catch (e: any) {
      setError(e?.message || "Error al cargar el reporte.");
    } finally {
      setLoading(false);
    }
  }

  async function handleExport() {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const raw = await fetchRows();
      const mapped = raw.map(mapRow);
      const activeCols = ALL_COLUMNS.filter((c) => enabledCols.has(c.key));
      const wsData = [
        activeCols.map((c) => c.label),
        ...mapped.map((r) => activeCols.map((c) => r[c.key] ?? "")),
      ];
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      XLSX.utils.book_append_sheet(wb, ws, "Cobros");
      XLSX.writeFile(wb, `cobros_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (e: any) {
      setError(e?.message || "Error al exportar.");
    } finally {
      setLoading(false);
    }
  }

  const activeCols = ALL_COLUMNS.filter((c) => enabledCols.has(c.key));

  const fieldCls = "w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[12px] focus:outline-none focus:ring-2 focus:ring-[#123b63]/40";

  return (
    <div className="space-y-5">
      {/* Filtros */}
      <div className="rounded-2xl bg-white shadow-[0_4px_20px_rgba(20,12,70,0.08)] ring-1 ring-slate-200/60 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[12px] font-extrabold uppercase text-[#0b2b4f] tracking-wider">
            Filtros del reporte
          </h3>
          <button
            type="button"
            onClick={() => setFilters(EMPTY_REPORT_FILTERS)}
            className="text-[11px] text-slate-500 hover:text-slate-700 underline"
          >
            Limpiar filtros
          </button>
        </div>

        {/* Origen */}
        <div className="mb-4">
          <span className="block text-[10px] font-bold uppercase text-slate-500 mb-2">Origen de documentos</span>
          <div className="flex gap-2">
            {([
              { v: "all",        l: "Todos" },
              { v: "drafts",     l: "Borradores" },
              { v: "registered", l: "Registrados" },
            ] as { v: Source; l: string }[]).map(({ v, l }) => (
              <button
                key={v}
                type="button"
                onClick={() => setF("source", v)}
                className={cls(
                  "rounded-full px-3 py-1 text-[11px] font-bold transition-colors",
                  filters.source === v
                    ? "bg-[#123b63] text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                )}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          <div>
            <label className="block text-[10px] text-slate-500 mb-1">Fecha desde</label>
            <input type="date" className={fieldCls}
              value={filters.issue_date_from}
              onChange={(e) => setF("issue_date_from", e.target.value)} />
          </div>
          <div>
            <label className="block text-[10px] text-slate-500 mb-1">Fecha hasta</label>
            <input type="date" className={fieldCls}
              value={filters.issue_date_to}
              onChange={(e) => setF("issue_date_to", e.target.value)} />
          </div>
          <div>
            <label className="block text-[10px] text-slate-500 mb-1">Tipo</label>
            <select className={fieldCls} value={filters.cobro_type}
              onChange={(e) => setF("cobro_type", e.target.value)}>
              <option value="">Todos</option>
              <option value="COBRO">Cobro</option>
              <option value="AJUSTE">Ajuste</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-slate-500 mb-1">Forma de pago</label>
            <select className={fieldCls} value={filters.payment_method}
              onChange={(e) => setF("payment_method", e.target.value)}>
              <option value="">Todas</option>
              <option value="EFECTIVO">Efectivo</option>
              <option value="TRANSFERENCIA">Transferencia</option>
              <option value="CHEQUE">Cheque</option>
              <option value="TARJETA">Tarjeta</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-slate-500 mb-1">RUT / Identificador</label>
            <input type="text" className={fieldCls} placeholder="12.345.678-9"
              value={filters.counterparty_identifier}
              onChange={(e) => setF("counterparty_identifier", e.target.value)} />
          </div>
          <div>
            <label className="block text-[10px] text-slate-500 mb-1">Nombre cliente</label>
            <input type="text" className={fieldCls} placeholder="Razón social"
              value={filters.counterparty_name}
              onChange={(e) => setF("counterparty_name", e.target.value)} />
          </div>
        </div>
      </div>

      {/* Columnas */}
      <div className="rounded-2xl bg-white shadow-[0_4px_20px_rgba(20,12,70,0.08)] ring-1 ring-slate-200/60 p-5">
        <button
          type="button"
          onClick={() => setColsExpanded((v) => !v)}
          className="flex w-full items-center justify-between"
        >
          <h3 className="text-[12px] font-extrabold uppercase text-[#0b2b4f] tracking-wider">
            Columnas a exportar{" "}
            <span className="font-normal text-slate-500">
              {enabledCols.size} / {ALL_COLUMNS.length}
            </span>
          </h3>
          <span className="text-[11px] text-slate-500">{colsExpanded ? "▲ Contraer" : "▼ Expandir"}</span>
        </button>

        {colsExpanded && (
          <div className="mt-4 space-y-4">
            {GROUPS.map((group) => (
              <div key={group}>
                <div className="text-[10px] font-bold uppercase text-slate-400 mb-2">{group}</div>
                <div className="flex flex-wrap gap-2">
                  {ALL_COLUMNS.filter((c) => c.group === group).map((col) => (
                    <button
                      key={col.key}
                      type="button"
                      onClick={() => toggleCol(col.key)}
                      className={cls(
                        "rounded-full px-3 py-1 text-[11px] font-semibold transition-colors",
                        enabledCols.has(col.key)
                          ? "bg-[#123b63] text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      )}
                    >
                      {col.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Acciones */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handlePreview}
          disabled={loading || !companyId}
          className={cls(
            "rounded-xl border border-[#123b63]/40 bg-white px-5 py-2 text-[12px] font-bold text-[#123b63]",
            "hover:bg-[#f0f6ff] disabled:opacity-60 transition-colors"
          )}
        >
          {loading ? "Cargando…" : "Vista previa"}
        </button>
        <button
          type="button"
          onClick={handleExport}
          disabled={loading || !companyId}
          className={cls(
            "rounded-xl bg-[#123b63] px-5 py-2 text-[12px] font-bold text-white",
            "hover:bg-[#0b2b4f] disabled:opacity-60 transition-colors"
          )}
        >
          Descargar Excel
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl bg-rose-50 px-4 py-3 text-[12px] text-rose-700 font-semibold">
          {error}
        </div>
      )}

      {/* Preview */}
      {previewRows.length > 0 && (
        <div className="rounded-2xl bg-white shadow-[0_4px_20px_rgba(20,12,70,0.08)] ring-1 ring-slate-200/60 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 bg-slate-50">
            <span className="text-[12px] font-bold text-slate-700">
              Vista previa — {previewRows.length} registro(s)
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead className="bg-gradient-to-b from-[#eaf2fb] to-[#d6e4f5] border-b border-slate-300/60">
                <tr className="text-[10px] font-extrabold uppercase text-[#0b2b4f]">
                  {activeCols.map((c) => (
                    <th key={c.key} className="px-3 py-2 text-left whitespace-nowrap">{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.slice(0, 50).map((row, i) => (
                  <tr key={i} className={cls(
                    "border-t border-slate-100",
                    i % 2 === 0 ? "bg-white" : "bg-slate-50/60"
                  )}>
                    {activeCols.map((c) => (
                      <td key={c.key} className="px-3 py-1.5 whitespace-nowrap text-slate-700">
                        {c.key === "amount"
                          ? formatNumber(Number(row[c.key] ?? 0), moneyDecimals)
                          : String(row[c.key] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {previewRows.length > 50 && (
              <div className="px-4 py-2 text-[11px] text-slate-400 border-t border-slate-100">
                Mostrando 50 de {previewRows.length} registros. Descarga el Excel para ver todos.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

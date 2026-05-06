"use client";

import React, { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import * as XLSX from "xlsx";
import { cls } from "./helpers";

/* ─────────────────────────────────────────────────────────────
   Columns
───────────────────────────────────────────────────────────── */
type ColKey =
  | "issue_date"
  | "doc_type_label"
  | "fiscal_doc_code"
  | "series"
  | "number"
  | "status_label"
  | "counterparty_identifier_snapshot"
  | "counterparty_name_snapshot"
  | "currency_code"
  | "net_taxable"
  | "net_exempt"
  | "tax_total"
  | "grand_total"
  | "balance"
  | "created_at";

interface ColDef { key: ColKey; label: string; defaultOn: boolean; group: string; }

const ALL_COLUMNS: ColDef[] = [
  // Identificación
  { key: "issue_date",                       label: "Fecha emisión",      defaultOn: true,  group: "Identificación" },
  { key: "doc_type_label",                   label: "Tipo",               defaultOn: true,  group: "Identificación" },
  { key: "fiscal_doc_code",                  label: "Cód. fiscal",        defaultOn: true,  group: "Identificación" },
  { key: "series",                           label: "Serie",              defaultOn: false, group: "Identificación" },
  { key: "number",                           label: "Folio",              defaultOn: true,  group: "Identificación" },
  { key: "status_label",                     label: "Estado",             defaultOn: true,  group: "Identificación" },
  // Contraparte
  { key: "counterparty_identifier_snapshot", label: "RUT / NIC",          defaultOn: true,  group: "Contraparte" },
  { key: "counterparty_name_snapshot",       label: "Nombre contraparte", defaultOn: true,  group: "Contraparte" },
  // Montos
  { key: "currency_code",                    label: "Moneda",             defaultOn: false, group: "Montos" },
  { key: "net_taxable",                      label: "Afecto",             defaultOn: true,  group: "Montos" },
  { key: "net_exempt",                       label: "Exento",             defaultOn: true,  group: "Montos" },
  { key: "tax_total",                        label: "IVA",                defaultOn: true,  group: "Montos" },
  { key: "grand_total",                      label: "Total",              defaultOn: true,  group: "Montos" },
  { key: "balance",                          label: "Saldo",              defaultOn: true,  group: "Montos" },
  // Auditoría
  { key: "created_at",                       label: "Fecha registro",     defaultOn: false, group: "Auditoría" },
];

const GROUPS = ["Identificación", "Contraparte", "Montos", "Auditoría"];

/* ─────────────────────────────────────────────────────────────
   Filters
───────────────────────────────────────────────────────────── */
type Source = "all" | "drafts" | "registered";

interface ReportFilters {
  source:            Source;
  issue_date_from:   string;
  issue_date_to:     string;
  doc_type:          string;
  counterparty_id:   string;
  counterparty_name: string;
  amount_from:       string;
  amount_to:         string;
}

const EMPTY_FILTERS: ReportFilters = {
  source:            "all",
  issue_date_from:   "",
  issue_date_to:     "",
  doc_type:          "",
  counterparty_id:   "",
  counterparty_name: "",
  amount_from:       "",
  amount_to:         "",
};

/* ─────────────────────────────────────────────────────────────
   Helpers
───────────────────────────────────────────────────────────── */
function docTypeLabel(t: string | null) {
  if (t === "INVOICE")     return "Factura";
  if (t === "CREDIT_NOTE") return "Nota crédito";
  if (t === "DEBIT_NOTE")  return "Nota débito";
  return t ?? "—";
}
function statusLabel(s: string | null) {
  if (s === "BORRADOR")  return "Borrador";
  if (s === "VIGENTE")   return "Vigente";
  if (s === "CANCELADO") return "Cancelado";
  return s ?? "—";
}
function normalizeId(raw: string) {
  return raw.trim().toUpperCase().replace(/[^0-9A-Z]+/g, "");
}

/* ─────────────────────────────────────────────────────────────
   Component
───────────────────────────────────────────────────────────── */
interface Props { companyId: string; }

export default function TradeDocsReportTab({ companyId }: Props) {
  const [filters,      setFilters]      = useState<ReportFilters>(EMPTY_FILTERS);
  const [selectedCols, setSelectedCols] = useState<Set<ColKey>>(
    () => new Set(ALL_COLUMNS.filter(c => c.defaultOn).map(c => c.key))
  );
  const [colsOpen,  setColsOpen]  = useState(false);
  const [exporting, setExporting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ kind: "idle" | "info" | "ok" | "error"; text: string }>(
    { kind: "idle", text: "" }
  );

  /* ── Column helpers ─────────────────────────── */
  const toggleCol   = (k: ColKey) =>
    setSelectedCols(prev => { const s = new Set(prev); s.has(k) ? s.delete(k) : s.add(k); return s; });
  const selectAll   = () => setSelectedCols(new Set(ALL_COLUMNS.map(c => c.key)));
  const selectNone  = () => setSelectedCols(new Set());
  const resetCols   = () => setSelectedCols(new Set(ALL_COLUMNS.filter(c => c.defaultOn).map(c => c.key)));

  /* ── Export ─────────────────────────────────── */
  async function handleExport(fmt: "xlsx" | "csv") {
    if (!companyId || exporting) return;
    if (selectedCols.size === 0) {
      setStatusMsg({ kind: "error", text: "Selecciona al menos una columna." });
      return;
    }
    setExporting(true);
    setStatusMsg({ kind: "info", text: "Consultando datos…" });

    try {
      let q = supabase
        .from("trade_docs")
        .select(
          "doc_type,fiscal_doc_code,status,issue_date,series,number," +
          "counterparty_identifier_snapshot,counterparty_name_snapshot," +
          "currency_code,net_taxable,net_exempt,tax_total,grand_total,balance,created_at"
        )
        .eq("company_id", companyId)
        .eq("doc_class", "FISCAL")
        .order("issue_date",  { ascending: false })
        .order("created_at",  { ascending: false });

      // Source
      if (filters.source === "drafts")     q = q.eq("status", "BORRADOR");
      if (filters.source === "registered") q = q.in("status", ["VIGENTE", "CANCELADO"]);

      // Dates
      if (filters.issue_date_from) q = q.gte("issue_date", filters.issue_date_from);
      if (filters.issue_date_to)   q = q.lte("issue_date", filters.issue_date_to);

      // Type
      if (filters.doc_type) q = q.eq("doc_type", filters.doc_type);

      // Counterparty
      const normId = normalizeId(filters.counterparty_id);
      if (normId)                        q = q.ilike("counterparty_identifier_snapshot", `%${normId}%`);
      if (filters.counterparty_name.trim()) q = q.ilike("counterparty_name_snapshot", `%${filters.counterparty_name.trim()}%`);

      // Amounts
      const af = Number(filters.amount_from), at = Number(filters.amount_to);
      if (filters.amount_from && !isNaN(af)) q = q.gte("grand_total", af);
      if (filters.amount_to   && !isNaN(at)) q = q.lte("grand_total", at);

      setStatusMsg({ kind: "info", text: "Procesando registros…" });
      const { data, error } = await q;
      if (error) throw error;

      const rows = data ?? [];
      if (!rows.length) {
        setStatusMsg({ kind: "error", text: "Sin registros con los filtros aplicados." });
        return;
      }

      setStatusMsg({ kind: "info", text: `Generando archivo (${rows.length} registros)…` });

      // Build ordered columns
      const cols = ALL_COLUMNS.filter(c => selectedCols.has(c.key));

      const exportRows = rows.map(row => {
        const obj: Record<string, unknown> = {};
        for (const col of cols) {
          switch (col.key) {
            case "doc_type_label":   obj[col.label] = docTypeLabel((row as any).doc_type);  break;
            case "status_label":     obj[col.label] = statusLabel((row as any).status);     break;
            case "net_taxable":      obj[col.label] = (row as any).net_taxable  ?? "";      break;
            case "net_exempt":       obj[col.label] = (row as any).net_exempt   ?? "";      break;
            case "tax_total":        obj[col.label] = (row as any).tax_total    ?? "";      break;
            case "grand_total":      obj[col.label] = (row as any).grand_total  ?? "";      break;
            case "balance":          obj[col.label] = (row as any).balance      ?? "";      break;
            case "created_at":       obj[col.label] = (row as any).created_at
              ? String((row as any).created_at).substring(0, 10) : "";                      break;
            default:                 obj[col.label] = (row as any)[col.key]     ?? "";      break;
          }
        }
        return obj;
      });

      const ws = XLSX.utils.json_to_sheet(exportRows);
      ws["!cols"] = cols.map(c => ({ wch: Math.max(c.label.length + 2, 16) }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Doc. Tributarios");

      const date = new Date().toISOString().slice(0, 10);
      const filename = `docs_tributarios_${date}.${fmt === "csv" ? "csv" : "xlsx"}`;
      XLSX.writeFile(wb, filename, fmt === "csv" ? { bookType: "csv" } : undefined);

      setStatusMsg({ kind: "ok", text: `✓ ${rows.length} registros exportados` });
      setTimeout(() => setStatusMsg({ kind: "idle", text: "" }), 5000);
    } catch (e: any) {
      setStatusMsg({ kind: "error", text: `Error: ${e?.message ?? "No se pudo exportar"}` });
    } finally {
      setExporting(false);
    }
  }

  /* ── Styles ─────────────────────────────────── */
  const inputCls   = "h-9 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-[#123b63] focus:ring-1 focus:ring-[#123b63]/20";
  const labelCls   = "mb-1 block text-xs font-medium text-slate-600";
  const sectionCls = "rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden";

  const statusColors = {
    idle:  "",
    info:  "bg-amber-50 text-amber-800 border border-amber-200",
    ok:    "bg-emerald-50 text-emerald-700 border border-emerald-200",
    error: "bg-rose-50 text-rose-700 border border-rose-200",
  };

  return (
    <div className="space-y-4 p-1">

      {/* ── 1. Filtros ──────────────────────────────────────── */}
      <div className={sectionCls}>
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-4 py-3">
          <div>
            <span className="text-sm font-bold text-[#0b2b4f]">Filtros del reporte</span>
            <p className="mt-0.5 text-[11px] text-slate-500">Define el alcance de los datos a exportar</p>
          </div>
          <button
            onClick={() => setFilters(EMPTY_FILTERS)}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-50 transition"
          >
            Limpiar filtros
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Origen */}
          <div>
            <label className={labelCls}>Origen de documentos</label>
            <div className="mt-1 flex flex-wrap gap-2">
              {([ ["all", "Todos"], ["drafts", "Borradores"], ["registered", "Registrados"] ] as [Source, string][]).map(([val, lbl]) => (
                <button
                  key={val}
                  onClick={() => setFilters(f => ({ ...f, source: val }))}
                  className={cls(
                    "rounded-xl px-3 py-1.5 text-xs font-bold transition",
                    filters.source === val ? "bg-[#123b63] text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  )}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          {/* Grid de filtros */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className={labelCls}>Fecha desde</label>
              <input type="date" className={inputCls} value={filters.issue_date_from}
                onChange={e => setFilters(f => ({ ...f, issue_date_from: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>Fecha hasta</label>
              <input type="date" className={inputCls} value={filters.issue_date_to}
                onChange={e => setFilters(f => ({ ...f, issue_date_to: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>Tipo de documento</label>
              <select className={inputCls} value={filters.doc_type}
                onChange={e => setFilters(f => ({ ...f, doc_type: e.target.value }))}>
                <option value="">Todos</option>
                <option value="INVOICE">Factura</option>
                <option value="CREDIT_NOTE">Nota crédito</option>
                <option value="DEBIT_NOTE">Nota débito</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>RUT / ID contraparte</label>
              <input className={inputCls} placeholder="12.345.678-9" value={filters.counterparty_id}
                onChange={e => setFilters(f => ({ ...f, counterparty_id: e.target.value }))} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Nombre contraparte</label>
              <input className={inputCls} placeholder="Razón social o nombre" value={filters.counterparty_name}
                onChange={e => setFilters(f => ({ ...f, counterparty_name: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>Total mínimo</label>
              <input type="number" className={inputCls} placeholder="0" value={filters.amount_from}
                onChange={e => setFilters(f => ({ ...f, amount_from: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>Total máximo</label>
              <input type="number" className={inputCls} placeholder="Sin límite" value={filters.amount_to}
                onChange={e => setFilters(f => ({ ...f, amount_to: e.target.value }))} />
            </div>
          </div>
        </div>
      </div>

      {/* ── 2. Selector de columnas ─────────────────────────── */}
      <div className={sectionCls}>
        <button
          onClick={() => setColsOpen(v => !v)}
          className="flex w-full items-center justify-between px-4 py-3 hover:bg-slate-50/60 transition"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-[#0b2b4f]">Columnas a exportar</span>
            <span className="rounded-full bg-[#123b63]/10 px-2 py-0.5 text-[11px] font-bold text-[#123b63]">
              {selectedCols.size} / {ALL_COLUMNS.length}
            </span>
          </div>
          <span className="text-[10px] font-bold text-slate-400">
            {colsOpen ? "▲ COLAPSAR" : "▼ EXPANDIR"}
          </span>
        </button>

        {colsOpen && (
          <div className="border-t border-slate-100 p-4 space-y-4">
            {/* Acciones rápidas */}
            <div className="flex flex-wrap gap-2">
              <button onClick={selectAll}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition">
                Seleccionar todas
              </button>
              <button onClick={selectNone}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition">
                Desmarcar todas
              </button>
              <button onClick={resetCols}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition">
                Restablecer
              </button>
            </div>

            {/* Columnas agrupadas */}
            {GROUPS.map(group => {
              const groupCols = ALL_COLUMNS.filter(c => c.group === group);
              return (
                <div key={group}>
                  <p className="mb-2 text-[11px] font-extrabold uppercase tracking-widest text-slate-400">{group}</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    {groupCols.map(col => (
                      <label
                        key={col.key}
                        className={cls(
                          "flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 transition select-none",
                          selectedCols.has(col.key)
                            ? "border-[#123b63]/30 bg-[#123b63]/5 text-[#123b63]"
                            : "border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300 hover:bg-white"
                        )}
                      >
                        <input
                          type="checkbox"
                          className="rounded border-slate-300"
                          checked={selectedCols.has(col.key)}
                          onChange={() => toggleCol(col.key)}
                        />
                        <span className="text-xs font-medium">{col.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 3. Exportar ─────────────────────────────────────── */}
      <div className={cls(sectionCls, "p-4")}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-[#0b2b4f]">Generar reporte</p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Los datos se obtienen directamente desde la base de datos con los filtros definidos
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {statusMsg.kind !== "idle" && (
              <span className={cls("flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold", statusColors[statusMsg.kind])}>
                {exporting && <span className="inline-block animate-spin text-[11px]">⟳</span>}
                {statusMsg.text}
              </span>
            )}

            <button
              disabled={exporting || selectedCols.size === 0}
              onClick={() => handleExport("xlsx")}
              className="flex items-center gap-1.5 rounded-xl bg-[#123b63] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#0f3354] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span>↓</span> Exportar Excel
            </button>

            <button
              disabled={exporting || selectedCols.size === 0}
              onClick={() => handleExport("csv")}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              CSV
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}

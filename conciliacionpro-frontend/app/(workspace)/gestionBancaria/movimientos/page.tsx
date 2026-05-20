"use client";

import React, { useMemo, useState } from "react";
import { Upload, X, BookOpen } from "lucide-react";
import MovimientosTable from "./components/movimientos/MovimientosTable";
import { MOCK_MOVIMIENTOS } from "./components/movimientos/mockData";
import type { ReconciliationStatus, MovimientosFilters } from "./components/movimientos/types";
import { tradeDocsTheme } from "@/app/(workspace)/gestionVentas/docs-tribut-ventas/components/tradeDocs/ui";
import FilterActionButtons from "@/app/(workspace)/components/FilterActionButtons";

function cls(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

function fmt(n: number) {
  return n.toLocaleString("es-CL", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

const EMPTY_FILTERS: MovimientosFilters = {
  dateFrom: "", dateTo: "", bankId: "", accountId: "",
  reconciliationStatus: "", accountingStatus: "", search: "",
};

// ─── Modal importar cartola ───────────────────────────────────────────────────

function ImportModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="overflow-hidden rounded-[28px] bg-white ring-1 ring-slate-200 shadow-[0_18px_70px_rgba(15,23,42,0.18)] w-[540px] max-w-full mx-4">
        {/* Header */}
        <div className={cls(tradeDocsTheme.header, "px-6 py-5")}>
          <div className={tradeDocsTheme.glowA} />
          <div className={tradeDocsTheme.glowB} />
          <div className="relative flex items-center justify-between">
            <div>
              <div className="text-[11px] font-extrabold uppercase text-white/70">Gestión Bancaria</div>
              <h2 className="text-xl font-black text-white mt-0.5">Importar Cartola Bancaria</h2>
            </div>
            <button
              onClick={onClose}
              className="h-8 w-8 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-white transition"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="p-6 bg-white">
          {/* Selector banco */}
          <div className="mb-4">
            <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500 block mb-1.5">
              Cuenta bancaria destino
            </label>
            <select className="w-full border border-slate-200 rounded-xl px-3 py-2 text-[13px] text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-[#123b63]/20 transition">
              <option value="">— Seleccionar cuenta —</option>
              <option>Banco de Chile — CTA CTE Principal (001-123456-01)</option>
              <option>Banco de Chile — Cuenta USD Exportaciones (001-789012-02)</option>
              <option>BCI — Cuenta Corriente Operaciones (023-456789-03)</option>
              <option>Santander — Cuenta Corriente Proveedores (072-654321-04)</option>
            </select>
          </div>

          {/* Drop zone */}
          <div className="border-2 border-dashed border-[#123b63]/20 rounded-2xl p-8 text-center hover:border-[#123b63]/40 hover:bg-sky-50/30 transition cursor-pointer">
            <Upload className="h-9 w-9 text-[#123b63]/20 mx-auto mb-3" />
            <p className="text-[14px] font-semibold text-slate-500 mb-1">
              Arrastra tu archivo o haz clic para seleccionar
            </p>
            <p className="text-[12px] text-slate-400">
              Excel (.xlsx, .xls) o CSV — todos los bancos chilenos
            </p>
          </div>

          {/* Info */}
          <div className="mt-4 bg-[#eaf2fb] rounded-xl px-4 py-3">
            <p className="text-[11px] font-bold text-[#123b63] mb-1">Formatos detectados automáticamente:</p>
            <p className="text-[11px] text-[#123b63]/70">
              Banco de Chile · BCI · Santander · Scotiabank · Itaú · BICE · Genérico (auto-detectar)
            </p>
          </div>

          {/* Acciones */}
          <div className="flex justify-end gap-2 mt-5">
            <button
              onClick={onClose}
              className={tradeDocsTheme.btnSoft}
            >
              Cancelar
            </button>
            <button
              onClick={() => { alert("[MOCK] Procesando archivo..."); onClose(); }}
              className={tradeDocsTheme.btnPrimary}
            >
              Importar cartola
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function MovimientosPage() {
  const [rows]       = useState(MOCK_MOVIMIENTOS);
  const [selectedMap, setSelectedMap] = useState<Record<string, boolean>>({});
  const [filters, setFilters]         = useState<MovimientosFilters>(EMPTY_FILTERS);
  const [showImport, setShowImport]   = useState(false);
  const [pageSize, setPageSize]       = useState<20 | 50 | 100>(20);

  // ── Stats ──
  const stats = useMemo(() => {
    const total       = rows.length;
    const conciliados = rows.filter((r) => r.reconciliation_status === "CONCILIADO").length;
    const parciales   = rows.filter((r) => r.reconciliation_status === "PARCIAL").length;
    const sugeridos   = rows.filter((r) => r.reconciliation_status === "SUGERIDO").length;
    const pendientes  = rows.filter((r) => r.reconciliation_status === "PENDIENTE").length;
    const borradores  = rows.filter((r) => r.accounting_status === "BORRADOR").length;
    const pctConc     = total > 0 ? Math.round((conciliados / total) * 100) : 0;
    return { total, conciliados, parciales, sugeridos, pendientes, borradores, pctConc };
  }, [rows]);

  // ── Filtros ──
  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filters.bankId && r.bank_id !== filters.bankId)                               return false;
      if (filters.accountId && r.account_id !== filters.accountId)                     return false;
      if (filters.reconciliationStatus && r.reconciliation_status !== filters.reconciliationStatus) return false;
      if (filters.accountingStatus && r.accounting_status !== filters.accountingStatus) return false;
      if (filters.dateFrom && r.date < filters.dateFrom)                               return false;
      if (filters.dateTo   && r.date > filters.dateTo)                                 return false;
      if (filters.search) {
        const q = filters.search.toLowerCase();
        if (!r.description.toLowerCase().includes(q) &&
            !r.bank_name.toLowerCase().includes(q) &&
            !r.account_number.includes(q)) return false;
      }
      return true;
    });
  }, [rows, filters]);

  // ── Selección ──
  const selectedIds  = Object.keys(selectedMap).filter((k) => selectedMap[k]);
  const allSelected  = filtered.length > 0 && filtered.every((r) => selectedMap[r.id]);

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedMap({});
    } else {
      const next: Record<string, boolean> = {};
      filtered.forEach((r) => { next[r.id] = true; });
      setSelectedMap(next);
    }
  }

  function toggleRow(id: string) {
    setSelectedMap((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  // ── Filtro rápido por chip ──
  function toggleStatusFilter(s: ReconciliationStatus) {
    setFilters((f) => ({
      ...f,
      reconciliationStatus: f.reconciliationStatus === s ? "" : s,
    }));
  }

  const hasActiveFilters =
    !!filters.bankId || !!filters.accountId ||
    !!filters.reconciliationStatus || !!filters.accountingStatus ||
    !!filters.dateFrom || !!filters.dateTo || !!filters.search;

  return (
    <div className="px-2 py-3">
      <div className={tradeDocsTheme.shell}>

        {/* ── Header ── */}
        <div className={cls(tradeDocsTheme.header, "px-5 py-4")}>
          <div className={tradeDocsTheme.glowA} />
          <div className={tradeDocsTheme.glowB} />

          <div className="relative flex flex-wrap items-end justify-between gap-3">
            {/* Título + pills */}
            <div className="min-w-0">
              <div className="text-[11px] font-extrabold uppercase text-white/70">
                Gestión Bancaria
              </div>
              <h1 className="mt-0.5 text-2xl font-black leading-tight">Movimientos Bancarios</h1>

              <div className="mt-3 flex flex-wrap gap-1.5 text-xs text-white/90">
                <span className="inline-flex items-center rounded-full bg-white/10 px-2 py-0.5 ring-1 ring-white/15">
                  Total: <b className="ml-1">{stats.total}</b>
                </span>
                <span className="inline-flex items-center rounded-full bg-emerald-500/30 px-2 py-0.5 ring-1 ring-emerald-400/40 text-emerald-100">
                  Conciliados: <b className="ml-1">{stats.conciliados}</b>
                </span>
                {stats.parciales > 0 && (
                  <span className="inline-flex items-center rounded-full bg-blue-500/30 px-2 py-0.5 ring-1 ring-blue-400/40 text-blue-100">
                    Parciales: <b className="ml-1">{stats.parciales}</b>
                  </span>
                )}
                <span className="inline-flex items-center rounded-full bg-amber-500/30 px-2 py-0.5 ring-1 ring-amber-400/40 text-amber-100">
                  Sugerencias: <b className="ml-1">{stats.sugeridos}</b>
                </span>
                <span className="inline-flex items-center rounded-full bg-rose-500/30 px-2 py-0.5 ring-1 ring-rose-400/40 text-rose-100">
                  Pendientes: <b className="ml-1">{stats.pendientes}</b>
                </span>
                {stats.borradores > 0 && (
                  <span className="inline-flex items-center rounded-full bg-sky-500/30 px-2 py-0.5 ring-1 ring-sky-400/40 text-sky-100">
                    Borradores JE: <b className="ml-1">{stats.borradores}</b>
                  </span>
                )}
                <span className={cls(
                  "inline-flex items-center rounded-full px-2 py-0.5 ring-1",
                  stats.pctConc >= 90
                    ? "bg-emerald-500/30 ring-emerald-400/40 text-emerald-100"
                    : stats.pctConc >= 60
                    ? "bg-amber-500/30 ring-amber-400/40 text-amber-100"
                    : "bg-rose-500/30 ring-rose-400/40 text-rose-100"
                )}>
                  % Conciliado: <b className="ml-1">{stats.pctConc}%</b>
                </span>
              </div>
            </div>

            {/* Botones */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={tradeDocsTheme.btnGlass}
                onClick={() => alert("[MOCK] Refrescar datos")}
              >
                Refrescar
              </button>

              <button
                type="button"
                className={tradeDocsTheme.btnGlass}
                onClick={() => setShowImport(true)}
              >
                <Upload className="inline h-3.5 w-3.5 mr-1.5 -mt-0.5" />
                Importar Cartola
              </button>
            </div>
          </div>
        </div>

        {/* ── Toolbar ── */}
        <div className="border-b border-slate-200/80 px-4 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">

            {/* Izquierda: contador + selector de cantidad */}
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-slate-500">
                <strong className="text-slate-700">{filtered.length}</strong>
                {hasActiveFilters && <> de <strong className="text-slate-700">{rows.length}</strong></>}
                {" "}movimientos
              </span>
              <div className="flex items-center gap-1 border-l border-slate-200 pl-3">
                <span className="text-[11px] text-slate-400 mr-0.5">Filas:</span>
                {([20, 50, 100] as const).map((n) => (
                  <button
                    key={n}
                    onClick={() => setPageSize(n)}
                    className={cls(
                      "h-6 px-2.5 rounded-lg text-[11px] font-bold transition",
                      pageSize === n
                        ? "bg-[#123b63] text-white shadow-sm"
                        : "bg-white border border-slate-200 text-slate-500 hover:border-[#123b63]/40 hover:text-[#123b63]"
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {/* Derecha: acciones */}
            <div className="flex flex-wrap items-center gap-2">
              <FilterActionButtons
                hasActiveFilters={hasActiveFilters}
                onOpenFilters={() => alert("[MOCK] Abrir panel de filtros")}
                onClearFilters={() => setFilters(EMPTY_FILTERS)}
                onReport={() => alert("[MOCK] Descargar reporte Excel")}
                reportTitle="Descargar Excel — Movimientos con filtros aplicados"
              />
              {selectedIds.length > 0 && (
                <button
                  onClick={() => alert(`[MOCK] Contabilizando ${selectedIds.length} movimiento(s)`)}
                  className={cls(tradeDocsTheme.btnPrimary, "flex items-center gap-1.5")}
                >
                  <BookOpen className="h-4 w-4" />
                  Contabilizar ({selectedIds.length})
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Tabla ── */}
        <div className="px-3 py-3">
          <MovimientosTable
            rows={filtered}
            pageSize={pageSize}
            selectedMap={selectedMap}
            allSelected={allSelected}
            onToggleSelectAll={toggleSelectAll}
            onToggleRow={toggleRow}
            onConfirmMatch={(rowId, matchKey) => alert(`[MOCK] Confirmar match ${matchKey} en ${rowId}`)}
            onRejectMatch={(rowId, matchKey)  => alert(`[MOCK] Rechazar sugerencia ${matchKey} en ${rowId}`)}
            onCreateDraftJE={(rowId)           => alert(`[MOCK] Crear asiento borrador para ${rowId}`)}
            onSearchDoc={(rowId)               => alert(`[MOCK] Buscar y vincular documento para ${rowId}`)}
            onPostJE={(rowId, matchKey)        => alert(`[MOCK] Contabilizar asiento del match ${matchKey} en ${rowId}`)}
            onCreateDoc={(rowId)               => alert(`[MOCK] Abrir modal crear documento para movimiento ${rowId}`)}
            onRemoveMatch={(rowId, matchKey, hasPostedJE) =>
              hasPostedJE
                ? alert(`[MOCK] Crear asiento de reversa y liberar match ${matchKey} en ${rowId}`)
                : alert(`[MOCK] Eliminar match ${matchKey} en ${rowId}`)
            }
          />
        </div>

      </div>

      {showImport && <ImportModal onClose={() => setShowImport(false)} />}
    </div>
  );
}

"use client";

import React, { useMemo, useState } from "react";
import { cls } from "./helpers";

// ─── Tipos ────────────────────────────────────────────────────────────────────

type ImportValidationRow = {
  status: "OK" | "ERROR";
  row_no?: number | null;
  number?: string | null;
  message: string;
};

type Props = {
  open: boolean;
  canEdit: boolean;
  importing: boolean;
  importErrors?: string[];
  importValidationRows?: ImportValidationRow[];
  importPreview: any[];
  onClose: () => void;
  onConfirm: () => void;
  onPickExcel: (file: File) => void;
  onExportValidationReport?: () => void;
};

// ─── Estilos locales ─────────────────────────────────────────────────────────

const OVERLAY =
  "fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4";
const PANEL =
  "relative w-[min(900px,96vw)] max-h-[92vh] overflow-y-auto rounded-2xl bg-white shadow-2xl flex flex-col";

const colA = "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold shadow-sm transition";
const btnPrimary = cls(colA, "bg-[#123b63] text-white hover:bg-[#0f3255]");
const btnSoft    = cls(colA, "bg-slate-100 text-slate-700 hover:bg-slate-200");

// ─── Badge por tipo de cobro ─────────────────────────────────────────────────

function CobroTypeBadge({ type }: { type: string }) {
  const isAjuste = type === "AJUSTE" || type === "AJUSTE_COBRO";
  return (
    <span className={cls(
      "inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold",
      isAjuste ? "bg-amber-100 text-amber-800" : "bg-sky-100 text-sky-800"
    )}>
      {isAjuste ? "AJU" : "COB"}
    </span>
  );
}

function MethodBadge({ method }: { method: string }) {
  const cfg: Record<string, [string, string]> = {
    EFECTIVO:      ["bg-green-100 text-green-800",  "EFE"],
    TRANSFERENCIA: ["bg-blue-100 text-blue-800",    "TRF"],
    CHEQUE:        ["bg-purple-100 text-purple-800","CHQ"],
    TARJETA:       ["bg-pink-100 text-pink-800",    "TAR"],
  };
  const [cls2, lbl] = cfg[method?.toUpperCase()] ?? ["bg-slate-100 text-slate-600", method || "—"];
  return (
    <span className={cls("inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold", cls2)}>
      {lbl}
    </span>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function CobrosImportModal({
  open,
  canEdit,
  importing,
  importErrors = [],
  importValidationRows = [],
  importPreview,
  onClose,
  onConfirm,
  onPickExcel,
  onExportValidationReport,
}: Props) {
  const [selectedFileName, setSelectedFileName] = useState("");

  const summary = useMemo(() => ({
    cobros:       importPreview.length,
    withAlloc:    importPreview.filter((r) => r.has_allocation).length,
    partial:      importPreview.filter((r) =>
      r.has_allocation &&
      r.alloc_amount != null &&
      Number(r.alloc_amount) > 0 &&
      Number(r.alloc_amount) < Math.abs(Number(r.total_amount || 0))
    ).length,
  }), [importPreview]);

  const effectiveValidationRows = useMemo<ImportValidationRow[]>(() => {
    if (importValidationRows.length) return importValidationRows;
    return importErrors.map((message) => ({ status: "ERROR" as const, message }));
  }, [importValidationRows, importErrors]);

  const validationErrorCount = useMemo(
    () => effectiveValidationRows.filter((x) => x.status === "ERROR").length,
    [effectiveValidationRows]
  );

  const canConfirm =
    canEdit && !importing && importPreview.length > 0 && validationErrorCount === 0;

  if (!open) return null;

  return (
    <div
      className={OVERLAY}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={PANEL}>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="bg-gradient-to-b from-[#0b2b4f] to-[#123b63] px-6 py-5 rounded-t-2xl">
          <div className="text-[11px] font-extrabold uppercase tracking-widest text-white/60 mb-1">
            Ventas · Excel → Borradores
          </div>
          <div className="text-xl font-black text-white">
            Carga masiva — Cobros
          </div>
        </div>

        {/* ── Cuerpo ──────────────────────────────────────────────────────── */}
        <div className="flex-1 space-y-4 p-6">

          {/* Formato esperado */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            <div className="font-semibold text-slate-900 mb-2">Formato esperado del archivo</div>
            <p className="text-xs text-slate-600 mb-3">
              El Excel debe tener la hoja <strong>COBROS</strong>. La{" "}
              <strong>fila 1</strong> contiene las claves técnicas (encabezado) y los datos
              van desde la <strong>fila 2</strong>. Descarga la plantilla para ver el formato exacto.
            </p>
            <div className="rounded-xl border bg-white p-3 space-y-1.5">
              <div className="text-xs font-extrabold uppercase tracking-wide text-slate-500 mb-1">
                COBROS
              </div>
              {[
                ["Datos cobro (A-H):",    "cobro_type, payment_date, counterparty_identifier, currency_code, total_amount, payment_method, reference, description"],
                ["Pago electrónico (I-L):","card_kind, card_last4, auth_code, bank_id"],
                ["Doc. a cobrar (M-P):",  "alloc_doc_class, alloc_doc_number, alloc_doc_type, alloc_amount"],
                ["Asiento (Q-V):",        "account_debe, account_haber, branch_code_debe, branch_code_haber, business_line_code_debe, business_line_code_haber"],
              ].map(([lbl, val]) => (
                <div key={lbl} className="text-xs text-slate-700 leading-relaxed">
                  <span className="font-semibold">{lbl}</span>{" "}
                  <span className="text-slate-500">{val}</span>
                </div>
              ))}
            </div>
            <div className="mt-2 text-xs text-slate-500">
              Tipos:&nbsp;
              <code className="bg-slate-100 px-1 rounded">COBRO</code>{" "}
              <code className="bg-slate-100 px-1 rounded">AJUSTE</code>
              &nbsp;·&nbsp;Métodos:&nbsp;
              <code className="bg-slate-100 px-1 rounded">EFECTIVO</code>{" "}
              <code className="bg-slate-100 px-1 rounded">TRANSFERENCIA</code>{" "}
              <code className="bg-slate-100 px-1 rounded">CHEQUE</code>{" "}
              <code className="bg-slate-100 px-1 rounded">TARJETA</code>
              &nbsp;·&nbsp;alloc_doc_class:&nbsp;
              <code className="bg-slate-100 px-1 rounded">FISCAL</code>{" "}
              <code className="bg-slate-100 px-1 rounded">NON_FISCAL</code>
            </div>
            {/* Nota sobre pagos parciales y multi-cobro */}
            <div className="mt-3 rounded-xl bg-sky-50 border border-sky-200 px-3 py-2.5 text-xs text-sky-800 space-y-1">
              <div className="font-semibold text-sky-900">Escenarios soportados</div>
              <div>
                <span className="font-semibold">Pago parcial:</span>{" "}
                pon en <code className="bg-sky-100 px-1 rounded">alloc_amount</code> el monto que cubre este cobro
                (puede ser menor que <code className="bg-sky-100 px-1 rounded">total_amount</code>).
              </div>
              <div>
                <span className="font-semibold">Un documento — varios cobros:</span>{" "}
                agrega múltiples filas con el mismo <code className="bg-sky-100 px-1 rounded">alloc_doc_number</code>{" "}
                y distintas referencias. Cada fila crea un cobro independiente.
              </div>
              <div>
                <span className="font-semibold">Un cobro — varios documentos:</span>{" "}
                usa el editor manual para asignar un mismo cobro a más de un documento.
              </div>
            </div>
          </div>

          {/* Selector de archivo */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-900">Seleccionar archivo</div>
                <div className="text-xs text-slate-500">Sube un Excel .xlsx o .xls</div>
              </div>
              <label className={cls(
                "cursor-pointer",
                canEdit ? btnPrimary : cls(colA, "cursor-not-allowed bg-slate-200 text-slate-500")
              )}>
                Elegir archivo
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  disabled={!canEdit || importing}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) { setSelectedFileName(f.name); onPickExcel(f); }
                    else   { setSelectedFileName(""); }
                    e.currentTarget.value = "";
                  }}
                />
              </label>
            </div>
            <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm">
              {selectedFileName
                ? <span>Archivo seleccionado: <b>{selectedFileName}</b></span>
                : <span className="text-slate-500">Aún no has seleccionado ningún archivo.</span>}
            </div>
          </div>

          {/* Resultado de validación */}
          {effectiveValidationRows.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <div className="text-sm font-semibold text-slate-900">Resultado de validación</div>
                  <div className={cls(
                    "text-xs mt-0.5",
                    validationErrorCount > 0
                      ? "text-rose-700 font-semibold"
                      : "text-emerald-700 font-semibold"
                  )}>
                    {validationErrorCount > 0
                      ? `${validationErrorCount} error(es) detectado(s). Corrígelos antes de importar.`
                      : "Validación correcta — listo para importar."}
                  </div>
                </div>
                {onExportValidationReport && (
                  <button type="button" className={btnSoft} onClick={onExportValidationReport}>
                    Exportar reporte
                  </button>
                )}
              </div>

              {validationErrorCount > 0 && (
                <div className="mt-3 max-h-48 overflow-y-auto rounded-xl border">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-rose-50 text-left">
                        <th className="px-3 py-2 font-semibold text-slate-700">Fila</th>
                        <th className="px-3 py-2 font-semibold text-slate-700">Ref / N°</th>
                        <th className="px-3 py-2 font-semibold text-slate-700">Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {effectiveValidationRows
                        .filter((r) => r.status === "ERROR")
                        .map((row, i) => (
                          <tr key={i} className="border-t">
                            <td className="px-3 py-1.5 text-slate-600">{row.row_no ?? "—"}</td>
                            <td className="px-3 py-1.5 text-slate-600">{row.number ?? "—"}</td>
                            <td className="px-3 py-1.5 text-rose-700">{row.message}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Vista previa */}
          {importPreview.length > 0 && (
            <>
              <div className="grid gap-3 grid-cols-3">
                {[
                  { label: "Cobros",            value: summary.cobros },
                  { label: "Con doc asociado",  value: summary.withAlloc },
                  { label: "Pagos parciales",   value: summary.partial,
                    hint: "alloc_amount < total_amount" },
                ].map(({ label, value, hint }) => (
                  <div key={label} className="rounded-2xl border bg-slate-50 p-3 text-center" title={hint}>
                    <div className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500">
                      {label}
                    </div>
                    <div className="mt-1 text-2xl font-black text-slate-900">{value}</div>
                  </div>
                ))}
              </div>

              <div className="overflow-hidden rounded-2xl border">
                <div className="bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
                  Vista previa ({importPreview.length} cobro{importPreview.length !== 1 ? "s" : ""})
                </div>
                <div className="max-h-60 overflow-auto">
                  <table className="min-w-full text-xs">
                    <thead className="sticky top-0 bg-white border-b">
                      <tr className="text-left text-[10px] uppercase tracking-wide text-slate-500">
                        <th className="px-3 py-2">Fila</th>
                        <th className="px-3 py-2">Tipo</th>
                        <th className="px-3 py-2">RUT / ID</th>
                        <th className="px-3 py-2">Método</th>
                        <th className="px-3 py-2">Referencia</th>
                        <th className="px-3 py-2 text-right">Monto cobro</th>
                        <th className="px-3 py-2">Doc. asignado</th>
                        <th className="px-3 py-2 text-right">Monto asig.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importPreview.map((r, i) => {
                        const totalAmt   = Number(r.total_amount || 0);
                        const allocAmt   = r.alloc_amount != null ? Number(r.alloc_amount) : null;
                        const isPartial  = allocAmt != null && allocAmt > 0 && allocAmt < Math.abs(totalAmt);
                        return (
                          <tr key={i} className="border-t last:border-b-0 hover:bg-slate-50/60">
                            <td className="px-3 py-1.5 text-slate-500">
                              {r.source_row_no ?? i + 3}
                            </td>
                            <td className="px-3 py-1.5">
                              <CobroTypeBadge type={r.cobro_type ?? ""} />
                            </td>
                            <td
                              className="px-3 py-1.5 max-w-[130px] truncate text-slate-700 font-mono text-[11px]"
                              title={r.counterparty_identifier}
                            >
                              {r.counterparty_identifier || "—"}
                            </td>
                            <td className="px-3 py-1.5">
                              <MethodBadge method={r.payment_method ?? ""} />
                            </td>
                            <td className="px-3 py-1.5 max-w-[110px] truncate text-slate-600"
                              title={r.reference}>
                              {r.reference || "—"}
                            </td>
                            <td className="px-3 py-1.5 text-right font-semibold tabular-nums">
                              {totalAmt !== 0
                                ? totalAmt.toLocaleString("es-CL")
                                : "—"}
                            </td>
                            <td className="px-3 py-1.5 max-w-[110px] truncate text-slate-700"
                              title={r.alloc_doc_number}>
                              {r.alloc_doc_number || (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums">
                              {r.has_allocation ? (
                                allocAmt != null ? (
                                  <span className={isPartial ? "text-amber-700 font-semibold" : "text-slate-700"}>
                                    {allocAmt.toLocaleString("es-CL")}
                                    {isPartial && (
                                      <span className="ml-1 text-[9px] font-bold rounded bg-amber-100 px-1 text-amber-700">
                                        PARCIAL
                                      </span>
                                    )}
                                  </span>
                                ) : (
                                  <span className="text-slate-400 text-[10px]">= cobro</span>
                                )
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* Importando */}
          {importing && (
            <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800 font-medium animate-pulse">
              Importando cobros... Por favor espera, no cierres esta ventana.
            </div>
          )}

        </div>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <div className="border-t bg-slate-50/80 px-6 py-4 flex items-center justify-between gap-2 rounded-b-2xl">
          <button
            type="button"
            className={btnSoft}
            onClick={onClose}
            disabled={importing}
          >
            Cerrar
          </button>
          <button
            type="button"
            className={cls(btnPrimary, !canConfirm && "cursor-not-allowed opacity-60")}
            disabled={!canConfirm}
            onClick={onConfirm}
          >
            {importing
              ? "Importando..."
              : `Crear ${importPreview.length > 0 ? importPreview.length : ""} borrador${importPreview.length !== 1 ? "es" : ""}`}
          </button>
        </div>

      </div>
    </div>
  );
}

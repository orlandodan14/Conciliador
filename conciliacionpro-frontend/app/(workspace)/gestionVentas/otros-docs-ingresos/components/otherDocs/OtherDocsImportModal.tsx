"use client";

import React, { useMemo, useState } from "react";
import { cls } from "./helpers";

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

const OVERLAY = "fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4";
const PANEL   = "relative w-[min(900px,96vw)] max-h-[92vh] overflow-y-auto rounded-2xl bg-white shadow-2xl flex flex-col";

const colA = "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold shadow-sm transition";
const btnPrimary = cls(colA, "bg-[#123b63] text-white hover:bg-[#0f3255]");
const btnSoft    = cls(colA, "bg-slate-100 text-slate-700 hover:bg-slate-200");

export default function OtherDocsImportModal({
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

  const summary = useMemo(() => {
    const docs  = importPreview.length;
    const withPayment = importPreview.filter((r) => r.has_payment).length;
    const withOrigin  = importPreview.filter((r) => r.has_origin).length;
    return { docs, withPayment, withOrigin };
  }, [importPreview]);

  const effectiveValidationRows = useMemo<ImportValidationRow[]>(() => {
    if (importValidationRows.length) return importValidationRows;
    return importErrors.map((message) => ({ status: "ERROR", message }));
  }, [importValidationRows, importErrors]);

  const validationErrorCount = useMemo(
    () => effectiveValidationRows.filter((x) => x.status === "ERROR").length,
    [effectiveValidationRows]
  );

  const canConfirm = canEdit && !importing && importPreview.length > 0 && validationErrorCount === 0;

  if (!open) return null;

  return (
    <div className={OVERLAY} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={PANEL}>

        {/* ── Header ────────────────────────────────────────────────────────── */}
        <div className="bg-gradient-to-b from-[#0b2b4f] to-[#123b63] px-6 py-5 rounded-t-2xl">
          <div className="text-[11px] font-extrabold uppercase tracking-widest text-white/60 mb-1">
            Ventas · Excel → Borradores
          </div>
          <div className="text-xl font-black text-white">Carga masiva — Otros documentos de ingresos</div>
        </div>

        {/* ── Cuerpo ────────────────────────────────────────────────────────── */}
        <div className="flex-1 space-y-4 p-6">

          {/* Formato esperado */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            <div className="font-semibold text-slate-900 mb-2">Formato esperado del archivo</div>
            <p className="text-xs text-slate-600 mb-3">
              El Excel debe tener la hoja <strong>DOCUMENTOS</strong> con claves técnicas en la fila 1 y
              una fila por documento desde la fila 2. Descarga la plantilla para ver el formato exacto.
            </p>
            <div className="rounded-xl border bg-white p-3">
              <div className="text-xs font-extrabold uppercase tracking-wide text-slate-500 mb-1">DOCUMENTOS</div>
              <div className="text-xs text-slate-700 leading-relaxed">
                <span className="font-semibold">Datos doc:</span>{" "}
                doc_type, issue_date, due_date, number, currency_code, branch_code, counterparty_identifier, counterparty_name, grand_total, reference
              </div>
              <div className="text-xs text-slate-700 leading-relaxed mt-1">
                <span className="font-semibold">Doc origen (solo DEV):</span>{" "}
                origin_fiscal_doc_code, origin_number
              </div>
              <div className="text-xs text-slate-700 leading-relaxed mt-1">
                <span className="font-semibold">Pago (opcional):</span>{" "}
                payment_date, payment_method, payment_amount, payment_reference, card_kind, card_last4, auth_code
              </div>
              <div className="text-xs text-slate-700 leading-relaxed mt-1">
                <span className="font-semibold">Asiento:</span>{" "}
                account_debe, account_haber, branch_code_debe, branch_code_haber, business_line_code_debe, business_line_code_haber
              </div>
            </div>
            <div className="mt-2 text-xs text-slate-500">
              Tipos válidos: <code className="bg-slate-100 px-1 rounded">OTRO_INGRESO</code>{" "}
              <code className="bg-slate-100 px-1 rounded">DEVOLUCION</code> ·{" "}
              Métodos de pago: <code className="bg-slate-100 px-1 rounded">EFECTIVO</code>{" "}
              <code className="bg-slate-100 px-1 rounded">TRANSFERENCIA</code>{" "}
              <code className="bg-slate-100 px-1 rounded">CHEQUE</code>{" "}
              <code className="bg-slate-100 px-1 rounded">TARJETA</code>
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
                  accept=".xlsx,.xls,.csv"
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
                    validationErrorCount > 0 ? "text-rose-700 font-semibold" : "text-emerald-700 font-semibold"
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
              {/* Tabla de errores */}
              {validationErrorCount > 0 && (
                <div className="mt-3 max-h-48 overflow-y-auto rounded-xl border">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-rose-50 text-left">
                        <th className="px-3 py-2 font-semibold text-slate-700">Fila</th>
                        <th className="px-3 py-2 font-semibold text-slate-700">Número</th>
                        <th className="px-3 py-2 font-semibold text-slate-700">Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {effectiveValidationRows.filter(r => r.status === "ERROR").map((row, i) => (
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
                  { label: "Documentos", value: summary.docs },
                  { label: "Con pago", value: summary.withPayment },
                  { label: "Con doc origen", value: summary.withOrigin },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-2xl border bg-slate-50 p-3 text-center">
                    <div className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500">{label}</div>
                    <div className="mt-1 text-2xl font-black text-slate-900">{value}</div>
                  </div>
                ))}
              </div>

              <div className="overflow-hidden rounded-2xl border">
                <div className="bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
                  Vista previa ({importPreview.length} documento{importPreview.length !== 1 ? "s" : ""})
                </div>
                <div className="max-h-56 overflow-auto">
                  <table className="min-w-full text-xs">
                    <thead className="sticky top-0 bg-white border-b">
                      <tr className="text-left text-[10px] uppercase tracking-wide text-slate-500">
                        <th className="px-3 py-2">Fila</th>
                        <th className="px-3 py-2">Tipo</th>
                        <th className="px-3 py-2">Número</th>
                        <th className="px-3 py-2">Contraparte</th>
                        <th className="px-3 py-2 text-right">Total</th>
                        <th className="px-3 py-2 text-center">Pago</th>
                        <th className="px-3 py-2 text-center">Origen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importPreview.map((r, i) => (
                        <tr key={i} className="border-t last:border-b-0 hover:bg-slate-50/60">
                          <td className="px-3 py-1.5 text-slate-500">{r.source_row_no ?? i + 2}</td>
                          <td className="px-3 py-1.5">
                            <span className={cls(
                              "inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold",
                              r.doc_type === "DEVOLUCION"
                                ? "bg-rose-100 text-rose-800"
                                : "bg-emerald-100 text-emerald-800"
                            )}>
                              {r.doc_type === "DEVOLUCION" ? "DEV" : "OTI"}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 font-medium">{r.number || "—"}</td>
                          <td className="px-3 py-1.5 max-w-[160px] truncate text-slate-700" title={r.counterparty_name}>
                            {r.counterparty_name || "—"}
                          </td>
                          <td className="px-3 py-1.5 text-right font-semibold">
                            {r.grand_total?.toLocaleString("es-CL") ?? "—"}
                          </td>
                          <td className="px-3 py-1.5 text-center">
                            {r.has_payment ? "✓" : <span className="text-slate-400">—</span>}
                          </td>
                          <td className="px-3 py-1.5 text-center">
                            {r.has_origin ? "✓" : <span className="text-slate-400">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* Mensaje de importando */}
          {importing && (
            <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800 font-medium animate-pulse">
              Importando documentos... Por favor espera, no cierres esta ventana.
            </div>
          )}
        </div>

        {/* ── Footer ────────────────────────────────────────────────────────── */}
        <div className="border-t bg-slate-50/80 px-6 py-4 flex items-center justify-between gap-2 rounded-b-2xl">
          <button type="button" className={btnSoft} onClick={onClose} disabled={importing}>
            Cerrar
          </button>
          <button
            type="button"
            className={cls(btnPrimary, !canConfirm && "cursor-not-allowed opacity-60")}
            disabled={!canConfirm}
            onClick={onConfirm}
          >
            {importing ? "Importando..." : `Crear ${importPreview.length > 0 ? importPreview.length : ""} borrador${importPreview.length !== 1 ? "es" : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import React, { useState } from "react";
import BaseModal from "@/app/(workspace)/gestionVentas/docs-tribut-ventas/components/tradeDocs/BaseModal";
import { cls } from "@/app/(workspace)/gestionVentas/docs-tribut-ventas/components/tradeDocs/helpers";
import { tradeDocsTheme } from "@/app/(workspace)/gestionVentas/docs-tribut-ventas/components/tradeDocs/ui";

// ── Tipos exportados ─────────────────────────────────────────────────────────

export type AsientosImportIssue = {
  level: "error" | "warn";
  code: string;
  message: string;
};

export type AsientosImportPreviewRow = {
  entry_key: string;
  entry_date: string;
  description: string;
  lines_count: number;
  currency_code: string;
};

// ── Props ────────────────────────────────────────────────────────────────────

type Props = {
  open: boolean;
  canEdit: boolean;
  importState: "idle" | "reading" | "parsing" | "validating" | "saving" | "done";
  issues: AsientosImportIssue[];
  previewRows: AsientosImportPreviewRow[];
  onClose: () => void;
  onConfirm: () => void;
  onPickExcel: (file: File) => void;
};

// ── Componente ───────────────────────────────────────────────────────────────

export default function AsientosImportModal({
  open,
  canEdit,
  importState,
  issues,
  previewRows,
  onClose,
  onConfirm,
  onPickExcel,
}: Props) {
  const [selectedFileName, setSelectedFileName] = useState("");

  const errorCount = issues.filter((x) => x.level === "error").length;
  const isWorking =
    importState === "reading" ||
    importState === "parsing" ||
    importState === "validating" ||
    importState === "saving";

  const canConfirm =
    canEdit && !isWorking && previewRows.length > 0 && errorCount === 0;

  const totalLines = previewRows.reduce((s, r) => s + r.lines_count, 0);
  const uniqueCurrencies = new Set(previewRows.map((r) => r.currency_code)).size;

  return (
    <BaseModal
      open={open}
      title="Carga masiva de asientos"
      subtitle="Gestión Contable • Excel → Borradores"
      onClose={onClose}
      widthClass="w-[min(1000px,96vw)]"
      footer={
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            className={tradeDocsTheme.btnSoft}
            onClick={onClose}
            disabled={isWorking}
          >
            Cerrar
          </button>
          <button
            type="button"
            className={cls(
              tradeDocsTheme.btnPrimary,
              !canConfirm && "cursor-not-allowed opacity-60"
            )}
            disabled={!canConfirm}
            onClick={onConfirm}
          >
            {importState === "saving" ? "Creando borradores..." : "Crear borradores"}
          </button>
        </div>
      }
    >
      <div className="space-y-4">

        {/* ── Formato esperado ── */}
        <div className="rounded-2xl border bg-slate-50 p-4 text-sm text-slate-700">
          <div className="font-semibold text-slate-900">Formato esperado del archivo</div>
          <div className="mt-1 text-xs text-slate-500">
            El Excel debe contener una hoja llamada{" "}
            <span className="font-bold text-slate-700">PLANTILLA</span> con las siguientes columnas:
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border bg-white p-3">
              <div className="text-xs font-extrabold uppercase tracking-wide text-slate-500">
                Encabezado del asiento
              </div>
              <div className="mt-2 text-xs text-slate-600 leading-relaxed">
                entry_key, entry_date, description, currency_code
              </div>
            </div>
            <div className="rounded-xl border bg-white p-3">
              <div className="text-xs font-extrabold uppercase tracking-wide text-slate-500">
                Líneas / Partidas
              </div>
              <div className="mt-2 text-xs text-slate-600 leading-relaxed">
                line_no, account_code, line_description, debit, credit,
                counterparty_identifier, cost_center_code,
                business_line_code, branch_code
              </div>
            </div>
          </div>
        </div>

        {/* ── Selector de archivo ── */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-900">Seleccionar archivo</div>
              <div className="text-xs text-slate-500">Sube un Excel .xlsx o .xls</div>
            </div>
            <label
              className={cls(
                "inline-flex cursor-pointer items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold shadow-sm transition",
                canEdit && !isWorking
                  ? "bg-[#123b63] text-white hover:bg-[#0f3255]"
                  : "cursor-not-allowed bg-slate-200 text-slate-500"
              )}
            >
              {isWorking ? "Procesando..." : "Elegir archivo"}
              <input
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                disabled={!canEdit || isWorking}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    setSelectedFileName(f.name);
                    onPickExcel(f);
                  } else {
                    setSelectedFileName("");
                  }
                  e.currentTarget.value = "";
                }}
              />
            </label>
          </div>
          <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm">
            {isWorking ? (
              <span className="text-slate-500">
                {importState === "reading" && "Leyendo archivo…"}
                {importState === "parsing" && "Analizando estructura…"}
                {importState === "validating" && "Validando datos…"}
                {importState === "saving" && "Guardando borradores…"}
              </span>
            ) : selectedFileName ? (
              <span className="text-slate-700">
                Archivo seleccionado: <b>{selectedFileName}</b>
              </span>
            ) : (
              <span className="text-slate-400">Aún no has seleccionado ningún archivo.</span>
            )}
          </div>
        </div>

        {/* ── Resultado de validación ── */}
        {issues.length > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-3">
              <div className="text-sm font-semibold text-slate-900">Resultado de validación</div>
              <div className="text-xs text-slate-500">
                {errorCount > 0
                  ? `Se detectaron ${errorCount} error(es). Corrígelos en el archivo y vuelve a cargar.`
                  : "Validación correcta — sin errores."}
              </div>
            </div>
            <div className="max-h-48 overflow-auto rounded-xl border">
              <table className="min-w-full text-xs">
                <thead className="sticky top-0 bg-white border-b">
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2 w-20">Nivel</th>
                    <th className="px-3 py-2">Mensaje</th>
                  </tr>
                </thead>
                <tbody>
                  {issues.map((issue, i) => (
                    <tr key={i} className="border-b last:border-b-0">
                      <td className="px-3 py-2">
                        <span
                          className={cls(
                            "rounded-full px-2 py-0.5 text-xs font-semibold",
                            issue.level === "error"
                              ? "bg-rose-100 text-rose-700"
                              : "bg-amber-100 text-amber-700"
                          )}
                        >
                          {issue.level === "error" ? "Error" : "Aviso"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-700">{issue.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Vista previa ── */}
        {previewRows.length > 0 && (
          <>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border bg-slate-50 p-3">
                <div className="text-xs font-extrabold uppercase tracking-wide text-slate-500">
                  Asientos
                </div>
                <div className="mt-1 text-2xl font-black text-slate-900">
                  {previewRows.length}
                </div>
              </div>
              <div className="rounded-2xl border bg-slate-50 p-3">
                <div className="text-xs font-extrabold uppercase tracking-wide text-slate-500">
                  Total líneas
                </div>
                <div className="mt-1 text-2xl font-black text-slate-900">{totalLines}</div>
              </div>
              <div className="rounded-2xl border bg-slate-50 p-3">
                <div className="text-xs font-extrabold uppercase tracking-wide text-slate-500">
                  Monedas
                </div>
                <div className="mt-1 text-2xl font-black text-slate-900">{uniqueCurrencies}</div>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border">
              <div className="bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
                Vista previa ({previewRows.length} asiento{previewRows.length !== 1 ? "s" : ""})
              </div>
              <div className="max-h-[300px] overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 bg-white border-b">
                    <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2">Clave</th>
                      <th className="px-3 py-2">Fecha</th>
                      <th className="px-3 py-2">Descripción</th>
                      <th className="px-3 py-2">Moneda</th>
                      <th className="px-3 py-2 text-right">Líneas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((r, i) => (
                      <tr key={i} className="border-b last:border-b-0 hover:bg-slate-50">
                        <td className="px-3 py-2 font-mono text-xs text-slate-600">
                          {r.entry_key}
                        </td>
                        <td className="px-3 py-2">{r.entry_date}</td>
                        <td className="max-w-xs truncate px-3 py-2 text-slate-700">
                          {r.description || "—"}
                        </td>
                        <td className="px-3 py-2 font-medium">{r.currency_code}</td>
                        <td className="px-3 py-2 text-right">{r.lines_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

      </div>
    </BaseModal>
  );
}

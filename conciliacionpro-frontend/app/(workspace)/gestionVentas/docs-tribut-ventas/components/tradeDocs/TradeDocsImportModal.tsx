"use client";

import React, { useMemo, useState } from "react";
import BaseModal from "@/app/(workspace)/gestionVentas/docs-tribut-ventas/components/tradeDocs/BaseModal";
import { cls, folioLabel } from "@/app/(workspace)/gestionVentas/docs-tribut-ventas/components/tradeDocs/helpers";
import { tradeDocsTheme } from "@/app/(workspace)/gestionVentas/docs-tribut-ventas/components/tradeDocs/ui";

type ActionReportRow = {
  scope: "IMPORT_VALIDATE" | "IMPORT_PROCESS" | "REGISTER" | "DELETE" | "SAVE";
  status: "OK" | "ERROR";
  doc_key?: string | null;
  trade_doc_id?: string | null;
  row_ref?: string | null;
  message: string;
};

type Props = {
  open: boolean;
  canEdit: boolean;
  importing: boolean;
  importErrors?: string[];
  importValidationRows?: ActionReportRow[];
  importPreview: any[];
  onClose: () => void;
  onConfirm: () => void;
  onPickExcel: (file: File) => void;
  onExportValidationReport?: () => void;
};

export default function TradeDocsImportModal({
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
    const docs = importPreview.length;
    const lines = importPreview.reduce((acc, r) => acc + Number(r.lines_count || 0), 0);
    const payments = importPreview.reduce((acc, r) => acc + Number(r.payments_count || 0), 0);
    return { docs, lines, payments };
  }, [importPreview]);
  const effectiveValidationRows = useMemo<ActionReportRow[]>(() => {
    if (importValidationRows.length) return importValidationRows;
    return importErrors.map((message) => ({
      scope: "IMPORT_VALIDATE",
      status: "ERROR",
      message,
    }));
  }, [importValidationRows, importErrors]);

  const validationErrorCount = useMemo(() => {
    return effectiveValidationRows.filter((x) => x.status === "ERROR").length;
  }, [effectiveValidationRows]);


  return (
    <BaseModal
      open={open}
      title="Carga masiva"
      subtitle="Ventas • Excel → Borradores"
      onClose={onClose}
      widthClass="w-[min(1100px,96vw)]"
      footer={
        <div className="flex items-center justify-between gap-2">
          <button className={tradeDocsTheme.btnSoft} onClick={onClose} disabled={importing}>
            Cerrar
          </button>

          <button
            className={cls(
              tradeDocsTheme.btnPrimary,
              (!canEdit || importing || !importPreview.length || validationErrorCount > 0) &&
                "cursor-not-allowed opacity-60"
            )}
            disabled={!canEdit || importing || !importPreview.length || validationErrorCount > 0}
            onClick={onConfirm}
          >
            {importing ? "Importando..." : "Crear borradores"}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="rounded-2xl border bg-slate-50 p-4 text-sm text-slate-700">
          <div className="font-semibold text-slate-900">Formato esperado del archivo</div>
          <div className="mt-2">
            El Excel debe venir con estas hojas:
            <span className="ml-1 font-bold">DOCUMENTOS</span>,
            <span className="ml-1 font-bold">LINEAS</span> y
            <span className="ml-1 font-bold">PAGOS</span>.
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border bg-white p-3">
              <div className="text-xs font-extrabold uppercase tracking-wide text-slate-500">
                DOCUMENTOS
              </div>
              <div className="mt-2 text-xs text-slate-700">
                doc_type, fiscal_doc_code, issue_date, due_date, series, number, currency_code,
                branch_code, counterparty_identifier, counterparty_name, reference,
                origin_fiscal_doc_code, origin_series, origin_number
              </div>
            </div>

            <div className="rounded-xl border bg-white p-3">
              <div className="text-xs font-extrabold uppercase tracking-wide text-slate-500">
                LINEAS
              </div>
              <div className="mt-2 text-xs text-slate-700">
                fiscal_doc_code, number, line_no, sku, description, qty, unit_price, tax_kind,
                tax_rate, exempt_amount, taxable_amount, tax_amount, line_total
              </div>
            </div>

            <div className="rounded-xl border bg-white p-3">
              <div className="text-xs font-extrabold uppercase tracking-wide text-slate-500">
                PAGOS
              </div>
              <div className="mt-2 text-xs text-slate-700">
                fiscal_doc_code, number, payment_no, payment_date, method, reference, card_kind,
                card_last4, auth_code, amount
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-900">Seleccionar archivo</div>
              <div className="text-xs text-slate-500">
                Sube un Excel .xlsx, .xls o .csv
              </div>
            </div>

            <label
              className={cls(
                "inline-flex cursor-pointer items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold shadow-sm transition",
                canEdit
                  ? "bg-[#123b63] text-white hover:bg-[#0f3255]"
                  : "cursor-not-allowed bg-slate-200 text-slate-500"
              )}
            >
              Elegir archivo
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                disabled={!canEdit || importing}
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

          <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-700">
            {selectedFileName ? (
              <span>
                Archivo seleccionado: <b>{selectedFileName}</b>
              </span>
            ) : (
              <span className="text-slate-500">Aún no has seleccionado ningún archivo.</span>
            )}
          </div>
        </div>

        {effectiveValidationRows.length ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-900">Resultado de validación</div>
                <div className="text-xs text-slate-500">
                  {validationErrorCount > 0
                    ? `Se detectaron ${validationErrorCount} error(es).`
                    : "Validación correcta."}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {onExportValidationReport && effectiveValidationRows.length ? (
                  <button
                    type="button"
                    className={tradeDocsTheme.btnSoft}
                    onClick={onExportValidationReport}
                  >
                    Exportar reporte
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {importPreview.length ? (
          <>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border bg-slate-50 p-3">
                <div className="text-xs font-extrabold uppercase tracking-wide text-slate-500">
                  Documentos
                </div>
                <div className="mt-1 text-2xl font-black text-slate-900">{summary.docs}</div>
              </div>

              <div className="rounded-2xl border bg-slate-50 p-3">
                <div className="text-xs font-extrabold uppercase tracking-wide text-slate-500">
                  Líneas
                </div>
                <div className="mt-1 text-2xl font-black text-slate-900">{summary.lines}</div>
              </div>

              <div className="rounded-2xl border bg-slate-50 p-3">
                <div className="text-xs font-extrabold uppercase tracking-wide text-slate-500">
                  Pagos
                </div>
                <div className="mt-1 text-2xl font-black text-slate-900">{summary.payments}</div>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border">
              <div className="bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
                Vista previa ({importPreview.length} documentos)
              </div>

              <div className="max-h-[340px] overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2">Tipo</th>
                      <th className="px-3 py-2">Código</th>
                      <th className="px-3 py-2">Folio</th>
                      <th className="px-3 py-2">Cliente</th>
                      <th className="px-3 py-2">Sucursal</th>
                      <th className="px-3 py-2 text-right">Líneas</th>
                      <th className="px-3 py-2 text-right">Pagos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview.map((r, i) => (
                      <tr key={`${r.doc_key}-${i}`} className="border-b last:border-b-0">
                        <td className="px-3 py-2">{r.doc_type}</td>
                        <td className="px-3 py-2">{r.fiscal_doc_code || "—"}</td>
                        <td className="px-3 py-2">{folioLabel(r.series, r.number)}</td>
                        <td className="px-3 py-2">{r.counterparty_name || "—"}</td>
                        <td className="px-3 py-2">{r.branch_code || "—"}</td>
                        <td className="px-3 py-2 text-right">{r.lines_count || 0}</td>
                        <td className="px-3 py-2 text-right">{r.payments_count || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </BaseModal>
  );
}
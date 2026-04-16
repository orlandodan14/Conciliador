"use client";

import React from "react";
import BaseModal from "@/app/(workspace)/gestionVentas/docs-tribut-ventas/components/tradeDocs/BaseModal";
import { cls, ellipsis, folioLabel } from "@/app/(workspace)/gestionVentas/docs-tribut-ventas/components/tradeDocs/helpers";
import { tradeDocsTheme } from "@/app/(workspace)/gestionVentas/docs-tribut-ventas/components/tradeDocs/ui";

type Props = {
  open: boolean;
  canEdit: boolean;
  importing: boolean;
  importErrors: string[];
  importPreview: any[];
  onClose: () => void;
  onConfirm: () => void;
  onPickExcel: (file: File) => void;
};

export default function TradeDocsImportModal({
  open,
  canEdit,
  importing,
  importErrors,
  importPreview,
  onClose,
  onConfirm,
  onPickExcel,
}: Props) {
  return (
    <BaseModal
      open={open}
      title="Carga masiva"
      subtitle="Ventas • Excel → Borradores"
      onClose={onClose}
      widthClass="w-[min(900px,96vw)]"
      footer={
        <div className="flex items-center justify-between gap-2">
          <button className={tradeDocsTheme.btnSoft} onClick={onClose} disabled={importing}>
            Cerrar
          </button>

          <button
            className={cls(
              tradeDocsTheme.btnPrimary,
              (!canEdit || importing || !importPreview.length || importErrors.length > 0) &&
                "cursor-not-allowed opacity-60"
            )}
            disabled={!canEdit || importing || !importPreview.length || importErrors.length > 0}
            onClick={onConfirm}
          >
            {importing ? "Importando..." : "Crear borradores"}
          </button>
        </div>
      }
    >
      <div className="rounded-2xl border bg-slate-50 p-3 text-sm text-slate-700">
        Sube un Excel con columnas:{" "}
        <b>
          doc_type, fiscal_doc_code, issue_date, due_date, series, number, currency_code,
          counterparty_identifier, counterparty_name, reference
        </b>
        .
        <div className="mt-1 text-xs text-slate-500">Hoja recomendada: “Ventas”.</div>
      </div>

      <div className="mt-3">
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPickExcel(f);
            e.currentTarget.value = "";
          }}
        />
      </div>

      {importErrors.length ? (
        <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
          <b>Errores:</b>
          <ul className="mt-2 list-disc pl-5">
            {importErrors.slice(0, 12).map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {importPreview.length ? (
        <div className="mt-3 overflow-hidden rounded-2xl border">
          <div className="bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Preview ({importPreview.length} filas)
          </div>

          <div className="max-h-[360px] overflow-y-auto overflow-x-hidden">
            <table className="w-full table-fixed border-collapse text-sm">
              <colgroup>
                <col style={{ width: "14%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "16%" }} />
                <col style={{ width: "16%" }} />
                <col style={{ width: "12%" }} />
                <col style={{ width: "32%" }} />
              </colgroup>

              <thead>
                <tr className="bg-white">
                  <th className="border px-2 py-2 text-left">doc_type</th>
                  <th className="border px-2 py-2 text-left">fiscal</th>
                  <th className="border px-2 py-2 text-left">issue</th>
                  <th className="border px-2 py-2 text-left">due</th>
                  <th className="border px-2 py-2 text-left">folio</th>
                  <th className="border px-2 py-2 text-left">counterparty</th>
                </tr>
              </thead>

              <tbody>
                {importPreview.slice(0, 50).map((r, i) => (
                  <tr key={i} className="hover:bg-sky-50/30">
                    <td className="border px-2 py-2">{r.doc_type}</td>
                    <td className="border px-2 py-2">{r.fiscal_doc_code || "—"}</td>
                    <td className="border px-2 py-2">{r.issue_date}</td>
                    <td className="border px-2 py-2">{r.due_date}</td>
                    <td className="border px-2 py-2">{folioLabel(r.series, r.number)}</td>
                    <td className="border px-2 py-2">
                      {ellipsis(r.counterparty_name || r.counterparty_identifier || "—", 40)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border-t bg-slate-50 px-3 py-2 text-xs text-slate-500">
            Mostrando 50 filas en preview.
          </div>
        </div>
      ) : null}
    </BaseModal>
  );
}
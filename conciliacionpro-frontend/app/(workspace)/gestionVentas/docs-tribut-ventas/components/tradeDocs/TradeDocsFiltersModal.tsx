"use client";

import React from "react";
import type { TradeDocListFilters } from "@/app/(workspace)/gestionVentas/docs-tribut-ventas/components/tradeDocs/types";
import BaseModal from "@/app/(workspace)/gestionVentas/docs-tribut-ventas/components/tradeDocs/BaseModal";
import { tradeDocsTheme } from "@/app/(workspace)/gestionVentas/docs-tribut-ventas/components/tradeDocs/ui";

type Props = {
  open: boolean;
  activeTab: "drafts" | "registered";
  filters: TradeDocListFilters;
  setFilters: React.Dispatch<React.SetStateAction<TradeDocListFilters>>;
  onClose: () => void;
  onClear: () => void;
  resultCount: number;
};

type NumericFilterModel = TradeDocListFilters["grand_total_filter"];

function NumericFilterBlock({
  label,
  value,
  onChange,
}: {
  label: string;
  value: NumericFilterModel;
  onChange: (next: NumericFilterModel) => void;
}) {
  const inputCls =
    "h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-[#123b63]";

  const isBetween = value.op === "between";

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
      <label className="mb-2 block text-xs font-semibold text-slate-600">{label}</label>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <select
          className={inputCls}
          value={value.op}
          onChange={(e) =>
            onChange({
              op: e.target.value as NumericFilterModel["op"],
              value1: value.value1,
              value2: e.target.value === "between" ? value.value2 : "",
            })
          }
        >
          <option value="">Todas</option>
          <option value="between">Entre</option>
          <option value="eq">Igual a</option>
          <option value="neq">Diferente de</option>
          <option value="gt">Mayor que</option>
          <option value="gte">Mayor o igual</option>
          <option value="lt">Menor que</option>
          <option value="lte">Menor o igual</option>
        </select>

        <input
          type="number"
          className={inputCls}
          value={value.value1}
          onChange={(e) =>
            onChange({
              ...value,
              value1: e.target.value,
            })
          }
          placeholder={isBetween ? "Desde" : "Valor"}
        />

        {isBetween ? (
          <input
            type="number"
            className={inputCls}
            value={value.value2}
            onChange={(e) =>
              onChange({
                ...value,
                value2: e.target.value,
              })
            }
            placeholder="Hasta"
          />
        ) : (
          <div />
        )}
      </div>
    </div>
  );
}

export default function TradeDocsFiltersModal({
  open,
  activeTab,
  filters,
  setFilters,
  onClose,
  onClear,
  resultCount,
}: Props) {
  return (
    <BaseModal
      open={open}
      title="Filtros de documentos"
      subtitle={`Ventas • ${activeTab === "drafts" ? "Borradores" : "Registrados"}`}
      onClose={onClose}
      widthClass="w-[min(860px,96vw)]"
      footer={
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs text-slate-500">{resultCount} resultado(s)</div>

          <div className="flex items-center gap-2">
            <button type="button" className={tradeDocsTheme.btnSoft} onClick={onClear}>
              Limpiar
            </button>

            <button type="button" className={tradeDocsTheme.btnSoft} onClick={onClose}>
              Cerrar
            </button>

            <button type="button" className={tradeDocsTheme.btnPrimary} onClick={onClose}>
              Aplicar
            </button>
          </div>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Fecha desde</label>
          <input
            type="date"
            className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-[#123b63]"
            value={filters.issue_date_from}
            onChange={(e) =>
              setFilters((f) => ({ ...f, issue_date_from: e.target.value }))
            }
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Fecha hasta</label>
          <input
            type="date"
            className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-[#123b63]"
            value={filters.issue_date_to}
            onChange={(e) =>
              setFilters((f) => ({ ...f, issue_date_to: e.target.value }))
            }
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Tipo</label>
          <select
            className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-[#123b63]"
            value={filters.doc_type}
            onChange={(e) => setFilters((f) => ({ ...f, doc_type: e.target.value }))}
          >
            <option value="">Todos</option>
            <option value="INVOICE">Factura</option>
            <option value="DEBIT_NOTE">Nota débito</option>
            <option value="CREDIT_NOTE">Nota crédito</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Folio</label>
          <input
            className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-[#123b63]"
            value={filters.number}
            onChange={(e) => setFilters((f) => ({ ...f, number: e.target.value }))}
            placeholder="1,2,3 o 1-3"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">RUT / ID</label>
          <input
            className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-[#123b63]"
            value={filters.counterparty_identifier}
            onChange={(e) =>
              setFilters((f) => ({ ...f, counterparty_identifier: e.target.value }))
            }
            placeholder="11.111.111-1"
          />
        </div>

        <div className="md:col-span-2">
          <label className="mb-1 block text-xs font-medium text-slate-600">Nombre</label>
          <input
            className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-[#123b63]"
            value={filters.counterparty_name}
            onChange={(e) =>
              setFilters((f) => ({ ...f, counterparty_name: e.target.value }))
            }
            placeholder="Orlando"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Situación</label>
          <select
            className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-[#123b63]"
            value={filters.payment_state}
            onChange={(e) =>
              setFilters((f) => ({ ...f, payment_state: e.target.value }))
            }
          >
            <option value="">Todas</option>
            <option value="PENDIENTE">Pendiente</option>
            <option value="PAGADO">Pagado</option>
            <option value="SALDO_A_FAVOR">Saldo a favor</option>
            <option value="CANCELADO">Cancelado</option>
          </select>
        </div>

        <div className="md:col-span-2 xl:col-span-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
          <NumericFilterBlock
            label="Monto"
            value={filters.grand_total_filter}
            onChange={(next) =>
              setFilters((f) => ({
                ...f,
                grand_total_filter: next,
              }))
            }
          />

          <NumericFilterBlock
            label="Saldo"
            value={filters.balance_filter}
            onChange={(next) =>
              setFilters((f) => ({
                ...f,
                balance_filter: next,
              }))
            }
          />
        </div>
      </div>
    </BaseModal>
  );
}
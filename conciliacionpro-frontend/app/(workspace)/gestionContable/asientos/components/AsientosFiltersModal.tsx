"use client";

import React from "react";
import BaseModal from "@/app/(workspace)/gestionVentas/docs-tribut-ventas/components/tradeDocs/BaseModal";
import { tradeDocsTheme } from "@/app/(workspace)/gestionVentas/docs-tribut-ventas/components/tradeDocs/ui";

// ── Tipos ────────────────────────────────────────────────────────────────────

export type AsientosNumericFilterOp =
  | ""
  | "between"
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte";

export type AsientosNumericFilter = {
  op: AsientosNumericFilterOp;
  value1: string;
  value2: string;
};

export type AsientosFilters = {
  entry_date_from: string;
  entry_date_to: string;
  /** "" = todos | "manual" | "trade_docs" | "non_fiscal" | "cobros" | "import" */
  source: string;
  currency_code: string;
  counterparty_identifier: string;
  counterparty_name: string;
  description: string;
  debit_filter: AsientosNumericFilter;
  credit_filter: AsientosNumericFilter;
};

export const EMPTY_ASIENTOS_FILTERS: AsientosFilters = {
  entry_date_from: "",
  entry_date_to: "",
  source: "",
  currency_code: "",
  counterparty_identifier: "",
  counterparty_name: "",
  description: "",
  debit_filter: { op: "", value1: "", value2: "" },
  credit_filter: { op: "", value1: "", value2: "" },
};

// ── Props ────────────────────────────────────────────────────────────────────

type Props = {
  open: boolean;
  activeTab: "drafts" | "registered";
  onClose: () => void;
  filters: AsientosFilters;
  onChange: (f: AsientosFilters) => void;
  onClear: () => void;
  resultCount: number;
};

// ── Helpers internos ─────────────────────────────────────────────────────────

const inputCls =
  "h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-[#123b63]";

function NumericFilterBlock({
  label,
  value,
  onChange,
}: {
  label: string;
  value: AsientosNumericFilter;
  onChange: (next: AsientosNumericFilter) => void;
}) {
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
              op: e.target.value as AsientosNumericFilterOp,
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
          onChange={(e) => onChange({ ...value, value1: e.target.value })}
          placeholder={isBetween ? "Desde" : "Valor"}
        />

        {isBetween ? (
          <input
            type="number"
            className={inputCls}
            value={value.value2}
            onChange={(e) => onChange({ ...value, value2: e.target.value })}
            placeholder="Hasta"
          />
        ) : (
          <div />
        )}
      </div>
    </div>
  );
}

// ── Componente principal ─────────────────────────────────────────────────────

export default function AsientosFiltersModal({
  open,
  activeTab,
  onClose,
  filters,
  onChange,
  onClear,
  resultCount,
}: Props) {
  function set<K extends keyof AsientosFilters>(key: K, value: AsientosFilters[K]) {
    onChange({ ...filters, [key]: value });
  }

  return (
    <BaseModal
      open={open}
      title="Filtros de asientos contables"
      subtitle={`Gestión Contable • ${activeTab === "drafts" ? "Borradores" : "Registrados"}`}
      onClose={onClose}
      widthClass="w-[min(900px,96vw)]"
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

        {/* Fecha desde */}
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Fecha desde</label>
          <input
            type="date"
            className={inputCls}
            value={filters.entry_date_from}
            onChange={(e) => set("entry_date_from", e.target.value)}
          />
        </div>

        {/* Fecha hasta */}
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Fecha hasta</label>
          <input
            type="date"
            className={inputCls}
            value={filters.entry_date_to}
            onChange={(e) => set("entry_date_to", e.target.value)}
          />
        </div>

        {/* Origen */}
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Origen</label>
          <select
            className={inputCls}
            value={filters.source}
            onChange={(e) => set("source", e.target.value)}
          >
            <option value="">Todos</option>
            <option value="manual">Manual</option>
            <option value="trade_docs">Doc Tributario</option>
            <option value="non_fiscal">Otro Ingreso</option>
            <option value="cobros">Cobro</option>
            <option value="import">Importación masiva</option>
          </select>
        </div>

        {/* Moneda */}
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Moneda</label>
          <input
            type="text"
            className={inputCls}
            placeholder="CLP, USD…"
            value={filters.currency_code}
            onChange={(e) => set("currency_code", e.target.value.toUpperCase())}
            maxLength={5}
          />
        </div>

        {/* RUT / ID */}
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">RUT / NIC</label>
          <input
            type="text"
            className={inputCls}
            placeholder="11.111.111-1"
            value={filters.counterparty_identifier}
            onChange={(e) => set("counterparty_identifier", e.target.value)}
          />
        </div>

        {/* Nombre contraparte */}
        <div className="md:col-span-2">
          <label className="mb-1 block text-xs font-medium text-slate-600">Nombre Contraparte</label>
          <input
            type="text"
            className={inputCls}
            placeholder="Nombre / Razón social"
            value={filters.counterparty_name}
            onChange={(e) => set("counterparty_name", e.target.value)}
          />
        </div>

        {/* Descripción */}
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Descripción</label>
          <input
            type="text"
            className={inputCls}
            placeholder="Texto en descripción…"
            value={filters.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </div>

        {/* Debe */}
        <div className="md:col-span-2 xl:col-span-4">
          <NumericFilterBlock
            label="Total Debe"
            value={filters.debit_filter}
            onChange={(next) => set("debit_filter", next)}
          />
        </div>

        {/* Haber */}
        <div className="md:col-span-2 xl:col-span-4">
          <NumericFilterBlock
            label="Total Haber"
            value={filters.credit_filter}
            onChange={(next) => set("credit_filter", next)}
          />
        </div>

      </div>
    </BaseModal>
  );
}

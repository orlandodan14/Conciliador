"use client";

import React from "react";
import type { CobrosListFilters, NumericFilterOperator } from "./types";
import BaseModal from "@/app/(workspace)/gestionVentas/docs-tribut-ventas/components/tradeDocs/BaseModal";
import { tradeDocsTheme } from "@/app/(workspace)/gestionVentas/docs-tribut-ventas/components/tradeDocs/ui";

type Props = {
  open: boolean;
  activeTab: string;
  onClose: () => void;
  filters: CobrosListFilters;
  onChange: (f: CobrosListFilters) => void;
  onClear: () => void;
  resultCount: number;
};

type AmountFilter = CobrosListFilters["amount_filter"];

const inputCls =
  "h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-[#123b63]";

function NumericFilterBlock({
  label,
  value,
  onChange,
}: {
  label: string;
  value: AmountFilter;
  onChange: (next: AmountFilter) => void;
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
              op: e.target.value as NumericFilterOperator,
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

export default function CobrosFiltersModal({
  open,
  activeTab,
  onClose,
  filters,
  onChange,
  onClear,
  resultCount,
}: Props) {
  function set<K extends keyof CobrosListFilters>(key: K, value: CobrosListFilters[K]) {
    onChange({ ...filters, [key]: value });
  }

  return (
    <BaseModal
      open={open}
      title="Filtros de cobros"
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

        {/* Fecha desde */}
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Fecha desde</label>
          <input
            type="date"
            className={inputCls}
            value={filters.issue_date_from}
            onChange={(e) => set("issue_date_from", e.target.value)}
          />
        </div>

        {/* Fecha hasta */}
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Fecha hasta</label>
          <input
            type="date"
            className={inputCls}
            value={filters.issue_date_to}
            onChange={(e) => set("issue_date_to", e.target.value)}
          />
        </div>

        {/* Tipo */}
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Tipo</label>
          <select
            className={inputCls}
            value={filters.cobro_type}
            onChange={(e) => set("cobro_type", e.target.value)}
          >
            <option value="">Todos</option>
            <option value="COBRO">Cobro</option>
            <option value="ANTICIPO">Anticipo de cliente</option>
            <option value="AJUSTE">Ajuste</option>
          </select>
        </div>

        {/* Forma de pago */}
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Forma de pago</label>
          <select
            className={inputCls}
            value={filters.payment_method}
            onChange={(e) => set("payment_method", e.target.value)}
          >
            <option value="">Todas</option>
            <option value="EFECTIVO">Efectivo</option>
            <option value="TRANSFERENCIA">Transferencia</option>
            <option value="CHEQUE">Cheque</option>
            <option value="TARJETA">Tarjeta</option>
          </select>
        </div>

        {/* Número */}
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Número</label>
          <input
            type="text"
            className={inputCls}
            placeholder="Número del cobro"
            value={filters.number}
            onChange={(e) => set("number", e.target.value)}
          />
        </div>

        {/* RUT / ID */}
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">RUT / ID</label>
          <input
            type="text"
            className={inputCls}
            placeholder="11.111.111-1"
            value={filters.counterparty_identifier}
            onChange={(e) => set("counterparty_identifier", e.target.value)}
          />
        </div>

        {/* Nombre */}
        <div className="md:col-span-2">
          <label className="mb-1 block text-xs font-medium text-slate-600">Nombre cliente</label>
          <input
            type="text"
            className={inputCls}
            placeholder="Nombre / Razón social"
            value={filters.counterparty_name}
            onChange={(e) => set("counterparty_name", e.target.value)}
          />
        </div>

        {/* Monto */}
        <div className="md:col-span-2 xl:col-span-4">
          <NumericFilterBlock
            label="Monto"
            value={filters.amount_filter}
            onChange={(next) => set("amount_filter", next)}
          />
        </div>

      </div>
    </BaseModal>
  );
}

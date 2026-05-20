"use client";

import React from "react";

/** Estilos tomados del tradeDocsTheme (mismo diseño que los otros módulos). */
const btnFilter =
  "rounded-xl border border-[#123b63]/20 bg-[#123b63] px-4 py-2 text-sm font-bold text-white transition-all duration-200 hover:bg-[#0f3354] hover:-translate-y-[1px] hover:shadow-md active:translate-y-0";
const btnSoft =
  "rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-all duration-200 hover:bg-slate-50 hover:border-slate-400 hover:-translate-y-[1px] hover:shadow-sm active:translate-y-0";

type Props = {
  /** Se muestra un punto "●" junto al texto del botón cuando hay filtros activos. */
  hasActiveFilters: boolean;
  onOpenFilters: () => void;
  onClearFilters: () => void;
  onReport: () => void;
  reportTitle?: string;
};

/**
 * Trío estándar de botones: Filtros · Limpiar filtros · ↓ Reporte
 *
 * Úsalo en cualquier módulo que tenga barra de acciones de tab, justo antes
 * o después de los botones específicos del módulo. Cada módulo abre su propio
 * modal de filtros, pero los botones tienen siempre el mismo aspecto visual.
 */
export default function FilterActionButtons({
  hasActiveFilters,
  onOpenFilters,
  onClearFilters,
  onReport,
  reportTitle = "Descargar Excel con filtros aplicados",
}: Props) {
  return (
    <>
      <button
        type="button"
        className={btnFilter}
        onClick={onOpenFilters}
        title="Abrir panel de filtros"
      >
        Filtros{hasActiveFilters ? " ●" : ""}
      </button>

      <button
        type="button"
        className={btnSoft}
        onClick={onClearFilters}
        title="Limpiar todos los filtros"
      >
        Limpiar filtros
      </button>

      <button
        type="button"
        className={btnSoft}
        onClick={onReport}
        title={reportTitle}
      >
        ↓ Reporte
      </button>
    </>
  );
}

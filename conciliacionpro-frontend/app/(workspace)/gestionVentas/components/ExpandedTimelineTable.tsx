"use client";

import React from "react";
import { Eye } from "lucide-react";

// ─── Utilidades internas ──────────────────────────────────────────────────────

function cls(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

function fmt(n: number, decimals: number): string {
  return n.toLocaleString("es-CL", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

// ─── Badge de estado — idéntico en todos los módulos ─────────────────────────

export function itemStatusBadge(
  eventType: string,
  itemStatus: string | null | undefined
): { text: string; cls: string } {
  const s = String(itemStatus || "").toUpperCase();
  if (eventType === "PAYMENT") {
    // Usar el estado real del cobro (BORRADOR / VIGENTE / CANCELADO)
    if (s === "BORRADOR")  return { text: "Borrador",  cls: "bg-amber-100 text-amber-800" };
    if (s === "CANCELADO") return { text: "Cancelado", cls: "bg-slate-100 text-slate-700" };
    return                        { text: "Aplicado",  cls: "bg-emerald-100 text-emerald-800" };
  }
  if (s === "VIGENTE")   return { text: "Vigente",   cls: "bg-emerald-100 text-emerald-800" };
  if (s === "CANCELADO") return { text: "Cancelado", cls: "bg-slate-100 text-slate-700" };
  if (s === "BORRADOR")  return { text: "Borrador",  cls: "bg-amber-100 text-amber-800" };
  return                        { text: s || "—",    cls: "bg-slate-100 text-slate-600" };
}

// ─── Tipo de fila ─────────────────────────────────────────────────────────────

export type TimelineItem = {
  /** Clave única para React list rendering */
  key: string;
  date: string | null;
  typeLabel: string;
  docLabel: string;
  amount: number;
  /**
   * true  → color rose   + signo −
   * false → color emerald + signo +
   */
  isNegative: boolean;
  /**
   * Si true, el monto se muestra en slate sin signo
   * (usado en filas de "documento origen" en otros-docs-ingresos).
   */
  amountNeutral?: boolean;
  affectsLabel: string;
  badge: { text: string; cls: string };
  /** Sobreescribe el fondo de la fila (ej. "bg-sky-50/70" para filas de origen) */
  rowBg?: string;
  /** ID del registro al que apunta esta fila (trade_doc_id o payment_id) */
  recordId?: string | null;
  /** Tipo de módulo para determinar qué modal abrir al hacer clic en Ver */
  recordType?: "FISCAL" | "NON_FISCAL" | "PAYMENT" | null;
};

// ─── Props del componente ─────────────────────────────────────────────────────

export type ExpandedTimelineTableProps = {
  items: TimelineItem[];
  loading?: boolean;
  loadingText?: string;
  /** Chip de sugerencia contextual abajo a la derecha. null/undefined = oculto. */
  suggestion?: { text: string; cls: string } | null;
  moneyDecimals?: number;
  /**
   * Callback para abrir el modal de detalle del registro.
   * Si se proporciona, se muestra el botón "Ver" en cada fila que tenga recordId.
   */
  onViewRecord?: (recordId: string, recordType: "FISCAL" | "NON_FISCAL" | "PAYMENT") => void;
};

// ─── Grid — mismo en todos los módulos ───────────────────────────────────────
// La última columna (44 px) es para el botón Ver; solo ocupa espacio cuando
// onViewRecord está definido (se agrega condicionalmente).

const GRID_BASE = "grid-cols-[100px_140px_140px_180px_1fr_200px]";
const GRID_WITH_ACTIONS = "grid-cols-[100px_140px_140px_180px_1fr_200px_44px]";

// ─── Componente ───────────────────────────────────────────────────────────────

export function ExpandedTimelineTable({
  items,
  loading = false,
  loadingText = "Cargando…",
  suggestion = null,
  moneyDecimals = 0,
  onViewRecord,
}: ExpandedTimelineTableProps) {
  const hasActions = Boolean(onViewRecord);
  const GRID = hasActions ? GRID_WITH_ACTIONS : GRID_BASE;

  return (
    <div className="w-full bg-slate-50/70 px-3 py-3">
      <div className="overflow-hidden rounded-xl bg-white/95 shadow-sm ring-1 ring-slate-200/70">
        <div className="px-3 py-3">
          <div className="flex flex-col gap-2">

            {/* ── Cargando ──────────────────────────────────────────────── */}
            {loading && (
              <div className="py-2 text-[12px] text-slate-500 animate-pulse">
                {loadingText}
              </div>
            )}

            {/* ── Tabla ─────────────────────────────────────────────────── */}
            {!loading && items.length > 0 && (
              <div className="overflow-hidden rounded-2xl ring-1 ring-slate-200/70">

                {/* Cabecera */}
                <div className={cls(
                  "grid " + GRID,
                  "bg-gradient-to-b from-slate-100 to-slate-50",
                  "text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#0b2b4f]"
                )}>
                  <div className="px-3 py-2 border-r border-slate-200">Fecha</div>
                  <div className="px-3 py-2 border-r border-slate-200">Tipo</div>
                  <div className="px-3 py-2 border-r border-slate-200">Documento</div>
                  <div className="px-3 py-2 border-r border-slate-200 text-right">Monto</div>
                  <div className="px-3 py-2 border-r border-slate-200">Cómo afecta</div>
                  <div className={cls("px-3 py-2", hasActions ? "border-r border-slate-200" : "")}>Estado</div>
                  {hasActions && <div className="px-1 py-2" />}
                </div>

                {/* Filas */}
                {items.map((item, idx) => (
                  <div
                    key={item.key}
                    className={cls(
                      "grid " + GRID + " text-[12px]",
                      item.rowBg ?? (idx % 2 === 0 ? "bg-white" : "bg-slate-50/70")
                    )}
                  >
                    <div className="px-3 py-2 border-t border-r border-slate-200/70 whitespace-nowrap text-slate-700">
                      {item.date || "—"}
                    </div>
                    <div className="px-3 py-2 border-t border-r border-slate-200/70 whitespace-nowrap font-semibold text-slate-800">
                      {item.typeLabel}
                    </div>
                    <div
                      className="px-3 py-2 border-t border-r border-slate-200/70 truncate whitespace-nowrap font-medium text-slate-900"
                      title={item.docLabel}
                    >
                      {item.docLabel}
                    </div>
                    <div className={cls(
                      "px-3 py-2 border-t border-r border-slate-200/70 text-right font-extrabold whitespace-nowrap",
                      item.amountNeutral ? "text-slate-800"
                        : item.isNegative ? "text-rose-700"
                        : "text-emerald-700"
                    )}>
                      {!item.amountNeutral && (item.isNegative ? "− " : "+ ")}
                      {fmt(Math.abs(item.amount), moneyDecimals)}
                    </div>
                    <div
                      className="px-3 py-2 border-t border-r border-slate-200/70 truncate whitespace-nowrap text-slate-700"
                      title={item.affectsLabel}
                    >
                      {item.affectsLabel}
                    </div>
                    <div className={cls(
                      "px-3 py-2 border-t border-slate-200/70",
                      hasActions ? "border-r border-slate-200/70" : ""
                    )}>
                      <span className={cls(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap",
                        item.badge.cls
                      )}>
                        {item.badge.text}
                      </span>
                    </div>
                    {hasActions && (
                      <div className="flex items-center justify-center border-t border-slate-200/70 px-1">
                        {item.recordId && item.recordType ? (
                          <button
                            type="button"
                            onClick={() => onViewRecord!(item.recordId!, item.recordType!)}
                            title="Ver detalle"
                            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-[#0b2b4f] transition-colors"
                          >
                            <Eye size={14} strokeWidth={2} />
                          </button>
                        ) : (
                          <span className="w-6" />
                        )}
                      </div>
                    )}
                  </div>
                ))}

              </div>
            )}

            {/* ── Sugerencia contextual (abajo a la derecha) ────────────── */}
            {!loading && suggestion && (
              <div className="flex justify-end">
                <span className={cls(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold",
                  suggestion.cls
                )}>
                  {suggestion.text}
                </span>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}

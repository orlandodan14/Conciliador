// app\gestionVentas\ventas\components\SaleExpandedRow.tsx
"use client";

import React, { useMemo } from "react";
import type { BankKey, Movimiento } from "@/app/lib/types";
import { cn } from "@/app/lib/utils";
import { formatCLP } from "@/app/lib/format";

/**
 * ================================================
 * MovimientoExpandedRow
 * --------------------------------
 * Fila expandida que muestra:
 * - Resumen de conciliación (estado, pendiente, mensaje)
 * - Acciones (Conciliar/Editar, Contabilizar, Leer mensajes)
 * - Lista de documentos conciliados (facturas/gastos/ingresos)
 *
 * ✅ Optimización aplicada:
 * - Separamos constantes “estáticas” fuera del componente (fallback, clases, tonos).
 * - Usamos helpers puros (calc*) para reducir lógica inline.
 * - useMemo solo donde realmente vale la pena (gridStyle + cálculos).
 * - Comentamos por bloques y líneas clave (sin ruido innecesario).
 * ================================================
 */

// ✅ Fallback de anchos (misma estructura de 14 columnas del header)
const COL_FALLBACK = [36, 88, 100, 100, 110, 120, 100, 120, 108, 108, 108, 44, 44, 44];

// ✅ Clases de botones (estáticas)
const BTN_PRIMARY =
  "rounded-lg bg-[#123b63] px-3 py-1.5 text-[11px] font-semibold text-white hover:opacity-95";
const BTN_SECONDARY =
  "rounded-lg bg-white/80 px-3 py-1.5 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-white";

// ✅ Mapa de tonos por estado (evita ternarios largos)
const TONES = {
  CONCILIADO: {
    wrap: "bg-emerald-50/60",
    pill: "bg-emerald-100/70 text-emerald-900",
    pend: "text-emerald-800",
  },
  PARCIAL: {
    wrap: "bg-amber-50/60",
    pill: "bg-amber-100/70 text-amber-900",
    pend: "text-amber-900",
  },
  NO_CONCILIADO: {
    wrap: "bg-rose-50/60",
    pill: "bg-rose-100/70 text-rose-900",
    pend: "text-rose-900",
  },
} as const;

// ✅ Helper: etiqueta humana del estado
function labelConciliacion(v: Movimiento["conciliacion"]) {
  if (v === "CONCILIADO") return "CONCILIADO";
  if (v === "PARCIAL") return "PARCIAL";
  return "NO CONCILIADO";
}

// ✅ Helper: suma absoluta de documentos conciliados (por neto)
function sumConciliadoAbs(m: Movimiento) {
  return (m.facturas ?? []).reduce((acc, d) => acc + Math.abs(d.neto ?? 0), 0);
}

// ✅ Helper: pendiente según reglas actuales del UI
function calcPendiente(m: Movimiento, movimientoAbs: number, conciliadoAbs: number) {
  if (m.conciliacion === "CONCILIADO") return 0;

  // Si no conciliado: pendiente = 100% del movimiento
  if (m.conciliacion === "NO_CONCILIADO") return movimientoAbs;

  // Parcial: pendiente = diferencia (nunca negativa)
  return Math.max(0, movimientoAbs - conciliadoAbs);
}

// ✅ Helper: construye gridTemplateColumns con “fr” proporcional a anchos medidos
function buildGridStyle(colWeights: number[] | null): React.CSSProperties {
  const base =
    colWeights && colWeights.length >= 14 ? colWeights.slice(0, 14) : COL_FALLBACK;

  // “fr” mantiene proporción y se estira al contenedor
  return { gridTemplateColumns: base.map((w) => `${w}fr`).join(" ") };
}

export default function MovimientoExpandedRow({
  m,
  bank, // (hoy no se usa aquí, pero lo dejamos por compatibilidad/futuro)
  colSpan = 14,
  colWeights,
  onConciliarManual,
  onEditarMatch,
  onContabilizarMovimiento,
  onEliminarMatch,
}: {
  m: Movimiento;
  bank?: { key: BankKey; name: string; logo: string };
  colSpan?: number;
  colWeights: number[] | null;
  onConciliarManual: (movId: string) => void;
  onEditarMatch: (movId: string) => void;
  onContabilizarMovimiento: (movId: string) => void;
  onEliminarMatch: (movId: string, docId: string) => void;
}) {
  // ✅ total conciliado = suma abs de netos de documentos asociados
  const conciliadoAbs = useMemo(() => sumConciliadoAbs(m), [m]);

  // ✅ monto del movimiento (abs)
  const movimientoAbs = useMemo(() => Math.abs(m.neto ?? 0), [m.neto]);

  // ✅ monto pendiente según estado
  const pendiente = useMemo(
    () => calcPendiente(m, movimientoAbs, conciliadoAbs),
    [m, movimientoAbs, conciliadoAbs]
  );

  // ✅ tono visual según estado
  const tone = TONES[m.conciliacion ?? "NO_CONCILIADO"];

  // ✅ mensaje: solo si existe y tiene texto, si no “—”
  const mensajeTexto =
    m.tieneMensaje && m.comentario?.trim() ? m.comentario.trim() : "—";

  // ✅ grid de 14 “columnas” alineadas al header
  const gridStyle = useMemo(() => buildGridStyle(colWeights), [colWeights]);

  // ✅ bandera útil
  const hasDocs = (m.facturas?.length ?? 0) > 0;

  return (
    <tr className="border-t bg-white">
      {/* La fila expandida ocupa toda la tabla */}
      <td colSpan={colSpan} className="p-0">
        {/* Wrapper con color según estado */}
        <div className={cn("w-full px-3 py-3", tone.wrap)}>
          {/* ========================= */}
          {/* HEADER RESUMEN + ACCIONES  */}
          {/* ========================= */}
          <div className="flex items-center justify-between gap-3">
            {/* Resumen (izquierda) */}
            <div className="min-w-0 flex-1 text-[11px] text-slate-700">
              <div className="flex flex-wrap items-center gap-2 min-w-0">
                {/* Estado */}
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold",
                    tone.pill
                  )}
                >
                  {labelConciliacion(m.conciliacion)}
                </span>

                <span className="text-slate-400">·</span>

                {/* Pendiente */}
                <span className="shrink-0">
                  Pendiente:{" "}
                  <span
                    className={cn(
                      "font-extrabold",
                      pendiente === 0 ? "text-emerald-800" : tone.pend
                    )}
                  >
                    {formatCLP(pendiente)}
                  </span>
                </span>

                <span className="text-slate-400">·</span>

                {/* Mensaje */}
                <span className="min-w-0 truncate">
                  <span className="text-slate-500">Mensaje: </span>
                  <span
                    className={cn(
                      "font-semibold",
                      m.tieneMensaje ? "text-slate-900" : "text-slate-400"
                    )}
                    title={mensajeTexto}
                  >
                    {mensajeTexto}
                  </span>
                </span>
              </div>
            </div>

            {/* Acciones (derecha) */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Si no conciliado -> Conciliar, si no -> Editar */}
              {m.conciliacion === "NO_CONCILIADO" ? (
                <button
                  className={BTN_PRIMARY}
                  onClick={(e) => {
                    e.stopPropagation(); // evita colapsar/expandir por click accidental
                    onConciliarManual(m.id);
                  }}
                >
                  🔎 Conciliar
                </button>
              ) : (
                <button
                  className={BTN_SECONDARY}
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditarMatch(m.id);
                  }}
                >
                  ✏️ Editar
                </button>
              )}

              {/* Contabilizar movimiento */}
              <button
                className={BTN_SECONDARY}
                onClick={(e) => {
                  e.stopPropagation();
                  onContabilizarMovimiento(m.id);
                }}
                title="Contabilizar este movimiento por separado"
              >
                🧾 Contabilizar
              </button>

              {/* Leer mensaje solo si viene con flag de mensaje */}
              {m.tieneMensaje && (
                <button
                  className={BTN_SECONDARY}
                  onClick={(e) => {
                    e.stopPropagation();
                    alert(
                      m.comentario?.trim()
                        ? m.comentario
                        : "Este movimiento no trae mensaje."
                    );
                  }}
                  title="Leer mensaje del movimiento"
                >
                  💬 Leer mensajes
                </button>
              )}
            </div>
          </div>

          {/* ========================= */}
          {/* DOCUMENTOS CONCILIADOS     */}
          {/* ========================= */}
          <div className="mt-3">
            {!hasDocs ? (
              // Sin documentos
              <div className="rounded-xl bg-white/70 px-3 py-3 text-[12px] text-slate-600 ring-1 ring-slate-200/60">
                Este movimiento aún no tiene documentos conciliados.
              </div>
            ) : (
              // Con documentos
              <div className="rounded-xl bg-white/80 ring-1 ring-slate-200/60 overflow-hidden">
                <div className="divide-y divide-slate-200/60">
                  {(m.facturas ?? []).map((d, i) => {
                    // Zebra striping
                    const zebra = i % 2 === 0 ? "bg-white/70" : "bg-slate-50/60";

                    return (
                      <div
                        key={d.id}
                        className={cn("grid items-center", zebra, "text-[11px]")}
                        style={gridStyle}
                      >
                        {/* 1) CHECK (vacío) */}
                        <CellSlim muted>{" "}</CellSlim>

                        {/* 2) FECHA */}
                        <CellSlim>{d.fecha}</CellSlim>

                        {/* 3) BANCO (vacío en documentos) */}
                        <CellSlim muted>—</CellSlim>

                        {/* 4) TIPO */}
                        <CellSlim title={d.tipo}>
                          <span className="truncate block">{d.tipo}</span>
                        </CellSlim>

                        {/* 5) RUT */}
                        <CellSlim>{d.rut}</CellSlim>

                        {/* 6) NOMBRE */}
                        <CellSlim title={d.nombre}>
                          <span className="truncate block">{d.nombre}</span>
                        </CellSlim>

                        {/* 7) REF */}
                        <CellSlim title={d.referencia}>
                          <span className="truncate block">
                            {d.referencia || "—"}
                          </span>
                        </CellSlim>

                        {/* 8) DESCRIPCIÓN (vacío en documentos) */}
                        <CellSlim muted>—</CellSlim>

                        {/* 9) DÉBITO */}
                        <CellSlim right className="text-slate-900">
                          {d.debito > 0 ? formatCLP(d.debito) : "—"}
                        </CellSlim>

                        {/* 10) CRÉDITO */}
                        <CellSlim right className="text-slate-900">
                          {d.credito > 0 ? formatCLP(d.credito) : "—"}
                        </CellSlim>

                        {/* 11) NETO */}
                        <CellSlim
                          right
                          className={cn(
                            (d.neto ?? 0) >= 0 ? "text-emerald-700" : "text-rose-700"
                          )}
                        >
                          {formatCLP(d.neto)}
                        </CellSlim>

                        {/* 12) MENSAJE (vacío, alinea con 💬) */}
                        <CellSlim center muted>
                          {" "}
                        </CellSlim>

                        {/* 13) ELIMINAR MATCH (alinea con 🔗) */}
                        <CellSlim center>
                          <button
                            className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100"
                            title="Eliminar match"
                            aria-label="Eliminar match"
                            onClick={(e) => {
                              e.stopPropagation();
                              onEliminarMatch(m.id, d.id);
                            }}
                          >
                            🗑️
                          </button>
                        </CellSlim>

                        {/* 14) MARGEN DER (vacío, alinea con 🧾) */}
                        <CellSlim muted>{" "}</CellSlim>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

/**
 * CellSlim
 * - Celda “delgada” reutilizable para la grilla del expanded row
 * - Alinea texto (right/center), permite muted, title, y clases extra
 */
function CellSlim({
  children,
  className,
  title,
  right,
  center,
  muted,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
  right?: boolean;
  center?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      title={title}
      className={cn(
        // padding compacto + evita overflow
        "px-2 py-2 min-w-0",
        // separadores suaves entre “columnas”
        "border-r border-slate-200/30 last:border-r-0",
        // alineaciones opcionales
        right && "text-right",
        center && "text-center",
        // estilo muted opcional
        muted && "text-slate-300",
        // clases extra
        className
      )}
    >
      {children}
    </div>
  );
}

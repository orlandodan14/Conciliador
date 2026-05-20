"use client";

import React, { useMemo, useState, useRef, useEffect } from "react";
import {
  ChevronUp, ChevronDown, ChevronsUpDown,
  CheckCircle2, AlertCircle, Clock, CircleDashed,
  BookOpen, FileText, Minus, CheckSquare2,
  Trash2, RotateCcw, X, Link2, Plus,
} from "lucide-react";
import type {
  MovimientoRow, ReconciliationStatus, AccountingStatus,
  MatchedDoc, SuggestedMatch, JournalEntry,
} from "./types";

function cls(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

function fmt(n: number, currency = "CLP") {
  const d = currency === "CLP" ? 0 : 2;
  return n.toLocaleString("es-CL", { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function fmtRut(rut: string | null) {
  if (!rut) return null;
  return rut.replace(/\./g, "");
}

// ─── Sort icon ────────────────────────────────────────────────────────────────

type SortDirection = "asc" | "desc";

function SortIcon({ active, direction }: { active: boolean; direction: SortDirection }) {
  if (!active) return <ChevronsUpDown className="h-3.5 w-3.5 text-slate-400" />;
  return direction === "asc"
    ? <ChevronUp className="h-3.5 w-3.5 text-[#123b63]" />
    : <ChevronDown className="h-3.5 w-3.5 text-[#123b63]" />;
}

// ─── TableTh ─────────────────────────────────────────────────────────────────

function TableTh({
  children, sortable = false, active = false, direction = "asc", onSort,
}: {
  children: React.ReactNode;
  sortable?: boolean;
  active?: boolean;
  direction?: SortDirection;
  onSort?: () => void;
}) {
  return (
    <th
      className={cls(
        "px-1.5 py-3 font-extrabold",
        "text-[10px] tracking-[0.06em] whitespace-nowrap",
        "text-center text-[#0b2b4f] overflow-hidden",
      )}
    >
      {sortable ? (
        <button
          type="button"
          onClick={onSort}
          className={cls(
            "mx-auto inline-flex items-center gap-1 rounded-md px-1.5 py-1 transition-colors",
            "hover:bg-white/60",
            active && "bg-white/70"
          )}
        >
          <span>{children}</span>
          <SortIcon active={active} direction={direction} />
        </button>
      ) : (
        children
      )}
    </th>
  );
}

// ─── TableTd ─────────────────────────────────────────────────────────────────

function TableTd({
  children, right, center, title, className,
}: {
  children: React.ReactNode;
  right?: boolean;
  center?: boolean;
  title?: string;
  className?: string;
}) {
  return (
    <td
      title={title}
      className={cls(
        "px-2 py-2 align-middle",
        "border-r last:border-r-0 border-slate-200/50",
        right && "text-right",
        center && "text-center",
        className
      )}
    >
      {children}
    </td>
  );
}

// ─── EstadoCell ───────────────────────────────────────────────────────────────

function EstadoCell({
  reconciliation,
  accounting,
}: {
  reconciliation: ReconciliationStatus;
  accounting: AccountingStatus;
}) {
  const recCfg = {
    CONCILIADO: { Icon: CheckCircle2, pillCls: "bg-emerald-100 text-emerald-800 ring-emerald-300/60", label: "Conciliado" },
    PARCIAL:    { Icon: CircleDashed, pillCls: "bg-blue-100 text-blue-800 ring-blue-300/60",           label: "Parcial"    },
    SUGERIDO:   { Icon: AlertCircle,  pillCls: "bg-amber-100 text-amber-800 ring-amber-300/60",        label: "Sugerencia" },
    PENDIENTE:  { Icon: Clock,        pillCls: "bg-rose-100 text-rose-800 ring-rose-300/60",           label: "Pendiente"  },
  }[reconciliation];

  const accCfg = {
    CONTABILIZADO: { Icon: BookOpen, pillCls: "bg-emerald-50 text-emerald-700 ring-emerald-200/60", label: "Contabilizado" },
    BORRADOR:      { Icon: FileText, pillCls: "bg-sky-50 text-sky-700 ring-sky-200/60",              label: "Borrador"      },
    SIN_ASIENTO:   { Icon: Minus,    pillCls: "bg-slate-100 text-slate-500 ring-slate-200/60",       label: "Sin asiento"   },
  }[accounting];

  return (
    <div className="flex flex-col items-center gap-1">
      {/* Conciliación — texto visible */}
      <span className={cls(
        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold ring-1 whitespace-nowrap",
        recCfg.pillCls
      )}>
        <recCfg.Icon className="h-3 w-3 shrink-0" />
        {recCfg.label}
      </span>
      {/* Contabilidad — texto visible */}
      <span className={cls(
        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold ring-1 whitespace-nowrap",
        accCfg.pillCls
      )}>
        <accCfg.Icon className="h-3 w-3 shrink-0" />
        {accCfg.label}
      </span>
    </div>
  );
}

// ─── Doc type helpers ─────────────────────────────────────────────────────────

function docTypeLabel(type: MatchedDoc["type"]) {
  if (type === "PAYMENT")    return "Cobro";
  if (type === "FISCAL")     return "Doc. Tributario";
  if (type === "NON_FISCAL") return "Otro Ingreso";
  return "Asiento";
}

function docTypeCls(type: MatchedDoc["type"]) {
  if (type === "PAYMENT")    return "bg-violet-100/80 text-violet-800";
  if (type === "FISCAL")     return "bg-blue-100/80 text-blue-800";
  if (type === "NON_FISCAL") return "bg-teal-100/80 text-teal-800";
  return "bg-slate-100 text-slate-600";
}

// ─── JournalEntryModal ────────────────────────────────────────────────────────

function JournalEntryModal({
  entry,
  currency,
  onClose,
}: {
  entry: JournalEntry;
  currency: string;
  onClose: () => void;
}) {
  const isDraft = entry.status === "DRAFT";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="overflow-hidden rounded-[28px] bg-white ring-1 ring-slate-200 shadow-[0_18px_70px_rgba(15,23,42,0.22)] w-[580px] max-w-full mx-4 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative bg-gradient-to-r from-[#0b2b4f] via-[#123b63] to-[#0b2b4f] text-white px-6 py-5 shrink-0">
          <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
          <div className="relative flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[11px] font-extrabold uppercase text-white/70">Asiento Contable</div>
              <h2 className="text-[18px] font-black text-white mt-0.5 leading-snug">{entry.description}</h2>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-white/70">
                <span className="font-mono font-semibold text-white/90">{entry.id}</span>
                <span>·</span>
                <span>{fmtDate(entry.date)}</span>
                <span>·</span>
                <span className={cls(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold",
                  isDraft
                    ? "bg-sky-400/30 text-sky-100"
                    : "bg-emerald-400/30 text-emerald-100"
                )}>
                  {isDraft ? "Borrador" : "Contabilizado"}
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 h-8 w-8 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-white transition"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto">
          <table className="w-full text-[12px] rounded-xl overflow-hidden border border-[#123b63]/15">
            <thead>
              <tr className="bg-[#dce8f6]/70 border-b border-[#123b63]/15">
                {["Cuenta", "Debe", "Haber"].map((h) => (
                  <th
                    key={h}
                    className={cls(
                      "px-3 py-2 text-[10px] font-extrabold uppercase tracking-[0.06em] text-[#123b63]/70",
                      h !== "Cuenta" ? "text-right" : "text-left"
                    )}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entry.lines.map((line, i) => (
                <tr
                  key={i}
                  className={cls(
                    "border-b last:border-b-0 border-slate-100",
                    i % 2 === 0 ? "bg-white" : "bg-[#f0f5fb]/60"
                  )}
                >
                  <td className="px-3 py-2 border-r border-slate-200/50">
                    <span className="font-mono text-[10px] text-slate-400 mr-1.5">{line.account_code}</span>
                    <span className="text-slate-700">{line.account_name}</span>
                  </td>
                  <td className="px-3 py-2 border-r border-slate-200/50 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                    {line.debit != null
                      ? `$ ${fmt(line.debit, currency)}`
                      : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                    {line.credit != null
                      ? `$ ${fmt(line.credit, currency)}`
                      : <span className="text-slate-300">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex justify-end mt-5">
            <button
              onClick={onClose}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-all hover:bg-slate-50 hover:border-slate-400"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── MatchedDocsTable (CONCILIADO / PARCIAL) ──────────────────────────────────

// Paleta azul (sin match aún — no se usa aquí, se deja para referencia futura)
const thCls      = "px-2 py-1.5 text-[9px] font-extrabold uppercase tracking-[0.06em] text-[#123b63]/70 whitespace-nowrap";
// Paleta verde (documentos ya conciliados)
const thClsGreen = "px-2 py-1.5 text-[9px] font-extrabold uppercase tracking-[0.06em] text-emerald-700/70 whitespace-nowrap";

function MatchedDocsTable({
  docs,
  currency,
  rowId,
  variant = "green",
  onViewJE,
  onPostJE,
  onRemoveMatch,
}: {
  docs: MatchedDoc[];
  currency: string;
  rowId: string;
  /** "green" para docs conciliados (CONCILIADO/PARCIAL), "blue" neutro */
  variant?: "blue" | "green";
  onViewJE: (entry: JournalEntry) => void;
  onPostJE?: (rowId: string, matchKey: string) => void;
  onRemoveMatch?: (rowId: string, matchKey: string, hasPostedJE: boolean) => void;
}) {
  const g       = variant === "green";
  const tbl     = g ? "border border-emerald-200/70"                    : "border border-[#123b63]/15";
  const head    = g ? "bg-emerald-50/70 border-b border-emerald-200/70" : "bg-[#dce8f6]/60 border-b border-[#123b63]/15";
  const th      = g ? thClsGreen : thCls;
  const rowDiv  = g ? "border-emerald-100/60"         : "border-slate-100";
  const oddBg   = g ? "bg-emerald-50/20"              : "bg-[#f0f5fb]/60";
  const cellBdr = g ? "border-r border-emerald-100/50" : "border-r border-slate-200/50";

  return (
    <table className={cls("w-full text-[11px] rounded-lg overflow-hidden", tbl)}>
      <thead>
        <tr className={head}>
          <th className={cls(th, "text-left")}>Fecha</th>
          <th className={cls(th, "text-left")}>Tipo</th>
          <th className={cls(th, "text-left")}>Documento</th>
          <th className={cls(th, "text-left")}>RUT/NIC</th>
          <th className={cls(th, "text-left")}>Nombre contraparte</th>
          <th className={cls(th, "text-right")}>Monto</th>
          <th className={cls(th, "text-left")}>Estado</th>
          <th className={cls(th, "text-center")}>Acciones</th>
        </tr>
      </thead>
      <tbody>
        {docs.map((doc, i) => {
          const hasPostedJE = doc.journal_entry?.status === "POSTED";
          const jeStatus    = doc.journal_entry?.status ?? null;
          return (
            <tr
              key={doc.key}
              className={cls(
                "border-b last:border-b-0", rowDiv,
                i % 2 === 0 ? "bg-white/70" : oddBg
              )}
            >
              {/* Fecha */}
              <td className={cls("px-2 py-1.5 text-slate-500 whitespace-nowrap", cellBdr)}>
                {fmtDate(doc.date)}
              </td>

              {/* Tipo */}
              <td className={cls("px-2 py-1.5", cellBdr)}>
                <span className={cls("inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold", docTypeCls(doc.type))}>
                  {docTypeLabel(doc.type)}
                </span>
              </td>

              {/* Documento */}
              <td className={cls("px-2 py-1.5 font-semibold text-[#0b2b4f] whitespace-nowrap", cellBdr)}>
                {doc.label}
              </td>

              {/* RUT/NIC */}
              <td className={cls("px-2 py-1.5 font-mono text-slate-500 whitespace-nowrap", cellBdr)}>
                {doc.counterparty_rut ? fmtRut(doc.counterparty_rut) : <span className="text-slate-300">—</span>}
              </td>

              {/* Nombre contraparte */}
              <td
                className={cls("px-2 py-1.5 text-slate-600 max-w-[180px] truncate", cellBdr)}
                title={doc.counterparty_name ?? "—"}
              >
                {doc.counterparty_name ?? <span className="text-slate-300">—</span>}
              </td>

              {/* Monto */}
              <td className={cls("px-2 py-1.5 text-right font-mono font-semibold tabular-nums text-slate-700 whitespace-nowrap", cellBdr)}>
                $ {fmt(doc.amount, currency)}
              </td>

              {/* Estado (JE) */}
              <td className={cls("px-2 py-1.5", cellBdr)}>
                {jeStatus === "POSTED" && (
                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-bold bg-emerald-100/80 text-emerald-800">
                    Contabilizado
                  </span>
                )}
                {jeStatus === "DRAFT" && (
                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-bold bg-sky-100/80 text-sky-800">
                    Borrador
                  </span>
                )}
                {jeStatus === null && (
                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-bold bg-slate-100 text-slate-500">
                    Sin asiento
                  </span>
                )}
              </td>

              {/* Acciones */}
              <td className="px-2 py-1.5 text-center">
                <div className="flex items-center justify-center gap-1">
                  {doc.journal_entry && (
                    <button
                      onClick={() => onViewJE(doc.journal_entry!)}
                      title={hasPostedJE ? "Ver asiento contabilizado" : "Ver asiento borrador"}
                      className={cls(
                        "inline-flex items-center gap-0.5 h-6 px-1.5 rounded border text-[9px] font-bold transition",
                        hasPostedJE
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                          : "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100"
                      )}
                    >
                      <BookOpen className="h-3 w-3" />
                      Ver
                    </button>
                  )}
                  {jeStatus === "DRAFT" && (
                    <button
                      onClick={() => onPostJE?.(rowId, doc.key)}
                      title="Contabilizar asiento borrador"
                      className="inline-flex items-center gap-0.5 h-6 px-1.5 rounded border text-[9px] font-bold transition border-emerald-300 bg-emerald-600 text-white hover:bg-emerald-700"
                    >
                      <CheckSquare2 className="h-3 w-3" />
                      Contabilizar
                    </button>
                  )}
                  <button
                    onClick={() => onRemoveMatch?.(rowId, doc.key, !!hasPostedJE)}
                    title={hasPostedJE ? "Crear asiento de reversa y liberar" : "Eliminar match"}
                    className={cls(
                      "inline-flex items-center gap-0.5 h-6 px-1.5 rounded border transition text-[9px] font-bold",
                      hasPostedJE
                        ? "border-rose-200 bg-rose-50 text-rose-500 hover:bg-rose-100"
                        : "border-slate-200 bg-white text-slate-400 hover:bg-slate-50 hover:text-slate-600"
                    )}
                  >
                    {hasPostedJE
                      ? <><RotateCcw className="h-3 w-3" />Reversar</>
                      : <><Trash2 className="h-3 w-3" />Eliminar</>}
                  </button>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ─── SuggestionsTable (SUGERIDO) ──────────────────────────────────────────────

function SuggestionsTable({
  suggestions,
  rowId,
  onConfirmMatch,
  onRejectMatch,
}: {
  suggestions: SuggestedMatch[];
  rowId: string;
  onConfirmMatch?: (rowId: string, matchKey: string) => void;
  onRejectMatch?: (rowId: string, matchKey: string) => void;
}) {
  return (
    <table className="w-full text-[11px] rounded-lg overflow-hidden border border-amber-200/70">
      <thead>
        <tr className="bg-amber-50/80 border-b border-amber-200/70">
          <th className="px-2 py-1.5 text-[9px] font-extrabold uppercase tracking-[0.06em] text-amber-700/80 text-left whitespace-nowrap">Fecha</th>
          <th className="px-2 py-1.5 text-[9px] font-extrabold uppercase tracking-[0.06em] text-amber-700/80 text-left whitespace-nowrap">Tipo</th>
          <th className="px-2 py-1.5 text-[9px] font-extrabold uppercase tracking-[0.06em] text-amber-700/80 text-left whitespace-nowrap">Documento</th>
          <th className="px-2 py-1.5 text-[9px] font-extrabold uppercase tracking-[0.06em] text-amber-700/80 text-left whitespace-nowrap">RUT/NIC</th>
          <th className="px-2 py-1.5 text-[9px] font-extrabold uppercase tracking-[0.06em] text-amber-700/80 text-left whitespace-nowrap">Nombre contraparte</th>
          <th className="px-2 py-1.5 text-[9px] font-extrabold uppercase tracking-[0.06em] text-amber-700/80 text-right whitespace-nowrap">Monto</th>
          <th className="px-2 py-1.5 text-[9px] font-extrabold uppercase tracking-[0.06em] text-amber-700/80 text-right whitespace-nowrap">Coincidencia</th>
          <th className="px-2 py-1.5 text-[9px] font-extrabold uppercase tracking-[0.06em] text-amber-700/80 text-center whitespace-nowrap">Acción</th>
        </tr>
      </thead>
      <tbody>
        {suggestions.map((sug, i) => (
          <tr
            key={sug.key}
            className={cls(
              "border-b last:border-b-0 border-amber-100/60 transition-colors hover:bg-amber-50/50",
              i % 2 === 0 ? "bg-white/70" : "bg-amber-50/30"
            )}
          >
            {/* Fecha */}
            <td className="px-2 py-1.5 border-r border-amber-100/60 text-slate-500 whitespace-nowrap">
              {fmtDate(sug.date)}
            </td>

            {/* Tipo */}
            <td className="px-2 py-1.5 border-r border-amber-100/60">
              <span className={cls("inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold", docTypeCls(sug.type))}>
                {docTypeLabel(sug.type)}
              </span>
            </td>

            {/* Documento */}
            <td className="px-2 py-1.5 border-r border-amber-100/60 font-semibold text-[#0b2b4f] whitespace-nowrap">
              {sug.label}
            </td>

            {/* RUT/NIC */}
            <td className="px-2 py-1.5 border-r border-amber-100/60 font-mono text-slate-500 whitespace-nowrap">
              {sug.counterparty_rut ? fmtRut(sug.counterparty_rut) : <span className="text-slate-300">—</span>}
            </td>

            {/* Nombre contraparte */}
            <td
              className="px-2 py-1.5 border-r border-amber-100/60 text-slate-600 max-w-[160px] truncate"
              title={sug.counterparty_name ?? "—"}
            >
              {sug.counterparty_name ?? <span className="text-slate-300">—</span>}
            </td>

            {/* Monto */}
            <td className="px-2 py-1.5 border-r border-amber-100/60 text-right font-mono font-semibold tabular-nums text-slate-700 whitespace-nowrap">
              $ {fmt(sug.amount, "CLP")}
            </td>

            {/* Coincidencia */}
            <td className="px-2 py-1.5 border-r border-amber-100/60">
              <div className="flex items-center justify-end gap-1.5 min-w-[90px]">
                <div className="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className={cls(
                      "h-full rounded-full",
                      sug.confidence >= 0.8 ? "bg-emerald-400"
                        : sug.confidence >= 0.5 ? "bg-amber-400"
                        : "bg-rose-400"
                    )}
                    style={{ width: `${Math.round(sug.confidence * 100)}%` }}
                  />
                </div>
                <span className={cls(
                  "text-[10px] font-bold tabular-nums w-7 text-right shrink-0",
                  sug.confidence >= 0.8 ? "text-emerald-700"
                    : sug.confidence >= 0.5 ? "text-amber-700"
                    : "text-rose-600"
                )}>
                  {Math.round(sug.confidence * 100)}%
                </span>
              </div>
            </td>

            {/* Acción */}
            <td className="px-2 py-1.5 text-center">
              <div className="flex gap-1 justify-center">
                <button
                  onClick={() => onConfirmMatch?.(rowId, sug.key)}
                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold rounded-lg transition"
                >
                  Confirmar
                </button>
                <button
                  onClick={() => onRejectMatch?.(rowId, sug.key)}
                  className="px-2.5 py-1 bg-white border border-rose-200 hover:bg-rose-50 text-rose-600 text-[10px] font-bold rounded-lg transition"
                >
                  Rechazar
                </button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── SectionLabel ─────────────────────────────────────────────────────────────

type LabelColor = "emerald" | "amber" | "blue" | "slate";

function SectionLabel({
  icon: Icon, color, text, count, badge,
}: {
  icon: React.ElementType;
  color: LabelColor;
  text: string;
  count?: number;
  badge?: string;
}) {
  const cfg: Record<LabelColor, { border: string; icon: string; text: string; pill: string }> = {
    emerald: { border: "border-emerald-400", icon: "text-emerald-600", text: "text-emerald-800", pill: "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200" },
    amber:   { border: "border-amber-400",   icon: "text-amber-600",   text: "text-amber-800",   pill: "bg-amber-100 text-amber-800 ring-1 ring-amber-200"     },
    blue:    { border: "border-blue-400",     icon: "text-blue-600",    text: "text-blue-800",    pill: "bg-blue-100 text-blue-800 ring-1 ring-blue-200"       },
    slate:   { border: "border-slate-300",    icon: "text-slate-400",   text: "text-slate-600",   pill: "bg-slate-100 text-slate-600 ring-1 ring-slate-200"   },
  };
  const c = cfg[color];
  return (
    <div className={cls("flex items-center gap-2 pl-2.5 border-l-[3px]", c.border)}>
      <Icon className={cls("h-3.5 w-3.5 shrink-0", c.icon)} />
      <span className={cls("text-[11px] font-bold leading-none", c.text)}>{text}</span>
      {count !== undefined && (
        <span className={cls("inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-bold", c.pill)}>
          {count}
        </span>
      )}
      {badge && (
        <span className={cls("inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-bold", c.pill)}>
          {badge}
        </span>
      )}
    </div>
  );
}

// ─── MovimientoExpanderRow ────────────────────────────────────────────────────

function MovimientoExpanderRow({
  row,
  onConfirmMatch,
  onRejectMatch,
  onSearchDoc,
  onPostJE,
  onRemoveMatch,
  onViewJE,
  onCreateDoc,
}: {
  row: MovimientoRow;
  onConfirmMatch?: (rowId: string, matchKey: string) => void;
  onRejectMatch?: (rowId: string, matchKey: string) => void;
  onSearchDoc?: (rowId: string) => void;
  onPostJE?: (rowId: string, matchKey: string) => void;
  onRemoveMatch?: (rowId: string, matchKey: string, hasPostedJE: boolean) => void;
  onViewJE: (entry: JournalEntry, currency: string) => void;
  onCreateDoc?: (rowId: string) => void;
}) {
  const isConciliado = row.reconciliation_status === "CONCILIADO";
  const isParcial    = row.reconciliation_status === "PARCIAL";
  const isSugerido   = row.reconciliation_status === "SUGERIDO";
  const isPendiente  = row.reconciliation_status === "PENDIENTE";

  const movAmount       = row.credit ?? row.debit ?? 0;
  const matchedTotal    = row.matched_docs.reduce((s, d) => s + d.amount, 0);
  const remainingAmount = movAmount - matchedTotal;
  const pctMatched      = movAmount > 0 ? Math.round((matchedTotal / movAmount) * 100) : 0;

  const outerBg = isConciliado ? "bg-emerald-50/30"
    : isParcial  ? "bg-blue-50/20"
    : isSugerido ? "bg-amber-50/30"
    : "bg-slate-50/40";

  // Botones de acción reutilizables (buscar / crear documento + asiento si existe)
  const ActionBtns = () => (
    <div className="flex items-center gap-1.5 shrink-0">
      {row.journal_entry && (
        <button
          onClick={() => onViewJE(row.journal_entry!, row.currency)}
          title={row.journal_entry.status === "DRAFT" ? "Ver asiento borrador" : "Ver asiento contabilizado"}
          className={cls(
            "flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold border transition",
            row.journal_entry.status === "DRAFT"
              ? "bg-sky-50 border-sky-200 text-sky-700 hover:bg-sky-100"
              : "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
          )}
        >
          <BookOpen className="h-3 w-3" />
          Ver asiento
        </button>
      )}
      <button
        type="button"
        onClick={() => onCreateDoc?.(row.id)}
        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-[10px] font-bold transition"
      >
        <Plus className="h-3 w-3" />
        Crear documento
      </button>
      <button
        onClick={() => onSearchDoc?.(row.id)}
        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#0b2b4f] hover:bg-[#0a3f6e] text-white text-[10px] font-bold transition"
      >
        <Link2 className="h-3 w-3" />
        Buscar y vincular
      </button>
    </div>
  );

  return (
    <div className={cls("border-b-2 border-[#123b63]/15", outerBg)}>

      {/* ── Banda resumen financiero ─────────────────────────────────────────── */}
      <div className={cls(
        "flex flex-wrap items-center gap-x-5 gap-y-1 px-4 py-2 border-b text-[11px]",
        isConciliado ? "bg-emerald-100/40 border-emerald-200/60"
        : isParcial   ? "bg-blue-100/30 border-blue-200/50"
        : isSugerido  ? "bg-amber-100/30 border-amber-200/50"
        : "bg-slate-100/40 border-slate-200/50"
      )}>

        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-extrabold uppercase tracking-wide text-slate-400">Movimiento</span>
          <span className="font-mono font-bold text-slate-700">
            {row.credit != null ? "+" : "−"}$ {fmt(movAmount, row.currency)}
          </span>
        </div>

        {(isConciliado || isParcial) && (
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-extrabold uppercase tracking-wide text-emerald-600/70">Conciliado</span>
            <span className="font-mono font-bold text-emerald-700">$ {fmt(matchedTotal, row.currency)}</span>
          </div>
        )}

        {isParcial && (
          <>
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-extrabold uppercase tracking-wide text-amber-600/80">Pendiente</span>
              <span className="font-mono font-bold text-amber-700">$ {fmt(remainingAmount, row.currency)}</span>
            </div>
            {/* Barra de progreso */}
            <div className="flex items-center gap-1.5 ml-auto">
              <div className="w-20 h-1.5 bg-slate-200/80 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${pctMatched}%` }} />
              </div>
              <span className="text-[10px] font-bold text-emerald-600">{pctMatched}%</span>
            </div>
          </>
        )}

        {isConciliado && (
          <div className="ml-auto flex items-center gap-1 text-emerald-600 font-bold text-[10px]">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Conciliación completa
          </div>
        )}

        {(isSugerido || isPendiente) && (
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-extrabold uppercase tracking-wide text-rose-500/80">Sin conciliar</span>
            <span className="font-mono font-bold text-rose-600">$ {fmt(movAmount, row.currency)}</span>
          </div>
        )}
      </div>

      {/* ── Cuerpo ───────────────────────────────────────────────────────────── */}
      <div className="px-4 py-3 space-y-3">

        {/* ── CONCILIADO ── */}
        {isConciliado && row.matched_docs.length > 0 && (
          <div>
            <SectionLabel icon={CheckCircle2} color="emerald" text="Documentos conciliados" count={row.matched_docs.length} />
            <div className="mt-2">
              <MatchedDocsTable
                docs={row.matched_docs}
                currency={row.currency}
                rowId={row.id}
                onViewJE={(entry) => onViewJE(entry, row.currency)}
                onPostJE={onPostJE}
                onRemoveMatch={onRemoveMatch}
              />
            </div>
          </div>
        )}

        {/* ── PARCIAL: parte conciliada ── */}
        {isParcial && row.matched_docs.length > 0 && (
          <div>
            <SectionLabel icon={CheckCircle2} color="emerald" text="Documentos conciliados" count={row.matched_docs.length} />
            <div className="mt-2">
              <MatchedDocsTable
                docs={row.matched_docs}
                currency={row.currency}
                rowId={row.id}
                onViewJE={(entry) => onViewJE(entry, row.currency)}
                onPostJE={onPostJE}
                onRemoveMatch={onRemoveMatch}
              />
            </div>
          </div>
        )}

        {/* ── PARCIAL: diferencia pendiente ── */}
        {isParcial && (
          <div className="rounded-xl border border-dashed border-amber-200 bg-amber-50/30 p-3">
            <div className="flex items-center justify-between mb-2.5">
              <SectionLabel
                icon={AlertCircle}
                color="amber"
                text="Diferencia pendiente de conciliar"
                badge={`$ ${fmt(remainingAmount, row.currency)}`}
              />
              {ActionBtns()}
            </div>
            {row.suggested_matches.length > 0 ? (
              <SuggestionsTable
                suggestions={row.suggested_matches}
                rowId={row.id}
                onConfirmMatch={onConfirmMatch}
                onRejectMatch={onRejectMatch}
              />
            ) : (
              <p className="text-[11px] text-amber-600/60 py-1 pl-1">
                Sin sugerencias automáticas para la diferencia — usa los botones para vincular o crear un documento.
              </p>
            )}
          </div>
        )}

        {/* ── SUGERIDO ── */}
        {isSugerido && (
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <SectionLabel
                icon={AlertCircle}
                color="amber"
                text="Sugerencias de conciliación"
                count={row.suggested_matches.length}
              />
              {ActionBtns()}
            </div>
            {row.suggested_matches.length > 0 && (
              <SuggestionsTable
                suggestions={row.suggested_matches}
                rowId={row.id}
                onConfirmMatch={onConfirmMatch}
                onRejectMatch={onRejectMatch}
              />
            )}
          </div>
        )}

        {/* ── PENDIENTE ── */}
        {isPendiente && (
          <div className="flex items-center gap-4 rounded-xl border border-dashed border-slate-200 bg-white/60 px-5 py-4">
            <Clock className="h-8 w-8 text-slate-300 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-semibold text-slate-500 mb-0.5">Sin conciliación</p>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Este movimiento no tiene documentos asociados aún. Puedes buscar uno existente o crear un documento nuevo.
              </p>
            </div>
            {ActionBtns()}
          </div>
        )}

      </div>
    </div>
  );
}

// ─── Sort key ─────────────────────────────────────────────────────────────────

type SortKey =
  | "date"
  | "bank_name"
  | "description"
  | "reference"
  | "counterparty_rut"
  | "counterparty_name"
  | "debit"
  | "credit"
  | "statement_balance"
  | "reconciliation_status";

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  rows: MovimientoRow[];
  loading?: boolean;
  selectedMap: Record<string, boolean>;
  allSelected: boolean;
  onToggleSelectAll: () => void;
  onToggleRow: (id: string) => void;
  onConfirmMatch?: (rowId: string, matchKey: string) => void;
  onRejectMatch?: (rowId: string, matchKey: string) => void;
  onCreateDraftJE?: (rowId: string) => void;
  onSearchDoc?: (rowId: string) => void;
  onPostJE?: (rowId: string, matchKey: string) => void;
  onCreateDoc?: (rowId: string) => void;
  onRemoveMatch?: (rowId: string, matchKey: string, hasPostedJE: boolean) => void;
  pageSize: 20 | 50 | 100;
};

// ─── Componente principal ─────────────────────────────────────────────────────

export default function MovimientosTable({
  rows,
  loading,
  selectedMap,
  allSelected,
  onToggleSelectAll,
  onToggleRow,
  onConfirmMatch,
  onRejectMatch,
  onSearchDoc,
  onPostJE,
  onCreateDoc,
  onRemoveMatch,
  pageSize,
}: Props) {
  const [expandedId, setExpandedId]   = useState<string | null>(null);
  const [sortKey,    setSortKey]      = useState<SortKey>("date");
  const [sortDir,    setSortDir]      = useState<SortDirection>("desc");
  const [jeModal,    setJeModal]      = useState<{ entry: JournalEntry; currency: string } | null>(null);
  const [visibleCount, setVisibleCount] = useState<number>(pageSize);
  const sentinelRef = useRef<HTMLDivElement>(null);

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  function handleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("desc"); }
  }

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      let cmp = 0;
      if      (sortKey === "date")                  cmp = a.date.localeCompare(b.date);
      else if (sortKey === "bank_name")             cmp = a.bank_name.localeCompare(b.bank_name);
      else if (sortKey === "description")           cmp = a.description.localeCompare(b.description, "es", { sensitivity: "base" });
      else if (sortKey === "reference")             cmp = (a.reference ?? "").localeCompare(b.reference ?? "");
      else if (sortKey === "counterparty_rut")      cmp = (a.counterparty_rut ?? "").localeCompare(b.counterparty_rut ?? "");
      else if (sortKey === "counterparty_name")     cmp = (a.counterparty_name ?? "").localeCompare(b.counterparty_name ?? "", "es", { sensitivity: "base" });
      else if (sortKey === "debit")                 cmp = (a.debit ?? 0) - (b.debit ?? 0);
      else if (sortKey === "credit")                cmp = (a.credit ?? 0) - (b.credit ?? 0);
      else if (sortKey === "statement_balance")     cmp = a.statement_balance - b.statement_balance;
      else if (sortKey === "reconciliation_status") cmp = a.reconciliation_status.localeCompare(b.reconciliation_status);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [rows, sortKey, sortDir]);

  // Reinicia al inicio cuando cambian filas o tamaño de página
  useEffect(() => { setVisibleCount(pageSize); }, [rows, pageSize]);

  const hasMore = visibleCount < sorted.length;
  const visible = sorted.slice(0, visibleCount);

  // IntersectionObserver: carga más al llegar al sentinel
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisibleCount(c => c + pageSize); },
      { rootMargin: "120px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, pageSize]);

  return (
    <>
      {/* ── Tabla: scroll horizontal si hace falta, header sticky con scroll de página ── */}
      <div className="w-full overflow-x-auto rounded-xl ring-1 ring-slate-200/60 shadow-sm">
        <table className="w-full table-fixed">
            <colgroup>
              <col style={{ width: "2%" }} />
              <col style={{ width: "6%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "20%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "7%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "8%" }} />
            </colgroup>

            {/* ── THEAD ── */}
            <thead
              className={cls(
                "sticky top-0 z-20",
                "bg-gradient-to-b from-[#eaf2fb] via-[#dde9f7] to-[#d6e4f5]",
                "border-b-2 border-[#123b63]/40",
                "shadow-[0_2px_0_rgba(18,59,99,0.35)]"
              )}
            >
              <tr>
                <th className="px-1.5 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={onToggleSelectAll}
                    className="h-4 w-4"
                    title="Seleccionar todo"
                  />
                </th>
                <TableTh sortable active={sortKey === "date"}                  direction={sortDir} onSort={() => handleSort("date")}>Fecha</TableTh>
                <TableTh sortable active={sortKey === "bank_name"}             direction={sortDir} onSort={() => handleSort("bank_name")}>Cuenta</TableTh>
                <TableTh sortable active={sortKey === "description"}           direction={sortDir} onSort={() => handleSort("description")}>Descripción</TableTh>
                <TableTh sortable active={sortKey === "reference"}             direction={sortDir} onSort={() => handleSort("reference")}>Referencia</TableTh>
                <TableTh sortable active={sortKey === "counterparty_rut"}      direction={sortDir} onSort={() => handleSort("counterparty_rut")}>RUT/NIC</TableTh>
                <TableTh sortable active={sortKey === "counterparty_name"}     direction={sortDir} onSort={() => handleSort("counterparty_name")}>Nombre contraparte</TableTh>
                <TableTh sortable active={sortKey === "debit"}                 direction={sortDir} onSort={() => handleSort("debit")}>Cargo</TableTh>
                <TableTh sortable active={sortKey === "credit"}                direction={sortDir} onSort={() => handleSort("credit")}>Abono</TableTh>
                <TableTh sortable active={sortKey === "statement_balance"}     direction={sortDir} onSort={() => handleSort("statement_balance")}>Saldo cartola</TableTh>
                <TableTh sortable active={sortKey === "reconciliation_status"} direction={sortDir} onSort={() => handleSort("reconciliation_status")}>Estado</TableTh>
              </tr>
            </thead>

            {/* ── TBODY ── */}
            <tbody className="text-[12px]">
              {loading && (
                <tr>
                  <td colSpan={11} className="p-10 text-center text-slate-500">
                    Cargando movimientos...
                  </td>
                </tr>
              )}

              {!loading && sorted.length === 0 && (
                <tr>
                  <td colSpan={11} className="p-10 text-center text-slate-500">
                    No hay movimientos para los filtros seleccionados.
                  </td>
                </tr>
              )}

              {!loading &&
                visible.map((row, idx) => {
                  const expanded = expandedId === row.id;
                  const checked  = !!selectedMap[row.id];

                  return (
                    <React.Fragment key={row.id}>
                      <tr
                        onClick={() => toggleExpand(row.id)}
                        className={cls(
                          "cursor-pointer border-t transition-colors",
                          row.reconciliation_status === "CONCILIADO" && (idx % 2 === 0 ? "bg-emerald-50/25" : "bg-emerald-50/50"),
                          row.reconciliation_status === "PARCIAL"    && (idx % 2 === 0 ? "bg-blue-50/25"    : "bg-blue-50/50"),
                          row.reconciliation_status === "SUGERIDO"   && (idx % 2 === 0 ? "bg-amber-50/30"   : "bg-amber-50/60"),
                          row.reconciliation_status === "PENDIENTE"  && (idx % 2 === 0 ? "bg-white"         : "bg-slate-50/70"),
                          "hover:bg-sky-50/50",
                          expanded && "!bg-[#eaf2fb]"
                        )}
                      >
                        {/* Checkbox */}
                        <td
                          className="px-2 py-2 align-middle text-center border-r border-slate-200/50"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            className="h-4 w-4"
                            onChange={() => onToggleRow(row.id)}
                          />
                        </td>

                        {/* Fecha */}
                        <TableTd className="whitespace-nowrap">{fmtDate(row.date)}</TableTd>

                        {/* Banco / Cuenta */}
                        <TableTd title={`${row.bank_name} — ${row.account_number}`}>
                          <span className="block font-semibold text-[#0b2b4f] truncate leading-tight">{row.bank_name}</span>
                          <span className="block text-[10px] text-slate-400 font-mono truncate leading-tight">{row.account_number}</span>
                        </TableTd>

                        {/* Descripción */}
                        <TableTd title={row.description}>
                          <span className="block truncate">{row.description}</span>
                        </TableTd>

                        {/* Referencia */}
                        <TableTd className="whitespace-nowrap" title={row.reference ?? undefined}>
                          {row.reference
                            ? <span className="font-mono text-slate-500 truncate block">{row.reference}</span>
                            : <span className="text-slate-300">—</span>}
                        </TableTd>

                        {/* RUT Contraparte */}
                        <TableTd className="whitespace-nowrap" title={row.counterparty_rut ?? undefined}>
                          {row.counterparty_rut
                            ? <span className="font-mono text-slate-600">{fmtRut(row.counterparty_rut)}</span>
                            : <span className="text-slate-300">—</span>}
                        </TableTd>

                        {/* Nombre Contraparte */}
                        <TableTd title={row.counterparty_name ?? undefined}>
                          {row.counterparty_name
                            ? <span className="text-[11px] text-slate-700 truncate block">{row.counterparty_name}</span>
                            : <span className="text-slate-300">—</span>}
                        </TableTd>

                        {/* Cargo */}
                        <TableTd right className="whitespace-nowrap">
                          {row.debit != null
                            ? <span className="font-mono font-semibold text-rose-700 tabular-nums">$ {fmt(row.debit, row.currency)}</span>
                            : <span className="text-slate-300">—</span>}
                        </TableTd>

                        {/* Abono */}
                        <TableTd right className="whitespace-nowrap">
                          {row.credit != null
                            ? <span className="font-mono font-semibold text-emerald-700 tabular-nums">$ {fmt(row.credit, row.currency)}</span>
                            : <span className="text-slate-300">—</span>}
                        </TableTd>

                        {/* Saldo Cartola */}
                        <TableTd right className="whitespace-nowrap">
                          <span className="font-mono text-slate-600 tabular-nums">$ {fmt(row.statement_balance, row.currency)}</span>
                        </TableTd>

                        {/* Estado */}
                        <TableTd center>
                          <EstadoCell
                            reconciliation={row.reconciliation_status}
                            accounting={row.accounting_status}
                          />
                        </TableTd>
                      </tr>

                      {/* ── ExpanderRow ── */}
                      {expanded && (
                        <tr className="border-t border-[#123b63]/10">
                          <td colSpan={11} className="p-0">
                            <MovimientoExpanderRow
                              row={row}
                              onConfirmMatch={onConfirmMatch}
                              onRejectMatch={onRejectMatch}
                              onSearchDoc={onSearchDoc}
                              onPostJE={onPostJE}
                              onCreateDoc={onCreateDoc}
                              onRemoveMatch={onRemoveMatch}
                              onViewJE={(entry, currency) => setJeModal({ entry, currency })}
                            />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
            </tbody>
          </table>

          {/* Sentinel de scroll infinito */}
          {hasMore && (
            <div ref={sentinelRef} className="flex items-center justify-center gap-2 py-4 text-[11px] text-slate-400">
              <span className="h-3.5 w-3.5 rounded-full border-2 border-slate-200 border-t-[#123b63] animate-spin" />
              Cargando más movimientos...
            </div>
          )}
          {!hasMore && sorted.length > pageSize && (
            <div className="py-2.5 text-center text-[10px] font-semibold tracking-widest text-slate-300 uppercase">
              · · · {sorted.length} movimientos cargados · · ·
            </div>
          )}
      </div>

      {/* ── Modal asiento contable ── */}
      {jeModal && (
        <JournalEntryModal
          entry={jeModal.entry}
          currency={jeModal.currency}
          onClose={() => setJeModal(null)}
        />
      )}
    </>
  );
}

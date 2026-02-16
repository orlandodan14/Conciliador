"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

/**
 * =========================
 * Helpers UI
 * =========================
 */
function cls(...a: Array<string | false | null | undefined>) {
  return a.filter(Boolean).join(" ");
}

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function isoToDDMMYYYY(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function ddmmyyyyToISO(ddmmyyyy: string) {
  const [d, m, y] = ddmmyyyy.split("/");
  return `${y}-${m}-${d}`;
}

function safeDDMMYYYYToISO(ddmmyyyy: string) {
  const parts = ddmmyyyy.trim().split("/");
  if (parts.length !== 3) return null;
  const [d, m, y] = parts;
  if (!d || !m || !y) return null;
  if (d.length !== 2 || m.length !== 2 || y.length !== 4) return null;
  return `${y}-${m}-${d}`;
}

function startOfMonthISO(yyyy: number, mm: number) {
  const m = String(mm).padStart(2, "0");
  return `${yyyy}-${m}-01`;
}

function endOfMonthISO(yyyy: number, mm: number) {
  const last = new Date(yyyy, mm, 0);
  const y = last.getFullYear();
  const m = String(last.getMonth() + 1).padStart(2, "0");
  const d = String(last.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function yyyymmFromISO(iso: string) {
  const [y, m] = iso.split("-");
  return `${y}-${m}`;
}

async function getAuthUserId(): Promise<string | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data?.user?.id ?? null;
}

/**
 * =========================
 * Modal (mismo patrón)
 * =========================
 */
function Modal({
  open,
  title,
  children,
  onClose,
  footer,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  footer?: React.ReactNode;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-black/35 p-4 sm:p-6" role="dialog" aria-modal="true">
      <div className="mx-auto flex h-full max-w-2xl items-center justify-center">
        <div
          className={cls(
            "w-full overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-black/5",
            "max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3rem)]"
          )}
        >
          <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white/90 px-5 py-4 backdrop-blur">
            <div className="min-w-0">
              <div className="truncate text-lg font-semibold text-slate-900">{title}</div>
              <div className="mt-0.5 text-xs font-semibold text-slate-500">Configuración contable</div>
            </div>

            <button
              onClick={onClose}
              className="ml-3 rounded-xl px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"
              aria-label="Cerrar"
              title="Cerrar"
              type="button"
            >
              ✕
            </button>
          </div>

          <div
            className={cls(
              "px-5 py-4 overflow-y-auto",
              footer
                ? "max-h-[calc(100vh-2rem-160px)] sm:max-h-[calc(100vh-3rem-160px)]"
                : "max-h-[calc(100vh-2rem-88px)] sm:max-h-[calc(100vh-3rem-88px)]"
            )}
          >
            {children}
          </div>

          {footer ? (
            <div className="sticky bottom-0 z-10 border-t bg-white/90 px-5 py-4 backdrop-blur">{footer}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * =========================
 * Tipos
 * =========================
 */
type PeriodType = "Mensual" | "Anual" | "Personalizado";
type PeriodStatus = "Abierto" | "Cerrado" | "Bloqueado";

type PeriodRow = {
  id: string;
  code: string;
  name: string;
  tipo: PeriodType;
  inicio: string; // dd/mm/yyyy
  fin: string; // dd/mm/yyyy
  estado: PeriodStatus;
  actual: boolean;
  notas?: string;
};

type AccountingPeriodDB = {
  id: string;
  company_id: string;
  code: string;
  name: string;
  period_type: string;
  start_date: string; // yyyy-mm-dd
  end_date: string; // yyyy-mm-dd
  status: string;
  is_current: boolean;
  notes: string | null;
  created_at: string;
  created_by: string | null;
  closed_at: string | null;
  closed_by: string | null;
  locked_at: string | null;
  locked_by: string | null;
};

function dbToUi(p: AccountingPeriodDB): PeriodRow {
  const tipo = (p.period_type === "Anual"
    ? "Anual"
    : p.period_type === "Personalizado"
    ? "Personalizado"
    : "Mensual") as PeriodType;

  const estado = (p.status === "Bloqueado" ? "Bloqueado" : p.status === "Cerrado" ? "Cerrado" : "Abierto") as PeriodStatus;

  return {
    id: p.id,
    code: p.code,
    name: p.name,
    tipo,
    inicio: isoToDDMMYYYY(p.start_date),
    fin: isoToDDMMYYYY(p.end_date),
    estado,
    actual: Boolean(p.is_current),
    notas: p.notes ?? undefined,
  };
}

/**
 * =========================
 * Página
 * =========================
 */
export default function PeriodosContablesPage() {
  // companyId (localStorage)
  const [companyId, setCompanyId] = useState<string | null>(null);

  useEffect(() => {
    const fromLS =
      localStorage.getItem("active_company_id") ||
      localStorage.getItem("company_id") ||
      localStorage.getItem("activeCompanyId");

    if (fromLS && fromLS.length >= 10) setCompanyId(fromLS);
    else setCompanyId(null);
  }, []);

  // Data
  const [rows, setRows] = useState<PeriodRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filtros
  const [qYear, setQYear] = useState<string>("");
  const [qStatus, setQStatus] = useState<"" | PeriodStatus>("");
  const [qText, setQText] = useState("");

  async function loadPeriods(cid: string) {
    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from("accounting_periods")
      .select(
        "id, company_id, code, name, period_type, start_date, end_date, status, is_current, notes, created_at, created_by, closed_at, closed_by, locked_at, locked_by"
      )
      .eq("company_id", cid)
      .order("start_date", { ascending: false });

    if (error) {
      setError(error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    setRows((data ?? []).map((x: any) => dbToUi(x as AccountingPeriodDB)));
    setLoading(false);
  }

  useEffect(() => {
    if (!companyId) {
      setLoading(false);
      return;
    }
    loadPeriods(companyId);
  }, [companyId]);

  const filtered = useMemo(() => {
    const t = qText.trim().toLowerCase();
    return rows
      .filter((r) => {
        if (!qYear.trim()) return true;
        const iso = ddmmyyyyToISO(r.inicio);
        return iso.startsWith(`${qYear.trim()}-`);
      })
      .filter((r) => (qStatus ? r.estado === qStatus : true))
      .filter((r) => {
        if (!t) return true;
        const hay = `${r.code} ${r.name} ${r.tipo} ${r.estado}`.toLowerCase();
        return hay.includes(t);
      })
      .sort((a, b) => ddmmyyyyToISO(b.inicio).localeCompare(ddmmyyyyToISO(a.inicio)));
  }, [rows, qYear, qStatus, qText]);

  /**
   * =========================
   * Modal state
   * =========================
   */
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [mTipo, setMTipo] = useState<PeriodType>("Mensual");
  const [mStartISO, setMStartISO] = useState<string>(todayISO());
  const [mEndISO, setMEndISO] = useState<string>(todayISO());
  const [mCode, setMCode] = useState<string>("");
  const [mName, setMName] = useState<string>("");
  const [mNotes, setMNotes] = useState<string>("");

  const [quickYear, setQuickYear] = useState<number>(new Date().getFullYear());
  const [quickMonth, setQuickMonth] = useState<number>(new Date().getMonth() + 1);

  function suggestCodeName(tipo: PeriodType, startISO: string, endISO: string) {
    if (tipo === "Mensual") {
      const ym = yyyymmFromISO(startISO);
      return { code: ym, name: `Período ${ym}` };
    }
    if (tipo === "Anual") {
      const y = startISO.split("-")[0];
      return { code: `FY${y}`, name: `Año fiscal ${y}` };
    }
    const s = startISO;
    const e = endISO;
    return { code: `${s}_a_${e}`, name: `Período ${isoToDDMMYYYY(s)} - ${isoToDDMMYYYY(e)}` };
  }

  function openAdd() {
    setEditingId(null);
    setMTipo("Mensual");

    const y = new Date().getFullYear();
    const m = new Date().getMonth() + 1;
    setQuickYear(y);
    setQuickMonth(m);

    const start = startOfMonthISO(y, m);
    const end = endOfMonthISO(y, m);
    setMStartISO(start);
    setMEndISO(end);

    const sug = suggestCodeName("Mensual", start, end);
    setMCode(sug.code);
    setMName(sug.name);
    setMNotes("");
    setOpen(true);
  }

  function openEdit(r: PeriodRow) {
    setEditingId(r.id);
    setMTipo(r.tipo);

    const s = safeDDMMYYYYToISO(r.inicio) ?? todayISO();
    const e = safeDDMMYYYYToISO(r.fin) ?? todayISO();
    setMStartISO(s);
    setMEndISO(e);

    setMCode(r.code);
    setMName(r.name);
    setMNotes(r.notas ?? "");
    setOpen(true);
  }

  function applyQuickMensual(y: number, m: number) {
    const start = startOfMonthISO(y, m);
    const end = endOfMonthISO(y, m);
    setMStartISO(start);
    setMEndISO(end);
    const sug = suggestCodeName("Mensual", start, end);
    if (!editingId) {
      setMCode(sug.code);
      setMName(sug.name);
    }
  }

  async function saveModal() {
    if (!companyId) {
      alert("No hay company_id activo. (Revisa localStorage: active_company_id)");
      return;
    }

    if (!mCode.trim() || !mName.trim()) {
      alert("Completa Código y Nombre.");
      return;
    }
    if (!mStartISO || !mEndISO) {
      alert("Completa Inicio y Fin.");
      return;
    }
    if (mStartISO > mEndISO) {
      alert("La fecha de Inicio no puede ser mayor que la de Fin.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (editingId) {
        const current = rows.find((x) => x.id === editingId);
        if (current?.estado === "Bloqueado") {
          alert("Este período está Bloqueado. No se puede editar.");
          setSaving(false);
          return;
        }
        if (current?.estado === "Cerrado") {
          const ok = confirm("Este período está Cerrado. ¿Seguro deseas editarlo? (No recomendado)");
          if (!ok) {
            setSaving(false);
            return;
          }
        }

        const { data, error } = await supabase
          .from("accounting_periods")
          .update({
            code: mCode.trim(),
            name: mName.trim(),
            period_type: mTipo,
            start_date: mStartISO,
            end_date: mEndISO,
            notes: mNotes.trim() ? mNotes.trim() : null,
          })
          .eq("id", editingId)
          .eq("company_id", companyId)
          .select(
            "id, company_id, code, name, period_type, start_date, end_date, status, is_current, notes, created_at, created_by, closed_at, closed_by, locked_at, locked_by"
          )
          .single();

        if (error) throw error;

        const updated = dbToUi(data as any);
        setRows((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      } else {
        const uid = await getAuthUserId();

        const { data, error } = await supabase
          .from("accounting_periods")
          .insert({
            company_id: companyId,
            code: mCode.trim(),
            name: mName.trim(),
            period_type: mTipo,
            start_date: mStartISO,
            end_date: mEndISO,
            status: "Abierto",
            is_current: false,
            notes: mNotes.trim() ? mNotes.trim() : null,
            created_by: uid, // ✅ FIX
          })
          .select(
            "id, company_id, code, name, period_type, start_date, end_date, status, is_current, notes, created_at, created_by, closed_at, closed_by, locked_at, locked_by"
          )
          .single();

        if (error) throw error;

        const created = dbToUi(data as any);
        setRows((prev) => [created, ...prev]);
      }

      setOpen(false);
    } catch (e: any) {
      const msg = e?.message ?? "Error guardando.";
      setError(msg);

      if (String(msg).toLowerCase().includes("overlap") || String(msg).toLowerCase().includes("exclude")) {
        alert("No se pudo guardar porque este período se cruza con otro existente (mismas fechas). Ajusta el rango e intenta nuevamente.");
      } else {
        alert(`Error al guardar: ${msg}`);
      }
    } finally {
      setSaving(false);
    }
  }

  /**
   * =========================
   * Acciones de estado
   * =========================
   */
  async function setCurrent(id: string) {
    if (!companyId) return;
    const current = rows.find((r) => r.id === id);
    if (!current) return;

    if (current.estado === "Bloqueado") {
      alert("Un período Bloqueado no se puede marcar como Actual.");
      return;
    }

    const before = rows;
    setRows((prev) => prev.map((r) => ({ ...r, actual: r.id === id })));
    setError(null);

    try {
      const prevCurrent = before.find((r) => r.actual && r.id !== id);
      if (prevCurrent) {
        const { error: e1 } = await supabase
          .from("accounting_periods")
          .update({ is_current: false })
          .eq("id", prevCurrent.id)
          .eq("company_id", companyId);
        if (e1) throw e1;
      }

      const { error: e2 } = await supabase
        .from("accounting_periods")
        .update({ is_current: true })
        .eq("id", id)
        .eq("company_id", companyId);

      if (e2) throw e2;
    } catch (e: any) {
      setRows(before);
      const msg = e?.message ?? "Error al marcar como actual.";
      setError(msg);
      alert(`Error: ${msg}`);
    }
  }

  async function closePeriod(id: string) {
    if (!companyId) return;
    const current = rows.find((r) => r.id === id);
    if (!current) return;

    if (current.estado !== "Abierto") {
      alert("Solo puedes cerrar períodos en estado Abierto.");
      return;
    }

    const ok = confirm("¿Cerrar este período? Recomendado cuando ya no habrá movimientos en ese rango.");
    if (!ok) return;

    const before = rows;
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, estado: "Cerrado" } : r)));
    setError(null);

    const uid = await getAuthUserId();

    const { error } = await supabase
      .from("accounting_periods")
      .update({ status: "Cerrado", closed_at: new Date().toISOString(), closed_by: uid }) // ✅ FIX
      .eq("id", id)
      .eq("company_id", companyId);

    if (error) {
      setRows(before);
      setError(error.message);
      alert(`Error al cerrar: ${error.message}`);
    }
  }

  async function reopenPeriod(id: string) {
    if (!companyId) return;
    const current = rows.find((r) => r.id === id);
    if (!current) return;

    if (current.estado !== "Cerrado") {
      alert("Solo puedes reabrir períodos en estado Cerrado.");
      return;
    }

    const ok = confirm("¿Reabrir este período? Úsalo solo si fue un cierre preliminar.");
    if (!ok) return;

    const before = rows;
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, estado: "Abierto" } : r)));
    setError(null);

    const { error } = await supabase
      .from("accounting_periods")
      .update({ status: "Abierto", closed_at: null, closed_by: null })
      .eq("id", id)
      .eq("company_id", companyId);

    if (error) {
      setRows(before);
      setError(error.message);
      alert(`Error al reabrir: ${error.message}`);
    }
  }

  async function lockPeriod(id: string) {
    if (!companyId) return;
    const current = rows.find((r) => r.id === id);
    if (!current) return;

    if (current.estado === "Bloqueado") {
      alert("Este período ya está Bloqueado.");
      return;
    }

    const ok = confirm("¿Bloquear este período? Esto es cierre definitivo (auditoría). Luego no deberías modificar nada.");
    if (!ok) return;

    const before = rows;
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, estado: "Bloqueado" } : r)));
    setError(null);

    const uid = await getAuthUserId();

    const { error } = await supabase
      .from("accounting_periods")
      .update({ status: "Bloqueado", locked_at: new Date().toISOString(), locked_by: uid }) // ✅ FIX
      .eq("id", id)
      .eq("company_id", companyId);

    if (error) {
      setRows(before);
      setError(error.message);
      alert(`Error al bloquear: ${error.message}`);
    }
  }

  async function removePeriod(id: string) {
    if (!companyId) return;

    const current = rows.find((r) => r.id === id);
    if (!current) return;

    if (current.estado !== "Abierto") {
      alert("Solo se puede eliminar un período Abierto.");
      return;
    }

    const ok = confirm("¿Eliminar este período? (Recomendado solo si fue creado por error).");
    if (!ok) return;

    const before = rows;
    setRows((prev) => prev.filter((r) => r.id !== id));
    setError(null);

    const { error } = await supabase.from("accounting_periods").delete().eq("id", id).eq("company_id", companyId);

    if (error) {
      setRows(before);
      setError(error.message);
      alert(`Error al eliminar: ${error.message}`);
    }
  }

  function onDownload() {
    alert("Descargar períodos (pendiente).");
  }

  const gridCols = "grid-cols-[130px_1.2fr_160px_140px_140px_140px_180px]";
  const cellBase = "min-w-0";

  return (
    <div className="p-6">
      <div className="overflow-hidden rounded-[28px] bg-white ring-1 ring-slate-200 shadow-[0_18px_70px_rgba(15,23,42,0.10)]">
        {/* Header */}
        <div className="relative bg-gradient-to-r from-[#0b2b4f] via-[#123b63] to-[#0b2b4f] px-7 py-7 text-white">
          <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />

          <div className="relative flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[12px] font-extrabold uppercase text-white/80">Configuración contable</div>
              <h1 className="mt-1 text-3xl font-black leading-tight">Períodos contables</h1>
              <div className="mt-2 text-[13px] text-white/85">
                Define períodos por mes o personalizados. El sistema usa el “Período Actual” como sugerencia por defecto
                al registrar movimientos.
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={openAdd}
                className="rounded-2xl bg-white/10 px-4 py-2 text-[12px] font-extrabold ring-1 ring-white/15 hover:bg-white/15 transition"
                type="button"
              >
                + Crear período
              </button>

              <button
                onClick={onDownload}
                className="rounded-2xl bg-white/10 px-4 py-2 text-[12px] font-extrabold ring-1 ring-white/15 hover:bg-white/15 transition"
                type="button"
              >
                Descargar
              </button>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-7">
          <div className="rounded-[26px] bg-white p-5 ring-1 ring-slate-200">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[12px] font-extrabold uppercase text-slate-600">Cómo se usa</div>
                <div className="mt-1 text-[13px] text-slate-600">
                  ✅ Recomendado: períodos <b>Mensuales</b>. <br />
                  🚫 No permitimos que dos períodos tengan fechas que se crucen (para evitar confusión). <br />
                  🔒 “Bloqueado” es cierre definitivo (auditoría).
                </div>
              </div>

              <button
                onClick={() => companyId && loadPeriods(companyId)}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-[12px] font-extrabold text-slate-700 hover:bg-slate-50"
                type="button"
              >
                Refrescar
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-12">
              <div className="lg:col-span-4">
                <div className="text-[11px] font-extrabold uppercase text-slate-600">Año (opcional)</div>
                <input
                  value={qYear}
                  onChange={(e) => setQYear(e.target.value)}
                  placeholder="Ej: 2026"
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-[12px] font-extrabold text-slate-900 outline-none focus:ring-2 focus:ring-slate-200"
                />
                <div className="mt-1 text-[12px] text-slate-500">Filtra por año según la fecha de inicio.</div>
              </div>

              <div className="lg:col-span-4">
                <div className="text-[11px] font-extrabold uppercase text-slate-600">Estado</div>
                <select
                  value={qStatus}
                  onChange={(e) => setQStatus(e.target.value as any)}
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-[12px] font-extrabold text-slate-900 outline-none focus:ring-2 focus:ring-slate-200"
                >
                  <option value="">Todos</option>
                  <option value="Abierto">Abierto</option>
                  <option value="Cerrado">Cerrado</option>
                  <option value="Bloqueado">Bloqueado</option>
                </select>
                <div className="mt-1 text-[12px] text-slate-500">Tip: “Abierto” es el operativo.</div>
              </div>

              <div className="lg:col-span-4">
                <div className="text-[11px] font-extrabold uppercase text-slate-600">Búsqueda</div>
                <div className="relative mt-1">
                  <input
                    value={qText}
                    onChange={(e) => setQText(e.target.value)}
                    placeholder="Código, nombre, tipo..."
                    className="w-full rounded-2xl border border-slate-200 bg-white px-11 py-2 text-[12px] font-extrabold text-slate-900 outline-none focus:ring-2 focus:ring-slate-200"
                  />
                  <span className="absolute left-4 top-2 text-slate-400">🔎</span>
                  {qText ? (
                    <button
                      type="button"
                      onClick={() => setQText("")}
                      className="absolute right-4 top-2 text-slate-400 hover:text-slate-600"
                      title="Limpiar"
                    >
                      ✕
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-[26px] bg-white ring-1 ring-slate-200">
            <div className="overflow-x-auto">
              <div className="min-w-[980px]">
                <div className={cls("grid items-center border-b border-slate-200 bg-slate-50 px-5 py-2.5", gridCols)}>
                  <div className={cls(cellBase, "text-[11px] font-extrabold uppercase text-slate-600")}>Código</div>

                  <div className={cls(cellBase, "pl-4 border-l border-slate-200 text-[11px] font-extrabold uppercase text-slate-600")}>
                    Nombre
                  </div>

                  <div className={cls(cellBase, "pl-4 border-l border-slate-200 text-[11px] font-extrabold uppercase text-slate-600")}>
                    Tipo
                  </div>

                  <div className={cls(cellBase, "pl-4 border-l border-slate-200 text-[11px] font-extrabold uppercase text-slate-600")}>
                    Inicio
                  </div>

                  <div className={cls(cellBase, "pl-4 border-l border-slate-200 text-[11px] font-extrabold uppercase text-slate-600")}>
                    Fin
                  </div>

                  <div className={cls(cellBase, "pl-4 border-l border-slate-200 text-[11px] font-extrabold uppercase text-slate-600")}>
                    Estado
                  </div>

                  <div className={cls(cellBase, "pl-4 border-l border-slate-200 text-[11px] font-extrabold uppercase text-slate-600 text-right")}>
                    Acciones
                  </div>
                </div>

                {loading ? (
                  <div className="px-5 py-14 text-center text-[13px] text-slate-600">Cargando...</div>
                ) : !companyId ? (
                  <div className="px-5 py-14 text-center text-[13px] text-slate-600">
                    No se detectó <b>company_id</b>. Guarda el id en localStorage como{" "}
                    <code className="rounded bg-slate-100 px-2 py-1">active_company_id</code>.
                  </div>
                ) : error ? (
                  <div className="px-5 py-14 text-center text-[13px] text-rose-600">
                    Error: {error}
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={() => loadPeriods(companyId)}
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-[12px] font-extrabold text-slate-700 hover:bg-slate-50"
                      >
                        Reintentar
                      </button>
                    </div>
                  </div>
                ) : filtered.length ? (
                  filtered.map((r) => (
                    <div
                      key={r.id}
                      className={cls("grid items-center px-5 py-2 border-b border-slate-100 hover:bg-slate-50", gridCols)}
                    >
                      <div className={cls(cellBase, "text-[13px] font-black text-slate-900 whitespace-nowrap")}>
                        {r.code}
                        {r.actual ? (
                          <span className="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-black text-indigo-700">
                            Actual
                          </span>
                        ) : null}
                      </div>

                      <div className={cls(cellBase, "pl-4 border-l border-slate-200")}>
                        <div className="text-[13px] font-extrabold text-slate-800 truncate">{r.name}</div>
                        {r.notas ? <div className="text-[12px] text-slate-500 truncate">{r.notas}</div> : null}
                      </div>

                      <div className={cls(cellBase, "pl-4 border-l border-slate-200")}>
                        <div className="text-[13px] font-semibold text-slate-800 truncate">{r.tipo}</div>
                      </div>

                      <div className={cls(cellBase, "pl-4 border-l border-slate-200")}>
                        <div className="text-[13px] font-semibold text-slate-800 whitespace-nowrap">{r.inicio}</div>
                      </div>

                      <div className={cls(cellBase, "pl-4 border-l border-slate-200")}>
                        <div className="text-[13px] font-semibold text-slate-800 whitespace-nowrap">{r.fin}</div>
                      </div>

                      <div className={cls(cellBase, "pl-4 border-l border-slate-200")}>
                        <span
                          className={cls(
                            "inline-flex items-center rounded-full px-3 py-1 text-[11px] font-black whitespace-nowrap",
                            r.estado === "Abierto"
                              ? "bg-emerald-100 text-emerald-700"
                              : r.estado === "Cerrado"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-slate-200 text-slate-700"
                          )}
                        >
                          {r.estado}
                        </span>
                      </div>

                      <div className={cls(cellBase, "pl-4 border-l border-slate-200")}>
                        <div className="flex justify-end gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() => setCurrent(r.id)}
                            className={cls(
                              "rounded-2xl border px-3 py-2 text-[12px] font-extrabold whitespace-nowrap transition",
                              r.actual
                                ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                            )}
                            title="Marcar como período actual"
                          >
                            {r.actual ? "Actual" : "Hacer actual"}
                          </button>

                          <button
                            type="button"
                            onClick={() => openEdit(r)}
                            className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-[12px] font-extrabold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                            disabled={r.estado === "Bloqueado"}
                            title={r.estado === "Bloqueado" ? "Bloqueado: no editable" : "Editar"}
                          >
                            Editar
                          </button>

                          {r.estado === "Abierto" ? (
                            <button
                              type="button"
                              onClick={() => closePeriod(r.id)}
                              className="rounded-2xl border border-amber-200 bg-white px-3 py-2 text-[12px] font-extrabold text-amber-700 hover:bg-amber-50 whitespace-nowrap"
                            >
                              Cerrar
                            </button>
                          ) : null}

                          {r.estado === "Cerrado" ? (
                            <>
                              <button
                                type="button"
                                onClick={() => reopenPeriod(r.id)}
                                className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-[12px] font-extrabold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                              >
                                Reabrir
                              </button>

                              <button
                                type="button"
                                onClick={() => lockPeriod(r.id)}
                                className="rounded-2xl border border-slate-300 bg-white px-3 py-2 text-[12px] font-extrabold text-slate-800 hover:bg-slate-100 whitespace-nowrap"
                              >
                                Bloquear
                              </button>
                            </>
                          ) : null}

                          <button
                            type="button"
                            onClick={() => removePeriod(r.id)}
                            className="rounded-2xl border border-rose-200 bg-white px-3 py-2 text-[12px] font-extrabold text-rose-600 hover:bg-rose-50 whitespace-nowrap"
                            disabled={r.estado !== "Abierto"}
                            title={r.estado !== "Abierto" ? "Solo se elimina si está Abierto" : "Eliminar"}
                          >
                            Eliminar
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="px-5 py-14 text-center text-[13px] text-slate-600">No hay períodos todavía.</div>
                )}

                <div className="border-t border-slate-200 bg-slate-50 px-5 py-3 text-[12px] text-slate-600">
                  Nota: Lo normal en empresas es <b>Mensual</b>. “Cerrado” es cierre operativo; “Bloqueado” es definitivo.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 text-center text-[12px] text-slate-500">ConciliaciónPro • Configuración contable</div>

      <Modal
        open={open}
        title={editingId ? "Editar período contable" : "Crear período contable"}
        onClose={() => setOpen(false)}
        footer={
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => setOpen(false)}
              className="rounded-full px-5 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
              type="button"
              disabled={saving}
            >
              Cancelar
            </button>

            <button
              onClick={saveModal}
              className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
              type="button"
              disabled={saving}
            >
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        }
      >
        <div className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-700">
          Tip: “Mensual” es lo más usado. El sistema no permite períodos que se crucen en fechas.
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <div className="text-xs font-black text-slate-600">Tipo</div>
            <select
              value={mTipo}
              onChange={(e) => {
                const next = e.target.value as PeriodType;
                setMTipo(next);

                if (next === "Mensual") {
                  applyQuickMensual(quickYear, quickMonth);
                  const sug = suggestCodeName("Mensual", startOfMonthISO(quickYear, quickMonth), endOfMonthISO(quickYear, quickMonth));
                  if (!editingId) {
                    setMCode(sug.code);
                    setMName(sug.name);
                  }
                } else if (next === "Anual") {
                  const y = Number((mStartISO || todayISO()).split("-")[0]);
                  const start = `${y}-01-01`;
                  const end = `${y}-12-31`;
                  setMStartISO(start);
                  setMEndISO(end);
                  const sug = suggestCodeName("Anual", start, end);
                  if (!editingId) {
                    setMCode(sug.code);
                    setMName(sug.name);
                  }
                } else {
                  const sug = suggestCodeName("Personalizado", mStartISO, mEndISO);
                  if (!editingId) {
                    setMCode(sug.code);
                    setMName(sug.name);
                  }
                }
              }}
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
            >
              <option value="Mensual">Mensual (recomendado)</option>
              <option value="Anual">Anual</option>
              <option value="Personalizado">Personalizado</option>
            </select>
          </div>

          <div>
            <div className="text-xs font-black text-slate-600">Código</div>
            <input
              value={mCode}
              onChange={(e) => setMCode(e.target.value)}
              placeholder="Ej: 2026-01"
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
            />
            <div className="mt-1 text-xs text-slate-500">Único y fácil de identificar.</div>
          </div>

          <div className="sm:col-span-2">
            <div className="text-xs font-black text-slate-600">Nombre</div>
            <input
              value={mName}
              onChange={(e) => setMName(e.target.value)}
              placeholder="Ej: Enero 2026"
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
            />
          </div>

          {mTipo === "Mensual" ? (
            <div className="sm:col-span-2 rounded-2xl border border-slate-200 bg-white p-3">
              <div className="text-xs font-black text-slate-600">Crear mensual rápido</div>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <div className="text-[11px] font-extrabold uppercase text-slate-600">Año</div>
                  <input
                    type="number"
                    value={quickYear}
                    onChange={(e) => {
                      const y = Number(e.target.value);
                      setQuickYear(y);
                      applyQuickMensual(y, quickMonth);
                    }}
                    className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
                  />
                </div>
                <div>
                  <div className="text-[11px] font-extrabold uppercase text-slate-600">Mes (1-12)</div>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={quickMonth}
                    onChange={(e) => {
                      const m = Number(e.target.value);
                      setQuickMonth(m);
                      applyQuickMensual(quickYear, m);
                    }}
                    className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
                  />
                </div>
              </div>
              <div className="mt-2 text-xs text-slate-500">
                Se ajustan automáticamente las fechas (inicio/fin) del mes seleccionado.
              </div>
            </div>
          ) : null}

          <div>
            <div className="text-xs font-black text-slate-600">Inicio</div>
            <input
              type="date"
              value={mStartISO}
              onChange={(e) => {
                const v = e.target.value;
                setMStartISO(v);
                if (!editingId) {
                  const sug = suggestCodeName(mTipo, v, mEndISO);
                  setMCode(sug.code);
                  setMName(sug.name);
                }
              }}
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
            />
          </div>

          <div>
            <div className="text-xs font-black text-slate-600">Fin</div>
            <input
              type="date"
              value={mEndISO}
              onChange={(e) => {
                const v = e.target.value;
                setMEndISO(v);
                if (!editingId) {
                  const sug = suggestCodeName(mTipo, mStartISO, v);
                  setMCode(sug.code);
                  setMName(sug.name);
                }
              }}
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
            />
          </div>

          <div className="sm:col-span-2">
            <div className="text-xs font-black text-slate-600">Notas (opcional)</div>
            <input
              value={mNotes}
              onChange={(e) => setMNotes(e.target.value)}
              placeholder="Ej: Cierre preliminar / Ajustes pendientes..."
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
            />
          </div>
        </div>

        <div className="mt-4 rounded-2xl bg-slate-50 p-3 text-sm text-slate-700">
          <b>Resumen:</b> {mCode || "—"} • {mName || "—"} • {mTipo} • {isoToDDMMYYYY(mStartISO)} → {isoToDDMMYYYY(mEndISO)}
        </div>
      </Modal>
    </div>
  );
}

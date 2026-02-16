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

function formatNumber(val: number, decimals: number) {
  try {
    return val.toLocaleString("es-CL", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  } catch {
    return String(val);
  }
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

/**
 * =========================
 * Modal
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

          {footer ? <div className="sticky bottom-0 z-10 border-t bg-white/90 px-5 py-4 backdrop-blur">{footer}</div> : null}
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
type FxSource = "Manual" | "Banco Central";
type FxStatus = "Activo" | "Bloqueado";

type FxRow = {
  id: string;
  fecha: string; // dd/mm/yyyy
  monedaOrigen: string;
  monedaDestino: string;
  valor: number;
  fuente: FxSource;
  estado: FxStatus;
};

type FxRateDB = {
  id: string;
  company_id: string;
  date: string; // yyyy-mm-dd
  from_currency: string;
  to_currency: string;
  value: number;
  source: string;
  status: string;
  created_at: string;
};

function dbToUi(r: FxRateDB): FxRow {
  return {
    id: r.id,
    fecha: isoToDDMMYYYY(r.date),
    monedaOrigen: r.from_currency,
    monedaDestino: r.to_currency,
    valor: Number(r.value),
    fuente: (r.source === "Banco Central" ? "Banco Central" : "Manual") as FxSource,
    estado: (r.status === "Bloqueado" ? "Bloqueado" : "Activo") as FxStatus,
  };
}

/**
 * =========================
 * Página
 * =========================
 */
export default function MonedasPage() {
  // Configuración (local por ahora)
  const [monedaBase, setMonedaBase] = useState("CLP - Peso Chileno");
  const [modoFuente, setModoFuente] = useState<"manual" | "oficial">("manual");
  const [proveedorOficial, setProveedorOficial] = useState("Banco Central de Chile");
  const [decimales, setDecimales] = useState<number>(4);
  const [redondeo, setRedondeo] = useState<"normal" | "financiero">("normal");

  // Filtros
  const [qFecha, setQFecha] = useState("");
  const [qText, setQText] = useState("");

  // Data real
  const [rows, setRows] = useState<FxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function loadFxRates(cid: string) {
    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from("fx_rates")
      .select("id, company_id, date, from_currency, to_currency, value, source, status, created_at")
      .eq("company_id", cid)
      .order("date", { ascending: false });

    if (error) {
      setError(error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    setRows((data ?? []).map(dbToUi));
    setLoading(false);
  }

  useEffect(() => {
    if (!companyId) {
      setLoading(false);
      return;
    }
    loadFxRates(companyId);
  }, [companyId]);

  const filtered = useMemo(() => {
    const t = qText.trim().toLowerCase();
    return rows
      .filter((r) => (qFecha.trim() ? r.fecha === qFecha.trim() : true))
      .filter((r) => {
        if (!t) return true;
        const hay = `${r.monedaOrigen} ${r.monedaDestino} ${r.fuente}`.toLowerCase();
        return hay.includes(t);
      })
      .sort((a, b) => ddmmyyyyToISO(b.fecha).localeCompare(ddmmyyyyToISO(a.fecha)));
  }, [rows, qFecha, qText]);

  // Modal
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [mFechaISO, setMFechaISO] = useState(todayISO());
  const [mOrigen, setMOrigen] = useState("USD");
  const [mDestino, setMDestino] = useState("CLP");
  const [mValor, setMValor] = useState("");

  function openAdd() {
    setEditingId(null);
    setMFechaISO(todayISO());
    setMOrigen("USD");
    setMDestino("CLP");
    setMValor("");
    setOpen(true);
  }

  function openEdit(r: FxRow) {
    setEditingId(r.id);
    setMFechaISO(safeDDMMYYYYToISO(r.fecha) ?? todayISO());
    setMOrigen(r.monedaOrigen);
    setMDestino(r.monedaDestino);
    setMValor(String(r.valor));
    setOpen(true);
  }

  async function saveModal() {
    if (!companyId) {
      alert("No hay company_id activo. (Revisa localStorage: active_company_id)");
      return;
    }

    const valorNum = Number(String(mValor).replace(",", "."));
    if (!mFechaISO || !mOrigen || !mDestino || !isFinite(valorNum) || valorNum <= 0) {
      alert("Completa Fecha, Monedas y un Valor válido.");
      return;
    }

    const fuente: FxSource = modoFuente === "oficial" ? "Banco Central" : "Manual";

    setSaving(true);
    setError(null);

    try {
      if (editingId) {
        const { data, error } = await supabase
          .from("fx_rates")
          .update({
            date: mFechaISO,
            from_currency: mOrigen,
            to_currency: mDestino,
            value: valorNum,
            source: fuente,
          })
          .eq("id", editingId)
          .eq("company_id", companyId)
          .select("id, company_id, date, from_currency, to_currency, value, source, status, created_at")
          .single();

        if (error) throw error;

        const updated = dbToUi(data as FxRateDB);
        setRows((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      } else {
        const { data, error } = await supabase
          .from("fx_rates")
          .insert({
            company_id: companyId,
            date: mFechaISO,
            from_currency: mOrigen,
            to_currency: mDestino,
            value: valorNum,
            source: fuente,
            status: "Activo",
          })
          .select("id, company_id, date, from_currency, to_currency, value, source, status, created_at")
          .single();

        if (error) throw error;

        const created = dbToUi(data as FxRateDB);
        setRows((prev) => [created, ...prev]);
      }

      setOpen(false);
    } catch (e: any) {
      const msg = e?.message ?? "Error guardando.";
      setError(msg);
      alert(`Error al guardar: ${msg}`);
    } finally {
      setSaving(false);
    }
  }

  async function toggleEstado(id: string) {
    if (!companyId) return;

    const current = rows.find((r) => r.id === id);
    if (!current) return;

    const nextStatus: FxStatus = current.estado === "Activo" ? "Bloqueado" : "Activo";

    setError(null);
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, estado: nextStatus } : r)));

    const { error } = await supabase
      .from("fx_rates")
      .update({ status: nextStatus })
      .eq("id", id)
      .eq("company_id", companyId);

    if (error) {
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, estado: current.estado } : r)));
      setError(error.message);
      alert(`Error al cambiar estado: ${error.message}`);
    }
  }

  async function removeRow(id: string) {
    if (!companyId) return;
    const ok = confirm("¿Eliminar este tipo de cambio?");
    if (!ok) return;

    const before = rows;
    setRows((prev) => prev.filter((r) => r.id !== id));
    setError(null);

    const { error } = await supabase.from("fx_rates").delete().eq("id", id).eq("company_id", companyId);

    if (error) {
      setRows(before);
      setError(error.message);
      alert(`Error al eliminar: ${error.message}`);
    }
  }

  function onGuardarConfig() {
    alert("Configuración guardada (pendiente de tabla settings).");
  }

  function onDownloadHistorial() {
    alert("Descargar historial (pendiente).");
  }

  /**
   * =========================
   * GRID PROFESIONAL (clave)
   * =========================
   * Usamos fr para que el layout sea flexible y no “baile”.
   * Además, overflow-x-auto para ventanas chicas.
   */
  const gridCols =
    "grid-cols-[140px_1.4fr_120px_140px_140px_120px_160px]"; // FECHA | PAR | DESTINO | VALOR | FUENTE | ESTADO | ACCIONES

  const cellBase = "min-w-0"; // permite truncate real

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
              <h1 className="mt-1 text-3xl font-black leading-tight">Moneda y tipo de cambio</h1>
              <div className="mt-2 text-[13px] text-white/85">Define moneda base, fuente y administra el historial por fecha.</div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={openAdd}
                className="rounded-2xl bg-white/10 px-4 py-2 text-[12px] font-extrabold ring-1 ring-white/15 hover:bg-white/15 transition"
                type="button"
              >
                + Agregar tipo de cambio
              </button>

              <button
                onClick={onDownloadHistorial}
                className="rounded-2xl bg-white/10 px-4 py-2 text-[12px] font-extrabold ring-1 ring-white/15 hover:bg-white/15 transition"
                type="button"
              >
                Descargar historial
              </button>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-7">
          {/* Config */}
          <div className="rounded-[26px] bg-white p-5 ring-1 ring-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[12px] font-extrabold uppercase text-slate-600">Configuración general</div>
                <div className="mt-1 text-[13px] text-slate-600">
                  La tabla de tipos de cambio se usa para generar asientos y para revalorizaciones en cierre (sin recalcular asientos antiguos).
                </div>
              </div>

              <button
                onClick={onGuardarConfig}
                className="rounded-2xl bg-slate-900 px-4 py-2 text-[12px] font-extrabold text-white hover:opacity-95 transition"
                type="button"
              >
                Guardar configuración
              </button>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-12">
              {/* izquierda */}
              <div className="lg:col-span-7">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <div className="text-[11px] font-extrabold uppercase text-slate-600">Moneda base</div>
                    <select
                      value={monedaBase}
                      onChange={(e) => setMonedaBase(e.target.value)}
                      className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-[12px] font-extrabold text-slate-900 outline-none focus:ring-2 focus:ring-slate-200"
                    >
                      <option>CLP - Peso Chileno</option>
                      <option>USD - Dólar</option>
                      <option>EUR - Euro</option>
                      <option>MXN - Peso Mexicano</option>
                      <option>VES - Bolívar</option>
                    </select>
                  </div>

                  <div>
                    <div className="text-[11px] font-extrabold uppercase text-slate-600">Decimales permitidos</div>
                    <input
                      type="number"
                      min={0}
                      max={10}
                      value={decimales}
                      onChange={(e) => setDecimales(Number(e.target.value))}
                      className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-[12px] font-extrabold text-slate-900 outline-none focus:ring-2 focus:ring-slate-200"
                    />
                    <div className="mt-1 text-[12px] text-slate-500">Recomendado: 4</div>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="text-[11px] font-extrabold uppercase text-slate-600">Fuente de tipo de cambio</div>
                  <div className="mt-2 flex flex-wrap items-center gap-6">
                    <label className="flex items-center gap-2 text-[12px] font-extrabold text-slate-900">
                      <input
                        type="radio"
                        checked={modoFuente === "manual"}
                        onChange={() => setModoFuente("manual")}
                        className="h-4 w-4 accent-slate-900"
                      />
                      Manual
                    </label>

                    <label className="flex items-center gap-2 text-[12px] font-extrabold text-slate-900">
                      <input
                        type="radio"
                        checked={modoFuente === "oficial"}
                        onChange={() => setModoFuente("oficial")}
                        className="h-4 w-4 accent-slate-900"
                      />
                      Oficial
                    </label>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="text-[11px] font-extrabold uppercase text-slate-600">Redondeo</div>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setRedondeo("normal")}
                      className={cls(
                        "rounded-2xl border px-4 py-2 text-[12px] font-extrabold transition",
                        redondeo === "normal"
                          ? "border-slate-900 bg-slate-50 text-slate-900"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      )}
                    >
                      Normal
                    </button>

                    <button
                      type="button"
                      onClick={() => setRedondeo("financiero")}
                      className={cls(
                        "rounded-2xl border px-4 py-2 text-[12px] font-extrabold transition",
                        redondeo === "financiero"
                          ? "border-slate-900 bg-slate-50 text-slate-900"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      )}
                    >
                      Financiero
                    </button>
                  </div>
                </div>
              </div>

              {/* derecha */}
              <div className="lg:col-span-5">
                <div className="rounded-[26px] bg-slate-50 p-4 ring-1 ring-slate-200">
                  <div className="text-[11px] font-extrabold uppercase text-slate-600">Sistema (si usas oficial)</div>

                  <select
                    value={proveedorOficial}
                    onChange={(e) => setProveedorOficial(e.target.value)}
                    disabled={modoFuente !== "oficial"}
                    className={cls(
                      "mt-2 w-full rounded-2xl border bg-white px-4 py-2 text-[12px] font-extrabold outline-none focus:ring-2 focus:ring-slate-200",
                      modoFuente !== "oficial" ? "border-slate-200 text-slate-400" : "border-slate-200 text-slate-900"
                    )}
                  >
                    <option>Banco Central de Chile</option>
                    <option>Proveedor Oficial (futuro)</option>
                  </select>

                  <div className="mt-3 text-[12px] text-slate-600">
                    {modoFuente === "oficial" ? "✅ Modo oficial activo." : "⚠️ Estás en modo manual."}
                  </div>
                </div>

                <div className="mt-3 rounded-[26px] bg-white p-4 ring-1 ring-slate-200">
                  <div className="text-[11px] font-extrabold uppercase text-slate-600">Búsqueda</div>

                  <div className="mt-2 grid grid-cols-1 gap-2">
                    <div className="relative">
                      <input
                        value={qFecha}
                        onChange={(e) => setQFecha(e.target.value)}
                        placeholder="Buscar por fecha (dd/mm/yyyy)..."
                        className="w-full rounded-2xl border border-slate-200 bg-white px-11 py-2 text-[12px] font-extrabold text-slate-900 outline-none focus:ring-2 focus:ring-slate-200"
                      />
                      <span className="absolute left-4 top-2 text-slate-400">🔎</span>
                      {qFecha ? (
                        <button
                          type="button"
                          onClick={() => setQFecha("")}
                          className="absolute right-4 top-2 text-slate-400 hover:text-slate-600"
                          title="Limpiar"
                        >
                          ✕
                        </button>
                      ) : null}
                    </div>

                    <div className="relative">
                      <input
                        value={qText}
                        onChange={(e) => setQText(e.target.value)}
                        placeholder="Filtro rápido (USD, CLP, Banco Central)..."
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

                  <div className="mt-2 text-[12px] text-slate-500">Tip: deja la fecha vacía para ver todo el historial.</div>
                </div>
              </div>
            </div>
          </div>

          {/* =========================
              HISTORIAL (TABLA PRO)
              ========================= */}
          <div className="mt-4 overflow-hidden rounded-[26px] bg-white ring-1 ring-slate-200">
            <div className="overflow-x-auto">
              <div className="min-w-[920px]">
                {/* header */}
                <div
                  className={cls(
                    "grid items-center border-b border-slate-200 bg-slate-50 px-5 py-2.5",
                    gridCols
                  )}
                >
                  <div className={cls(cellBase, "text-[11px] font-extrabold uppercase text-slate-600")}>Fecha</div>

                  <div className={cls(cellBase, "pl-4 border-l border-slate-200 text-[11px] font-extrabold uppercase text-slate-600")}>
                    Par
                  </div>

                  <div className={cls(cellBase, "pl-4 border-l border-slate-200 text-[11px] font-extrabold uppercase text-slate-600")}>
                    Destino
                  </div>

                  <div className={cls(cellBase, "pl-4 border-l border-slate-200 text-[11px] font-extrabold uppercase text-slate-600 text-right")}>
                    Valor
                  </div>

                  <div className={cls(cellBase, "pl-4 border-l border-slate-200 text-[11px] font-extrabold uppercase text-slate-600")}>
                    Fuente
                  </div>

                  <div className={cls(cellBase, "pl-4 border-l border-slate-200 text-[11px] font-extrabold uppercase text-slate-600")}>
                    Estado
                  </div>

                  <div className={cls(cellBase, "pl-4 border-l border-slate-200 text-[11px] font-extrabold uppercase text-slate-600 text-right")}>
                    Acciones
                  </div>
                </div>

                {/* body */}
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
                        onClick={() => loadFxRates(companyId)}
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
                      className={cls(
                        "grid items-center px-5 py-2 border-b border-slate-100 hover:bg-slate-50",
                        gridCols
                      )}
                    >
                      <div className={cls(cellBase, "text-[13px] font-extrabold text-slate-900 whitespace-nowrap")}>{r.fecha}</div>

                      <div className={cls(cellBase, "pl-4 border-l border-slate-200")}>
                        <div className="text-[13px] font-extrabold text-slate-800 truncate">
                          {r.monedaOrigen} - {r.monedaDestino}
                        </div>
                      </div>

                      <div className={cls(cellBase, "pl-4 border-l border-slate-200")}>
                        <div className="text-[13px] font-semibold text-slate-800 truncate">{r.monedaDestino}</div>
                      </div>

                      <div className={cls(cellBase, "pl-4 border-l border-slate-200 text-right")}>
                        <div className="text-[13px] font-black text-slate-900 tabular-nums whitespace-nowrap">
                          {formatNumber(r.valor, decimales)}
                        </div>
                      </div>

                      <div className={cls(cellBase, "pl-4 border-l border-slate-200")}>
                        <div className="text-[13px] font-semibold text-slate-800 truncate">{r.fuente}</div>
                      </div>

                      <div className={cls(cellBase, "pl-4 border-l border-slate-200")}>
                        <button
                          type="button"
                          onClick={() => toggleEstado(r.id)}
                          className={cls(
                            "rounded-full px-3 py-1 text-[11px] font-black transition whitespace-nowrap",
                            r.estado === "Activo" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700"
                          )}
                          title="Click para alternar"
                        >
                          {r.estado}
                        </button>
                      </div>

                      <div className={cls(cellBase, "pl-4 border-l border-slate-200")}>
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openEdit(r)}
                            className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-[12px] font-extrabold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                          >
                            Editar
                          </button>

                          <button
                            type="button"
                            onClick={() => removeRow(r.id)}
                            className="rounded-2xl border border-rose-200 bg-white px-3 py-2 text-[12px] font-extrabold text-rose-600 hover:bg-rose-50 whitespace-nowrap"
                          >
                            Eliminar
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="px-5 py-14 text-center text-[13px] text-slate-600">No hay resultados.</div>
                )}

                <div className="border-t border-slate-200 bg-slate-50 px-5 py-3 text-[12px] text-slate-600">
                  Nota: en una versión con cierres contables, los registros “Bloqueados” no deberían editarse si el período está cerrado.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 text-center text-[12px] text-slate-500">ConciliaciónPro • Configuración contable</div>

      {/* Modal */}
      <Modal
        open={open}
        title={editingId ? "Editar tipo de cambio" : "Agregar tipo de cambio"}
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <div className="text-xs font-black text-slate-600">Fecha</div>
            <input
              type="date"
              value={mFechaISO}
              onChange={(e) => setMFechaISO(e.target.value)}
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
            />
          </div>

          <div>
            <div className="text-xs font-black text-slate-600">Valor</div>
            <input
              value={mValor}
              onChange={(e) => setMValor(e.target.value)}
              placeholder="Ej: 915.25"
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
            />
            <div className="mt-1 text-xs text-slate-500">Se mostrará con {decimales} decimales.</div>
          </div>

          <div>
            <div className="text-xs font-black text-slate-600">Moneda origen</div>
            <select
              value={mOrigen}
              onChange={(e) => setMOrigen(e.target.value)}
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
            >
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="MXN">MXN</option>
              <option value="VES">VES</option>
              <option value="CLP">CLP</option>
            </select>
          </div>

          <div>
            <div className="text-xs font-black text-slate-600">Moneda destino</div>
            <select
              value={mDestino}
              onChange={(e) => setMDestino(e.target.value)}
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
            >
              <option value="CLP">CLP</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="MXN">MXN</option>
              <option value="VES">VES</option>
            </select>
          </div>
        </div>

        <div className="mt-4 rounded-2xl bg-slate-50 p-3 text-sm text-slate-700">
          Fuente aplicada según modo: <b>{modoFuente === "oficial" ? "Banco Central" : "Manual"}</b>.
        </div>
      </Modal>
    </div>
  );
}

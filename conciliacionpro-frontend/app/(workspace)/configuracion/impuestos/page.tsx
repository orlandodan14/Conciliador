"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

/**
 * =========================
 * Helpers UI (mismo estilo)
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

function safeDDMMYYYYToISO(ddmmyyyy: string) {
  const parts = ddmmyyyy.trim().split("/");
  if (parts.length !== 3) return null;
  const [d, m, y] = parts;
  if (!d || !m || !y) return null;
  if (d.length !== 2 || m.length !== 2 || y.length !== 4) return null;
  return `${y}-${m}-${d}`;
}

async function getAuthUserId(): Promise<string | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data?.user?.id ?? null;
}

async function getMyRoleForCompany(companyId: string): Promise<"OWNER" | "EDITOR" | "LECTOR" | null> {
  // Asume tabla: company_members(company_id, user_id, role)
  const uid = await getAuthUserId();
  if (!uid) return null;

  const { data, error } = await supabase
    .from("company_members")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", uid)
    .maybeSingle();

  if (error) return null;
  const r = (data?.role ?? null) as any;
  if (r === "OWNER" || r === "EDITOR" || r === "LECTOR") return r;
  return null;
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
      <div className="mx-auto flex h-full max-w-3xl items-center justify-center">
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

          <div className={cls("px-5 py-4 overflow-y-auto", footer ? "max-h-[calc(100vh-2rem-160px)] sm:max-h-[calc(100vh-3rem-160px)]" : "max-h-[calc(100vh-2rem-88px)] sm:max-h-[calc(100vh-3rem-88px)]")}>
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
type TaxType = "IVA" | "RETENCION" | "RECARGO" | "ESPECIAL";
type TaxScope = "VENTA" | "COMPRA" | "AMBOS";

type TaxRow = {
  id: string;
  code: string;
  name: string;
  tax_type: TaxType;
  scope: TaxScope;
  included_in_price_default: boolean;
  is_active: boolean;
  notes?: string;
};

type TaxDB = {
  id: string;
  company_id: string;
  code: string;
  name: string;
  tax_type: TaxType;
  scope: TaxScope;
  included_in_price_default: boolean;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  created_by: string | null;
};

type TaxSettingsDB = {
  id: string;
  company_id: string;
  country_code: string | null;
  prices_include_tax: boolean;
  rounding_mode: "LINEA" | "TOTAL";
  decimals: number;
  show_exempt_as_zero: boolean;
};

type RateDB = {
  id: string;
  company_id: string;
  tax_id: string;
  rate: number; // numeric -> JS number
  valid_from: string; // yyyy-mm-dd
  valid_to: string | null; // yyyy-mm-dd
  jurisdiction_code: string | null;
  label: string | null;
  is_active: boolean;
};

function scopeLabel(s: TaxScope) {
  return s === "AMBOS" ? "Ventas y Compras" : s === "VENTA" ? "Ventas" : "Compras";
}

function typeLabel(t: TaxType) {
  if (t === "IVA") return "IVA / VAT / GST";
  if (t === "RETENCION") return "Retención";
  if (t === "RECARGO") return "Recargo / Percepción";
  return "Especial";
}

function fmtRate(r: number) {
  // 19 -> "19.00%"
  const n = Number(r);
  if (Number.isNaN(n)) return `${r}%`;
  return `${n.toFixed(2)}%`;
}

/**
 * =========================
 * Página
 * =========================
 */
export default function ImpuestosPage() {
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

  // Permisos
  const [role, setRole] = useState<"OWNER" | "EDITOR" | "LECTOR" | null>(null);
  const canEdit = role === "OWNER" || role === "EDITOR";

  useEffect(() => {
    if (!companyId) return;
    getMyRoleForCompany(companyId).then(setRole);
  }, [companyId]);

  // Contexto (país/moneda) — solo lectura (si no existe, mostramos fallback)
  const [countryCode, setCountryCode] = useState<string | null>(null);
  const [baseCurrency, setBaseCurrency] = useState<string | null>(null);

  async function loadCurrencyContext(cid: string) {
    // Intento "safe": si tu tabla difiere, simplemente quedará null (sin romper la página).
    try {
      const { data } = await supabase
        .from("companies")
        .select("country_code, base_currency_code")
        .eq("id", cid)
        .maybeSingle();

      setCountryCode((data as any)?.country_code ?? null);
      setBaseCurrency((data as any)?.base_currency_code ?? null);
    } catch {
      setCountryCode(null);
      setBaseCurrency(null);
    }
  }

  // Tax settings
  const [settings, setSettings] = useState<TaxSettingsDB | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  async function loadSettings(cid: string) {
    const { data, error } = await supabase
      .from("tax_settings")
      .select("id, company_id, country_code, prices_include_tax, rounding_mode, decimals, show_exempt_as_zero")
      .eq("company_id", cid)
      .maybeSingle();

    if (error) {
      setSettings(null);
      return;
    }
    setSettings((data as any) ?? null);
  }

  async function ensureSettings(cid: string) {
    // crea fila si no existe (RLS requiere editor)
    const { data: existing } = await supabase
      .from("tax_settings")
      .select("id")
      .eq("company_id", cid)
      .maybeSingle();

    if (existing?.id) return;

    const uid = await getAuthUserId();

    await supabase.from("tax_settings").insert({
      company_id: cid,
      country_code: countryCode ?? null,
      prices_include_tax: false,
      rounding_mode: "LINEA",
      decimals: 2,
      show_exempt_as_zero: true,
      created_by: uid,
      updated_by: uid,
    });
  }

  async function saveSettings(next: Partial<TaxSettingsDB>) {
    if (!companyId) return;
    if (!canEdit) {
      alert("No tienes permisos para editar configuración de impuestos.");
      return;
    }

    setSavingSettings(true);
    try {
      await ensureSettings(companyId);

      const uid = await getAuthUserId();

      const { data, error } = await supabase
        .from("tax_settings")
        .update({ ...next, updated_by: uid })
        .eq("company_id", companyId)
        .select("id, company_id, country_code, prices_include_tax, rounding_mode, decimals, show_exempt_as_zero")
        .single();

      if (error) throw error;

      setSettings(data as any);
    } catch (e: any) {
      alert(`Error guardando configuración: ${e?.message ?? "Error"}`);
    } finally {
      setSavingSettings(false);
    }
  }

  // Taxes list
  const [rows, setRows] = useState<TaxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [qText, setQText] = useState("");
  const [qActive, setQActive] = useState<"" | "Activos" | "Inactivos">("");
  const [qType, setQType] = useState<"" | TaxType>("");

  async function loadTaxes(cid: string) {
    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from("taxes")
      .select("id, company_id, code, name, tax_type, scope, included_in_price_default, is_active, notes, created_at, created_by")
      .eq("company_id", cid)
      .order("is_active", { ascending: false })
      .order("code", { ascending: true });

    if (error) {
      setError(error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    setRows(
      (data as any[]).map((t) => ({
        id: t.id,
        code: t.code,
        name: t.name,
        tax_type: t.tax_type,
        scope: t.scope,
        included_in_price_default: Boolean(t.included_in_price_default),
        is_active: Boolean(t.is_active),
        notes: t.notes ?? undefined,
      }))
    );
    setLoading(false);
  }

  useEffect(() => {
    if (!companyId) {
      setLoading(false);
      return;
    }
    loadCurrencyContext(companyId);
    loadSettings(companyId);
    loadTaxes(companyId);
  }, [companyId]);

  const filtered = useMemo(() => {
    const t = qText.trim().toLowerCase();
    return rows
      .filter((r) => {
        if (!qActive) return true;
        return qActive === "Activos" ? r.is_active : !r.is_active;
      })
      .filter((r) => (qType ? r.tax_type === qType : true))
      .filter((r) => {
        if (!t) return true;
        const hay = `${r.code} ${r.name} ${r.tax_type} ${r.scope}`.toLowerCase();
        return hay.includes(t);
      });
  }, [rows, qText, qActive, qType]);

  /**
   * =========================
   * Modal impuesto (crear/editar)
   * =========================
   */
  const [openTax, setOpenTax] = useState(false);
  const [editingTaxId, setEditingTaxId] = useState<string | null>(null);

  const [mCode, setMCode] = useState("");
  const [mName, setMName] = useState("");
  const [mType, setMType] = useState<TaxType>("IVA");
  const [mScope, setMScope] = useState<TaxScope>("AMBOS");
  const [mIncluded, setMIncluded] = useState(false);
  const [mActive, setMActive] = useState(true);
  const [mNotes, setMNotes] = useState("");

  function openAddTax() {
    setEditingTaxId(null);
    setMCode("");
    setMName("");
    setMType("IVA");
    setMScope("AMBOS");
    setMIncluded(false);
    setMActive(true);
    setMNotes("");
    setOpenTax(true);
  }

  function openEditTax(t: TaxRow) {
    setEditingTaxId(t.id);
    setMCode(t.code);
    setMName(t.name);
    setMType(t.tax_type);
    setMScope(t.scope);
    setMIncluded(Boolean(t.included_in_price_default));
    setMActive(Boolean(t.is_active));
    setMNotes(t.notes ?? "");
    setOpenTax(true);
  }

  async function saveTaxModal() {
    if (!companyId) {
      alert("No hay company_id activo.");
      return;
    }
    if (!canEdit) {
      alert("No tienes permisos para crear/editar impuestos.");
      return;
    }

    if (!mCode.trim() || !mName.trim()) {
      alert("Completa Código y Nombre.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const uid = await getAuthUserId();

      if (editingTaxId) {
        const { data, error } = await supabase
          .from("taxes")
          .update({
            code: mCode.trim(),
            name: mName.trim(),
            tax_type: mType,
            scope: mScope,
            included_in_price_default: mIncluded,
            is_active: mActive,
            notes: mNotes.trim() ? mNotes.trim() : null,
            updated_by: uid,
          })
          .eq("id", editingTaxId)
          .eq("company_id", companyId)
          .select("id, company_id, code, name, tax_type, scope, included_in_price_default, is_active, notes, created_at, created_by")
          .single();

        if (error) throw error;

        const updated: TaxRow = {
          id: (data as any).id,
          code: (data as any).code,
          name: (data as any).name,
          tax_type: (data as any).tax_type,
          scope: (data as any).scope,
          included_in_price_default: Boolean((data as any).included_in_price_default),
          is_active: Boolean((data as any).is_active),
          notes: (data as any).notes ?? undefined,
        };

        setRows((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      } else {
        const { data, error } = await supabase
          .from("taxes")
          .insert({
            company_id: companyId,
            code: mCode.trim(),
            name: mName.trim(),
            tax_type: mType,
            scope: mScope,
            included_in_price_default: mIncluded,
            is_active: mActive,
            notes: mNotes.trim() ? mNotes.trim() : null,
            created_by: uid,
            updated_by: uid,
          })
          .select("id, company_id, code, name, tax_type, scope, included_in_price_default, is_active, notes, created_at, created_by")
          .single();

        if (error) throw error;

        const created: TaxRow = {
          id: (data as any).id,
          code: (data as any).code,
          name: (data as any).name,
          tax_type: (data as any).tax_type,
          scope: (data as any).scope,
          included_in_price_default: Boolean((data as any).included_in_price_default),
          is_active: Boolean((data as any).is_active),
          notes: (data as any).notes ?? undefined,
        };

        setRows((prev) => [created, ...prev]);
      }

      setOpenTax(false);
    } catch (e: any) {
      const msg = e?.message ?? "Error guardando impuesto.";
      setError(msg);
      alert(`Error: ${msg}`);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActiveTax(t: TaxRow) {
    if (!companyId) return;
    if (!canEdit) {
      alert("No tienes permisos para activar/desactivar impuestos.");
      return;
    }

    const next = !t.is_active;
    const before = rows;
    setRows((prev) => prev.map((x) => (x.id === t.id ? { ...x, is_active: next } : x)));

    try {
      const uid = await getAuthUserId();
      const { error } = await supabase
        .from("taxes")
        .update({ is_active: next, updated_by: uid })
        .eq("id", t.id)
        .eq("company_id", companyId);

      if (error) throw error;
    } catch (e: any) {
      setRows(before);
      alert(`Error: ${e?.message ?? "No se pudo actualizar."}`);
    }
  }

  /**
   * =========================
   * Modal tasas (por impuesto)
   * =========================
   */
  const [openRates, setOpenRates] = useState(false);
  const [ratesTax, setRatesTax] = useState<TaxRow | null>(null);
  const [rates, setRates] = useState<RateDB[]>([]);
  const [ratesLoading, setRatesLoading] = useState(false);

  const [rateEditingId, setRateEditingId] = useState<string | null>(null);
  const [rRate, setRRate] = useState<string>("19");
  const [rFrom, setRFrom] = useState<string>(todayISO());
  const [rTo, setRTo] = useState<string>("");
  const [rJur, setRJur] = useState<string>("");
  const [rLabel, setRLabel] = useState<string>("General");
  const [rActive, setRActive] = useState<boolean>(true);

  function resetRateForm() {
    setRateEditingId(null);
    setRRate("19");
    setRFrom(todayISO());
    setRTo("");
    setRJur("");
    setRLabel("General");
    setRActive(true);
  }

  async function loadRates(taxId: string) {
    if (!companyId) return;

    setRatesLoading(true);
    const { data, error } = await supabase
      .from("tax_rates")
      .select("id, company_id, tax_id, rate, valid_from, valid_to, jurisdiction_code, label, is_active")
      .eq("company_id", companyId)
      .eq("tax_id", taxId)
      .order("valid_from", { ascending: false });

    setRatesLoading(false);
    if (error) {
      alert(`Error cargando tasas: ${error.message}`);
      setRates([]);
      return;
    }
    setRates((data as any[]) ?? []);
  }

  async function openRatesModal(t: TaxRow) {
    setRatesTax(t);
    setOpenRates(true);
    resetRateForm();
    await loadRates(t.id);
  }

  function editRate(r: RateDB) {
    setRateEditingId(r.id);
    setRRate(String(r.rate));
    setRFrom(r.valid_from);
    setRTo(r.valid_to ?? "");
    setRJur(r.jurisdiction_code ?? "");
    setRLabel(r.label ?? "");
    setRActive(Boolean(r.is_active));
  }

  async function saveRate() {
    if (!companyId || !ratesTax) return;
    if (!canEdit) {
      alert("No tienes permisos para crear/editar tasas.");
      return;
    }

    const num = Number(String(rRate).replace(",", "."));
    if (Number.isNaN(num) || num < 0 || num > 100) {
      alert("Tasa inválida (0 a 100).");
      return;
    }
    if (!rFrom) {
      alert("Completa 'Desde'.");
      return;
    }
    if (rTo && rFrom > rTo) {
      alert("'Hasta' no puede ser menor que 'Desde'.");
      return;
    }

    try {
      const uid = await getAuthUserId();
      const payload = {
        company_id: companyId,
        tax_id: ratesTax.id,
        rate: num,
        valid_from: rFrom,
        valid_to: rTo ? rTo : null,
        jurisdiction_code: rJur.trim() ? rJur.trim() : null,
        label: rLabel.trim() ? rLabel.trim() : null,
        is_active: rActive,
        updated_by: uid,
      };

      if (rateEditingId) {
        const { error } = await supabase
          .from("tax_rates")
          .update(payload)
          .eq("id", rateEditingId)
          .eq("company_id", companyId);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("tax_rates")
          .insert({ ...payload, created_by: uid });

        if (error) throw error;
      }

      resetRateForm();
      await loadRates(ratesTax.id);
    } catch (e: any) {
      const msg = e?.message ?? "Error guardando tasa.";
      // mensaje amigable si es solape (exclude)
      if (String(msg).toLowerCase().includes("overlap") || String(msg).toLowerCase().includes("exclude")) {
        alert("No se pudo guardar porque esta tasa se cruza con otra vigente para la misma jurisdicción.");
      } else {
        alert(`Error: ${msg}`);
      }
    }
  }

  async function removeRate(id: string) {
    if (!companyId || !ratesTax) return;
    if (!canEdit) {
      alert("No tienes permisos para eliminar tasas.");
      return;
    }

    const ok = confirm("¿Eliminar esta tasa?");
    if (!ok) return;

    const { error } = await supabase.from("tax_rates").delete().eq("id", id).eq("company_id", companyId);
    if (error) {
      alert(`Error: ${error.message}`);
      return;
    }
    await loadRates(ratesTax.id);
  }

  function onDownload() {
    alert("Descargar impuestos (pendiente).");
  }

  /**
   * =========================
   * Layout tabla pro (grid)
   * =========================
   */
  const gridCols = "grid-cols-[120px_2fr_190px_160px_110px_110px_200px]";
  // COD | NOMBRE | TIPO | APLICA A | INCLUIDO | ESTADO | ACCIONES
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
              <h1 className="mt-1 text-3xl font-black leading-tight">Impuestos</h1>
              <div className="mt-2 text-[13px] text-white/85">
                Configura IVA/VAT, retenciones y tasas vigentes por fecha.
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={openAddTax}
                disabled={!canEdit}
                className={cls(
                  "rounded-2xl px-4 py-2 text-[12px] font-extrabold ring-1 transition",
                  canEdit ? "bg-white/10 ring-white/15 hover:bg-white/15" : "bg-white/5 ring-white/10 opacity-60 cursor-not-allowed"
                )}
                type="button"
                title={!canEdit ? "Solo OWNER/EDITOR" : "Crear impuesto"}
              >
                + Crear impuesto
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
          {/* Contexto + Parámetros */}
          <div className="rounded-[26px] bg-white p-5 ring-1 ring-slate-200">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[12px] font-extrabold uppercase text-slate-600">Contexto y parámetros</div>
                <div className="mt-1 text-[13px] text-slate-600">
                  <div>
                    País: <b>{countryCode ?? "—"}</b> • Moneda base: <b>{baseCurrency ?? "—"}</b>{" "}
                    <span className="text-slate-400">(se configura en Monedas)</span>
                  </div>
                  <div className="mt-1">
                    Aquí defines cómo se comportan los impuestos (incluido en precio, redondeo, decimales) y el catálogo de impuestos + tasas por vigencia.
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href="/configuracion/monedas"
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-[12px] font-extrabold text-slate-700 hover:bg-slate-50"
                >
                  Ir a Monedas
                </Link>

                <button
                  onClick={() => companyId && (loadCurrencyContext(companyId), loadSettings(companyId), loadTaxes(companyId))}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-[12px] font-extrabold text-slate-700 hover:bg-slate-50"
                  type="button"
                >
                  Refrescar
                </button>
              </div>
            </div>

            {/* Parámetros (settings) */}
            <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-12">
              <div className="lg:col-span-3">
                <div className="text-[11px] font-extrabold uppercase text-slate-600">Precios incluyen impuestos</div>
                <select
                  value={String(settings?.prices_include_tax ?? false)}
                  onChange={(e) => saveSettings({ prices_include_tax: e.target.value === "true" })}
                  disabled={!canEdit || savingSettings}
                  className={cls(
                    "mt-1 w-full rounded-2xl border bg-white px-4 py-2 text-[12px] font-extrabold text-slate-900 outline-none focus:ring-2 focus:ring-slate-200",
                    !canEdit ? "border-slate-200 opacity-60 cursor-not-allowed" : "border-slate-200"
                  )}
                >
                  <option value="false">No (neto + impuesto)</option>
                  <option value="true">Sí (precio con impuesto)</option>
                </select>
                <div className="mt-1 text-[12px] text-slate-500">Muy usado en VAT “incluido”.</div>
              </div>

              <div className="lg:col-span-3">
                <div className="text-[11px] font-extrabold uppercase text-slate-600">Redondeo</div>
                <select
                  value={settings?.rounding_mode ?? "LINEA"}
                  onChange={(e) => saveSettings({ rounding_mode: e.target.value as any })}
                  disabled={!canEdit || savingSettings}
                  className={cls(
                    "mt-1 w-full rounded-2xl border bg-white px-4 py-2 text-[12px] font-extrabold text-slate-900 outline-none focus:ring-2 focus:ring-slate-200",
                    !canEdit ? "border-slate-200 opacity-60 cursor-not-allowed" : "border-slate-200"
                  )}
                >
                  <option value="LINEA">Por línea (recomendado)</option>
                  <option value="TOTAL">Por total del documento</option>
                </select>
                <div className="mt-1 text-[12px] text-slate-500">Evita diferencias por ítems.</div>
              </div>

              <div className="lg:col-span-3">
                <div className="text-[11px] font-extrabold uppercase text-slate-600">Decimales</div>
                <input
                  type="number"
                  min={0}
                  max={6}
                  value={settings?.decimals ?? 2}
                  onChange={(e) => saveSettings({ decimals: Number(e.target.value) })}
                  disabled={!canEdit || savingSettings}
                  className={cls(
                    "mt-1 w-full rounded-2xl border bg-white px-4 py-2 text-[12px] font-extrabold text-slate-900 outline-none focus:ring-2 focus:ring-slate-200",
                    !canEdit ? "border-slate-200 opacity-60 cursor-not-allowed" : "border-slate-200"
                  )}
                />
                <div className="mt-1 text-[12px] text-slate-500">2 es lo típico.</div>
              </div>

              <div className="lg:col-span-3">
                <div className="text-[11px] font-extrabold uppercase text-slate-600">Exento</div>
                <select
                  value={String(settings?.show_exempt_as_zero ?? true)}
                  onChange={(e) => saveSettings({ show_exempt_as_zero: e.target.value === "true" })}
                  disabled={!canEdit || savingSettings}
                  className={cls(
                    "mt-1 w-full rounded-2xl border bg-white px-4 py-2 text-[12px] font-extrabold text-slate-900 outline-none focus:ring-2 focus:ring-slate-200",
                    !canEdit ? "border-slate-200 opacity-60 cursor-not-allowed" : "border-slate-200"
                  )}
                >
                  <option value="true">Mostrar como 0%</option>
                  <option value="false">Mostrar como etiqueta</option>
                </select>
                <div className="mt-1 text-[12px] text-slate-500">Preferencia visual.</div>
              </div>
            </div>

            {!settings && canEdit ? (
              <div className="mt-4 rounded-2xl bg-amber-50 p-3 text-[13px] text-amber-800 ring-1 ring-amber-100">
                No existe configuración de impuestos todavía. Se creará automáticamente al guardar un parámetro.
              </div>
            ) : null}
          </div>

          {/* Filtros */}
          <div className="mt-4 rounded-[26px] bg-white p-5 ring-1 ring-slate-200">
            <div className="text-[12px] font-extrabold uppercase text-slate-600">Filtros</div>
            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-12">
              <div className="lg:col-span-5">
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

              <div className="lg:col-span-3">
                <div className="text-[11px] font-extrabold uppercase text-slate-600">Estado</div>
                <select
                  value={qActive}
                  onChange={(e) => setQActive(e.target.value as any)}
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-[12px] font-extrabold text-slate-900 outline-none focus:ring-2 focus:ring-slate-200"
                >
                  <option value="">Todos</option>
                  <option value="Activos">Activos</option>
                  <option value="Inactivos">Inactivos</option>
                </select>
              </div>

              <div className="lg:col-span-4">
                <div className="text-[11px] font-extrabold uppercase text-slate-600">Tipo</div>
                <select
                  value={qType}
                  onChange={(e) => setQType(e.target.value as any)}
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-[12px] font-extrabold text-slate-900 outline-none focus:ring-2 focus:ring-slate-200"
                >
                  <option value="">Todos</option>
                  <option value="IVA">IVA / VAT / GST</option>
                  <option value="RETENCION">Retención</option>
                  <option value="RECARGO">Recargo / Percepción</option>
                  <option value="ESPECIAL">Especial</option>
                </select>
              </div>
            </div>
          </div>

          {/* Tabla */}
          <div className="mt-4 overflow-hidden rounded-[26px] bg-white ring-1 ring-slate-200">
            <div className="overflow-x-auto">
              <div className="min-w-[1050px]">
                {/* header */}
                <div className={cls("grid items-center border-b border-slate-200 bg-slate-50 px-5 py-2.5", gridCols)}>
                  <div className={cls(cellBase, "text-[11px] font-extrabold uppercase text-slate-600")}>Código</div>
                  <div className={cls(cellBase, "pl-4 border-l border-slate-200 text-[11px] font-extrabold uppercase text-slate-600")}>Nombre</div>
                  <div className={cls(cellBase, "pl-4 border-l border-slate-200 text-[11px] font-extrabold uppercase text-slate-600")}>Tipo</div>
                  <div className={cls(cellBase, "pl-4 border-l border-slate-200 text-[11px] font-extrabold uppercase text-slate-600")}>Aplica a</div>
                  <div className={cls(cellBase, "pl-4 border-l border-slate-200 text-[11px] font-extrabold uppercase text-slate-600")}>Incluido</div>
                  <div className={cls(cellBase, "pl-4 border-l border-slate-200 text-[11px] font-extrabold uppercase text-slate-600")}>Estado</div>
                  <div className={cls(cellBase, "pl-4 border-l border-slate-200 text-[11px] font-extrabold uppercase text-slate-600 text-right")}>Acciones</div>
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
                        onClick={() => companyId && loadTaxes(companyId)}
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-[12px] font-extrabold text-slate-700 hover:bg-slate-50"
                      >
                        Reintentar
                      </button>
                    </div>
                  </div>
                ) : filtered.length ? (
                  filtered.map((t) => (
                    <div key={t.id} className={cls("grid items-center px-5 py-2 border-b border-slate-100 hover:bg-slate-50", gridCols)}>
                      <div className={cls(cellBase, "text-[13px] font-black text-slate-900 whitespace-nowrap")}>{t.code}</div>

                      <div className={cls(cellBase, "pl-4 border-l border-slate-200")}>
                        <div className="text-[13px] font-extrabold text-slate-800 line-clamp-2">{t.name}</div>
                        {t.notes ? <div className="text-[12px] text-slate-500 truncate">{t.notes}</div> : null}
                      </div>

                      <div className={cls(cellBase, "pl-4 border-l border-slate-200")}>
                        <div className="text-[13px] font-semibold text-slate-800 truncate">{typeLabel(t.tax_type)}</div>
                      </div>

                      <div className={cls(cellBase, "pl-4 border-l border-slate-200")}>
                        <div className="text-[13px] font-semibold text-slate-800 truncate">{scopeLabel(t.scope)}</div>
                      </div>

                      <div className={cls(cellBase, "pl-4 border-l border-slate-200")}>
                        <span className={cls("inline-flex items-center rounded-full px-3 py-1 text-[11px] font-black whitespace-nowrap", t.included_in_price_default ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-700")}>
                          {t.included_in_price_default ? "Sí" : "No"}
                        </span>
                      </div>

                      <div className={cls(cellBase, "pl-4 border-l border-slate-200")}>
                        <span className={cls("inline-flex items-center rounded-full px-3 py-1 text-[11px] font-black whitespace-nowrap", t.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700")}>
                          {t.is_active ? "Activo" : "Inactivo"}
                        </span>
                      </div>

                      <div className={cls(cellBase, "pl-4 border-l border-slate-200")}>
                        <div className="flex justify-end gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() => openRatesModal(t)}
                            className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-[12px] font-extrabold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                            title="Gestionar tasas y vigencias"
                          >
                            Tasas
                          </button>

                          <button
                            type="button"
                            onClick={() => openEditTax(t)}
                            disabled={!canEdit}
                            className={cls(
                              "rounded-2xl border px-3 py-2 text-[12px] font-extrabold whitespace-nowrap",
                              canEdit ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-50" : "border-slate-200 bg-white text-slate-400 opacity-60 cursor-not-allowed"
                            )}
                            title={!canEdit ? "Solo OWNER/EDITOR" : "Editar"}
                          >
                            Editar
                          </button>

                          <button
                            type="button"
                            onClick={() => toggleActiveTax(t)}
                            disabled={!canEdit}
                            className={cls(
                              "rounded-2xl border px-3 py-2 text-[12px] font-extrabold whitespace-nowrap",
                              canEdit
                                ? t.is_active
                                  ? "border-amber-200 bg-white text-amber-700 hover:bg-amber-50"
                                  : "border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50"
                                : "border-slate-200 bg-white text-slate-400 opacity-60 cursor-not-allowed"
                            )}
                            title={!canEdit ? "Solo OWNER/EDITOR" : t.is_active ? "Desactivar" : "Activar"}
                          >
                            {t.is_active ? "Desactivar" : "Activar"}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="px-5 py-14 text-center text-[13px] text-slate-600">No hay impuestos todavía.</div>
                )}

                <div className="border-t border-slate-200 bg-slate-50 px-5 py-3 text-[12px] text-slate-600">
                  Nota: Lo más común es tener <b>IVA</b> (general), y en algunos países <b>retenciones</b>. Las tasas se controlan por vigencia para auditoría.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 text-center text-[12px] text-slate-500">ConciliaciónPro • Configuración contable</div>

      {/* Modal: Impuesto */}
      <Modal
        open={openTax}
        title={editingTaxId ? "Editar impuesto" : "Crear impuesto"}
        onClose={() => setOpenTax(false)}
        footer={
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => setOpenTax(false)}
              className="rounded-full px-5 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
              type="button"
              disabled={saving}
            >
              Cancelar
            </button>

            <button
              onClick={saveTaxModal}
              className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
              type="button"
              disabled={saving || !canEdit}
              title={!canEdit ? "Solo OWNER/EDITOR" : "Guardar"}
            >
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        }
      >
        <div className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-700">
          Tip: define el impuesto aquí y luego crea sus <b>Tasas</b> con vigencias (ej: 19% desde 2020-01-01).
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <div className="text-xs font-black text-slate-600">Código</div>
            <input
              value={mCode}
              onChange={(e) => setMCode(e.target.value)}
              placeholder="Ej: IVA, VAT, RET_IVA"
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
            />
            <div className="mt-1 text-xs text-slate-500">Único por empresa.</div>
          </div>

          <div>
            <div className="text-xs font-black text-slate-600">Tipo</div>
            <select
              value={mType}
              onChange={(e) => setMType(e.target.value as TaxType)}
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
            >
              <option value="IVA">IVA / VAT / GST</option>
              <option value="RETENCION">Retención</option>
              <option value="RECARGO">Recargo / Percepción</option>
              <option value="ESPECIAL">Especial</option>
            </select>
          </div>

          <div className="sm:col-span-2">
            <div className="text-xs font-black text-slate-600">Nombre</div>
            <input
              value={mName}
              onChange={(e) => setMName(e.target.value)}
              placeholder="Ej: IVA, VAT, Retención ISR..."
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
            />
          </div>

          <div>
            <div className="text-xs font-black text-slate-600">Aplica a</div>
            <select
              value={mScope}
              onChange={(e) => setMScope(e.target.value as TaxScope)}
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
            >
              <option value="VENTA">Ventas</option>
              <option value="COMPRA">Compras</option>
              <option value="AMBOS">Ventas y Compras</option>
            </select>
          </div>

          <div>
            <div className="text-xs font-black text-slate-600">Incluido en precio (default)</div>
            <select
              value={String(mIncluded)}
              onChange={(e) => setMIncluded(e.target.value === "true")}
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
            >
              <option value="false">No</option>
              <option value="true">Sí</option>
            </select>
          </div>

          <div>
            <div className="text-xs font-black text-slate-600">Estado</div>
            <select
              value={String(mActive)}
              onChange={(e) => setMActive(e.target.value === "true")}
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
            >
              <option value="true">Activo</option>
              <option value="false">Inactivo</option>
            </select>
          </div>

          <div className="sm:col-span-2">
            <div className="text-xs font-black text-slate-600">Notas (opcional)</div>
            <input
              value={mNotes}
              onChange={(e) => setMNotes(e.target.value)}
              placeholder="Ej: Aplicar solo a ciertos documentos..."
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
            />
          </div>
        </div>

        <div className="mt-4 rounded-2xl bg-slate-50 p-3 text-sm text-slate-700">
          <b>Resumen:</b> {mCode || "—"} • {mName || "—"} • {typeLabel(mType)} • {scopeLabel(mScope)} • Incluido:{" "}
          {mIncluded ? "Sí" : "No"} • {mActive ? "Activo" : "Inactivo"}
        </div>
      </Modal>

      {/* Modal: Tasas */}
      <Modal
        open={openRates}
        title={ratesTax ? `Tasas • ${ratesTax.code} (${ratesTax.name})` : "Tasas"}
        onClose={() => setOpenRates(false)}
        footer={
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => setOpenRates(false)}
              className="rounded-full px-5 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
              type="button"
            >
              Cerrar
            </button>
          </div>
        }
      >
        <div className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-700">
          Recomendación: maneja cambios de tasa con vigencias. El sistema bloquea tasas que se crucen en fechas para la misma jurisdicción.
        </div>

        {/* Form tasa */}
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[12px] font-extrabold uppercase text-slate-600">
              {rateEditingId ? "Editar tasa" : "Nueva tasa"}
            </div>
            {!canEdit ? (
              <div className="text-[12px] font-semibold text-slate-500">Solo OWNER/EDITOR puede editar.</div>
            ) : null}
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-12">
            <div className="sm:col-span-2">
              <div className="text-xs font-black text-slate-600">Tasa %</div>
              <input
                value={rRate}
                onChange={(e) => setRRate(e.target.value)}
                className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
                placeholder="19"
                disabled={!canEdit}
              />
            </div>

            <div className="sm:col-span-3">
              <div className="text-xs font-black text-slate-600">Desde</div>
              <input
                type="date"
                value={rFrom}
                onChange={(e) => setRFrom(e.target.value)}
                className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
                disabled={!canEdit}
              />
            </div>

            <div className="sm:col-span-3">
              <div className="text-xs font-black text-slate-600">Hasta (opcional)</div>
              <input
                type="date"
                value={rTo}
                onChange={(e) => setRTo(e.target.value)}
                className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
                disabled={!canEdit}
              />
            </div>

            <div className="sm:col-span-4">
              <div className="text-xs font-black text-slate-600">Jurisdicción (opcional)</div>
              <input
                value={rJur}
                onChange={(e) => setRJur(e.target.value)}
                className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
                placeholder="Ej: CL-RM / MX-JAL"
                disabled={!canEdit}
              />
            </div>

            <div className="sm:col-span-8">
              <div className="text-xs font-black text-slate-600">Etiqueta (opcional)</div>
              <input
                value={rLabel}
                onChange={(e) => setRLabel(e.target.value)}
                className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
                placeholder="General / Reducida / Exento / Cero"
                disabled={!canEdit}
              />
            </div>

            <div className="sm:col-span-4">
              <div className="text-xs font-black text-slate-600">Estado</div>
              <select
                value={String(rActive)}
                onChange={(e) => setRActive(e.target.value === "true")}
                className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
                disabled={!canEdit}
              >
                <option value="true">Activa</option>
                <option value="false">Inactiva</option>
              </select>
            </div>

            <div className="sm:col-span-12 flex justify-end gap-2">
              {rateEditingId ? (
                <button
                  type="button"
                  onClick={resetRateForm}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-[12px] font-extrabold text-slate-700 hover:bg-slate-50"
                  disabled={!canEdit}
                >
                  Cancelar edición
                </button>
              ) : null}

              <button
                type="button"
                onClick={saveRate}
                className={cls(
                  "rounded-2xl px-4 py-2 text-[12px] font-extrabold",
                  canEdit ? "bg-slate-900 text-white hover:bg-slate-800" : "bg-slate-200 text-slate-500 cursor-not-allowed"
                )}
                disabled={!canEdit}
              >
                {rateEditingId ? "Guardar cambios" : "Agregar tasa"}
              </button>
            </div>
          </div>
        </div>

        {/* Tabla tasas */}
        <div className="mt-4 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
          <div className="overflow-x-auto">
            <div className="min-w-[900px]">
              <div className="grid grid-cols-[140px_140px_140px_1fr_140px_180px] items-center border-b border-slate-200 bg-slate-50 px-5 py-2.5">
                <div className="text-[11px] font-extrabold uppercase text-slate-600">Tasa</div>
                <div className="pl-4 border-l border-slate-200 text-[11px] font-extrabold uppercase text-slate-600">Desde</div>
                <div className="pl-4 border-l border-slate-200 text-[11px] font-extrabold uppercase text-slate-600">Hasta</div>
                <div className="pl-4 border-l border-slate-200 text-[11px] font-extrabold uppercase text-slate-600">Etiqueta / Jurisdicción</div>
                <div className="pl-4 border-l border-slate-200 text-[11px] font-extrabold uppercase text-slate-600">Estado</div>
                <div className="pl-4 border-l border-slate-200 text-[11px] font-extrabold uppercase text-slate-600 text-right">Acciones</div>
              </div>

              {ratesLoading ? (
                <div className="px-5 py-10 text-center text-[13px] text-slate-600">Cargando tasas...</div>
              ) : rates.length ? (
                rates.map((r) => (
                  <div key={r.id} className="grid grid-cols-[140px_140px_140px_1fr_140px_180px] items-center px-5 py-2 border-b border-slate-100 hover:bg-slate-50">
                    <div className="text-[13px] font-black text-slate-900 whitespace-nowrap">{fmtRate(Number(r.rate))}</div>

                    <div className="pl-4 border-l border-slate-200 text-[13px] font-semibold text-slate-800 whitespace-nowrap">
                      {isoToDDMMYYYY(r.valid_from)}
                    </div>

                    <div className="pl-4 border-l border-slate-200 text-[13px] font-semibold text-slate-800 whitespace-nowrap">
                      {r.valid_to ? isoToDDMMYYYY(r.valid_to) : "—"}
                    </div>

                    <div className="pl-4 border-l border-slate-200">
                      <div className="text-[13px] font-semibold text-slate-800 truncate">{r.label ?? "—"}</div>
                      <div className="text-[12px] text-slate-500 truncate">Jurisdicción: {r.jurisdiction_code ?? "—"}</div>
                    </div>

                    <div className="pl-4 border-l border-slate-200">
                      <span className={cls("inline-flex items-center rounded-full px-3 py-1 text-[11px] font-black whitespace-nowrap", r.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700")}>
                        {r.is_active ? "Activa" : "Inactiva"}
                      </span>
                    </div>

                    <div className="pl-4 border-l border-slate-200">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => editRate(r)}
                          disabled={!canEdit}
                          className={cls(
                            "rounded-2xl border px-3 py-2 text-[12px] font-extrabold whitespace-nowrap",
                            canEdit ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-50" : "border-slate-200 bg-white text-slate-400 opacity-60 cursor-not-allowed"
                          )}
                        >
                          Editar
                        </button>

                        <button
                          type="button"
                          onClick={() => removeRate(r.id)}
                          disabled={!canEdit}
                          className={cls(
                            "rounded-2xl border px-3 py-2 text-[12px] font-extrabold whitespace-nowrap",
                            canEdit ? "border-rose-200 bg-white text-rose-600 hover:bg-rose-50" : "border-slate-200 bg-white text-slate-400 opacity-60 cursor-not-allowed"
                          )}
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="px-5 py-10 text-center text-[13px] text-slate-600">No hay tasas todavía.</div>
              )}

              <div className="border-t border-slate-200 bg-slate-50 px-5 py-3 text-[12px] text-slate-600">
                Tip: deja “Hasta” vacío para tasa vigente. Si necesitas tasas por región, usa Jurisdicción.
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

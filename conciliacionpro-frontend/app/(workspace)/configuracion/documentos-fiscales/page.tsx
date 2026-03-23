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

async function getAuthUserId(): Promise<string | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data?.user?.id ?? null;
}

async function getMyRoleForCompany(companyId: string): Promise<"OWNER" | "EDITOR" | "LECTOR" | null> {
  const uid = await getAuthUserId();
  if (!uid) return null;

  const { data, error } = await supabase
    .from("company_members")
    .select("role,status")
    .eq("company_id", companyId)
    .eq("user_id", uid)
    .maybeSingle();

  if (error || !data) return null;
  if ((data as any)?.status && (data as any).status !== "active" && (data as any).status !== "ACTIVE") return null;

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

          <div
            className={cls(
              "px-5 py-4 overflow-y-auto overflow-x-hidden",
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
type DocScope = "VENTA" | "COMPRA" | "AMBOS";

type FiscalDocSettingsDB = {
  id: string;
  company_id: string;
  enabled: boolean;
  require_sales: boolean;
  require_purchases: boolean;

  // Legacy: se mantiene para no romper páginas viejas
  default_sales_doc_type_id: string | null;
  default_purchase_doc_type_id: string | null;

  // Nuevos defaults por tipo de documento de ventas
  default_sales_invoice_doc_type_id: string | null;
  default_sales_debit_note_doc_type_id: string | null;
  default_sales_credit_note_doc_type_id: string | null;

  // ✅ NUEVO: controla si se puede cancelar desde módulos
  allow_sales_cancellation: boolean;
  allow_purchase_cancellation: boolean;

  created_at?: string;
};

type FiscalDocTypeRow = {
  id: string;
  code: string; // CL-33 / MX-I / PE-01 etc
  name: string;
  country_code: string | null; // CL/MX/PE/CO...
  scope: DocScope;
  requires_series: boolean;
  requires_number: boolean;
  number_min_len: number;
  number_max_len: number;
  is_electronic: boolean;
  is_active: boolean;
  sort_order: number;
  notes?: string;
};

function scopeLabel(s: DocScope) {
  return s === "AMBOS" ? "Ventas y Compras" : s === "VENTA" ? "Ventas" : "Compras";
}

function hydrateSettingsRow(row: any): FiscalDocSettingsDB {
  const invoiceDefault = row?.default_sales_invoice_doc_type_id ?? row?.default_sales_doc_type_id ?? null;

  return {
    ...(row as any),
    default_sales_doc_type_id: row?.default_sales_doc_type_id ?? invoiceDefault,
    default_purchase_doc_type_id: row?.default_purchase_doc_type_id ?? null,
    default_sales_invoice_doc_type_id: invoiceDefault,
    default_sales_debit_note_doc_type_id: row?.default_sales_debit_note_doc_type_id ?? null,
    default_sales_credit_note_doc_type_id: row?.default_sales_credit_note_doc_type_id ?? null,
    allow_sales_cancellation: Boolean(row?.allow_sales_cancellation ?? true),
    allow_purchase_cancellation: Boolean(row?.allow_purchase_cancellation ?? true),
  } as FiscalDocSettingsDB;
}

/**
 * =========================
 * Página
 * =========================
 */
export default function DocumentosFiscalesPage() {
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

  // Contexto país (solo lectura)
  const [countryCode, setCountryCode] = useState<string | null>(null);

  async function loadCompanyContext(cid: string) {
    try {
      const { data } = await supabase.from("companies").select("country_code").eq("id", cid).maybeSingle();
      setCountryCode((data as any)?.country_code ?? null);
    } catch {
      setCountryCode(null);
    }
  }

  // Settings
  const [settings, setSettings] = useState<FiscalDocSettingsDB | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  async function loadSettings(cid: string) {
    const { data, error } = await supabase
      .from("fiscal_doc_settings")
      .select(
        [
          "id",
          "company_id",
          "enabled",
          "require_sales",
          "require_purchases",
          "default_sales_doc_type_id",
          "default_purchase_doc_type_id",
          "default_sales_invoice_doc_type_id",
          "default_sales_debit_note_doc_type_id",
          "default_sales_credit_note_doc_type_id",
          "allow_sales_cancellation",
          "allow_purchase_cancellation",
          "created_at",
        ].join(",")
      )
      .eq("company_id", cid)
      .maybeSingle();

    if (error) {
      setSettings(null);
      return;
    }

    const s: FiscalDocSettingsDB | null = data ? hydrateSettingsRow(data) : null;

    setSettings(s);
  }

  async function ensureSettings(cid: string) {
    const { data: existing } = await supabase
      .from("fiscal_doc_settings")
      .select("id")
      .eq("company_id", cid)
      .maybeSingle();

    if (existing?.id) return;

    const uid = await getAuthUserId();
    await supabase.from("fiscal_doc_settings").insert({
      company_id: cid,
      enabled: false,
      require_sales: false,
      require_purchases: false,
      default_sales_doc_type_id: null,
      default_purchase_doc_type_id: null,
      default_sales_invoice_doc_type_id: null,
      default_sales_debit_note_doc_type_id: null,
      default_sales_credit_note_doc_type_id: null,

      // ✅ NUEVO: valores por defecto
      allow_sales_cancellation: true,
      allow_purchase_cancellation: true,

      created_by: uid,
      updated_by: uid,
    });
  }

  async function saveSettings(next: Partial<FiscalDocSettingsDB>) {
    if (!companyId) return;
    if (!canEdit) {
      alert("No tienes permisos para editar configuración de documentos fiscales.");
      return;
    }

    setSavingSettings(true);
    try {
      await ensureSettings(companyId);
      const uid = await getAuthUserId();

      const patch: Partial<FiscalDocSettingsDB> = { ...next };

      // Compatibilidad hacia atrás:
      // el default legacy de ventas seguirá reflejando el default de Documento de ingreso.
      if (Object.prototype.hasOwnProperty.call(patch, "default_sales_invoice_doc_type_id")) {
        patch.default_sales_doc_type_id = patch.default_sales_invoice_doc_type_id ?? null;
      }

      const { data, error } = await supabase
        .from("fiscal_doc_settings")
        .update({ ...patch, updated_by: uid })
        .eq("company_id", companyId)
        .select(
          [
            "id",
            "company_id",
            "enabled",
            "require_sales",
            "require_purchases",
            "default_sales_doc_type_id",
            "default_purchase_doc_type_id",
            "default_sales_invoice_doc_type_id",
            "default_sales_debit_note_doc_type_id",
            "default_sales_credit_note_doc_type_id",
            "allow_sales_cancellation",
            "allow_purchase_cancellation",
            "created_at",
          ].join(",")
        )
        .single();

      if (error) throw error;

      setSettings(hydrateSettingsRow(data));
    } catch (e: any) {
      alert(`Error guardando configuración: ${e?.message ?? "Error"}`);
    } finally {
      setSavingSettings(false);
    }
  }

  // Catálogo
  const [rows, setRows] = useState<FiscalDocTypeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [qText, setQText] = useState("");
  const [qActive, setQActive] = useState<"" | "Activos" | "Inactivos">("");
  const [qScope, setQScope] = useState<"" | DocScope>("");
  const [qCountry, setQCountry] = useState<string>("");

  async function loadCatalog(cid: string) {
    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from("fiscal_doc_types")
      .select(
        [
          "id",
          "company_id",
          "code",
          "name",
          "country_code",
          "scope",
          "requires_series",
          "requires_number",
          "number_min_len",
          "number_max_len",
          "is_electronic",
          "is_active",
          "sort_order",
          "notes",
        ].join(",")
      )
      .eq("company_id", cid)
      .order("is_active", { ascending: false })
      .order("sort_order", { ascending: true })
      .order("code", { ascending: true });

    if (error) {
      setError(error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    setRows(
      ((data as any[]) || []).map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        country_code: r.country_code ?? null,
        scope: r.scope,
        requires_series: Boolean(r.requires_series),
        requires_number: Boolean(r.requires_number),
        number_min_len: Number(r.number_min_len ?? 0),
        number_max_len: Number(r.number_max_len ?? 50),
        is_electronic: Boolean(r.is_electronic),
        is_active: Boolean(r.is_active),
        sort_order: Number(r.sort_order ?? 100),
        notes: r.notes ?? undefined,
      }))
    );

    setLoading(false);
  }

  useEffect(() => {
    if (!companyId) {
      setLoading(false);
      return;
    }
    loadCompanyContext(companyId);
    loadSettings(companyId);
    loadCatalog(companyId);
  }, [companyId]);

  const filtered = useMemo(() => {
    const t = qText.trim().toLowerCase();
    return rows
      .filter((r) => {
        if (!qActive) return true;
        return qActive === "Activos" ? r.is_active : !r.is_active;
      })
      .filter((r) => (qScope ? r.scope === qScope : true))
      .filter((r) => (qCountry ? (r.country_code ?? "").toUpperCase() === qCountry.toUpperCase() : true))
      .filter((r) => {
        if (!t) return true;
        const hay = `${r.code} ${r.name} ${r.scope} ${r.country_code ?? ""}`.toLowerCase();
        return hay.includes(t);
      });
  }, [rows, qText, qActive, qScope, qCountry]);

  // -------- Modal Doc Type (crear/editar)
  const [openDoc, setOpenDoc] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [mCode, setMCode] = useState("");
  const [mName, setMName] = useState("");
  const [mCountry, setMCountry] = useState<string>("");
  const [mScope, setMScope] = useState<DocScope>("AMBOS");
  const [mReqSeries, setMReqSeries] = useState(false);
  const [mReqNumber, setMReqNumber] = useState(true);
  const [mMinLen, setMMinLen] = useState<number>(0);
  const [mMaxLen, setMMaxLen] = useState<number>(50);
  const [mElectronic, setMElectronic] = useState(true);
  const [mActive, setMActive] = useState(true);
  const [mSort, setMSort] = useState<number>(100);
  const [mNotes, setMNotes] = useState("");

  function openAdd() {
    setEditingId(null);
    setMCode("");
    setMName("");
    setMCountry(countryCode ?? "");
    setMScope("AMBOS");
    setMReqSeries(false);
    setMReqNumber(true);
    setMMinLen(0);
    setMMaxLen(50);
    setMElectronic(true);
    setMActive(true);
    setMSort(100);
    setMNotes("");
    setOpenDoc(true);
  }

  function openEdit(r: FiscalDocTypeRow) {
    setEditingId(r.id);
    setMCode(r.code);
    setMName(r.name);
    setMCountry(r.country_code ?? "");
    setMScope(r.scope);
    setMReqSeries(Boolean(r.requires_series));
    setMReqNumber(Boolean(r.requires_number));
    setMMinLen(Number(r.number_min_len ?? 0));
    setMMaxLen(Number(r.number_max_len ?? 50));
    setMElectronic(Boolean(r.is_electronic));
    setMActive(Boolean(r.is_active));
    setMSort(Number(r.sort_order ?? 100));
    setMNotes(r.notes ?? "");
    setOpenDoc(true);
  }

  async function saveDocModal() {
    if (!companyId) {
      alert("No hay company_id activo.");
      return;
    }
    if (!canEdit) {
      alert("No tienes permisos para crear/editar documentos fiscales.");
      return;
    }

    if (!mCode.trim() || !mName.trim()) {
      alert("Completa Código y Nombre.");
      return;
    }
    if (mMaxLen < 1 || mMaxLen > 200) {
      alert("Largo máximo inválido (1 a 200).");
      return;
    }
    if (mMinLen < 0 || mMinLen > mMaxLen) {
      alert("Largo mínimo inválido (0 a max).");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const uid = await getAuthUserId();

      const payload = {
        company_id: companyId,
        code: mCode.trim(),
        name: mName.trim(),
        country_code: mCountry.trim() ? mCountry.trim().toUpperCase() : null,
        scope: mScope,
        requires_series: Boolean(mReqSeries),
        requires_number: Boolean(mReqNumber),
        number_min_len: Number(mMinLen),
        number_max_len: Number(mMaxLen),
        is_electronic: Boolean(mElectronic),
        is_active: Boolean(mActive),
        sort_order: Number(mSort),
        notes: mNotes.trim() ? mNotes.trim() : null,
        updated_by: uid,
      };

      if (editingId) {
        const { data, error } = await supabase
          .from("fiscal_doc_types")
          .update(payload)
          .eq("id", editingId)
          .eq("company_id", companyId)
          .select(
            "id,code,name,country_code,scope,requires_series,requires_number,number_min_len,number_max_len,is_electronic,is_active,sort_order,notes"
          )
          .single();

        if (error) throw error;

        const updated: FiscalDocTypeRow = {
          id: (data as any).id,
          code: (data as any).code,
          name: (data as any).name,
          country_code: (data as any).country_code ?? null,
          scope: (data as any).scope,
          requires_series: Boolean((data as any).requires_series),
          requires_number: Boolean((data as any).requires_number),
          number_min_len: Number((data as any).number_min_len ?? 0),
          number_max_len: Number((data as any).number_max_len ?? 50),
          is_electronic: Boolean((data as any).is_electronic),
          is_active: Boolean((data as any).is_active),
          sort_order: Number((data as any).sort_order ?? 100),
          notes: (data as any).notes ?? undefined,
        };

        setRows((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      } else {
        const { data, error } = await supabase
          .from("fiscal_doc_types")
          .insert({ ...payload, created_by: uid })
          .select(
            "id,code,name,country_code,scope,requires_series,requires_number,number_min_len,number_max_len,is_electronic,is_active,sort_order,notes"
          )
          .single();

        if (error) throw error;

        const created: FiscalDocTypeRow = {
          id: (data as any).id,
          code: (data as any).code,
          name: (data as any).name,
          country_code: (data as any).country_code ?? null,
          scope: (data as any).scope,
          requires_series: Boolean((data as any).requires_series),
          requires_number: Boolean((data as any).requires_number),
          number_min_len: Number((data as any).number_min_len ?? 0),
          number_max_len: Number((data as any).number_max_len ?? 50),
          is_electronic: Boolean((data as any).is_electronic),
          is_active: Boolean((data as any).is_active),
          sort_order: Number((data as any).sort_order ?? 100),
          notes: (data as any).notes ?? undefined,
        };

        setRows((prev) => [created, ...prev]);
      }

      setOpenDoc(false);
    } catch (e: any) {
      const msg = e?.message ?? "Error guardando documento fiscal.";
      setError(msg);
      alert(`Error: ${msg}`);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(r: FiscalDocTypeRow) {
    if (!companyId) return;
    if (!canEdit) {
      alert("No tienes permisos para activar/desactivar.");
      return;
    }

    const next = !r.is_active;
    const before = rows;
    setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, is_active: next } : x)));

    try {
      const uid = await getAuthUserId();
      const { error } = await supabase
        .from("fiscal_doc_types")
        .update({ is_active: next, updated_by: uid })
        .eq("id", r.id)
        .eq("company_id", companyId);

      if (error) throw error;

      if (!next && settings) {
        const cleared: Partial<FiscalDocSettingsDB> = {};
        if (settings.default_sales_doc_type_id === r.id) cleared.default_sales_doc_type_id = null;
        if (settings.default_purchase_doc_type_id === r.id) cleared.default_purchase_doc_type_id = null;
        if (settings.default_sales_invoice_doc_type_id === r.id) cleared.default_sales_invoice_doc_type_id = null;
        if (settings.default_sales_debit_note_doc_type_id === r.id) cleared.default_sales_debit_note_doc_type_id = null;
        if (settings.default_sales_credit_note_doc_type_id === r.id) cleared.default_sales_credit_note_doc_type_id = null;
        if (Object.keys(cleared).length) setSettings({ ...settings, ...cleared } as any);
      }
    } catch (e: any) {
      setRows(before);
      alert(`Error: ${e?.message ?? "No se pudo actualizar."}`);
    }
  }

  const salesOptions = useMemo(
    () => rows.filter((r) => r.is_active && (r.scope === "VENTA" || r.scope === "AMBOS")),
    [rows]
  );
  const purchaseOptions = useMemo(
    () => rows.filter((r) => r.is_active && (r.scope === "COMPRA" || r.scope === "AMBOS")),
    [rows]
  );

  const gridCols = "grid-cols-[160px_2fr_120px_140px_120px_160px_220px]";
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
              <h1 className="mt-1 text-3xl font-black leading-tight">Documentos fiscales</h1>
              <div className="mt-2 text-[13px] text-white/85">
                Catálogo de tipos fiscales (CL/MX/otros) y reglas de uso en ventas/compras.
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={openAdd}
                disabled={!canEdit}
                className={cls(
                  "rounded-2xl px-4 py-2 text-[12px] font-extrabold ring-1 transition",
                  canEdit
                    ? "bg-white/10 ring-white/15 hover:bg-white/15"
                    : "bg-white/5 ring-white/10 opacity-60 cursor-not-allowed"
                )}
                type="button"
                title={!canEdit ? "Solo OWNER/EDITOR" : "Crear tipo fiscal"}
              >
                + Crear tipo fiscal
              </button>

              <button
                onClick={() => companyId && (loadSettings(companyId), loadCatalog(companyId), loadCompanyContext(companyId))}
                className="rounded-2xl bg-white/10 px-4 py-2 text-[12px] font-extrabold ring-1 ring-white/15 hover:bg-white/15 transition"
                type="button"
              >
                Refrescar
              </button>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-7 space-y-4">
          {/* Parámetros */}
          <div className="rounded-[26px] bg-white p-5 ring-1 ring-slate-200">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[12px] font-extrabold uppercase text-slate-600">Parámetros</div>
                <div className="mt-1 text-[13px] text-slate-600">
                  País empresa: <b>{countryCode ?? "—"}</b> • Aquí defines exigencia, defaults y cancelación.
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href="/configuracion/impuestos"
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-[12px] font-extrabold text-slate-700 hover:bg-slate-50"
                >
                  Ir a Impuestos
                </Link>
              </div>
            </div>

            {/* ✅ OJO: ampliamos a 12 cols pero sin romper nada */}
            <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-12">
              <div className="lg:col-span-3">
                <div className="text-[11px] font-extrabold uppercase text-slate-600">Habilitado</div>
                <select
                  value={String(settings?.enabled ?? false)}
                  onChange={(e) => saveSettings({ enabled: e.target.value === "true" })}
                  disabled={!canEdit || savingSettings}
                  className={cls(
                    "mt-1 w-full rounded-2xl border bg-white px-4 py-2 text-[12px] font-extrabold text-slate-900 outline-none focus:ring-2 focus:ring-slate-200",
                    !canEdit ? "border-slate-200 opacity-60 cursor-not-allowed" : "border-slate-200"
                  )}
                >
                  <option value="false">No (opcional)</option>
                  <option value="true">Sí (usa catálogo)</option>
                </select>
                <div className="mt-1 text-[12px] text-slate-500">Si está apagado, ventas/compras no obligan.</div>
              </div>

              <div className="lg:col-span-3">
                <div className="text-[11px] font-extrabold uppercase text-slate-600">Exigir en ventas</div>
                <select
                  value={String(settings?.require_sales ?? false)}
                  onChange={(e) => saveSettings({ require_sales: e.target.value === "true" })}
                  disabled={!canEdit || savingSettings || !(settings?.enabled ?? false)}
                  className={cls(
                    "mt-1 w-full rounded-2xl border bg-white px-4 py-2 text-[12px] font-extrabold text-slate-900 outline-none focus:ring-2 focus:ring-slate-200",
                    !canEdit || !(settings?.enabled ?? false) ? "border-slate-200 opacity-60 cursor-not-allowed" : "border-slate-200"
                  )}
                >
                  <option value="false">No</option>
                  <option value="true">Sí</option>
                </select>
                <div className="mt-1 text-[12px] text-slate-500">Obliga seleccionar tipo fiscal en Ventas.</div>
              </div>

              <div className="lg:col-span-3">
                <div className="text-[11px] font-extrabold uppercase text-slate-600">Exigir en compras</div>
                <select
                  value={String(settings?.require_purchases ?? false)}
                  onChange={(e) => saveSettings({ require_purchases: e.target.value === "true" })}
                  disabled={!canEdit || savingSettings || !(settings?.enabled ?? false)}
                  className={cls(
                    "mt-1 w-full rounded-2xl border bg-white px-4 py-2 text-[12px] font-extrabold text-slate-900 outline-none focus:ring-2 focus:ring-slate-200",
                    !canEdit || !(settings?.enabled ?? false) ? "border-slate-200 opacity-60 cursor-not-allowed" : "border-slate-200"
                  )}
                >
                  <option value="false">No</option>
                  <option value="true">Sí</option>
                </select>
                <div className="mt-1 text-[12px] text-slate-500">Obliga seleccionar tipo fiscal en Compras.</div>
              </div>

              <div className="lg:col-span-3">
                <div className="text-[11px] font-extrabold uppercase text-slate-600">Default ventas · Documento ingreso</div>
                <select
                  value={settings?.default_sales_invoice_doc_type_id ?? settings?.default_sales_doc_type_id ?? ""}
                  onChange={(e) => saveSettings({ default_sales_invoice_doc_type_id: e.target.value || null })}
                  disabled={!canEdit || savingSettings || !(settings?.enabled ?? false)}
                  className={cls(
                    "mt-1 w-full rounded-2xl border bg-white px-4 py-2 text-[12px] font-extrabold text-slate-900 outline-none focus:ring-2 focus:ring-slate-200",
                    !canEdit || !(settings?.enabled ?? false) ? "border-slate-200 opacity-60 cursor-not-allowed" : "border-slate-200"
                  )}
                >
                  <option value="">— (sin default)</option>
                  {salesOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.code} • {o.name}
                    </option>
                  ))}
                </select>
                <div className="mt-1 text-[12px] text-slate-500">Se usa para doc_type = INVOICE.</div>
              </div>

              <div className="lg:col-span-3">
                <div className="text-[11px] font-extrabold uppercase text-slate-600">Default ventas · Nota débito</div>
                <select
                  value={settings?.default_sales_debit_note_doc_type_id ?? ""}
                  onChange={(e) => saveSettings({ default_sales_debit_note_doc_type_id: e.target.value || null })}
                  disabled={!canEdit || savingSettings || !(settings?.enabled ?? false)}
                  className={cls(
                    "mt-1 w-full rounded-2xl border bg-white px-4 py-2 text-[12px] font-extrabold text-slate-900 outline-none focus:ring-2 focus:ring-slate-200",
                    !canEdit || !(settings?.enabled ?? false) ? "border-slate-200 opacity-60 cursor-not-allowed" : "border-slate-200"
                  )}
                >
                  <option value="">— (sin default)</option>
                  {salesOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.code} • {o.name}
                    </option>
                  ))}
                </select>
                <div className="mt-1 text-[12px] text-slate-500">Se usa para doc_type = DEBIT_NOTE.</div>
              </div>

              <div className="lg:col-span-3">
                <div className="text-[11px] font-extrabold uppercase text-slate-600">Default ventas · Nota crédito</div>
                <select
                  value={settings?.default_sales_credit_note_doc_type_id ?? ""}
                  onChange={(e) => saveSettings({ default_sales_credit_note_doc_type_id: e.target.value || null })}
                  disabled={!canEdit || savingSettings || !(settings?.enabled ?? false)}
                  className={cls(
                    "mt-1 w-full rounded-2xl border bg-white px-4 py-2 text-[12px] font-extrabold text-slate-900 outline-none focus:ring-2 focus:ring-slate-200",
                    !canEdit || !(settings?.enabled ?? false) ? "border-slate-200 opacity-60 cursor-not-allowed" : "border-slate-200"
                  )}
                >
                  <option value="">— (sin default)</option>
                  {salesOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.code} • {o.name}
                    </option>
                  ))}
                </select>
                <div className="mt-1 text-[12px] text-slate-500">Se usa para doc_type = CREDIT_NOTE.</div>
              </div>

              <div className="lg:col-span-3">
                <div className="text-[11px] font-extrabold uppercase text-slate-600">Default compras</div>
                <select
                  value={settings?.default_purchase_doc_type_id ?? ""}
                  onChange={(e) => saveSettings({ default_purchase_doc_type_id: e.target.value || null })}
                  disabled={!canEdit || savingSettings || !(settings?.enabled ?? false)}
                  className={cls(
                    "mt-1 w-full rounded-2xl border bg-white px-4 py-2 text-[12px] font-extrabold text-slate-900 outline-none focus:ring-2 focus:ring-slate-200",
                    !canEdit || !(settings?.enabled ?? false) ? "border-slate-200 opacity-60 cursor-not-allowed" : "border-slate-200"
                  )}
                >
                  <option value="">— (sin default)</option>
                  {purchaseOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.code} • {o.name}
                    </option>
                  ))}
                </select>
                <div className="mt-1 text-[12px] text-slate-500">Se mantiene como configuración general de compras.</div>
              </div>

              {/* ✅ NUEVO: Cancelación */}
              <div className="lg:col-span-3">
                <div className="text-[11px] font-extrabold uppercase text-slate-600">Ventas cancelables</div>
                <select
                  value={String(settings?.allow_sales_cancellation ?? true)}
                  onChange={(e) => saveSettings({ allow_sales_cancellation: e.target.value === "true" })}
                  disabled={!canEdit || savingSettings}
                  className={cls(
                    "mt-1 w-full rounded-2xl border bg-white px-4 py-2 text-[12px] font-extrabold text-slate-900 outline-none focus:ring-2 focus:ring-slate-200",
                    !canEdit ? "border-slate-200 opacity-60 cursor-not-allowed" : "border-slate-200"
                  )}
                >
                  <option value="true">Sí (mostrar botón Cancelar)</option>
                  <option value="false">No (ocultar Cancelar)</option>
                </select>
                <div className="mt-1 text-[12px] text-slate-500">
                  Controla el botón “Cancelar” en Gestión de Ventas → Documentos tributarios.
                </div>
              </div>

              <div className="lg:col-span-3">
                <div className="text-[11px] font-extrabold uppercase text-slate-600">Compras cancelables</div>
                <select
                  value={String(settings?.allow_purchase_cancellation ?? true)}
                  onChange={(e) => saveSettings({ allow_purchase_cancellation: e.target.value === "true" })}
                  disabled={!canEdit || savingSettings}
                  className={cls(
                    "mt-1 w-full rounded-2xl border bg-white px-4 py-2 text-[12px] font-extrabold text-slate-900 outline-none focus:ring-2 focus:ring-slate-200",
                    !canEdit ? "border-slate-200 opacity-60 cursor-not-allowed" : "border-slate-200"
                  )}
                >
                  <option value="true">Sí</option>
                  <option value="false">No</option>
                </select>
                <div className="mt-1 text-[12px] text-slate-500">
                  (Para tu futura página de Compras tributarias).
                </div>
              </div>
            </div>

            {!settings && canEdit ? (
              <div className="mt-4 rounded-2xl bg-amber-50 p-3 text-[13px] text-amber-800 ring-1 ring-amber-100">
                No existe configuración aún. Se crea automáticamente al guardar un parámetro.
              </div>
            ) : null}
          </div>

          {/* Filtros */}
          <div className="rounded-[26px] bg-white p-5 ring-1 ring-slate-200">
            <div className="text-[12px] font-extrabold uppercase text-slate-600">Filtros</div>
            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-12">
              <div className="lg:col-span-5">
                <div className="text-[11px] font-extrabold uppercase text-slate-600">Búsqueda</div>
                <div className="relative mt-1">
                  <input
                    value={qText}
                    onChange={(e) => setQText(e.target.value)}
                    placeholder="Código, nombre, país..."
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

              <div className="lg:col-span-2">
                <div className="text-[11px] font-extrabold uppercase text-slate-600">Aplica a</div>
                <select
                  value={qScope}
                  onChange={(e) => setQScope(e.target.value as any)}
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-[12px] font-extrabold text-slate-900 outline-none focus:ring-2 focus:ring-slate-200"
                >
                  <option value="">Todos</option>
                  <option value="VENTA">Ventas</option>
                  <option value="COMPRA">Compras</option>
                  <option value="AMBOS">Ambos</option>
                </select>
              </div>

              <div className="lg:col-span-2">
                <div className="text-[11px] font-extrabold uppercase text-slate-600">País</div>
                <input
                  value={qCountry}
                  onChange={(e) => setQCountry(e.target.value.toUpperCase())}
                  placeholder="CL"
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-[12px] font-extrabold text-slate-900 outline-none focus:ring-2 focus:ring-slate-200"
                />
              </div>
            </div>
          </div>

          {/* Tabla */}
          <div className="overflow-hidden rounded-[26px] bg-white ring-1 ring-slate-200">
            <div className="overflow-x-auto">
              <div className="min-w-[1050px]">
                <div className={cls("grid items-center border-b border-slate-200 bg-slate-50 px-5 py-2.5", gridCols)}>
                  <div className={cls(cellBase, "text-[11px] font-extrabold uppercase text-slate-600")}>Código</div>
                  <div className={cls(cellBase, "pl-4 border-l border-slate-200 text-[11px] font-extrabold uppercase text-slate-600")}>Nombre</div>
                  <div className={cls(cellBase, "pl-4 border-l border-slate-200 text-[11px] font-extrabold uppercase text-slate-600")}>País</div>
                  <div className={cls(cellBase, "pl-4 border-l border-slate-200 text-[11px] font-extrabold uppercase text-slate-600")}>Aplica</div>
                  <div className={cls(cellBase, "pl-4 border-l border-slate-200 text-[11px] font-extrabold uppercase text-slate-600")}>Folio</div>
                  <div className={cls(cellBase, "pl-4 border-l border-slate-200 text-[11px] font-extrabold uppercase text-slate-600")}>Electrónico</div>
                  <div className={cls(cellBase, "pl-4 border-l border-slate-200 text-[11px] font-extrabold uppercase text-slate-600 text-right")}>Acciones</div>
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
                        onClick={() => companyId && loadCatalog(companyId)}
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
                        <div className="text-[11px] text-slate-500">Orden: {r.sort_order}</div>
                      </div>

                      <div className={cls(cellBase, "pl-4 border-l border-slate-200")}>
                        <div className="text-[13px] font-extrabold text-slate-800 line-clamp-2">{r.name}</div>
                        {r.notes ? <div className="text-[12px] text-slate-500 truncate">{r.notes}</div> : null}
                        <div className="mt-1 text-[11px] text-slate-500">
                          Serie: {r.requires_series ? "Sí" : "No"} • N°: {r.requires_number ? "Sí" : "No"} • Largo:{" "}
                          {r.number_min_len}-{r.number_max_len}
                        </div>
                      </div>

                      <div className={cls(cellBase, "pl-4 border-l border-slate-200")}>
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black text-slate-700">
                          {(r.country_code ?? "—").toUpperCase()}
                        </span>
                      </div>

                      <div className={cls(cellBase, "pl-4 border-l border-slate-200")}>
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black text-slate-700">
                          {scopeLabel(r.scope)}
                        </span>
                        <div className="mt-1">
                          <span
                            className={cls(
                              "inline-flex items-center rounded-full px-3 py-1 text-[11px] font-black",
                              r.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700"
                            )}
                          >
                            {r.is_active ? "Activo" : "Inactivo"}
                          </span>
                        </div>
                      </div>

                      <div className={cls(cellBase, "pl-4 border-l border-slate-200")}>
                        <span className="inline-flex items-center rounded-full bg-indigo-100 px-3 py-1 text-[11px] font-black text-indigo-700">
                          {r.requires_number ? "Requiere" : "Opcional"}
                        </span>
                      </div>

                      <div className={cls(cellBase, "pl-4 border-l border-slate-200")}>
                        <span
                          className={cls(
                            "inline-flex items-center rounded-full px-3 py-1 text-[11px] font-black",
                            r.is_electronic ? "bg-sky-100 text-sky-700" : "bg-slate-100 text-slate-700"
                          )}
                        >
                          {r.is_electronic ? "Sí" : "No"}
                        </span>
                      </div>

                      <div className={cls(cellBase, "pl-4 border-l border-slate-200")}>
                        <div className="flex justify-end gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() => openEdit(r)}
                            disabled={!canEdit}
                            className={cls(
                              "rounded-2xl border px-3 py-2 text-[12px] font-extrabold whitespace-nowrap",
                              canEdit
                                ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                                : "border-slate-200 bg-white text-slate-400 opacity-60 cursor-not-allowed"
                            )}
                          >
                            Editar
                          </button>

                          <button
                            type="button"
                            onClick={() => toggleActive(r)}
                            disabled={!canEdit}
                            className={cls(
                              "rounded-2xl border px-3 py-2 text-[12px] font-extrabold whitespace-nowrap",
                              canEdit
                                ? r.is_active
                                  ? "border-amber-200 bg-white text-amber-700 hover:bg-amber-50"
                                  : "border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50"
                                : "border-slate-200 bg-white text-slate-400 opacity-60 cursor-not-allowed"
                            )}
                          >
                            {r.is_active ? "Desactivar" : "Activar"}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="px-5 py-14 text-center text-[13px] text-slate-600">
                    No hay tipos fiscales. Crea el primero (ej: CL-33 Factura afecta).
                  </div>
                )}

                <div className="border-t border-slate-200 bg-slate-50 px-5 py-3 text-[12px] text-slate-600">
                  Tip: usa <b>country_code</b> para filtrar por país (CL/MX/PE/CO). Puedes mantener catálogo multi-país por empresa.
                </div>
              </div>
            </div>
          </div>

          <div className="text-center text-[12px] text-slate-500">ConciliaciónPro • Configuración contable</div>
        </div>
      </div>

      {/* Modal: DocType */}
      <Modal
        open={openDoc}
        title={editingId ? "Editar tipo fiscal" : "Crear tipo fiscal"}
        onClose={() => setOpenDoc(false)}
        footer={
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => setOpenDoc(false)}
              className="rounded-full px-5 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
              type="button"
              disabled={saving}
            >
              Cancelar
            </button>

            <button
              onClick={saveDocModal}
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
          Define un tipo fiscal reusable: reglas para serie/folio, largo de folio y si es electrónico. Sirve para CL/MX y más países.
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <div className="text-xs font-black text-slate-600">Código</div>
            <input
              value={mCode}
              onChange={(e) => setMCode(e.target.value)}
              placeholder="Ej: CL-33 / MX-I / PE-01"
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
            />
            <div className="mt-1 text-xs text-slate-500">Único por empresa.</div>
          </div>

          <div>
            <div className="text-xs font-black text-slate-600">País (opcional)</div>
            <input
              value={mCountry}
              onChange={(e) => setMCountry(e.target.value.toUpperCase())}
              placeholder="CL"
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
            />
            <div className="mt-1 text-xs text-slate-500">CL/MX/PE/CO… si queda vacío aplica a cualquiera.</div>
          </div>

          <div className="sm:col-span-2">
            <div className="text-xs font-black text-slate-600">Nombre</div>
            <input
              value={mName}
              onChange={(e) => setMName(e.target.value)}
              placeholder="Ej: Factura afecta / CFDI Ingreso"
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
            />
          </div>

          <div>
            <div className="text-xs font-black text-slate-600">Aplica a</div>
            <select
              value={mScope}
              onChange={(e) => setMScope(e.target.value as any)}
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
            >
              <option value="VENTA">Ventas</option>
              <option value="COMPRA">Compras</option>
              <option value="AMBOS">Ventas y Compras</option>
            </select>
          </div>

          <div>
            <div className="text-xs font-black text-slate-600">Electrónico</div>
            <select
              value={String(mElectronic)}
              onChange={(e) => setMElectronic(e.target.value === "true")}
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
            >
              <option value="true">Sí</option>
              <option value="false">No</option>
            </select>
          </div>

          <div>
            <div className="text-xs font-black text-slate-600">¿Requiere Serie?</div>
            <select
              value={String(mReqSeries)}
              onChange={(e) => setMReqSeries(e.target.value === "true")}
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
            >
              <option value="false">No</option>
              <option value="true">Sí</option>
            </select>
          </div>

          <div>
            <div className="text-xs font-black text-slate-600">¿Requiere Folio/Número?</div>
            <select
              value={String(mReqNumber)}
              onChange={(e) => setMReqNumber(e.target.value === "true")}
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
            >
              <option value="true">Sí</option>
              <option value="false">No</option>
            </select>
          </div>

          <div>
            <div className="text-xs font-black text-slate-600">Largo mín. folio</div>
            <input
              type="number"
              min={0}
              max={200}
              value={mMinLen}
              onChange={(e) => setMMinLen(Number(e.target.value))}
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
            />
          </div>

          <div>
            <div className="text-xs font-black text-slate-600">Largo máx. folio</div>
            <input
              type="number"
              min={1}
              max={200}
              value={mMaxLen}
              onChange={(e) => setMMaxLen(Number(e.target.value))}
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
            />
          </div>

          <div>
            <div className="text-xs font-black text-slate-600">Orden</div>
            <input
              type="number"
              min={0}
              max={9999}
              value={mSort}
              onChange={(e) => setMSort(Number(e.target.value))}
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
            />
            <div className="mt-1 text-xs text-slate-500">Menor = aparece primero.</div>
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
              placeholder="Ej: CL DTE 33, MX CFDI Ingreso..."
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
            />
          </div>
        </div>

        <div className="mt-4 rounded-2xl bg-slate-50 p-3 text-sm text-slate-700">
          <b>Resumen:</b> {mCode || "—"} • {mName || "—"} • {mCountry || "—"} • {scopeLabel(mScope)} • Serie:{" "}
          {mReqSeries ? "Sí" : "No"} • Folio: {mReqNumber ? "Sí" : "No"} • Largo: {mMinLen}-{mMaxLen} • Electrónico:{" "}
          {mElectronic ? "Sí" : "No"}
        </div>
      </Modal>
    </div>
  );
}
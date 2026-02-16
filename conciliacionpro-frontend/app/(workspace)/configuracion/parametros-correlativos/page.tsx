"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

/**
 * =========================
 * Helpers UI (mismo estilo)
 * =========================
 */
function cls(...a: Array<string | false | null | undefined>) {
  return a.filter(Boolean).join(" ");
}

async function getAuthUserId(): Promise<string | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data?.user?.id ?? null;
}

async function getMyRoleForCompany(
  companyId: string
): Promise<"OWNER" | "EDITOR" | "LECTOR" | null> {
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
  subtitle,
  children,
  onClose,
  footer,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
  footer?: React.ReactNode;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/35 p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
    >
      <div className="mx-auto flex h-full max-w-4xl items-center justify-center">
        <div
          className={cls(
            "w-full overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-black/5",
            "max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3rem)]"
          )}
        >
          <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white/90 px-5 py-4 backdrop-blur">
            <div className="min-w-0">
              <div className="truncate text-lg font-semibold text-slate-900">
                {title}
              </div>
              <div className="mt-0.5 text-xs font-semibold text-slate-500">
                {subtitle ?? "Configuración contable"}
              </div>
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
            <div className="sticky bottom-0 z-10 border-t bg-white/90 px-5 py-4 backdrop-blur">
              {footer}
            </div>
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
type Role = "OWNER" | "EDITOR" | "LECTOR";

type RoundingMode = "HALF_UP" | "HALF_EVEN" | "TRUNCATE";

type AccountingSettings = {
  id: string;
  company_id: string;
  money_decimals: number;
  qty_decimals: number;
  rounding_mode: RoundingMode;
  posting_tolerance: number; // numeric -> number
  lock_posted_edits: boolean;
  notes: string | null;
};

type JournalSeries = {
  id: string;
  company_id: string;
  code: string;
  name: string;
  description: string | null;
  prefix: string | null;
  suffix: string | null;
  padding: number;
  next_number: number;
  reset_policy: "NEVER" | "YEARLY" | "MONTHLY";
  is_active: boolean;
};

type JournalNumberLog = {
  id: string;
  company_id: string;
  series_id: string;
  used_number: number;
  formatted: string;
  journal_id: string | null;
  used_at: string;
  used_by: string | null;
};

const DEFAULT_SERIES_SEED: Array<
  Pick<
    JournalSeries,
    | "code"
    | "name"
    | "description"
    | "prefix"
    | "suffix"
    | "padding"
    | "next_number"
    | "reset_policy"
    | "is_active"
  >
> = [
  {
    code: "MANUAL",
    name: "Asientos manuales",
    description: "Numeración para asientos ingresados manualmente.",
    prefix: "AJ-",
    suffix: null,
    padding: 6,
    next_number: 1,
    reset_policy: "NEVER",
    is_active: true,
  },
  {
    code: "OPENING",
    name: "Apertura (saldos iniciales)",
    description: "Numeración para asientos de apertura/migración.",
    prefix: "AP-",
    suffix: null,
    padding: 6,
    next_number: 1,
    reset_policy: "NEVER",
    is_active: true,
  },
  {
    code: "CLOSING",
    name: "Cierre",
    description: "Numeración para asientos de cierre de período/año.",
    prefix: "CI-",
    suffix: null,
    padding: 6,
    next_number: 1,
    reset_policy: "YEARLY",
    is_active: true,
  },
];

/**
 * =========================
 * Utils
 * =========================
 */
function roundValue(value: number, decimals: number, mode: RoundingMode) {
  const factor = Math.pow(10, decimals);
  const x = value * factor;

  if (!isFinite(x)) return value;

  if (mode === "TRUNCATE") {
    const t = x < 0 ? Math.ceil(x) : Math.floor(x);
    return t / factor;
  }

  // HALF_UP y HALF_EVEN:
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const floor = Math.floor(ax);
  const diff = ax - floor;

  if (diff > 0.5) return (sign * (floor + 1)) / factor;
  if (diff < 0.5) return (sign * floor) / factor;

  // .5 exacto
  if (mode === "HALF_UP") return (sign * (floor + 1)) / factor;

  // HALF_EVEN
  const isEven = floor % 2 === 0;
  return (sign * (isEven ? floor : floor + 1)) / factor;
}

function formatNumberES(val: number, decimals: number) {
  try {
    return val.toLocaleString("es-CL", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  } catch {
    return String(val);
  }
}

function formatJournalNumber(
  prefix: string | null,
  num: number,
  padding: number,
  suffix: string | null
) {
  const p = prefix ?? "";
  const s = suffix ?? "";
  const n = String(num).padStart(padding, "0");
  return `${p}${n}${s}`;
}

function labelRoundingMode(m: RoundingMode) {
  if (m === "HALF_UP") return "Redondeo normal (0.5 sube)";
  if (m === "HALF_EVEN") return "Redondeo bancario (al par)";
  return "Cortar decimales (sin redondear)";
}

function helpRoundingMode(m: RoundingMode) {
  if (m === "HALF_UP")
    return "Si el decimal es 0,5 o más, sube. Ej: 1,5 → 2.";
  if (m === "HALF_EVEN")
    return "Si cae justo en 0,5, redondea al número par. Reduce sesgo en grandes volúmenes.";
  return "Elimina decimales sin subir. Ej: 1,9 → 1.";
}

function labelResetPolicy(p: "NEVER" | "YEARLY" | "MONTHLY") {
  if (p === "NEVER") return "Nunca (correlativo continuo)";
  if (p === "YEARLY") return "Cada año (reinicia en enero)";
  return "Cada mes (reinicia mensualmente)";
}

function helpResetPolicy(p: "NEVER" | "YEARLY" | "MONTHLY") {
  if (p === "NEVER")
    return "Mantiene la numeración creciendo para siempre (recomendado para la mayoría).";
  if (p === "YEARLY")
    return "Cuando cambia el año, reinicia el número a 1 (útil si tu auditoría lo exige).";
  return "Cuando cambia el mes, reinicia el número a 1 (poco común; úsalo solo si tu proceso lo pide).";
}

export default function ParametrosYCorrelativosPage() {
  // companyId
  const [companyId, setCompanyId] = useState<string | null>(null);

  useEffect(() => {
    const fromLS =
      localStorage.getItem("active_company_id") ||
      localStorage.getItem("company_id") ||
      localStorage.getItem("activeCompanyId");

    if (fromLS && fromLS.length >= 10) setCompanyId(fromLS);
    else setCompanyId(null);
  }, []);

  // permisos
  const [role, setRole] = useState<Role | null>(null);
  const canEdit = role === "OWNER" || role === "EDITOR";

  useEffect(() => {
    if (!companyId) return;
    getMyRoleForCompany(companyId).then(setRole);
  }, [companyId]);

  // data
  const [settings, setSettings] = useState<AccountingSettings | null>(null);
  const [series, setSeries] = useState<JournalSeries[]>([]);
  const [logs, setLogs] = useState<JournalNumberLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI state
  const [openSettings, setOpenSettings] = useState(false);
  const [openSeries, setOpenSeries] = useState(false);
  const [pickSeries, setPickSeries] = useState<JournalSeries | null>(null);

  const [saving, setSaving] = useState(false);

  // filters
  const [qText, setQText] = useState("");
  const [qActive, setQActive] = useState<"" | "ACTIVE" | "INACTIVE">("");

  async function bootstrap(cid: string) {
    setLoading(true);
    setError(null);

    try {
      // 1) settings
      const s1 = await supabase
        .from("accounting_settings")
        .select(
          "id, company_id, money_decimals, qty_decimals, rounding_mode, posting_tolerance, lock_posted_edits, notes"
        )
        .eq("company_id", cid)
        .maybeSingle();

      if (s1.error) throw s1.error;

      // si no existe, lo creamos (solo si puede editar)
      if (!s1.data) {
        if (canEdit) {
          const uid = await getAuthUserId();
          const ins = await supabase
            .from("accounting_settings")
            .insert({
              company_id: cid,
              money_decimals: 0,
              qty_decimals: 2,
              rounding_mode: "HALF_UP",
              posting_tolerance: 0,
              lock_posted_edits: true,
              created_by: uid,
              updated_by: uid,
            } as any)
            .select(
              "id, company_id, money_decimals, qty_decimals, rounding_mode, posting_tolerance, lock_posted_edits, notes"
            )
            .single();
          if (ins.error) throw ins.error;
          setSettings(ins.data as any);
        } else {
          setSettings(null);
        }
      } else {
        setSettings(s1.data as any);
      }

      // 2) series
      const s2 = await supabase
        .from("journal_series")
        .select(
          "id, company_id, code, name, description, prefix, suffix, padding, next_number, reset_policy, is_active"
        )
        .eq("company_id", cid)
        .order("code", { ascending: true });

      if (s2.error) throw s2.error;

      let rows = (s2.data ?? []) as any as JournalSeries[];

      // seed series base si está vacío (solo si puede editar)
      if (!rows.length && canEdit) {
        const uid = await getAuthUserId();
        const seedPayload = DEFAULT_SERIES_SEED.map((x) => ({
          ...x,
          company_id: cid,
          created_by: uid,
          updated_by: uid,
        }));

        const ins2 = await supabase
          .from("journal_series")
          .insert(seedPayload as any)
          .select(
            "id, company_id, code, name, description, prefix, suffix, padding, next_number, reset_policy, is_active"
          );

        if (ins2.error) throw ins2.error;
        rows = (ins2.data ?? []) as any;
      }

      setSeries(rows);

      // 3) logs (últimos usados por serie)
      const s3 = await supabase
        .from("journal_number_log")
        .select(
          "id, company_id, series_id, used_number, formatted, journal_id, used_at, used_by"
        )
        .eq("company_id", cid)
        .order("used_at", { ascending: false })
        .limit(300);

      if (s3.error) throw s3.error;
      setLogs((s3.data ?? []) as any);
    } catch (e: any) {
      setError(e?.message ?? "Error cargando.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!companyId) {
      setLoading(false);
      return;
    }
    // bootstrap cuando ya conozco rol (porque hago seed condicionada)
    if (!role) return;
    bootstrap(companyId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, role]);

  const filteredSeries = useMemo(() => {
    const t = qText.trim().toLowerCase();
    return series
      .filter((s) =>
        qActive ? (qActive === "ACTIVE" ? s.is_active : !s.is_active) : true
      )
      .filter((s) => {
        if (!t) return true;
        const hay =
          `${s.code} ${s.name} ${s.description ?? ""} ${s.prefix ?? ""} ${
            s.suffix ?? ""
          }`.toLowerCase();
        return hay.includes(t);
      });
  }, [series, qText, qActive]);

  function lastUsedForSeries(seriesId: string) {
    return logs.filter((l) => l.series_id === seriesId).slice(0, 5);
  }

  function nextPreviewForSeries(s: JournalSeries) {
    const res: string[] = [];
    for (let i = 0; i < 5; i++) {
      const num = (s.next_number ?? 1) + i;
      res.push(formatJournalNumber(s.prefix, num, s.padding, s.suffix));
    }
    return res;
  }

  // ===== Settings modal state
  const [editMoneyDecimals, setEditMoneyDecimals] = useState(0);
  const [editQtyDecimals, setEditQtyDecimals] = useState(2);
  const [editRoundingMode, setEditRoundingMode] =
    useState<RoundingMode>("HALF_UP");
  const [editTolerance, setEditTolerance] = useState<number>(0);
  const [editNotes, setEditNotes] = useState("");

  function openSettingsModal() {
    setEditMoneyDecimals(settings?.money_decimals ?? 0);
    setEditQtyDecimals(settings?.qty_decimals ?? 2);
    setEditRoundingMode(
      (settings?.rounding_mode ?? "HALF_UP") as RoundingMode
    );
    setEditTolerance(Number(settings?.posting_tolerance ?? 0));
    setEditNotes(settings?.notes ?? "");
    setOpenSettings(true);
  }

  async function saveSettings() {
    if (!companyId) return;
    if (!canEdit) {
      alert("Solo OWNER/EDITOR puede editar.");
      return;
    }
    setSaving(true);
    try {
      const uid = await getAuthUserId();

      const payload: any = {
        company_id: companyId,
        money_decimals: Number(editMoneyDecimals),
        qty_decimals: Number(editQtyDecimals),
        rounding_mode: editRoundingMode,
        posting_tolerance: Number(editTolerance),
        notes: editNotes.trim() ? editNotes.trim() : null,
        updated_by: uid,
      };

      if (settings?.id) {
        const up = await supabase
          .from("accounting_settings")
          .update(payload)
          .eq("id", settings.id)
          .eq("company_id", companyId)
          .select(
            "id, company_id, money_decimals, qty_decimals, rounding_mode, posting_tolerance, lock_posted_edits, notes"
          )
          .single();
        if (up.error) throw up.error;
        setSettings(up.data as any);
      } else {
        payload.created_by = uid;
        const ins = await supabase
          .from("accounting_settings")
          .insert(payload)
          .select(
            "id, company_id, money_decimals, qty_decimals, rounding_mode, posting_tolerance, lock_posted_edits, notes"
          )
          .single();
        if (ins.error) throw ins.error;
        setSettings(ins.data as any);
      }

      setOpenSettings(false);
    } catch (e: any) {
      alert(e?.message ?? "Error guardando parámetros.");
    } finally {
      setSaving(false);
    }
  }

  // ===== Series modal state
  const [serCode, setSerCode] = useState("");
  const [serName, setSerName] = useState("");
  const [serDesc, setSerDesc] = useState("");
  const [serPrefix, setSerPrefix] = useState("");
  const [serSuffix, setSerSuffix] = useState("");
  const [serPadding, setSerPadding] = useState(6);
  const [serNext, setSerNext] = useState(1);
  const [serReset, setSerReset] = useState<"NEVER" | "YEARLY" | "MONTHLY">(
    "NEVER"
  );
  const [serActive, setSerActive] = useState(true);

  function openSeriesModal(existing?: JournalSeries) {
    if (existing) {
      setPickSeries(existing);
      setSerCode(existing.code);
      setSerName(existing.name);
      setSerDesc(existing.description ?? "");
      setSerPrefix(existing.prefix ?? "");
      setSerSuffix(existing.suffix ?? "");
      setSerPadding(existing.padding ?? 6);
      setSerNext(existing.next_number ?? 1);
      setSerReset(existing.reset_policy ?? "NEVER");
      setSerActive(!!existing.is_active);
    } else {
      setPickSeries(null);
      setSerCode("");
      setSerName("");
      setSerDesc("");
      setSerPrefix("");
      setSerSuffix("");
      setSerPadding(6);
      setSerNext(1);
      setSerReset("NEVER");
      setSerActive(true);
    }
    setOpenSeries(true);
  }

  async function saveSeries() {
    if (!companyId) return;
    if (!canEdit) {
      alert("Solo OWNER/EDITOR puede editar.");
      return;
    }
    if (!serCode.trim() || !serName.trim()) {
      alert("Código y nombre son obligatorios.");
      return;
    }

    setSaving(true);
    try {
      const uid = await getAuthUserId();

      const payload: any = {
        company_id: companyId,
        code: serCode.trim().toUpperCase(),
        name: serName.trim(),
        description: serDesc.trim() ? serDesc.trim() : null,
        prefix: serPrefix.trim() ? serPrefix.trim() : null,
        suffix: serSuffix.trim() ? serSuffix.trim() : null,
        padding: Number(serPadding),
        next_number: Number(serNext),
        reset_policy: serReset,
        is_active: serActive,
        updated_by: uid,
      };

      if (pickSeries?.id) {
        const up = await supabase
          .from("journal_series")
          .update(payload)
          .eq("id", pickSeries.id)
          .eq("company_id", companyId)
          .select(
            "id, company_id, code, name, description, prefix, suffix, padding, next_number, reset_policy, is_active"
          )
          .single();
        if (up.error) throw up.error;

        setSeries((prev) =>
          prev.map((x) => (x.id === pickSeries.id ? (up.data as any) : x))
        );
      } else {
        payload.created_by = uid;
        const ins = await supabase
          .from("journal_series")
          .insert(payload)
          .select(
            "id, company_id, code, name, description, prefix, suffix, padding, next_number, reset_policy, is_active"
          )
          .single();
        if (ins.error) throw ins.error;
        setSeries((prev) => [ins.data as any, ...prev]);
      }

      setOpenSeries(false);
    } catch (e: any) {
      alert(e?.message ?? "Error guardando correlativo.");
    } finally {
      setSaving(false);
    }
  }

  // ===== Preview examples for settings
  const previewSamples = useMemo(() => {
    const moneyDec = settings?.money_decimals ?? 0;
    const mode = (settings?.rounding_mode ?? "HALF_UP") as RoundingMode;

    const base = [1234.56789, 100.5, 100.25, 100.75, -12.3456, 0.0049];
    return base.map((x) => {
      const r = roundValue(x, moneyDec, mode);
      return {
        raw: x,
        rounded: r,
        rawText: formatNumberES(x, Math.min(6, Math.max(2, moneyDec + 2))),
        roundedText: formatNumberES(r, moneyDec),
      };
    });
  }, [settings]);

  // Labels en UI (para que no se vea “inglés”)
  const roundingLabel = settings?.rounding_mode
    ? labelRoundingMode(settings.rounding_mode)
    : "—";

  const resetLabelForCard = (p: "NEVER" | "YEARLY" | "MONTHLY") =>
    labelResetPolicy(p);

  return (
    <div className="p-6">
      <div className="overflow-hidden rounded-[28px] bg-white ring-1 ring-slate-200 shadow-[0_18px_70px_rgba(15,23,42,0.10)]">
        {/* Header */}
        <div className="relative bg-gradient-to-r from-[#0b2b4f] via-[#123b63] to-[#0b2b4f] px-7 py-7 text-white">
          <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />

          <div className="relative flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[12px] font-extrabold uppercase text-white/80">
                Configuración contable
              </div>
              <h1 className="mt-1 text-3xl font-black leading-tight">
                Parámetros y correlativos
              </h1>
              <div className="mt-2 text-[13px] text-white/85">
                Define cómo se redondean montos y cómo se numeran los asientos al
                postear.
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => companyId && role && bootstrap(companyId)}
                className="rounded-2xl bg-white/10 px-4 py-2 text-[12px] font-extrabold ring-1 ring-white/15 hover:bg-white/15 transition"
                type="button"
              >
                Refrescar
              </button>

              <button
                onClick={openSettingsModal}
                disabled={!canEdit}
                className={cls(
                  "rounded-2xl px-4 py-2 text-[12px] font-extrabold ring-1 transition",
                  canEdit
                    ? "bg-white text-slate-900 ring-white/20 hover:bg-white/90"
                    : "bg-white/10 text-white/60 ring-white/15 opacity-70 cursor-not-allowed"
                )}
                type="button"
                title={!canEdit ? "Solo OWNER/EDITOR" : "Editar parámetros"}
              >
                Editar parámetros
              </button>

              <button
                onClick={() => openSeriesModal()}
                disabled={!canEdit}
                className={cls(
                  "rounded-2xl px-4 py-2 text-[12px] font-extrabold ring-1 transition",
                  canEdit
                    ? "bg-white/10 text-white ring-white/15 hover:bg-white/15"
                    : "bg-white/10 text-white/60 ring-white/15 opacity-70 cursor-not-allowed"
                )}
                type="button"
                title={!canEdit ? "Solo OWNER/EDITOR" : "Crear correlativo"}
              >
                + Nuevo correlativo
              </button>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-7">
          {loading ? (
            <div className="px-5 py-14 text-center text-[13px] text-slate-600">
              Cargando...
            </div>
          ) : !companyId ? (
            <div className="px-5 py-14 text-center text-[13px] text-slate-600">
              No se detectó <b>company_id</b>. Guarda el id en localStorage como{" "}
              <code className="rounded bg-slate-100 px-2 py-1">
                active_company_id
              </code>
              .
            </div>
          ) : error ? (
            <div className="px-5 py-14 text-center text-[13px] text-rose-600">
              Error: {error}
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => companyId && role && bootstrap(companyId)}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-[12px] font-extrabold text-slate-700 hover:bg-slate-50"
                >
                  Reintentar
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4">
                {/* Parámetros ARRIBA */}
                <div className="rounded-[26px] bg-white p-5 ring-1 ring-slate-200">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[12px] font-extrabold uppercase text-slate-600">
                        Parámetros de redondeo
                      </div>
                      <div className="mt-1 text-[13px] text-slate-700">
                        Controla cuántos decimales se muestran y <b>cómo</b> se
                        ajustan los montos (ej: 1,49 → 1 o 1,5 → 2).
                      </div>
                    </div>

                    <span
                      className={cls(
                        "inline-flex items-center rounded-full px-3 py-1 text-[11px] font-black whitespace-nowrap",
                        settings
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-amber-100 text-amber-800"
                      )}
                    >
                      {settings ? "Configurado" : "Pendiente"}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <div className="text-[11px] font-extrabold uppercase text-slate-600">
                        Decimales en dinero
                      </div>
                      <div className="mt-1 rounded-2xl bg-slate-50 px-4 py-3 text-[13px] font-black text-slate-900 ring-1 ring-slate-200">
                        {settings?.money_decimals ?? "—"}
                      </div>
                      <div className="mt-1 text-[12px] text-slate-500">
                        CLP suele ser 0; USD/MXN suele ser 2.
                      </div>
                    </div>

                    <div>
                      <div className="text-[11px] font-extrabold uppercase text-slate-600">
                        Decimales en cantidad
                      </div>
                      <div className="mt-1 rounded-2xl bg-slate-50 px-4 py-3 text-[13px] font-black text-slate-900 ring-1 ring-slate-200">
                        {settings?.qty_decimals ?? "—"}
                      </div>
                      <div className="mt-1 text-[12px] text-slate-500">
                        Útil para inventarios (ej: 1,25 kg).
                      </div>
                    </div>

                    <div>
                      <div className="text-[11px] font-extrabold uppercase text-slate-600">
                        Tipo de redondeo
                      </div>
                      <div className="mt-1 rounded-2xl bg-slate-50 px-4 py-3 text-[13px] font-black text-slate-900 ring-1 ring-slate-200">
                        {roundingLabel}
                      </div>
                      <div className="mt-1 text-[12px] text-slate-500">
                        {settings?.rounding_mode
                          ? helpRoundingMode(settings.rounding_mode)
                          : "—"}
                      </div>
                    </div>

                    <div className="sm:col-span-2 lg:col-span-1">
                      <div className="text-[11px] font-extrabold uppercase text-slate-600">
                        Tolerancia al postear
                      </div>
                      <div className="mt-1 rounded-2xl bg-slate-50 px-4 py-3 text-[13px] font-black text-slate-900 ring-1 ring-slate-200">
                        {settings
                          ? formatNumberES(
                              Number(settings.posting_tolerance ?? 0),
                              settings.money_decimals ?? 0
                            )
                          : "—"}
                      </div>
                      <div className="mt-1 text-[12px] text-slate-500">
                        Si el descuadre es menor a esto, se permite postear.
                      </div>
                    </div>
                  </div>

                  {/* Preview */}
                  <div className="mt-4 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                    <div className="text-[11px] font-extrabold uppercase text-slate-600">
                      Ejemplo (antes → después)
                    </div>

                    <div className="mt-3 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
                      <div className="grid grid-cols-2 border-b bg-slate-50 px-4 py-2">
                        <div className="text-[11px] font-extrabold uppercase text-slate-600">
                          Monto original
                        </div>
                        <div className="text-[11px] font-extrabold uppercase text-slate-600">
                          Monto aplicado
                        </div>
                      </div>

                      {previewSamples.map((r, idx) => (
                        <div
                          key={idx}
                          className="grid grid-cols-2 border-b border-slate-100 px-4 py-2"
                        >
                          <div className="text-[13px] font-semibold text-slate-800">
                            {r.rawText}
                          </div>
                          <div className="text-[13px] font-black text-slate-900">
                            {r.roundedText}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-2 text-[12px] text-slate-600">
                      Esto no “cambia” tu contabilidad histórica: solo define
                      cómo el sistema <b>calcula y muestra</b> montos desde ahora.
                    </div>
                  </div>
                </div>

                {/* Correlativos ABAJO */}
                <div className="rounded-[26px] bg-white p-5 ring-1 ring-slate-200">
                  <div className="min-w-0">
                    <div className="text-[12px] font-extrabold uppercase text-slate-600">
                      Correlativos de asientos
                    </div>
                    <div className="mt-1 text-[13px] text-slate-700">
                      El número se asigna <b>solo cuando posteas</b>. En borrador
                      no se gasta correlativo.
                    </div>
                  </div>

                  {/* filtros */}
                  <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-12">
                    <div className="lg:col-span-8">
                      <div className="text-[11px] font-extrabold uppercase text-slate-600">
                        Buscar
                      </div>
                      <div className="relative mt-1">
                        <input
                          value={qText}
                          onChange={(e) => setQText(e.target.value)}
                          placeholder="Código, nombre, prefijo, sufijo..."
                          className="w-full rounded-2xl border border-slate-200 bg-white px-11 py-2 text-[12px] font-extrabold text-slate-900 outline-none focus:ring-2 focus:ring-slate-200"
                        />
                        <span className="absolute left-4 top-2 text-slate-400">
                          🔎
                        </span>
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

                    <div className="lg:col-span-4">
                      <div className="text-[11px] font-extrabold uppercase text-slate-600">
                        Estado
                      </div>
                      <select
                        value={qActive}
                        onChange={(e) => setQActive(e.target.value as any)}
                        className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-[12px] font-extrabold text-slate-900 outline-none focus:ring-2 focus:ring-slate-200"
                      >
                        <option value="">Todos</option>
                        <option value="ACTIVE">Activos</option>
                        <option value="INACTIVE">Inactivos</option>
                      </select>
                    </div>
                  </div>

                  {/* LISTA sin scroll horizontal */}
                  <div className="mt-4 space-y-3">
                    {filteredSeries.length ? (
                      filteredSeries.map((s) => {
                        const used = lastUsedForSeries(s.id);
                        const next5 = nextPreviewForSeries(s);
                        const fmtSample = formatJournalNumber(
                          s.prefix,
                          s.next_number,
                          s.padding,
                          s.suffix
                        );

                        return (
                          <div
                            key={s.id}
                            className="overflow-hidden rounded-[22px] ring-1 ring-slate-200"
                          >
                            <div className="bg-slate-50 px-4 py-3">
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <div className="text-[13px] font-black text-slate-900">
                                      {s.code}
                                    </div>
                                    <span
                                      className={cls(
                                        "inline-flex items-center rounded-full px-3 py-1 text-[11px] font-black",
                                        s.is_active
                                          ? "bg-emerald-100 text-emerald-700"
                                          : "bg-slate-200 text-slate-700"
                                      )}
                                    >
                                      {s.is_active ? "Activo" : "Inactivo"}
                                    </span>
                                  </div>

                                  <div className="mt-1 text-[13px] font-extrabold text-slate-800">
                                    {s.name}
                                  </div>

                                  <div className="mt-0.5 text-[12px] text-slate-500">
                                    {s.description ?? "—"}
                                  </div>
                                </div>

                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => openSeriesModal(s)}
                                    disabled={!canEdit}
                                    className={cls(
                                      "rounded-2xl border px-3 py-2 text-[12px] font-extrabold whitespace-nowrap",
                                      canEdit
                                        ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                                        : "border-slate-200 bg-white text-slate-400 opacity-60 cursor-not-allowed"
                                    )}
                                    title={
                                      !canEdit
                                        ? "Solo OWNER/EDITOR"
                                        : "Editar correlativo"
                                    }
                                  >
                                    Editar
                                  </button>
                                </div>
                              </div>
                            </div>

                            <div className="bg-white px-4 py-4">
                              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                <div className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
                                  <div className="text-[11px] font-extrabold uppercase text-slate-600">
                                    Cómo se ve el número
                                  </div>
                                  <div className="mt-1 text-[13px] font-black text-slate-900 break-all">
                                    {fmtSample}
                                  </div>
                                  <div className="mt-1 text-[12px] text-slate-500 break-words">
                                    Prefijo: <b>{s.prefix ?? "—"}</b> • Relleno
                                    (ceros): <b>{s.padding}</b> • Sufijo:{" "}
                                    <b>{s.suffix ?? "—"}</b>
                                  </div>
                                </div>

                                <div className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
                                  <div className="text-[11px] font-extrabold uppercase text-slate-600">
                                    Próximo número a usar
                                  </div>
                                  <div className="mt-1 text-[22px] font-black text-slate-900">
                                    {s.next_number}
                                  </div>
                                  <div className="mt-1 text-[12px] text-slate-500">
                                    Se asigna al <b>postear</b>.
                                  </div>
                                </div>

                                <div className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
                                  <div className="text-[11px] font-extrabold uppercase text-slate-600">
                                    Reinicio del correlativo
                                  </div>
                                  <div className="mt-1 text-[13px] font-black text-slate-900">
                                    {resetLabelForCard(s.reset_policy)}
                                  </div>
                                  <div className="mt-1 text-[12px] text-slate-500">
                                    {helpResetPolicy(s.reset_policy)}
                                  </div>
                                </div>
                              </div>

                              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-12">
                                <div className="md:col-span-6 rounded-2xl bg-white p-3 ring-1 ring-slate-200">
                                  <div className="text-[11px] font-extrabold uppercase text-slate-600">
                                    Últimos 5 usados
                                  </div>
                                  {used.length ? (
                                    <div className="mt-2 space-y-1">
                                      {used.map((u) => (
                                        <div
                                          key={u.id}
                                          className="flex flex-wrap items-center justify-between gap-2"
                                        >
                                          <div className="text-[13px] font-black text-slate-900 break-all">
                                            {u.formatted}
                                          </div>
                                          <div className="text-[12px] text-slate-500 whitespace-nowrap">
                                            {new Date(u.used_at).toLocaleString(
                                              "es-CL"
                                            )}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="mt-2 text-[13px] text-slate-600">
                                      Aún no se han utilizado.
                                    </div>
                                  )}
                                </div>

                                <div className="md:col-span-6 rounded-2xl bg-white p-3 ring-1 ring-slate-200">
                                  <div className="text-[11px] font-extrabold uppercase text-slate-600">
                                    Próximos 5 (vista previa)
                                  </div>
                                  <div className="mt-2 space-y-1">
                                    {next5.map((x, i) => (
                                      <div
                                        key={i}
                                        className="text-[13px] font-black text-slate-900 break-all"
                                      >
                                        {x}
                                      </div>
                                    ))}
                                  </div>
                                  <div className="mt-2 text-[12px] text-slate-600">
                                    Importante: se “gastan” recién al{" "}
                                    <b>postear</b>.
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="px-4 py-10 text-center text-[13px] text-slate-600">
                        No hay correlativos para mostrar.
                      </div>
                    )}
                  </div>

                  <div className="mt-3 text-[12px] text-slate-600">
                    Sugerencia MVP: <b>MANUAL</b> (asientos manuales),{" "}
                    <b>OPENING</b> (apertura/migración), <b>CLOSING</b> (cierre).
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="mt-6 text-center text-[12px] text-slate-500">
        ConciliaciónPro • Configuración contable
      </div>

      {/* Modal Parámetros */}
      <Modal
        open={openSettings}
        title="Parámetros de redondeo"
        subtitle="Define cómo el sistema muestra y ajusta montos"
        onClose={() => setOpenSettings(false)}
        footer={
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => setOpenSettings(false)}
              className="rounded-full px-5 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
              type="button"
              disabled={saving}
            >
              Cancelar
            </button>

            <button
              onClick={saveSettings}
              className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
              type="button"
              disabled={saving || !canEdit}
              title={!canEdit ? "Solo OWNER/EDITOR" : "Guardar"}
            >
              {saving ? "Guardando..." : "Guardar cambios"}
            </button>
          </div>
        }
      >
        <div className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-700">
          Estos parámetros afectan los cálculos y la visualización <b>desde ahora</b>.
          Si ya tienes datos históricos, no los reescribe.
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-12">
          <div className="sm:col-span-4">
            <div className="text-xs font-black text-slate-600">
              Decimales en dinero
            </div>
            <div className="mt-1 text-[12px] text-slate-500">
              Cuántos decimales se muestran en montos (ej: 1.234,56).
            </div>
            <input
              type="number"
              value={editMoneyDecimals}
              min={0}
              max={6}
              onChange={(e) => setEditMoneyDecimals(Number(e.target.value))}
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
              disabled={!canEdit}
            />
          </div>

          <div className="sm:col-span-4">
            <div className="text-xs font-black text-slate-600">
              Decimales en cantidad
            </div>
            <div className="mt-1 text-[12px] text-slate-500">
              Para unidades que permiten decimales (kg, litros, horas, etc.).
            </div>
            <input
              type="number"
              value={editQtyDecimals}
              min={0}
              max={6}
              onChange={(e) => setEditQtyDecimals(Number(e.target.value))}
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
              disabled={!canEdit}
            />
          </div>

          <div className="sm:col-span-4">
            <div className="text-xs font-black text-slate-600">
              Tipo de redondeo
            </div>
            <div className="mt-1 text-[12px] text-slate-500">
              Define qué pasa cuando hay decimales.
            </div>
            <select
              value={editRoundingMode}
              onChange={(e) =>
                setEditRoundingMode(e.target.value as RoundingMode)
              }
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
              disabled={!canEdit}
            >
              <option value="HALF_UP">Redondeo normal (0.5 sube)</option>
              <option value="HALF_EVEN">Redondeo bancario (al par)</option>
              <option value="TRUNCATE">Cortar decimales (sin redondear)</option>
            </select>
            <div className="mt-2 text-[12px] text-slate-600">
              {helpRoundingMode(editRoundingMode)}
            </div>
          </div>

          <div className="sm:col-span-6">
            <div className="text-xs font-black text-slate-600">
              Tolerancia de descuadre al postear
            </div>
            <div className="mt-1 text-[12px] text-slate-500">
              Si el asiento descuadra menos que esto (por redondeos), se permite postear.
            </div>
            <input
              type="number"
              value={editTolerance}
              min={0}
              step="0.000001"
              onChange={(e) => setEditTolerance(Number(e.target.value))}
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
              disabled={!canEdit}
            />
          </div>

          <div className="sm:col-span-6">
            <div className="text-xs font-black text-slate-600">
              Notas internas (opcional)
            </div>
            <div className="mt-1 text-[12px] text-slate-500">
              Un recordatorio para tu equipo (no afecta cálculos).
            </div>
            <input
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              placeholder="Ej: CLP sin decimales; tolerancia 0."
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
              disabled={!canEdit}
            />
          </div>
        </div>

        <div className="mt-4 rounded-2xl bg-slate-50 p-3 text-sm text-slate-700">
          <b>Vista previa:</b>{" "}
          {formatNumberES(
            roundValue(1234.567, Number(editMoneyDecimals), editRoundingMode),
            Number(editMoneyDecimals)
          )}{" "}
          (desde 1234.567)
        </div>
      </Modal>

      {/* Modal Series */}
      <Modal
        open={openSeries}
        title={pickSeries ? `Editar correlativo • ${pickSeries.code}` : "Nuevo correlativo"}
        subtitle="Define cómo se numeran los asientos al postear"
        onClose={() => setOpenSeries(false)}
        footer={
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => setOpenSeries(false)}
              className="rounded-full px-5 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
              type="button"
              disabled={saving}
            >
              Cancelar
            </button>

            <button
              onClick={saveSeries}
              className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
              type="button"
              disabled={saving || !canEdit}
              title={!canEdit ? "Solo OWNER/EDITOR" : "Guardar"}
            >
              {saving ? "Guardando..." : "Guardar cambios"}
            </button>
          </div>
        }
      >
        <div className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-700">
          El correlativo se asigna <b>solo al postear</b>. Mientras el asiento está en borrador,
          no se consume numeración.
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-12">
          <div className="sm:col-span-4">
            <div className="text-xs font-black text-slate-600">Código interno</div>
            <div className="mt-1 text-[12px] text-slate-500">
              Identificador corto (ej: MANUAL, OPENING).
            </div>
            <input
              value={serCode}
              onChange={(e) => setSerCode(e.target.value)}
              placeholder="Ej: MANUAL"
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
              disabled={!canEdit || !!pickSeries}
              title={pickSeries ? "No se recomienda cambiar el código" : ""}
            />
          </div>

          <div className="sm:col-span-8">
            <div className="text-xs font-black text-slate-600">Nombre visible</div>
            <div className="mt-1 text-[12px] text-slate-500">
              Cómo lo verá el usuario (ej: Asientos manuales).
            </div>
            <input
              value={serName}
              onChange={(e) => setSerName(e.target.value)}
              placeholder="Ej: Asientos manuales"
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
              disabled={!canEdit}
            />
          </div>

          <div className="sm:col-span-12">
            <div className="text-xs font-black text-slate-600">Descripción (opcional)</div>
            <div className="mt-1 text-[12px] text-slate-500">
              Para qué se usa esta numeración.
            </div>
            <input
              value={serDesc}
              onChange={(e) => setSerDesc(e.target.value)}
              placeholder="Ej: Numeración para asientos de cierre..."
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
              disabled={!canEdit}
            />
          </div>

          <div className="sm:col-span-4">
            <div className="text-xs font-black text-slate-600">Prefijo (opcional)</div>
            <div className="mt-1 text-[12px] text-slate-500">
              Texto antes del número (ej: AJ-).
            </div>
            <input
              value={serPrefix}
              onChange={(e) => setSerPrefix(e.target.value)}
              placeholder="Ej: AJ-"
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
              disabled={!canEdit}
            />
          </div>

          <div className="sm:col-span-4">
            <div className="text-xs font-black text-slate-600">Sufijo (opcional)</div>
            <div className="mt-1 text-[12px] text-slate-500">
              Texto después del número (ej: -2026).
            </div>
            <input
              value={serSuffix}
              onChange={(e) => setSerSuffix(e.target.value)}
              placeholder="Ej: -2026"
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
              disabled={!canEdit}
            />
          </div>

          <div className="sm:col-span-4">
            <div className="text-xs font-black text-slate-600">Relleno con ceros</div>
            <div className="mt-1 text-[12px] text-slate-500">
              Cantidad de dígitos (ej: 6 → 000001).
            </div>
            <input
              type="number"
              value={serPadding}
              min={1}
              max={12}
              onChange={(e) => setSerPadding(Number(e.target.value))}
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
              disabled={!canEdit}
            />
          </div>

          <div className="sm:col-span-4">
            <div className="text-xs font-black text-slate-600">Próximo número</div>
            <div className="mt-1 text-[12px] text-slate-500">
              El siguiente que se asignará al postear.
            </div>
            <input
              type="number"
              value={serNext}
              min={1}
              onChange={(e) => setSerNext(Number(e.target.value))}
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
              disabled={!canEdit}
            />
          </div>

          <div className="sm:col-span-4">
            <div className="text-xs font-black text-slate-600">Reinicio</div>
            <div className="mt-1 text-[12px] text-slate-500">
              Cuándo vuelve a 1 (si aplica).
            </div>
            <select
              value={serReset}
              onChange={(e) => setSerReset(e.target.value as any)}
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
              disabled={!canEdit}
            >
              <option value="NEVER">Nunca (correlativo continuo)</option>
              <option value="YEARLY">Cada año (reinicia en enero)</option>
              <option value="MONTHLY">Cada mes (reinicia mensualmente)</option>
            </select>
            <div className="mt-2 text-[12px] text-slate-600">
              {helpResetPolicy(serReset)}
            </div>
          </div>

          <div className="sm:col-span-4">
            <div className="text-xs font-black text-slate-600">Estado</div>
            <div className="mt-1 text-[12px] text-slate-500">
              Si está inactivo, no debería usarse en nuevos posteos.
            </div>
            <select
              value={serActive ? "1" : "0"}
              onChange={(e) => setSerActive(e.target.value === "1")}
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
              disabled={!canEdit}
            >
              <option value="1">Activo</option>
              <option value="0">Inactivo</option>
            </select>
          </div>
        </div>

        <div className="mt-4 rounded-2xl bg-slate-50 p-3 text-sm text-slate-700">
          <b>Vista previa del próximo número:</b>{" "}
          <span className="font-black">
            {formatJournalNumber(
              serPrefix || null,
              Number(serNext),
              Number(serPadding),
              serSuffix || null
            )}
          </span>
        </div>
      </Modal>
    </div>
  );
}

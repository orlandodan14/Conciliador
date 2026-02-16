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
    .select("role, status")
    .eq("company_id", companyId)
    .eq("user_id", uid)
    .maybeSingle();

  if (error) return null;

  const status = String((data as any)?.status ?? "").toLowerCase();
  if (status && status !== "active") return null;

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
    <div className="fixed inset-0 z-[60] bg-black/35 p-4 sm:p-6" role="dialog" aria-modal="true">
      <div className="mx-auto flex h-full max-w-5xl items-center justify-center">
        <div
          className={cls(
            "w-full overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-black/5",
            "max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3rem)]"
          )}
        >
          <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white/90 px-5 py-4 backdrop-blur">
            <div className="min-w-0">
              <div className="truncate text-lg font-semibold text-slate-900">{title}</div>
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
type DimKey = "CC" | "CU" | "SUC" | "ITEM";
type Enforcement = "BLOCK" | "WARN";

type AccountNodeLite = {
  id: string;
  code: string | null;
  name: string | null;
  level?: number | null;
};

type PolicyRow = {
  id: string;
  company_id: string;
  account_node_id: string;

  require_cc: boolean;
  require_cu: boolean;
  require_suc: boolean;
  require_item: boolean;

  enforcement: Enforcement;
  is_active: boolean;

  effective_from: string; // YYYY-MM-DD
  effective_to: string | null;

  notes: string | null;
};

/**
 * =========================
 * Config
 * =========================
 */
const POLICIES_TABLE = "account_imputation_policies";
const ACCOUNTS_TABLE = "account_nodes";

function dimBadge(d: DimKey) {
  if (d === "CC") return "CC";
  if (d === "CU") return "CU";
  if (d === "SUC") return "SUC";
  return "ITEM";
}

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export default function PoliticasImputacionPage() {
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
  const [role, setRole] = useState<"OWNER" | "EDITOR" | "LECTOR" | null>(null);
  const canEdit = role === "OWNER" || role === "EDITOR";

  useEffect(() => {
    if (!companyId) return;
    getMyRoleForCompany(companyId).then(setRole);
  }, [companyId]);

  // data
  const [accounts, setAccounts] = useState<AccountNodeLite[]>([]);
  const [policies, setPolicies] = useState<PolicyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // filters
  const [qText, setQText] = useState("");
  const [qActive, setQActive] = useState<"" | "active" | "inactive">("");
  const [qEnf, setQEnf] = useState<"" | Enforcement>("");

  // modal
  const [openEdit, setOpenEdit] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [editingPolicyId, setEditingPolicyId] = useState<string | null>(null);

  const [fRequireCC, setFRequireCC] = useState(false);
  const [fRequireCU, setFRequireCU] = useState(false);
  const [fRequireSUC, setFRequireSUC] = useState(false);
  const [fRequireITEM, setFRequireITEM] = useState(false);
  const [fEnforcement, setFEnforcement] = useState<Enforcement>("BLOCK");
  const [fIsActive, setFIsActive] = useState(true);
  const [fEffFrom, setFEffFrom] = useState<string>(todayISO());
  const [fEffTo, setFEffTo] = useState<string>("");
  const [fNotes, setFNotes] = useState<string>("");

  const [saving, setSaving] = useState(false);

  async function bootstrap(cid: string) {
    setLoading(true);
    setError(null);

    try {
      // cuentas posteables (nivel 4)
      const { data: acc, error: accErr } = await supabase
        .from(ACCOUNTS_TABLE)
        .select("id, code, name, level")
        .eq("company_id", cid)
        .eq("level", 4)
        .order("code", { ascending: true });

      if (accErr) throw accErr;
      setAccounts((acc ?? []) as any);

      // políticas
      const { data: pol, error: polErr } = await supabase
        .from(POLICIES_TABLE)
        .select(
          "id, company_id, account_node_id, require_cc, require_cu, require_suc, require_item, enforcement, is_active, effective_from, effective_to, notes"
        )
        .eq("company_id", cid)
        .order("account_node_id", { ascending: true })
        .order("effective_from", { ascending: false });

      if (polErr) throw polErr;
      setPolicies(((pol ?? []) as any) as PolicyRow[]);
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
    bootstrap(companyId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  function accountLabel(id: string) {
    const a = accounts.find((x) => x.id === id);
    if (!a) return `Cuenta ${id.slice(0, 8)}…`;
    const c = a.code ? String(a.code) : "";
    const n = a.name ? String(a.name) : "";
    return c && n ? `${c} • ${n}` : n || c || a.id;
  }

  // “vigente” (para MVP): tomamos la última por effective_from
  function currentPolicyForAccount(accountId: string) {
    return policies.find((p) => p.account_node_id === accountId && p.is_active) ?? null;
  }

  const coverage = useMemo(() => {
    const total = accounts.length;
    const withPolicy = accounts.filter((a) => !!currentPolicyForAccount(a.id)).length;
    return { total, withPolicy, missing: Math.max(0, total - withPolicy) };
  }, [accounts, policies]);

  const filtered = useMemo(() => {
    const t = qText.trim().toLowerCase();
    return accounts
      .filter((a) => {
        if (!t) return true;
        const hay = `${a.code ?? ""} ${a.name ?? ""}`.toLowerCase();
        return hay.includes(t);
      })
      .filter((a) => {
        const p = currentPolicyForAccount(a.id);
        if (!qActive) return true;
        return qActive === "active" ? !!p : !p;
      })
      .filter((a) => {
        if (!qEnf) return true;
        const p = currentPolicyForAccount(a.id);
        if (!p) return false;
        return p.enforcement === qEnf;
      });
  }, [accounts, policies, qText, qActive, qEnf]);

  function openPolicyEditor(accountId: string) {
    const p = currentPolicyForAccount(accountId);

    setEditingAccountId(accountId);
    setEditingPolicyId(p?.id ?? null);

    setFRequireCC(!!p?.require_cc);
    setFRequireCU(!!p?.require_cu);
    setFRequireSUC(!!p?.require_suc);
    setFRequireITEM(!!p?.require_item);

    setFEnforcement((p?.enforcement ?? "BLOCK") as Enforcement);
    setFIsActive(p ? !!p.is_active : true);

    setFEffFrom(p?.effective_from ?? todayISO());
    setFEffTo(p?.effective_to ?? "");
    setFNotes(p?.notes ?? "");

    setOpenEdit(true);
  }

  async function savePolicy() {
    if (!companyId || !editingAccountId) return;
    if (!canEdit) return alert("No tienes permisos (solo OWNER/EDITOR).");

    // mínimo de sentido: si no marcas nada, no es “política”, es vacío
    const anyReq = fRequireCC || fRequireCU || fRequireSUC || fRequireITEM;
    if (!anyReq) {
      const ok = confirm("No marcaste ninguna dimensión obligatoria. ¿Quieres dejar la cuenta SIN política?");
      if (!ok) return;
    }

    setSaving(true);
    try {
      const uid = await getAuthUserId();

      const payload = {
        company_id: companyId,
        account_node_id: editingAccountId,

        require_cc: !!fRequireCC,
        require_cu: !!fRequireCU,
        require_suc: !!fRequireSUC,
        require_item: !!fRequireITEM,

        enforcement: fEnforcement,
        is_active: !!fIsActive,

        effective_from: fEffFrom || todayISO(),
        effective_to: fEffTo.trim() ? fEffTo.trim() : null,

        notes: fNotes.trim() ? fNotes.trim() : null,

        updated_by: uid,
      } as any;

      if (editingPolicyId) {
        const { data, error } = await supabase
          .from(POLICIES_TABLE)
          .update(payload)
          .eq("id", editingPolicyId)
          .eq("company_id", companyId)
          .select(
            "id, company_id, account_node_id, require_cc, require_cu, require_suc, require_item, enforcement, is_active, effective_from, effective_to, notes"
          )
          .single();

        if (error) throw error;

        setPolicies((prev) => prev.map((x) => (x.id === editingPolicyId ? ((data as any) as PolicyRow) : x)));
      } else {
        // insert nueva
        const { data, error } = await supabase
          .from(POLICIES_TABLE)
          .insert({
            ...payload,
            created_by: uid,
          } as any)
          .select(
            "id, company_id, account_node_id, require_cc, require_cu, require_suc, require_item, enforcement, is_active, effective_from, effective_to, notes"
          )
          .single();

        if (error) throw error;

        setPolicies((prev) => [((data as any) as PolicyRow), ...prev]);
      }

      setOpenEdit(false);
    } catch (e: any) {
      alert(`Error guardando: ${e?.message ?? "Error"}`);
    } finally {
      setSaving(false);
    }
  }

  const gridCols = "grid-cols-[2fr_260px_150px_160px_170px]";

  function reqBadges(p: PolicyRow | null) {
    const items: DimKey[] = [];
    if (p?.require_cc) items.push("CC");
    if (p?.require_cu) items.push("CU");
    if (p?.require_suc) items.push("SUC");
    if (p?.require_item) items.push("ITEM");
    return items;
  }

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
              <h1 className="mt-1 text-3xl font-black leading-tight">Políticas de imputación</h1>
              <div className="mt-2 text-[13px] text-white/85">
                Define qué dimensiones son <b>obligatorias</b> por cuenta contable (CC/CU/SUC/ITEM).
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/configuracion/plan-de-cuentas"
                className="rounded-2xl bg-white/10 px-4 py-2 text-[12px] font-extrabold ring-1 ring-white/15 hover:bg-white/15 transition"
              >
                Ir a Plan de cuentas
              </Link>

              <button
                onClick={() => companyId && bootstrap(companyId)}
                className="rounded-2xl bg-white/10 px-4 py-2 text-[12px] font-extrabold ring-1 ring-white/15 hover:bg-white/15 transition"
                type="button"
              >
                Refrescar
              </button>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-7">
          {/* Estado simple */}
          <div className="rounded-[26px] bg-white p-5 ring-1 ring-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[12px] font-extrabold uppercase text-slate-600">Cómo funciona</div>
                <div className="mt-2 text-[13px] text-slate-700">
                  Si una cuenta exige CC/CU/SUC/ITEM, el asiento <b>debe</b> traer esos valores al postear.
                  <span className="text-slate-500"> (Autocompletar lo dejamos para v2.)</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black text-slate-700">
                  {role ?? "—"} {role ? "•" : ""} {canEdit ? "Puede editar" : "Solo lectura"}
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black text-slate-700">
                  Cuentas posteables: {coverage.total}
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black text-slate-700">
                  Con política: {coverage.withPolicy} • Faltan: {coverage.missing}
                </span>
              </div>
            </div>

            <div className="mt-4 rounded-2xl bg-slate-50 p-3 text-[13px] text-slate-700 ring-1 ring-slate-200">
              Recomendación MVP: deja <b>BLOCK</b> en cuentas críticas (Ventas, COGS, Gastos, Nómina) y usa <b>WARN</b> solo
              al inicio para adopción.
            </div>
          </div>

          {/* Filtros */}
          <div className="mt-4 rounded-[26px] bg-white p-5 ring-1 ring-slate-200">
            <div className="text-[12px] font-extrabold uppercase text-slate-600">Filtros</div>

            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-12">
              <div className="lg:col-span-7">
                <div className="text-[11px] font-extrabold uppercase text-slate-600">Búsqueda</div>
                <div className="relative mt-1">
                  <input
                    value={qText}
                    onChange={(e) => setQText(e.target.value)}
                    placeholder="Código o nombre de cuenta..."
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
                  <option value="active">Con política</option>
                  <option value="inactive">Sin política</option>
                </select>
              </div>

              <div className="lg:col-span-2">
                <div className="text-[11px] font-extrabold uppercase text-slate-600">Enforcement</div>
                <select
                  value={qEnf}
                  onChange={(e) => setQEnf(e.target.value as any)}
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-[12px] font-extrabold text-slate-900 outline-none focus:ring-2 focus:ring-slate-200"
                >
                  <option value="">Todos</option>
                  <option value="BLOCK">BLOCK</option>
                  <option value="WARN">WARN</option>
                </select>
              </div>
            </div>
          </div>

          {/* Tabla */}
          <div className="mt-4 overflow-hidden rounded-[26px] bg-white ring-1 ring-slate-200">
            <div className="overflow-x-auto">
              <div className="min-w-[1050px]">
                <div className={cls("grid items-center border-b border-slate-200 bg-slate-50 px-5 py-2.5", gridCols)}>
                  <div className="text-[11px] font-extrabold uppercase text-slate-600">Cuenta</div>
                  <div className="pl-4 border-l border-slate-200 text-[11px] font-extrabold uppercase text-slate-600">
                    Obligatorio
                  </div>
                  <div className="pl-4 border-l border-slate-200 text-[11px] font-extrabold uppercase text-slate-600">
                    Enforcement
                  </div>
                  <div className="pl-4 border-l border-slate-200 text-[11px] font-extrabold uppercase text-slate-600">
                    Vigencia
                  </div>
                  <div className="pl-4 border-l border-slate-200 text-[11px] font-extrabold uppercase text-slate-600 text-right">
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
                        onClick={() => companyId && bootstrap(companyId)}
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-[12px] font-extrabold text-slate-700 hover:bg-slate-50"
                      >
                        Reintentar
                      </button>
                    </div>
                  </div>
                ) : filtered.length ? (
                  filtered.map((a) => {
                    const p = currentPolicyForAccount(a.id);
                    const badges = reqBadges(p);

                    return (
                      <div
                        key={a.id}
                        className={cls("grid items-center px-5 py-3 border-b border-slate-100 hover:bg-slate-50", gridCols)}
                      >
                        <div className="min-w-0">
                          <div className="text-[13px] font-extrabold text-slate-900 truncate">{accountLabel(a.id)}</div>
                          <div className="mt-0.5 text-[12px] text-slate-500 truncate">
                          </div>
                        </div>

                        <div className="pl-4 border-l border-slate-200">
                          {p ? (
                            <div className="flex flex-wrap gap-2">
                              {badges.length ? (
                                badges.map((b) => (
                                  <span
                                    key={b}
                                    className="rounded-full bg-indigo-100 px-3 py-1 text-[11px] font-black text-indigo-700"
                                  >
                                    {dimBadge(b)}
                                  </span>
                                ))
                              ) : (
                                <span className="text-[12px] text-slate-500">— Sin requisitos —</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-[12px] text-amber-700">Sin política</span>
                          )}
                          {p?.notes ? <div className="mt-1 text-[12px] text-slate-500 truncate">Nota: {p.notes}</div> : null}
                        </div>

                        <div className="pl-4 border-l border-slate-200">
                          {p ? (
                            <span
                              className={cls(
                                "inline-flex items-center rounded-full px-3 py-1 text-[11px] font-black whitespace-nowrap",
                                p.enforcement === "BLOCK" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-800"
                              )}
                            >
                              {p.enforcement}
                            </span>
                          ) : (
                            <span className="text-[12px] text-slate-500">—</span>
                          )}
                          {p ? (
                            <div className="mt-1">
                              <span
                                className={cls(
                                  "inline-flex items-center rounded-full px-3 py-1 text-[11px] font-black whitespace-nowrap",
                                  p.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700"
                                )}
                              >
                                {p.is_active ? "Activa" : "Inactiva"}
                              </span>
                            </div>
                          ) : null}
                        </div>

                        <div className="pl-4 border-l border-slate-200">
                          {p ? (
                            <div className="text-[12px] text-slate-700">
                              Desde: <b>{p.effective_from}</b>
                              <br />
                              Hasta: <b>{p.effective_to ?? "—"}</b>
                            </div>
                          ) : (
                            <span className="text-[12px] text-slate-500">—</span>
                          )}
                        </div>

                        <div className="pl-4 border-l border-slate-200">
                          <div className="flex justify-end gap-2 flex-wrap">
                            <button
                              type="button"
                              onClick={() => openPolicyEditor(a.id)}
                              disabled={!canEdit}
                              className={cls(
                                "rounded-2xl border px-3 py-2 text-[12px] font-extrabold whitespace-nowrap",
                                canEdit
                                  ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                                  : "border-slate-200 bg-white text-slate-400 opacity-60 cursor-not-allowed"
                              )}
                              title={!canEdit ? "Solo OWNER/EDITOR" : "Configurar política"}
                            >
                              {p ? "Editar" : "Configurar"}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="px-5 py-14 text-center text-[13px] text-slate-600">No hay cuentas para mostrar.</div>
                )}

                <div className="border-t border-slate-200 bg-slate-50 px-5 py-3 text-[12px] text-slate-600">
                  Tip: empieza por cuentas de resultado (Ingresos/COGS/Gastos) y luego control (AR/AP/Bancos).
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 text-center text-[12px] text-slate-500">ConciliaciónPro • Configuración contable</div>

      {/* Modal editor */}
      <Modal
        open={openEdit}
        title={editingAccountId ? `Política • ${accountLabel(editingAccountId)}` : "Política"}
        subtitle="Define qué dimensiones serán obligatorias al postear en esta cuenta"
        onClose={() => setOpenEdit(false)}
        footer={
          <div className="flex items-center justify-between gap-2">
            <div className="text-[12px] text-slate-500">
              MVP: solo obligatoriedad. V2: autocompletar y reglas por origen (ventas/bancos/etc.).
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setOpenEdit(false)}
                className="rounded-full px-5 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                type="button"
                disabled={saving}
              >
                Cancelar
              </button>
              <button
                onClick={savePolicy}
                className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                type="button"
                disabled={saving || !canEdit}
                title={!canEdit ? "Solo OWNER/EDITOR" : "Guardar"}
              >
                {saving ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        }
      >
        <div className="rounded-2xl bg-slate-50 p-3 text-[13px] text-slate-700">
          Marca qué dimensiones serán <b>obligatorias</b> para poder postear movimientos en esta cuenta.
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-12">
          <div className="sm:col-span-12">
            <div className="text-xs font-black text-slate-600">Dimensiones obligatorias</div>

            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {[
                { key: "CC" as const, label: "Centro de costo (CC)", state: fRequireCC, set: setFRequireCC },
                { key: "CU" as const, label: "Centro de utilidad (CU)", state: fRequireCU, set: setFRequireCU },
                { key: "SUC" as const, label: "Sucursal (SUC)", state: fRequireSUC, set: setFRequireSUC },
                { key: "ITEM" as const, label: "Artículo/Ítem (ITEM)", state: fRequireITEM, set: setFRequireITEM },
              ].map((d) => (
                <label
                  key={d.key}
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3"
                >
                  <input
                    type="checkbox"
                    checked={d.state}
                    onChange={(e) => d.set(e.target.checked)}
                    disabled={!canEdit}
                  />
                  <span className="text-sm font-semibold text-slate-700">{d.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="sm:col-span-6">
            <div className="text-xs font-black text-slate-600">Enforcement</div>
            <select
              value={fEnforcement}
              onChange={(e) => setFEnforcement(e.target.value as Enforcement)}
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
              disabled={!canEdit}
            >
              <option value="BLOCK">BLOCK (bloquea si falta)</option>
              <option value="WARN">WARN (solo advierte)</option>
            </select>
          </div>

          <div className="sm:col-span-6">
            <div className="text-xs font-black text-slate-600">Estado</div>
            <label className="mt-1 inline-flex w-full items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2">
              <input
                type="checkbox"
                checked={fIsActive}
                onChange={(e) => setFIsActive(e.target.checked)}
                disabled={!canEdit}
              />
              <span className="text-sm font-semibold text-slate-700">Política activa</span>
            </label>
          </div>

          <div className="sm:col-span-6">
            <div className="text-xs font-black text-slate-600">Vigente desde</div>
            <input
              type="date"
              value={fEffFrom}
              onChange={(e) => setFEffFrom(e.target.value)}
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
              disabled={!canEdit}
            />
          </div>

          <div className="sm:col-span-6">
            <div className="text-xs font-black text-slate-600">Vigente hasta (opcional)</div>
            <input
              type="date"
              value={fEffTo}
              onChange={(e) => setFEffTo(e.target.value)}
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
              disabled={!canEdit}
              placeholder="—"
            />
          </div>

          <div className="sm:col-span-12">
            <div className="text-xs font-black text-slate-600">Notas (opcional)</div>
            <input
              value={fNotes}
              onChange={(e) => setFNotes(e.target.value)}
              placeholder="Ej: Ventas siempre deben tener SUC + CU"
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
              disabled={!canEdit}
            />
          </div>
        </div>

        <div className="mt-4 rounded-2xl bg-slate-50 p-3 text-[13px] text-slate-700 ring-1 ring-slate-200">
          <b>Resumen:</b> Requiere{" "}
          <b>
            {[
              fRequireCC ? "CC" : null,
              fRequireCU ? "CU" : null,
              fRequireSUC ? "SUC" : null,
              fRequireITEM ? "ITEM" : null,
            ]
              .filter(Boolean)
              .join(" + ") || "— nada —"}
          </b>{" "}
          • Enforcement: <b>{fEnforcement}</b>
        </div>
      </Modal>
    </div>
  );
}

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
                Configuración contable
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
 * Tipos (alineado a tu tabla REAL)
 * =========================
 * cost_centers:
 * - id
 * - company_id
 * - code (text)  NOT NULL (pero puede ser string vacío, igual lo manejamos)
 * - name
 * - description (text nullable)
 * - parent_id (uuid nullable)
 * - is_active (bool)
 * - is_default (bool)
 * - manager_user_id (uuid nullable)
 * - created_at/created_by/updated_at/updated_by...
 */
type CostCenterRow = {
  id: string;
  company_id: string;
  code: string;
  name: string;
  description: string | null;
  parent_id: string | null;
  is_active: boolean;
  is_default: boolean;
  manager_user_id: string | null;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
};

/**
 * =========================
 * Tablas reales en tu BBDD
 * =========================
 */
const COST_CENTERS_TABLE_CANDIDATES = [
  "cost_centers",
  "centros_costos",
  "cost_centers_v1",
];

function isMissingTableError(e: any) {
  const msg = String(e?.message ?? "");
  const code = String((e as any)?.code ?? "");
  return (
    code === "42P01" ||
    msg.toLowerCase().includes("does not exist") ||
    msg.toLowerCase().includes("relation")
  );
}

async function detectTable(candidates: string[], probeSelect: string) {
  for (const t of candidates) {
    try {
      const { error } = await supabase.from(t).select(probeSelect).limit(1);
      if (!error) return t;
      if (isMissingTableError(error)) continue;
      return t;
    } catch (e: any) {
      if (isMissingTableError(e)) continue;
      return t;
    }
  }
  return null;
}

export default function CentrosCostosPage() {
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

  // Tabla detectada
  const [ccTable, setCcTable] = useState<string | null>(null);

  // Datos
  const [rows, setRows] = useState<CostCenterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Para mostrar "Responsable" de forma bonita (profiles)
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);

  // Filtros
  const [qText, setQText] = useState("");
  const [qActive, setQActive] = useState<"" | "active" | "inactive">("");

  // Modal
  const [openEdit, setOpenEdit] = useState(false);
  const [editing, setEditing] = useState<CostCenterRow | null>(null);

  const [fCode, setFCode] = useState("");
  const [fName, setFName] = useState("");
  const [fParentId, setFParentId] = useState<string | null>(null);
  const [fIsActive, setFIsActive] = useState(true);
  const [fIsDefault, setFIsDefault] = useState(false);
  const [fManagerUserId, setFManagerUserId] = useState<string | null>(null);
  const [fDescription, setFDescription] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadProfilesForCompany(cid: string) {
    try {
      // 1) miembros de la empresa
      const { data: members, error: em } = await supabase
        .from("company_members")
        .select("user_id")
        .eq("company_id", cid)
        .eq("status", "active");

      if (em) return;

      const ids = (members ?? []).map((m: any) => m.user_id).filter(Boolean);
      if (!ids.length) {
        setProfiles([]);
        return;
      }

      // 2) perfiles
      const { data: prof, error: ep } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", ids);

      if (ep) return;
      setProfiles(((prof as any[]) ?? []) as ProfileRow[]);
    } catch {
      // silencioso
    }
  }

  async function bootstrap(cid: string) {
    setLoading(true);
    setError(null);

    try {
      const t = await detectTable(COST_CENTERS_TABLE_CANDIDATES, "id");
      setCcTable(t);

      if (!t) {
        setRows([]);
        setProfiles([]);
        return;
      }

      const { data, error } = await supabase
        .from(t)
        .select(
          "id, company_id, code, name, description, parent_id, is_active, is_default, manager_user_id"
        )
        .eq("company_id", cid)
        .order("is_default", { ascending: false })
        .order("code", { ascending: true })
        .order("name", { ascending: true });

      if (error) throw error;

      setRows(((data as any[]) ?? []) as CostCenterRow[]);
      // Cargamos perfiles para mostrar responsables y para el selector del modal
      await loadProfilesForCompany(cid);
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

  const parentsList = useMemo(() => {
    return rows.slice().sort((a, b) => {
      const ac = a.code ?? "";
      const bc = b.code ?? "";
      if (ac !== bc) return ac.localeCompare(bc);
      return a.name.localeCompare(b.name);
    });
  }, [rows]);

  const profileById = useMemo(() => {
    const map = new Map<string, ProfileRow>();
    for (const p of profiles) map.set(p.id, p);
    return map;
  }, [profiles]);

  function managerLabel(manager_user_id: string | null) {
    if (!manager_user_id) return null;
    const p = profileById.get(manager_user_id);
    if (!p) return `Usuario: ${manager_user_id.slice(0, 8)}…`;
    const name = (p.full_name ?? "").trim();
    const email = (p.email ?? "").trim();
    if (name && email) return `${name} • ${email}`;
    return name || email || `Usuario: ${manager_user_id.slice(0, 8)}…`;
  }

  const filtered = useMemo(() => {
    const t = qText.trim().toLowerCase();

    return rows
      .filter((r) => {
        if (!qActive) return true;
        return qActive === "active" ? r.is_active : !r.is_active;
      })
      .filter((r) => {
        if (!t) return true;
        const mgr = managerLabel(r.manager_user_id) ?? "";
        const hay = `${r.code ?? ""} ${r.name} ${mgr} ${r.description ?? ""}`.toLowerCase();
        return hay.includes(t);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, qText, qActive, profileById]);

  function labelCC(id: string | null) {
    if (!id) return "— Sin padre —";
    const r = rows.find((x) => x.id === id);
    if (!r) return `Centro: ${id.slice(0, 8)}…`;
    const c = r.code ? String(r.code) : "";
    const n = r.name ? String(r.name) : "";
    return c && n ? `${c} • ${n}` : n || c || r.id;
  }

  function openCreate() {
    setEditing(null);
    setFCode("");
    setFName("");
    setFParentId(null);
    setFIsActive(true);
    setFIsDefault(rows.length === 0); // si es el primero, sugerimos default
    setFManagerUserId(null);
    setFDescription("");
    setOpenEdit(true);
  }

  function openUpdate(r: CostCenterRow) {
    setEditing(r);
    setFCode(r.code ?? "");
    setFName(r.name ?? "");
    setFParentId(r.parent_id ?? null);
    setFIsActive(!!r.is_active);
    setFIsDefault(!!r.is_default);
    setFManagerUserId(r.manager_user_id ?? null);
    setFDescription(r.description ?? "");
    setOpenEdit(true);
  }

  async function save() {
    if (!companyId) return;
    if (!ccTable) {
      alert(
        "No existe la tabla de centros de costos. Debes crearla para poder guardar."
      );
      return;
    }
    if (!canEdit) {
      alert("No tienes permisos para editar.");
      return;
    }

    const name = fName.trim();
    if (!name) {
      alert("Nombre es obligatorio.");
      return;
    }

    setSaving(true);
    try {
      const uid = await getAuthUserId();

      // Si marcaron default, garantizamos único
      if (fIsDefault) {
        await supabase
          .from(ccTable)
          .update({ is_default: false, updated_by: uid } as any)
          .eq("company_id", companyId);
      }

      if (editing) {
        const { data, error } = await supabase
          .from(ccTable)
          .update({
            code: fCode.trim() ? fCode.trim() : "", // en tu tabla code es NOT NULL
            name,
            parent_id: fParentId,
            is_active: fIsActive,
            is_default: fIsDefault,
            manager_user_id: fManagerUserId,
            description: fDescription.trim() ? fDescription.trim() : null,
            updated_by: uid,
          } as any)
          .eq("id", editing.id)
          .eq("company_id", companyId)
          .select(
            "id, company_id, code, name, description, parent_id, is_active, is_default, manager_user_id"
          )
          .single();

        if (error) throw error;
        setRows((prev) =>
          prev.map((x) => (x.id === editing.id ? (data as any) : x))
        );
      } else {
        const { data, error } = await supabase
          .from(ccTable)
          .insert({
            company_id: companyId,
            code: fCode.trim() ? fCode.trim() : "",
            name,
            parent_id: fParentId,
            is_active: fIsActive,
            is_default: fIsDefault,
            manager_user_id: fManagerUserId,
            description: fDescription.trim() ? fDescription.trim() : null,
            created_by: uid,
            updated_by: uid,
          } as any)
          .select(
            "id, company_id, code, name, description, parent_id, is_active, is_default, manager_user_id"
          )
          .single();

        if (error) throw error;
        setRows((prev) => [(data as any) as CostCenterRow, ...prev]);
      }

      setOpenEdit(false);
    } catch (e: any) {
      alert(`Error guardando: ${e?.message ?? "Error"}`);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(r: CostCenterRow) {
    if (!companyId || !ccTable) return;
    if (!canEdit) {
      alert("No tienes permisos para activar/desactivar.");
      return;
    }

    // No permitimos desactivar el default
    if (r.is_default && r.is_active) {
      alert("No puedes desactivar el centro por defecto. Define otro default primero.");
      return;
    }

    const next = !r.is_active;
    const before = rows;

    setRows((prev) =>
      prev.map((x) => (x.id === r.id ? { ...x, is_active: next } : x))
    );

    try {
      const uid = await getAuthUserId();
      const { error } = await supabase
        .from(ccTable)
        .update({ is_active: next, updated_by: uid } as any)
        .eq("id", r.id)
        .eq("company_id", companyId);

      if (error) throw error;
    } catch (e: any) {
      setRows(before);
      alert(`Error: ${e?.message ?? "No se pudo actualizar."}`);
    }
  }

  async function setAsDefault(r: CostCenterRow) {
    if (!companyId || !ccTable) return;
    if (!canEdit) {
      alert("No tienes permisos para cambiar default.");
      return;
    }

    if (!r.is_active) {
      alert("Activa el centro antes de marcarlo como default.");
      return;
    }

    const before = rows;
    setRows((prev) => prev.map((x) => ({ ...x, is_default: x.id === r.id })));

    try {
      const uid = await getAuthUserId();

      const { error: e1 } = await supabase
        .from(ccTable)
        .update({ is_default: false, updated_by: uid } as any)
        .eq("company_id", companyId);

      if (e1) throw e1;

      const { error: e2 } = await supabase
        .from(ccTable)
        .update({ is_default: true, updated_by: uid } as any)
        .eq("id", r.id)
        .eq("company_id", companyId);

      if (e2) throw e2;
    } catch (e: any) {
      setRows(before);
      alert(`Error: ${e?.message ?? "No se pudo cambiar default."}`);
    }
  }

  /**
   * =========================
   * Tabla layout pro (grid)
   * =========================
   */
  const gridCols = "grid-cols-[160px_2fr_1.5fr_140px_180px]";
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
              <div className="text-[12px] font-extrabold uppercase text-white/80">
                Configuración contable
              </div>
              <h1 className="mt-1 text-3xl font-black leading-tight">
                Centros de Costos
              </h1>
              <div className="mt-2 text-[13px] text-white/85">
                Define responsables del gasto (áreas, proyectos o unidades internas). Se usarán luego en reglas de imputación y asientos.
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/configuracion/reglas-imputacion"
                className="rounded-2xl bg-white/10 px-4 py-2 text-[12px] font-extrabold ring-1 ring-white/15 hover:bg-white/15 transition"
              >
                Ir a Reglas de imputación
              </Link>

              <button
                onClick={() => companyId && bootstrap(companyId)}
                className="rounded-2xl bg-white/10 px-4 py-2 text-[12px] font-extrabold ring-1 ring-white/15 hover:bg-white/15 transition"
                type="button"
              >
                Refrescar
              </button>

              <button
                onClick={openCreate}
                disabled={!canEdit}
                className={cls(
                  "rounded-2xl px-4 py-2 text-[12px] font-extrabold ring-1 transition",
                  canEdit
                    ? "bg-white text-slate-900 ring-white/15 hover:bg-slate-100"
                    : "bg-white/60 text-slate-600 ring-white/10 opacity-70 cursor-not-allowed"
                )}
                type="button"
                title={!canEdit ? "Solo OWNER/EDITOR" : "Nuevo centro de costos"}
              >
                + Nuevo
              </button>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-7">
          {/* Estado */}

          {/* Filtros */}
          <div className="mt-4 rounded-[26px] bg-white p-5 ring-1 ring-slate-200">
            <div className="text-[12px] font-extrabold uppercase text-slate-600">
              Filtros
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-12">
              <div className="lg:col-span-8">
                <div className="text-[11px] font-extrabold uppercase text-slate-600">
                  Búsqueda
                </div>
                <div className="relative mt-1">
                  <input
                    value={qText}
                    onChange={(e) => setQText(e.target.value)}
                    placeholder="Código, nombre, responsable..."
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
                  <option value="active">Activos</option>
                  <option value="inactive">Inactivos</option>
                </select>
              </div>
            </div>
          </div>

          {/* Tabla */}
          <div className="mt-4 overflow-hidden rounded-[26px] bg-white ring-1 ring-slate-200">
            <div className="overflow-x-auto">
              <div className="min-w-[980px]">
                {/* header */}
                <div
                  className={cls(
                    "grid items-center border-b border-slate-200 bg-slate-50 px-5 py-2.5",
                    gridCols
                  )}
                >
                  <div className={cls(cellBase, "text-[11px] font-extrabold uppercase text-slate-600")}>
                    Código
                  </div>
                  <div className={cls(cellBase, "pl-4 border-l border-slate-200 text-[11px] font-extrabold uppercase text-slate-600")}>
                    Nombre
                  </div>
                  <div className={cls(cellBase, "pl-4 border-l border-slate-200 text-[11px] font-extrabold uppercase text-slate-600")}>
                    Padre
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
                  <div className="px-5 py-14 text-center text-[13px] text-slate-600">
                    Cargando...
                  </div>
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
                  filtered.map((r) => {
                    const code = r.code?.trim() ? r.code.trim() : "—";
                    const isDefault = !!r.is_default;
                    const mgr = managerLabel(r.manager_user_id);

                    return (
                      <div
                        key={r.id}
                        className={cls(
                          "grid items-center px-5 py-2 border-b border-slate-100 hover:bg-slate-50",
                          gridCols
                        )}
                      >
                        <div className={cls(cellBase, "text-[13px] font-black text-slate-900 whitespace-nowrap")}>
                          {code}
                        </div>

                        <div className={cls(cellBase, "pl-4 border-l border-slate-200")}>
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="text-[13px] font-extrabold text-slate-800 truncate">
                              {r.name}
                            </div>
                            {isDefault ? (
                              <span className="inline-flex items-center rounded-full bg-indigo-100 px-2.5 py-1 text-[11px] font-black text-indigo-700 whitespace-nowrap">
                                Default
                              </span>
                            ) : null}
                          </div>

                          {mgr ? (
                            <div className="mt-0.5 text-[12px] text-slate-500 truncate">
                              <span className="font-semibold">Responsable:</span>{" "}
                              {mgr}
                            </div>
                          ) : (
                            <div className="mt-0.5 text-[12px] text-slate-400 truncate">
                              Sin responsable (opcional)
                            </div>
                          )}

                          {r.description ? (
                            <div className="mt-0.5 text-[12px] text-slate-500 truncate">
                              {r.description}
                            </div>
                          ) : null}
                        </div>

                        <div className={cls(cellBase, "pl-4 border-l border-slate-200")}>
                          <div className="text-[13px] font-semibold text-slate-900 truncate">
                            {labelCC(r.parent_id)}
                          </div>
                        </div>

                        <div className={cls(cellBase, "pl-4 border-l border-slate-200")}>
                          <span
                            className={cls(
                              "inline-flex items-center rounded-full px-3 py-1 text-[11px] font-black whitespace-nowrap",
                              r.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700"
                            )}
                          >
                            {r.is_active ? "Activo" : "Inactivo"}
                          </span>
                        </div>

                        <div className={cls(cellBase, "pl-4 border-l border-slate-200")}>
                          <div className="flex justify-end gap-2 flex-wrap">
                            <button
                              type="button"
                              onClick={() => openUpdate(r)}
                              disabled={!canEdit}
                              className={cls(
                                "rounded-2xl border px-3 py-2 text-[12px] font-extrabold whitespace-nowrap",
                                canEdit
                                  ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                                  : "border-slate-200 bg-white text-slate-400 opacity-60 cursor-not-allowed"
                              )}
                              title={!canEdit ? "Solo OWNER/EDITOR" : "Editar"}
                            >
                              Editar
                            </button>

                            <button
                              type="button"
                              onClick={() => setAsDefault(r)}
                              disabled={!canEdit || r.is_default || !r.is_active}
                              className={cls(
                                "rounded-2xl border px-3 py-2 text-[12px] font-extrabold whitespace-nowrap",
                                canEdit && !r.is_default && r.is_active
                                  ? "border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-50"
                                  : "border-slate-200 bg-white text-slate-400 opacity-60 cursor-not-allowed"
                              )}
                              title={
                                r.is_default
                                  ? "Ya es default"
                                  : !r.is_active
                                  ? "Activa el centro para marcarlo como default"
                                  : "Marcar como default"
                              }
                            >
                              Default
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
                              title={r.is_active ? "Desactivar" : "Activar"}
                            >
                              {r.is_active ? "Desactivar" : "Activar"}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="px-5 py-14 text-center text-[13px] text-slate-600">
                    No hay centros de costos para mostrar.
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={openCreate}
                        disabled={!canEdit}
                        className={cls(
                          "rounded-2xl border border-slate-200 bg-white px-4 py-2 text-[12px] font-extrabold text-slate-700 hover:bg-slate-50",
                          !canEdit ? "opacity-60 cursor-not-allowed" : ""
                        )}
                      >
                        Crear el primero
                      </button>
                    </div>
                  </div>
                )}

                <div className="border-t border-slate-200 bg-slate-50 px-5 py-3 text-[12px] text-slate-600">
                  Tip: usa jerarquía para orden real (ej: <b>Operaciones</b> → <b>Mantención</b> → <b>Proyecto X</b>).
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 text-center text-[12px] text-slate-500">
        ConciliaciónPro • Configuración contable
      </div>

      {/* Modal crear/editar */}
      <Modal
        open={openEdit}
        title={editing ? "Editar centro de costos" : "Nuevo centro de costos"}
        onClose={() => setOpenEdit(false)}
        footer={
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
              onClick={save}
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
        {!ccTable ? (
          <div className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-800 ring-1 ring-amber-100">
            No se detectó la tabla <b>cost_centers</b>. Crea la tabla para poder guardar.
          </div>
        ) : null}

        <div className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-700">
          Crea centros para imputar gastos por área, proyecto o responsable.
          Puedes definir un <b>centro por defecto</b> (solo uno por empresa).
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-12">
          <div className="sm:col-span-4">
            <div className="text-xs font-black text-slate-600">Código (opcional)</div>
            <input
              value={fCode}
              onChange={(e) => setFCode(e.target.value)}
              placeholder="Ej: CC-010"
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
              disabled={!canEdit}
            />
            <div className="mt-1 text-xs text-slate-500">
              Si no usas código, queda vacío (pero la tabla exige NOT NULL).
            </div>
          </div>

          <div className="sm:col-span-8">
            <div className="text-xs font-black text-slate-600">Nombre *</div>
            <input
              value={fName}
              onChange={(e) => setFName(e.target.value)}
              placeholder="Ej: Casa Matriz / Operaciones / Proyecto ABC"
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
              disabled={!canEdit}
            />
          </div>

          <div className="sm:col-span-12">
            <div className="text-xs font-black text-slate-600">Centro padre (jerarquía)</div>
            <select
              value={fParentId ?? ""}
              onChange={(e) => setFParentId(e.target.value ? e.target.value : null)}
              disabled={!canEdit}
              className={cls(
                "mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200",
                !canEdit ? "opacity-60 cursor-not-allowed" : ""
              )}
            >
              <option value="">— Sin padre —</option>
              {parentsList
                .filter((p) => (editing ? p.id !== editing.id : true))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {`${p.code ?? ""}${p.code ? " • " : ""}${p.name}`}
                  </option>
                ))}
            </select>
            <div className="mt-1 text-xs text-slate-500">Ej: Operaciones → Mantención.</div>
          </div>

          <div className="sm:col-span-12">
            <div className="text-xs font-black text-slate-600">Responsable (usuario) (opcional)</div>
            <select
              value={fManagerUserId ?? ""}
              onChange={(e) => setFManagerUserId(e.target.value ? e.target.value : null)}
              disabled={!canEdit}
              className={cls(
                "mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200",
                !canEdit ? "opacity-60 cursor-not-allowed" : ""
              )}
            >
              <option value="">— Sin responsable —</option>
              {profiles
                .slice()
                .sort((a, b) => {
                  const an = (a.full_name ?? a.email ?? "").toLowerCase();
                  const bn = (b.full_name ?? b.email ?? "").toLowerCase();
                  return an.localeCompare(bn);
                })
                .map((p) => {
                  const label =
                    (p.full_name ?? "").trim() ||
                    (p.email ?? "").trim() ||
                    `Usuario ${p.id.slice(0, 8)}…`;
                  const sub = p.email ? ` • ${p.email}` : "";
                  return (
                    <option key={p.id} value={p.id}>
                      {label}
                      {sub}
                    </option>
                  );
                })}
            </select>
            <div className="mt-1 text-xs text-slate-500">
              Pro: el responsable apunta a un usuario real (profiles), no texto libre.
            </div>
          </div>

          <div className="sm:col-span-12">
            <div className="text-xs font-black text-slate-600">Descripción (opcional)</div>
            <input
              value={fDescription}
              onChange={(e) => setFDescription(e.target.value)}
              placeholder="Ej: Se usa para gastos generales si no aplica otro centro."
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
              disabled={!canEdit}
            />
          </div>

          <div className="sm:col-span-12 flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2">
              <input
                type="checkbox"
                checked={fIsActive}
                onChange={(e) => setFIsActive(e.target.checked)}
                disabled={!canEdit}
              />
              <span className="text-sm font-semibold text-slate-700">Activo</span>
            </label>

            <label className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2">
              <input
                type="checkbox"
                checked={fIsDefault}
                onChange={(e) => setFIsDefault(e.target.checked)}
                disabled={!canEdit}
              />
              <span className="text-sm font-semibold text-slate-700">
                Centro por defecto (único por empresa)
              </span>
            </label>

            <div className="text-xs text-slate-500">
              Pro: el default sirve como “fallback”, pero luego lo controlas con Reglas de Imputación.
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl bg-slate-50 p-3 text-sm text-slate-700">
          <b>Resumen:</b>{" "}
          {fCode.trim() ? <b>{fCode.trim()}</b> : <span className="text-slate-400">sin código</span>}
          {" • "}
          <b>{fName.trim() || "—"}</b>
          {" • "}
          Padre: <b>{labelCC(fParentId)}</b>
          {" • "}
          {fIsDefault ? <b className="text-indigo-700">Default</b> : "No default"}
        </div>
      </Modal>
    </div>
  );
}

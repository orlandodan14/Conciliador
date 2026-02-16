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

/**
 * Membresía (alineada a RLS)
 */
async function getMyMembershipForCompany(companyId: string): Promise<{
  role: "OWNER" | "EDITOR" | "LECTOR" | null;
  status: string | null;
}> {
  const uid = await getAuthUserId();
  if (!uid) return { role: null, status: null };

  const { data, error } = await supabase
    .from("company_members")
    .select("role, status")
    .eq("company_id", companyId)
    .eq("user_id", uid)
    .maybeSingle();

  if (error) return { role: null, status: null };

  const r = (data?.role ?? null) as any;
  const s = (data?.status ?? null) as any;

  const role =
    r === "OWNER" || r === "EDITOR" || r === "LECTOR" ? (r as any) : null;

  return { role, status: s ? String(s) : null };
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
                Segmentación • Ubicaciones
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
 * Tipos (tabla branches)
 * =========================
 */
type BranchKind = "BRANCH" | "STORE" | "WAREHOUSE" | "DC" | "OFFICE" | "OTHER";

type BranchRow = {
  id: string;
  company_id: string;
  code: string;
  name: string;

  kind: BranchKind;
  parent_id: string | null;

  country_code: string | null;
  region: string | null;
  city: string | null;
  address_line1: string | null;
  address_line2: string | null;
  postal_code: string | null;

  phone: string | null;
  email: string | null;
  manager_user_id: string | null;

  is_active: boolean;
  is_default: boolean;

  timezone: string | null;
  tags: string[] | null;
  notes: string | null;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
};

function isRlsError(e: any) {
  const m = String(e?.message ?? "").toLowerCase();
  return m.includes("row-level security") || m.includes("rls");
}

function kindLabel(k: BranchKind) {
  if (k === "BRANCH") return "Sucursal";
  if (k === "STORE") return "Tienda";
  if (k === "WAREHOUSE") return "Bodega";
  if (k === "DC") return "Centro de distribución";
  if (k === "OFFICE") return "Oficina";
  return "Otro";
}

function normalizeTags(input: string) {
  const parts = input
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

  const uniq = Array.from(new Set(parts.map((x) => x.toLowerCase()))).map(
    (x) => parts.find((p) => p.toLowerCase() === x) ?? x
  );

  return uniq.length ? uniq : null;
}

export default function SucursalesPage() {
  const TABLE = "branches";

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

  // Membresía
  const [role, setRole] = useState<"OWNER" | "EDITOR" | "LECTOR" | null>(null);
  const [membershipStatus, setMembershipStatus] = useState<string | null>(null);

  const isMemberActive = (membershipStatus ?? "").toLowerCase() === "active";
  const canEdit = isMemberActive && (role === "OWNER" || role === "EDITOR");

  useEffect(() => {
    if (!companyId) return;
    getMyMembershipForCompany(companyId).then((m) => {
      setRole(m.role);
      setMembershipStatus(m.status);
    });
  }, [companyId]);

  // Datos
  const [rows, setRows] = useState<BranchRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros
  const [qText, setQText] = useState("");
  const [qActive, setQActive] = useState<"" | "active" | "inactive">("");
  const [qKind, setQKind] = useState<"" | BranchKind>("");

  // Modal
  const [openEdit, setOpenEdit] = useState(false);
  const [editing, setEditing] = useState<BranchRow | null>(null);

  // Form
  const [fCode, setFCode] = useState("");
  const [fName, setFName] = useState("");
  const [fKind, setFKind] = useState<BranchKind>("BRANCH");
  const [fParentId, setFParentId] = useState<string | null>(null);

  const [fCountry, setFCountry] = useState("");
  const [fRegion, setFRegion] = useState("");
  const [fCity, setFCity] = useState("");
  const [fAddr1, setFAddr1] = useState("");
  const [fAddr2, setFAddr2] = useState("");
  const [fPostal, setFPostal] = useState("");

  const [fPhone, setFPhone] = useState("");
  const [fEmail, setFEmail] = useState("");
  const [fManagerUserId, setFManagerUserId] = useState<string | null>(null);

  const [fTimezone, setFTimezone] = useState("");
  const [fTags, setFTags] = useState("");
  const [fNotes, setFNotes] = useState("");

  const [fIsActive, setFIsActive] = useState(true);
  const [fIsDefault, setFIsDefault] = useState(false);

  const [saving, setSaving] = useState(false);

  async function loadProfilesForCompany(cid: string) {
    try {
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
      const { data, error } = await supabase
        .from(TABLE)
        .select(
          [
            "id",
            "company_id",
            "code",
            "name",
            "kind",
            "parent_id",
            "country_code",
            "region",
            "city",
            "address_line1",
            "address_line2",
            "postal_code",
            "phone",
            "email",
            "manager_user_id",
            "is_active",
            "is_default",
            "timezone",
            "tags",
            "notes",
          ].join(",")
        )
        .eq("company_id", cid)
        .order("is_default", { ascending: false })
        .order("code", { ascending: true })
        .order("name", { ascending: true });

      if (error) throw error;

      setRows(((data as any[]) ?? []) as BranchRow[]);
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

  function labelBranch(id: string | null) {
    if (!id) return "— Sin padre —";
    const r = rows.find((x) => x.id === id);
    if (!r) return `Sucursal: ${id.slice(0, 8)}…`;
    const c = r.code ? String(r.code) : "";
    const n = r.name ? String(r.name) : "";
    return c && n ? `${c} • ${n}` : n || c || r.id;
  }

  const parentsList = useMemo(() => {
    return rows.slice().sort((a, b) => {
      const ac = a.code ?? "";
      const bc = b.code ?? "";
      if (ac !== bc) return ac.localeCompare(bc);
      return a.name.localeCompare(b.name);
    });
  }, [rows]);

  const filtered = useMemo(() => {
    const t = qText.trim().toLowerCase();

    return rows
      .filter((r) => {
        if (!qActive) return true;
        return qActive === "active" ? r.is_active : !r.is_active;
      })
      .filter((r) => {
        if (!qKind) return true;
        return r.kind === qKind;
      })
      .filter((r) => {
        if (!t) return true;
        const mgr = managerLabel(r.manager_user_id) ?? "";
        const tags = (r.tags ?? []).join(" ");
        const addr = `${r.country_code ?? ""} ${r.region ?? ""} ${r.city ?? ""} ${r.address_line1 ?? ""}`.trim();
        const hay = `${r.code ?? ""} ${r.name} ${r.kind} ${addr} ${mgr} ${tags} ${r.notes ?? ""}`.toLowerCase();
        return hay.includes(t);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, qText, qActive, qKind, profileById]);

  function openCreate() {
    setEditing(null);

    setFCode("");
    setFName("");
    setFKind("BRANCH");
    setFParentId(null);

    setFCountry("");
    setFRegion("");
    setFCity("");
    setFAddr1("");
    setFAddr2("");
    setFPostal("");

    setFPhone("");
    setFEmail("");
    setFManagerUserId(null);

    setFTimezone("");
    setFTags("");
    setFNotes("");

    setFIsActive(true);
    setFIsDefault(rows.length === 0); // primera como default sugerida

    setOpenEdit(true);
  }

  function openUpdate(r: BranchRow) {
    setEditing(r);

    setFCode(r.code ?? "");
    setFName(r.name ?? "");
    setFKind(r.kind ?? "BRANCH");
    setFParentId(r.parent_id ?? null);

    setFCountry(r.country_code ?? "");
    setFRegion(r.region ?? "");
    setFCity(r.city ?? "");
    setFAddr1(r.address_line1 ?? "");
    setFAddr2(r.address_line2 ?? "");
    setFPostal(r.postal_code ?? "");

    setFPhone(r.phone ?? "");
    setFEmail(r.email ?? "");
    setFManagerUserId(r.manager_user_id ?? null);

    setFTimezone(r.timezone ?? "");
    setFTags((r.tags ?? []).join(", "));
    setFNotes(r.notes ?? "");

    setFIsActive(!!r.is_active);
    setFIsDefault(!!r.is_default);

    setOpenEdit(true);
  }

  async function save() {
    if (!companyId) return;

    if (!canEdit) {
      if (!isMemberActive) {
        alert(
          "No puedes guardar porque tu membresía no está ACTIVE en esta empresa.\n" +
            "Esto lo bloquea RLS (correcto)."
        );
      } else {
        alert("No tienes permisos para editar (solo OWNER/EDITOR).");
      }
      return;
    }

    const code = fCode.trim();
    const name = fName.trim();

    if (!code) return alert("Código es obligatorio.");
    if (!name) return alert("Nombre es obligatorio.");

    setSaving(true);
    try {
      const uid = await getAuthUserId();
      const tags = normalizeTags(fTags);

      // Default único: si marco default, bajo todos los demás
      if (fIsDefault) {
        const { error: e0 } = await supabase
          .from(TABLE)
          .update({ is_default: false, updated_by: uid } as any)
          .eq("company_id", companyId);

        if (e0) throw e0;
      }

      const payload: any = {
        code,
        name,
        kind: fKind,
        parent_id: fParentId,

        country_code: fCountry.trim() ? fCountry.trim() : null,
        region: fRegion.trim() ? fRegion.trim() : null,
        city: fCity.trim() ? fCity.trim() : null,
        address_line1: fAddr1.trim() ? fAddr1.trim() : null,
        address_line2: fAddr2.trim() ? fAddr2.trim() : null,
        postal_code: fPostal.trim() ? fPostal.trim() : null,

        phone: fPhone.trim() ? fPhone.trim() : null,
        email: fEmail.trim() ? fEmail.trim() : null,
        manager_user_id: fManagerUserId,

        timezone: fTimezone.trim() ? fTimezone.trim() : null,
        tags,
        notes: fNotes.trim() ? fNotes.trim() : null,

        is_active: fIsActive,
        is_default: fIsDefault,

        updated_by: uid,
      };

      if (editing) {
        const { data, error } = await supabase
          .from(TABLE)
          .update(payload)
          .eq("id", editing.id)
          .eq("company_id", companyId)
          .select(
            [
              "id",
              "company_id",
              "code",
              "name",
              "kind",
              "parent_id",
              "country_code",
              "region",
              "city",
              "address_line1",
              "address_line2",
              "postal_code",
              "phone",
              "email",
              "manager_user_id",
              "is_active",
              "is_default",
              "timezone",
              "tags",
              "notes",
            ].join(",")
          )
          .single();

        if (error) throw error;

        setRows((prev) =>
          prev.map((x) => (x.id === editing.id ? (data as any) : x))
        );
      } else {
        const { data, error } = await supabase
          .from(TABLE)
          .insert({
            ...payload,
            company_id: companyId,
            created_by: uid,
          } as any)
          .select(
            [
              "id",
              "company_id",
              "code",
              "name",
              "kind",
              "parent_id",
              "country_code",
              "region",
              "city",
              "address_line1",
              "address_line2",
              "postal_code",
              "phone",
              "email",
              "manager_user_id",
              "is_active",
              "is_default",
              "timezone",
              "tags",
              "notes",
            ].join(",")
          )
          .single();

        if (error) throw error;

        setRows((prev) => [((data as any) as BranchRow), ...prev]);
      }

      setOpenEdit(false);
    } catch (e: any) {
      if (isRlsError(e)) {
        alert(
          "Error guardando por seguridad (RLS).\n\n" +
            "Causa típica: tu fila en company_members no está ACTIVE o no eres OWNER/EDITOR.\n\n" +
            `Detalle: ${e?.message ?? "RLS"}`
        );
      } else {
        alert(`Error guardando: ${e?.message ?? "Error"}`);
      }
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(r: BranchRow) {
    if (!companyId) return;
    if (!canEdit) return alert("No tienes permisos.");

    if (r.is_default && r.is_active) {
      return alert("No puedes desactivar el default. Define otro default primero.");
    }

    const next = !r.is_active;
    const before = rows;

    setRows((prev) =>
      prev.map((x) => (x.id === r.id ? { ...x, is_active: next } : x))
    );

    try {
      const uid = await getAuthUserId();
      const { error } = await supabase
        .from(TABLE)
        .update({ is_active: next, updated_by: uid } as any)
        .eq("id", r.id)
        .eq("company_id", companyId);

      if (error) throw error;
    } catch (e: any) {
      setRows(before);
      alert(`Error: ${e?.message ?? "No se pudo actualizar."}`);
    }
  }

  async function setAsDefault(r: BranchRow) {
    if (!companyId) return;
    if (!canEdit) return alert("No tienes permisos.");
    if (!r.is_active) return alert("Activa la sucursal antes de marcarla como default.");

    const before = rows;
    setRows((prev) => prev.map((x) => ({ ...x, is_default: x.id === r.id })));

    try {
      const uid = await getAuthUserId();

      const { error: e1 } = await supabase
        .from(TABLE)
        .update({ is_default: false, updated_by: uid } as any)
        .eq("company_id", companyId);

      if (e1) throw e1;

      const { error: e2 } = await supabase
        .from(TABLE)
        .update({ is_default: true, updated_by: uid } as any)
        .eq("id", r.id)
        .eq("company_id", companyId);

      if (e2) throw e2;
    } catch (e: any) {
      setRows(before);
      alert(`Error: ${e?.message ?? "No se pudo cambiar default."}`);
    }
  }

  const showMembershipWarning =
    companyId &&
    (role === "OWNER" || role === "EDITOR" || role === "LECTOR") &&
    !isMemberActive;

  /**
   * Layout tabla (grid)
   */
  const gridCols = "grid-cols-[130px_2.4fr_1.3fr_1.2fr_140px_220px]";
  const cellBase = "min-w-0";

  function shortLocation(r: BranchRow) {
    const parts = [r.city, r.region, r.country_code].filter(Boolean);
    const addr = r.address_line1 ? `${r.address_line1}` : "";
    const right = parts.length ? parts.join(", ") : "";
    return [addr, right].filter(Boolean).join(" • ");
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
              <div className="text-[12px] font-extrabold uppercase text-white/80">
                Segmentación
              </div>
              <h1 className="mt-1 text-3xl font-black leading-tight">
                Sucursales (Ubicaciones)
              </h1>
              <div className="mt-2 text-[13px] text-white/85">
                Dónde ocurre la operación: <b>ventas</b>, <b>gastos</b>, <b>inventario</b> y{" "}
                <b>responsables</b>. Úsalas en reportes y reglas.
              </div>

              {showMembershipWarning ? (
                <div className="mt-3 inline-flex items-center rounded-2xl bg-rose-500/15 px-3 py-2 text-[12px] font-extrabold ring-1 ring-white/15">
                  ⚠ Tu membresía no está ACTIVE → RLS bloqueará creación/edición.
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/configuracion/segmentacion"
                className="rounded-2xl bg-white/10 px-4 py-2 text-[12px] font-extrabold ring-1 ring-white/15 hover:bg-white/15 transition"
              >
                Volver
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
                title={!canEdit ? "Solo OWNER/EDITOR active" : "Nueva sucursal"}
              >
                + Nuevo
              </button>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-7">
          {/* Filtros */}
          <div className="rounded-[26px] bg-white p-5 ring-1 ring-slate-200">
            <div className="text-[12px] font-extrabold uppercase text-slate-600">
              Filtros
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-12">
              <div className="lg:col-span-7">
                <div className="text-[11px] font-extrabold uppercase text-slate-600">
                  Búsqueda
                </div>
                <div className="relative mt-1">
                  <input
                    value={qText}
                    onChange={(e) => setQText(e.target.value)}
                    placeholder="Código, nombre, ciudad, responsable, tags..."
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
                <div className="text-[11px] font-extrabold uppercase text-slate-600">
                  Tipo
                </div>
                <select
                  value={qKind}
                  onChange={(e) => setQKind(e.target.value as any)}
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-[12px] font-extrabold text-slate-900 outline-none focus:ring-2 focus:ring-slate-200"
                >
                  <option value="">Todos</option>
                  <option value="BRANCH">Sucursal</option>
                  <option value="STORE">Tienda</option>
                  <option value="WAREHOUSE">Bodega</option>
                  <option value="DC">Centro de distribución</option>
                  <option value="OFFICE">Oficina</option>
                  <option value="OTHER">Otro</option>
                </select>
              </div>

              <div className="lg:col-span-2">
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
              <div className="min-w-[1120px]">
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
                    Nombre / Ubicación
                  </div>
                  <div className={cls(cellBase, "pl-4 border-l border-slate-200 text-[11px] font-extrabold uppercase text-slate-600")}>
                    Padre
                  </div>
                  <div className={cls(cellBase, "pl-4 border-l border-slate-200 text-[11px] font-extrabold uppercase text-slate-600")}>
                    Tipo
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
                    const isDefault = !!r.is_default;
                    const mgr = managerLabel(r.manager_user_id);
                    const tags = (r.tags ?? []).slice(0, 3);
                    const moreTags = (r.tags ?? []).length - tags.length;

                    return (
                      <div
                        key={r.id}
                        className={cls(
                          "grid items-center px-5 py-2 border-b border-slate-100 hover:bg-slate-50",
                          gridCols
                        )}
                      >
                        <div className={cls(cellBase, "text-[13px] font-black text-slate-900 whitespace-nowrap")}>
                          {r.code?.trim() ? r.code.trim() : "—"}
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

                          <div className="mt-0.5 text-[12px] text-slate-500 truncate">
                            {shortLocation(r) || "Sin dirección (opcional)"}
                          </div>

                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            {tags.map((t) => (
                              <span
                                key={t}
                                className="rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-slate-700 ring-1 ring-slate-200"
                              >
                                #{t}
                              </span>
                            ))}
                            {moreTags > 0 ? (
                              <span className="text-[11px] font-black text-slate-500">
                                +{moreTags}
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
                        </div>

                        <div className={cls(cellBase, "pl-4 border-l border-slate-200")}>
                          <div className="text-[13px] font-semibold text-slate-900 truncate">
                            {labelBranch(r.parent_id)}
                          </div>
                        </div>

                        <div className={cls(cellBase, "pl-4 border-l border-slate-200")}>
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black text-slate-700 whitespace-nowrap">
                            {kindLabel(r.kind)}
                          </span>
                        </div>

                        <div className={cls(cellBase, "pl-4 border-l border-slate-200")}>
                          <span
                            className={cls(
                              "inline-flex items-center rounded-full px-3 py-1 text-[11px] font-black whitespace-nowrap",
                              r.is_active
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-slate-200 text-slate-700"
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
                    No hay sucursales para mostrar.
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
                        Crear la primera
                      </button>
                    </div>
                  </div>
                )}

                <div className="border-t border-slate-200 bg-slate-50 px-5 py-3 text-[12px] text-slate-600">
                  Tip: define un <b>Default</b> para que ventas/gastos tengan ubicación si el usuario no elige.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 text-center text-[12px] text-slate-500">
        ConciliaciónPro • Segmentación
      </div>

      {/* Modal crear/editar */}
      <Modal
        open={openEdit}
        title={editing ? "Editar sucursal" : "Nueva sucursal"}
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
              title={!canEdit ? "Solo OWNER/EDITOR active" : "Guardar"}
            >
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        }
      >
        {showMembershipWarning ? (
          <div className="mb-3 rounded-2xl bg-rose-50 p-3 text-sm text-rose-800 ring-1 ring-rose-100">
            RLS bloqueará guardado: tu usuario no está <b>ACTIVE</b> en{" "}
            <b>company_members</b>.
          </div>
        ) : null}

        <div className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-700">
          Define <b>la ubicación</b> donde ocurren ventas/gastos. Ej:{" "}
          <b>Santiago - Ñuñoa</b>, <b>DC Central</b>, <b>Bodega Norte</b>.
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-12">
          <div className="sm:col-span-4">
            <div className="text-xs font-black text-slate-600">Código *</div>
            <input
              value={fCode}
              onChange={(e) => setFCode(e.target.value)}
              placeholder="Ej: SCL-001"
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
              disabled={!canEdit}
            />
          </div>

          <div className="sm:col-span-8">
            <div className="text-xs font-black text-slate-600">Nombre *</div>
            <input
              value={fName}
              onChange={(e) => setFName(e.target.value)}
              placeholder="Ej: Sucursal Ñuñoa"
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
              disabled={!canEdit}
            />
          </div>

          <div className="sm:col-span-6">
            <div className="text-xs font-black text-slate-600">Tipo</div>
            <select
              value={fKind}
              onChange={(e) => setFKind(e.target.value as any)}
              disabled={!canEdit}
              className={cls(
                "mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200",
                !canEdit ? "opacity-60 cursor-not-allowed" : ""
              )}
            >
              <option value="BRANCH">Sucursal</option>
              <option value="STORE">Tienda</option>
              <option value="WAREHOUSE">Bodega</option>
              <option value="DC">Centro de distribución</option>
              <option value="OFFICE">Oficina</option>
              <option value="OTHER">Otro</option>
            </select>
          </div>

          <div className="sm:col-span-6">
            <div className="text-xs font-black text-slate-600">
              Padre (jerarquía)
            </div>
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
          </div>

          {/* Dirección */}
          <div className="sm:col-span-4">
            <div className="text-xs font-black text-slate-600">País</div>
            <input
              value={fCountry}
              onChange={(e) => setFCountry(e.target.value)}
              placeholder="Ej: CL"
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
              disabled={!canEdit}
            />
          </div>
          <div className="sm:col-span-4">
            <div className="text-xs font-black text-slate-600">Región</div>
            <input
              value={fRegion}
              onChange={(e) => setFRegion(e.target.value)}
              placeholder="Ej: Metropolitana"
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
              disabled={!canEdit}
            />
          </div>
          <div className="sm:col-span-4">
            <div className="text-xs font-black text-slate-600">Ciudad</div>
            <input
              value={fCity}
              onChange={(e) => setFCity(e.target.value)}
              placeholder="Ej: Santiago"
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
              disabled={!canEdit}
            />
          </div>

          <div className="sm:col-span-8">
            <div className="text-xs font-black text-slate-600">Dirección</div>
            <input
              value={fAddr1}
              onChange={(e) => setFAddr1(e.target.value)}
              placeholder="Ej: Av. Irarrázaval 1234"
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
              disabled={!canEdit}
            />
          </div>
          <div className="sm:col-span-4">
            <div className="text-xs font-black text-slate-600">Código postal</div>
            <input
              value={fPostal}
              onChange={(e) => setFPostal(e.target.value)}
              placeholder="Ej: 7750000"
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
              disabled={!canEdit}
            />
          </div>

          <div className="sm:col-span-12">
            <div className="text-xs font-black text-slate-600">
              Dirección (detalle)
            </div>
            <input
              value={fAddr2}
              onChange={(e) => setFAddr2(e.target.value)}
              placeholder="Ej: Piso 3, Oficina 301"
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
              disabled={!canEdit}
            />
          </div>

          {/* Contacto */}
          <div className="sm:col-span-6">
            <div className="text-xs font-black text-slate-600">Teléfono</div>
            <input
              value={fPhone}
              onChange={(e) => setFPhone(e.target.value)}
              placeholder="Ej: +56 9 1234 5678"
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
              disabled={!canEdit}
            />
          </div>
          <div className="sm:col-span-6">
            <div className="text-xs font-black text-slate-600">Email</div>
            <input
              value={fEmail}
              onChange={(e) => setFEmail(e.target.value)}
              placeholder="Ej: nunoa@empresa.com"
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
              disabled={!canEdit}
            />
          </div>

          <div className="sm:col-span-12">
            <div className="text-xs font-black text-slate-600">
              Responsable (opcional)
            </div>
            <select
              value={fManagerUserId ?? ""}
              onChange={(e) =>
                setFManagerUserId(e.target.value ? e.target.value : null)
              }
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
                  return (
                    <option key={p.id} value={p.id}>
                      {label}
                    </option>
                  );
                })}
            </select>
          </div>

          <div className="sm:col-span-6">
            <div className="text-xs font-black text-slate-600">Timezone</div>
            <input
              value={fTimezone}
              onChange={(e) => setFTimezone(e.target.value)}
              placeholder="Ej: America/Santiago"
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
              disabled={!canEdit}
            />
          </div>

          <div className="sm:col-span-6">
            <div className="text-xs font-black text-slate-600">Tags</div>
            <input
              value={fTags}
              onChange={(e) => setFTags(e.target.value)}
              placeholder="Ej: retail, norte, bodega"
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
              disabled={!canEdit}
            />
          </div>

          <div className="sm:col-span-12">
            <div className="text-xs font-black text-slate-600">Notas</div>
            <input
              value={fNotes}
              onChange={(e) => setFNotes(e.target.value)}
              placeholder="Ej: Punto de venta principal / DC para despacho e-commerce."
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
                Default (único)
              </span>
            </label>
          </div>
        </div>
      </Modal>
    </div>
  );
}

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
  if (status !== "active") return null;

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
                Inventario • Catálogo
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
type ItemType = "PRODUCT" | "SERVICE";

type ItemRow = {
  id: string;
  company_id: string;
  sku: string;
  name: string;
  description: string | null;

  item_type: ItemType;
  category_id: string | null;

  unit: string;
  barcode: string | null;

  price_sale: number;
  price_cost: number;
  currency_code: string | null;

  tax_id: string | null;
  tax_exempt: boolean;

  track_inventory: boolean;
  is_active: boolean;

  tags: string[] | null;
  notes: string | null;
};

type CategoryRow = {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
};

type TaxRow = {
  id: string;
  code: string | null;
  name: string | null;
};

function formatNumber(n: number) {
  try {
    return n.toLocaleString("es-CL", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  } catch {
    return String(n);
  }
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

function itemTypeLabel(t: ItemType) {
  return t === "PRODUCT" ? "Producto" : "Servicio";
}

export default function ArticulosPage() {
  const ITEMS_TABLE = "items";
  const CATS_TABLE = "item_categories";
  const TAXES_TABLE = "taxes"; // si no existe o RLS bloquea, solo se oculta

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

  // permisos
  const [role, setRole] = useState<"OWNER" | "EDITOR" | "LECTOR" | null>(null);
  const canEdit = role === "OWNER" || role === "EDITOR";

  useEffect(() => {
    if (!companyId) return;
    getMyRoleForCompany(companyId).then(setRole);
  }, [companyId]);

  // data
  const [items, setItems] = useState<ItemRow[]>([]);
  const [cats, setCats] = useState<CategoryRow[]>([]);
  const [taxes, setTaxes] = useState<TaxRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // filtros
  const [qText, setQText] = useState("");
  const [qType, setQType] = useState<"" | ItemType>("");
  const [qActive, setQActive] = useState<"" | "active" | "inactive">("");
  const [qCat, setQCat] = useState<string>("");

  // modal
  const [openEdit, setOpenEdit] = useState(false);
  const [editing, setEditing] = useState<ItemRow | null>(null);
  const [saving, setSaving] = useState(false);

  // form
  const [fSku, setFSku] = useState("");
  const [fName, setFName] = useState("");
  const [fDesc, setFDesc] = useState("");
  const [fType, setFType] = useState<ItemType>("PRODUCT");
  const [fCatId, setFCatId] = useState<string | null>(null);

  const [fUnit, setFUnit] = useState("UN");
  const [fBarcode, setFBarcode] = useState("");

  const [fPriceSale, setFPriceSale] = useState<string>("0");
  const [fPriceCost, setFPriceCost] = useState<string>("0");
  const [fCurrency, setFCurrency] = useState<string>("");

  const [fTaxExempt, setFTaxExempt] = useState(false);
  const [fTaxId, setFTaxId] = useState<string | null>(null);

  const [fTrackInv, setFTrackInv] = useState(false);
  const [fIsActive, setFIsActive] = useState(true);

  const [fTags, setFTags] = useState("");
  const [fNotes, setFNotes] = useState("");

  function toNum(v: string) {
    const x = Number(String(v).replace(",", "."));
    return Number.isFinite(x) ? x : 0;
  }

  async function bootstrap(cid: string) {
    setLoading(true);
    setError(null);

    try {
      // categorías (opcionales)
      const c1 = await supabase
        .from(CATS_TABLE)
        .select("id, code, name, is_active")
        .eq("company_id", cid)
        .order("code", { ascending: true });

      if (!c1.error) setCats(((c1.data as any[]) ?? []) as CategoryRow[]);
      else setCats([]);

      // taxes (opcionales)
      const t1 = await supabase
        .from(TAXES_TABLE)
        .select("id, code, name")
        .eq("company_id", cid)
        .eq("is_active", true)
        .order("code", { ascending: true });

      if (!t1.error) setTaxes(((t1.data as any[]) ?? []) as TaxRow[]);
      else setTaxes([]);

      // items
      const { data, error } = await supabase
        .from(ITEMS_TABLE)
        .select(
          [
            "id",
            "company_id",
            "sku",
            "name",
            "description",
            "item_type",
            "category_id",
            "unit",
            "barcode",
            "price_sale",
            "price_cost",
            "currency_code",
            "tax_id",
            "tax_exempt",
            "track_inventory",
            "is_active",
            "tags",
            "notes",
          ].join(",")
        )
        .eq("company_id", cid)
        .order("is_active", { ascending: false })
        .order("sku", { ascending: true });

      if (error) throw error;

      setItems(((data as any[]) ?? []) as ItemRow[]);
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

  const catById = useMemo(() => {
    const m = new Map<string, CategoryRow>();
    cats.forEach((c) => m.set(c.id, c));
    return m;
  }, [cats]);

  const taxById = useMemo(() => {
    const m = new Map<string, TaxRow>();
    taxes.forEach((t) => m.set(t.id, t));
    return m;
  }, [taxes]);

  function catLabel(id: string | null) {
    if (!id) return "—";
    const c = catById.get(id);
    if (!c) return `Cat: ${id.slice(0, 8)}…`;
    return `${c.code} • ${c.name}`;
  }

  function taxLabel(id: string | null, exempt: boolean) {
    if (exempt) return "Exento";
    if (!id) return "—";
    const t = taxById.get(id);
    if (!t) return `Tax: ${id.slice(0, 8)}…`;
    const code = (t.code ?? "").trim();
    const name = (t.name ?? "").trim();
    return code && name ? `${code} • ${name}` : name || code || t.id;
  }

  const filtered = useMemo(() => {
    const t = qText.trim().toLowerCase();

    return items
      .filter((r) => (qType ? r.item_type === qType : true))
      .filter((r) => {
        if (!qActive) return true;
        return qActive === "active" ? r.is_active : !r.is_active;
      })
      .filter((r) => (qCat ? (r.category_id ?? "") === qCat : true))
      .filter((r) => {
        if (!t) return true;
        const tags = (r.tags ?? []).join(" ");
        const hay = `${r.sku} ${r.name} ${r.description ?? ""} ${r.unit ?? ""} ${r.barcode ?? ""} ${tags} ${r.notes ?? ""}`.toLowerCase();
        return hay.includes(t);
      });
  }, [items, qText, qType, qActive, qCat]);

  function openCreate() {
    setEditing(null);

    setFSku("");
    setFName("");
    setFDesc("");
    setFType("PRODUCT");
    setFCatId(null);

    setFUnit("UN");
    setFBarcode("");

    setFPriceSale("0");
    setFPriceCost("0");
    setFCurrency("");

    setFTaxExempt(false);
    setFTaxId(null);

    setFTrackInv(false);
    setFIsActive(true);

    setFTags("");
    setFNotes("");

    setOpenEdit(true);
  }

  function openUpdate(r: ItemRow) {
    setEditing(r);

    setFSku(r.sku ?? "");
    setFName(r.name ?? "");
    setFDesc(r.description ?? "");
    setFType(r.item_type ?? "PRODUCT");
    setFCatId(r.category_id ?? null);

    setFUnit(r.unit ?? "UN");
    setFBarcode(r.barcode ?? "");

    setFPriceSale(String(r.price_sale ?? 0));
    setFPriceCost(String(r.price_cost ?? 0));
    setFCurrency(r.currency_code ?? "");

    setFTaxExempt(!!r.tax_exempt);
    setFTaxId(r.tax_id ?? null);

    setFTrackInv(!!r.track_inventory);
    setFIsActive(!!r.is_active);

    setFTags((r.tags ?? []).join(", "));
    setFNotes(r.notes ?? "");

    setOpenEdit(true);
  }

  async function save() {
    if (!companyId) return;
    if (!canEdit) return alert("No tienes permisos (solo OWNER/EDITOR).");

    const sku = fSku.trim();
    const name = fName.trim();
    if (!sku) return alert("SKU/Código es obligatorio.");
    if (!name) return alert("Nombre es obligatorio.");

    const priceSale = Math.max(0, toNum(fPriceSale));
    const priceCost = Math.max(0, toNum(fPriceCost));
    const tags = normalizeTags(fTags);

    setSaving(true);
    try {
      const uid = await getAuthUserId();

      const payload: any = {
        sku,
        name,
        description: fDesc.trim() ? fDesc.trim() : null,
        item_type: fType,
        category_id: fCatId,

        unit: fUnit.trim() ? fUnit.trim() : "UN",
        barcode: fBarcode.trim() ? fBarcode.trim() : null,

        price_sale: priceSale,
        price_cost: priceCost,
        currency_code: fCurrency.trim() ? fCurrency.trim() : null,

        tax_exempt: fTaxExempt,
        tax_id: fTaxExempt ? null : fTaxId,

        track_inventory: fTrackInv,
        is_active: fIsActive,

        tags,
        notes: fNotes.trim() ? fNotes.trim() : null,

        updated_by: uid,
      };

      if (editing) {
        const { data, error } = await supabase
          .from(ITEMS_TABLE)
          .update(payload)
          .eq("id", editing.id)
          .eq("company_id", companyId)
          .select(
            [
              "id",
              "company_id",
              "sku",
              "name",
              "description",
              "item_type",
              "category_id",
              "unit",
              "barcode",
              "price_sale",
              "price_cost",
              "currency_code",
              "tax_id",
              "tax_exempt",
              "track_inventory",
              "is_active",
              "tags",
              "notes",
            ].join(",")
          )
          .single();

        if (error) throw error;

        setItems((prev) => prev.map((x) => (x.id === editing.id ? (data as any) : x)));
      } else {
        const { data, error } = await supabase
          .from(ITEMS_TABLE)
          .insert({
            ...payload,
            company_id: companyId,
            created_by: uid,
          } as any)
          .select(
            [
              "id",
              "company_id",
              "sku",
              "name",
              "description",
              "item_type",
              "category_id",
              "unit",
              "barcode",
              "price_sale",
              "price_cost",
              "currency_code",
              "tax_id",
              "tax_exempt",
              "track_inventory",
              "is_active",
              "tags",
              "notes",
            ].join(",")
          )
          .single();

        if (error) throw error;

        setItems((prev) => [((data as any) as ItemRow), ...prev]);
      }

      setOpenEdit(false);
    } catch (e: any) {
      alert(`Error guardando: ${e?.message ?? "Error"}`);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(r: ItemRow) {
    if (!companyId) return;
    if (!canEdit) return alert("No tienes permisos.");

    const next = !r.is_active;
    const before = items;

    setItems((prev) => prev.map((x) => (x.id === r.id ? { ...x, is_active: next } : x)));

    try {
      const uid = await getAuthUserId();
      const { error } = await supabase
        .from(ITEMS_TABLE)
        .update({ is_active: next, updated_by: uid } as any)
        .eq("id", r.id)
        .eq("company_id", companyId);

      if (error) throw error;
    } catch (e: any) {
      setItems(before);
      alert(`Error: ${e?.message ?? "No se pudo actualizar."}`);
    }
  }

  /**
   * Tabla pro (grid)
   */
  const gridCols = "grid-cols-[140px_2.2fr_160px_160px_200px_120px_220px]";
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
                Inventario
              </div>
              <h1 className="mt-1 text-3xl font-black leading-tight">Artículos</h1>
              <div className="mt-2 text-[13px] text-white/85">
                Catálogo de <b>productos</b> y <b>servicios</b>. Base para ventas, compras e inventario.
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/configuracion"
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
                title={!canEdit ? "Solo OWNER/EDITOR" : "Nuevo artículo"}
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
              <div className="lg:col-span-6">
                <div className="text-[11px] font-extrabold uppercase text-slate-600">
                  Búsqueda
                </div>
                <div className="relative mt-1">
                  <input
                    value={qText}
                    onChange={(e) => setQText(e.target.value)}
                    placeholder="SKU, nombre, barcode, tags..."
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

              <div className="lg:col-span-2">
                <div className="text-[11px] font-extrabold uppercase text-slate-600">
                  Tipo
                </div>
                <select
                  value={qType}
                  onChange={(e) => setQType(e.target.value as any)}
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-[12px] font-extrabold text-slate-900 outline-none focus:ring-2 focus:ring-slate-200"
                >
                  <option value="">Todos</option>
                  <option value="PRODUCT">Producto</option>
                  <option value="SERVICE">Servicio</option>
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

              <div className="lg:col-span-2">
                <div className="text-[11px] font-extrabold uppercase text-slate-600">
                  Categoría
                </div>
                <select
                  value={qCat}
                  onChange={(e) => setQCat(e.target.value)}
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-[12px] font-extrabold text-slate-900 outline-none focus:ring-2 focus:ring-slate-200"
                >
                  <option value="">Todas</option>
                  {cats.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} • {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Tabla */}
          <div className="mt-4 overflow-hidden rounded-[26px] bg-white ring-1 ring-slate-200">
            <div className="overflow-x-auto">
              <div className="min-w-[1150px]">
                {/* header */}
                <div className={cls("grid items-center border-b border-slate-200 bg-slate-50 px-5 py-2.5", gridCols)}>
                  <div className={cls(cellBase, "text-[11px] font-extrabold uppercase text-slate-600")}>SKU</div>
                  <div className={cls(cellBase, "pl-4 border-l border-slate-200 text-[11px] font-extrabold uppercase text-slate-600")}>Artículo</div>
                  <div className={cls(cellBase, "pl-4 border-l border-slate-200 text-[11px] font-extrabold uppercase text-slate-600")}>Tipo</div>
                  <div className={cls(cellBase, "pl-4 border-l border-slate-200 text-[11px] font-extrabold uppercase text-slate-600")}>Categoría</div>
                  <div className={cls(cellBase, "pl-4 border-l border-slate-200 text-[11px] font-extrabold uppercase text-slate-600")}>Precio venta</div>
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
                        onClick={() => companyId && bootstrap(companyId)}
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-[12px] font-extrabold text-slate-700 hover:bg-slate-50"
                      >
                        Reintentar
                      </button>
                    </div>
                  </div>
                ) : filtered.length ? (
                  filtered.map((r) => {
                    const tags = (r.tags ?? []).slice(0, 3);
                    const moreTags = (r.tags ?? []).length - tags.length;

                    return (
                      <div key={r.id} className={cls("grid items-center px-5 py-2 border-b border-slate-100 hover:bg-slate-50", gridCols)}>
                        <div className={cls(cellBase, "text-[13px] font-black text-slate-900 whitespace-nowrap")}>
                          {r.sku}
                        </div>

                        <div className={cls(cellBase, "pl-4 border-l border-slate-200")}>
                          <div className="text-[13px] font-extrabold text-slate-800 truncate">
                            {r.name}
                          </div>
                          <div className="mt-0.5 text-[12px] text-slate-500 truncate">
                            {r.unit ? `Unidad: ${r.unit}` : "Unidad: —"}
                            {r.barcode ? ` • Barcode: ${r.barcode}` : ""}
                            {r.tax_exempt || r.tax_id ? ` • Impuesto: ${taxLabel(r.tax_id, r.tax_exempt)}` : ""}
                          </div>

                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            {tags.map((t) => (
                              <span key={t} className="rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-slate-700 ring-1 ring-slate-200">
                                #{t}
                              </span>
                            ))}
                            {moreTags > 0 ? (
                              <span className="text-[11px] font-black text-slate-500">+{moreTags}</span>
                            ) : null}
                          </div>

                          {r.description ? (
                            <div className="mt-0.5 text-[12px] text-slate-500 truncate">{r.description}</div>
                          ) : null}
                        </div>

                        <div className={cls(cellBase, "pl-4 border-l border-slate-200")}>
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black text-slate-700 whitespace-nowrap">
                            {itemTypeLabel(r.item_type)}
                          </span>
                          {r.track_inventory ? (
                            <div className="mt-1 text-[12px] text-indigo-700 font-semibold">
                              Control inventario
                            </div>
                          ) : (
                            <div className="mt-1 text-[12px] text-slate-400">Sin inventario</div>
                          )}
                        </div>

                        <div className={cls(cellBase, "pl-4 border-l border-slate-200")}>
                          <div className="text-[13px] font-semibold text-slate-900 truncate">
                            {catLabel(r.category_id)}
                          </div>
                        </div>

                        <div className={cls(cellBase, "pl-4 border-l border-slate-200")}>
                          <div className="text-[13px] font-black text-slate-900">
                            {formatNumber(Number(r.price_sale ?? 0))}
                          </div>
                          <div className="text-[12px] text-slate-500">
                            Costo: {formatNumber(Number(r.price_cost ?? 0))}
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
                    );
                  })
                ) : (
                  <div className="px-5 py-14 text-center text-[13px] text-slate-600">
                    No hay artículos para mostrar.
                  </div>
                )}

                <div className="border-t border-slate-200 bg-slate-50 px-5 py-3 text-[12px] text-slate-600">
                  Tip: para servicios usa <b>tipo Servicio</b> y desactiva control de inventario.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 text-center text-[12px] text-slate-500">
        ConciliaciónPro • Inventario
      </div>

      {/* Modal */}
      <Modal
        open={openEdit}
        title={editing ? `Editar artículo • ${editing.sku}` : "Nuevo artículo"}
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
        <div className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-700">
          Artículos = base para <b>ventas</b>, <b>compras</b> e <b>inventario</b>.
          Mantén el <b>SKU</b> estable.
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-12">
          <div className="sm:col-span-4">
            <div className="text-xs font-black text-slate-600">SKU / Código *</div>
            <input
              value={fSku}
              onChange={(e) => setFSku(e.target.value)}
              placeholder="Ej: PROD-0001"
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
              disabled={!canEdit}
            />
          </div>

          <div className="sm:col-span-8">
            <div className="text-xs font-black text-slate-600">Nombre *</div>
            <input
              value={fName}
              onChange={(e) => setFName(e.target.value)}
              placeholder="Ej: Suscripción mensual"
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
              disabled={!canEdit}
            />
          </div>

          <div className="sm:col-span-12">
            <div className="text-xs font-black text-slate-600">Descripción</div>
            <input
              value={fDesc}
              onChange={(e) => setFDesc(e.target.value)}
              placeholder="Detalle opcional"
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
              disabled={!canEdit}
            />
          </div>

          <div className="sm:col-span-4">
            <div className="text-xs font-black text-slate-600">Tipo</div>
            <select
              value={fType}
              onChange={(e) => setFType(e.target.value as any)}
              disabled={!canEdit}
              className={cls(
                "mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200",
                !canEdit ? "opacity-60 cursor-not-allowed" : ""
              )}
            >
              <option value="PRODUCT">Producto</option>
              <option value="SERVICE">Servicio</option>
            </select>
          </div>

          <div className="sm:col-span-4">
            <div className="text-xs font-black text-slate-600">Categoría</div>
            <select
              value={fCatId ?? ""}
              onChange={(e) => setFCatId(e.target.value ? e.target.value : null)}
              disabled={!canEdit}
              className={cls(
                "mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200",
                !canEdit ? "opacity-60 cursor-not-allowed" : ""
              )}
            >
              <option value="">— Sin categoría —</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} • {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-4">
            <div className="text-xs font-black text-slate-600">Unidad</div>
            <input
              value={fUnit}
              onChange={(e) => setFUnit(e.target.value)}
              placeholder="Ej: UN, KG, HR"
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
              disabled={!canEdit}
            />
          </div>

          <div className="sm:col-span-6">
            <div className="text-xs font-black text-slate-600">Barcode</div>
            <input
              value={fBarcode}
              onChange={(e) => setFBarcode(e.target.value)}
              placeholder="Opcional"
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
              disabled={!canEdit}
            />
          </div>

          <div className="sm:col-span-3">
            <div className="text-xs font-black text-slate-600">Precio venta</div>
            <input
              value={fPriceSale}
              onChange={(e) => setFPriceSale(e.target.value)}
              inputMode="decimal"
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
              disabled={!canEdit}
            />
          </div>

          <div className="sm:col-span-3">
            <div className="text-xs font-black text-slate-600">Costo</div>
            <input
              value={fPriceCost}
              onChange={(e) => setFPriceCost(e.target.value)}
              inputMode="decimal"
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
              disabled={!canEdit}
            />
          </div>

          <div className="sm:col-span-6">
            <div className="text-xs font-black text-slate-600">Moneda (opcional)</div>
            <input
              value={fCurrency}
              onChange={(e) => setFCurrency(e.target.value)}
              placeholder="Ej: CLP, USD"
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
              disabled={!canEdit}
            />
          </div>

          <div className="sm:col-span-6">
            <div className="text-xs font-black text-slate-600">Impuesto</div>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2">
                <input
                  type="checkbox"
                  checked={fTaxExempt}
                  onChange={(e) => setFTaxExempt(e.target.checked)}
                  disabled={!canEdit}
                />
                <span className="text-sm font-semibold text-slate-700">Exento</span>
              </label>

              <select
                value={fTaxId ?? ""}
                onChange={(e) => setFTaxId(e.target.value ? e.target.value : null)}
                disabled={!canEdit || fTaxExempt}
                className={cls(
                  "min-w-[260px] rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200",
                  (!canEdit || fTaxExempt) ? "opacity-60 cursor-not-allowed" : ""
                )}
              >
                <option value="">— Sin impuesto —</option>
                {taxes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {`${t.code ?? ""}${t.code ? " • " : ""}${t.name ?? t.id}`}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Si marcas exento, el impuesto se ignora.
            </div>
          </div>

          <div className="sm:col-span-12 flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2">
              <input
                type="checkbox"
                checked={fTrackInv}
                onChange={(e) => setFTrackInv(e.target.checked)}
                disabled={!canEdit || fType === "SERVICE"}
              />
              <span className="text-sm font-semibold text-slate-700">
                Control inventario
              </span>
            </label>

            <label className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2">
              <input
                type="checkbox"
                checked={fIsActive}
                onChange={(e) => setFIsActive(e.target.checked)}
                disabled={!canEdit}
              />
              <span className="text-sm font-semibold text-slate-700">Activo</span>
            </label>
          </div>

          <div className="sm:col-span-12">
            <div className="text-xs font-black text-slate-600">Tags</div>
            <input
              value={fTags}
              onChange={(e) => setFTags(e.target.value)}
              placeholder="Ej: plan, mensual, premium"
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
              disabled={!canEdit}
            />
          </div>

          <div className="sm:col-span-12">
            <div className="text-xs font-black text-slate-600">Notas</div>
            <input
              value={fNotes}
              onChange={(e) => setFNotes(e.target.value)}
              placeholder="Opcional"
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
              disabled={!canEdit}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

/* =========================
   Tipos + helpers existentes
========================= */

type Company = {
  id: string;
  name: string;
  fiscal_id: string;
  country: string;
  currency: string;
  created_at: string;
};

const COUNTRY_LABEL: Record<string, string> = {
  CL: "Chile",
  MX: "México",
  ES: "España",
};

/* =========================
   Modal: formulario Empresa
   (reusamos TU página empresa,
   pero ahora embebida en modal)
========================= */

type CountryKey = "CL" | "MX" | "ES";
type CurrencyKey = "CLP" | "MXN" | "EUR" | "USD";

const COUNTRIES: { key: CountryKey; label: string }[] = [
  { key: "CL", label: "Chile" },
  { key: "MX", label: "México" },
  { key: "ES", label: "España" },
];

const CURRENCIES: { key: CurrencyKey; label: string; hint: string }[] = [
  { key: "CLP", label: "CLP — Peso chileno", hint: "Chile" },
  { key: "MXN", label: "MXN — Peso mexicano", hint: "México" },
  { key: "EUR", label: "EUR — Euro", hint: "España" },
  { key: "USD", label: "USD — Dólar", hint: "Opcional" },
];

const REGIONS_BY_COUNTRY: Record<
  CountryKey,
  { label: string; options: string[] }
> = {
  CL: {
    label: "Región",
    options: ["Metropolitana", "Valparaíso", "Biobío", "La Araucanía", "Los Lagos"],
  },
  MX: {
    label: "Estado",
    options: ["CDMX", "Jalisco", "Nuevo León", "Querétaro", "Puebla", "Yucatán"],
  },
  ES: {
    label: "Comunidad Autónoma",
    options: ["Madrid", "Cataluña", "Andalucía", "Valencia", "País Vasco"],
  },
};

const inputCls =
  "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[14px] outline-none focus:ring-4 focus:ring-slate-200 cursor-text";

function Section({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl bg-white ring-1 ring-slate-200 p-5">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-[12px] font-extrabold tracking-wide text-slate-700 uppercase">
            {title}
          </div>
          {subtitle && <div className="mt-1 text-[13px] text-slate-600">{subtitle}</div>}
        </div>
        {right}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 md:grid-cols-2">{children}</div>;
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 text-[12px] font-extrabold tracking-wide text-slate-700 uppercase">
        {label}
      </div>
      {children}
      {hint && <div className="mt-1 text-[12px] text-slate-500">{hint}</div>}
    </div>
  );
}

/** Modal genérico */
function Modal({
  open,
  title,
  subtitle,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[999]">
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      {/* panel */}
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-4xl overflow-hidden rounded-3xl bg-white ring-1 ring-slate-200 shadow-[0_30px_90px_rgba(0,0,0,0.35)]">
          {/* header */}
          <div className="bg-gradient-to-r from-[#0b2b4f] via-[#123b63] to-[#0b2b4f] px-6 py-5 text-white">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-2xl font-black">{title}</div>
                {subtitle ? (
                  <div className="mt-1 text-[13px] text-white/85">{subtitle}</div>
                ) : null}
              </div>

              <button
                type="button"
                onClick={onClose}
                className="h-10 rounded-2xl bg-white/10 px-4 text-[12px] font-extrabold ring-1 ring-white/15 hover:bg-white/15 cursor-pointer"
              >
                ✕ Cerrar
              </button>
            </div>
          </div>

          {/* body */}
          <div className="max-h-[75vh] overflow-auto p-6">{children}</div>
        </div>
      </div>
    </div>
  );
}

/** Form de Empresa para modal (create/edit) */
function EmpresaFormModal({
  mode,
  companyId,
  onSaved,
  onClose,
}: {
  mode: "create" | "edit";
  companyId?: string | null;
  onSaved: () => void;
  onClose: () => void;
}) {
  const isEdit = mode === "edit" && !!companyId;

  // Básico
  const [companyName, setCompanyName] = useState("");
  const [country, setCountry] = useState<CountryKey>("CL");
  const [fiscalId, setFiscalId] = useState("");
  const [contactEmail, setContactEmail] = useState("");

  // Opcional
  const [tradeName, setTradeName] = useState("");
  const [useBillingAddress, setUseBillingAddress] = useState(true);

  // Dirección
  const [region, setRegion] = useState("");
  const [city, setCity] = useState("");
  const [street, setStreet] = useState("");
  const [streetNumber, setStreetNumber] = useState("");
  const [unit, setUnit] = useState("");
  const [postalCode, setPostalCode] = useState("");

  // Moneda
  const [currency, setCurrency] = useState<CurrencyKey>("CLP");

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const regionMeta = useMemo(() => REGIONS_BY_COUNTRY[country], [country]);

  const suggestedCurrency = useMemo<CurrencyKey>(() => {
    if (country === "CL") return "CLP";
    if (country === "MX") return "MXN";
    if (country === "ES") return "EUR";
    return "USD";
  }, [country]);

  // Cargar datos si edit
  useEffect(() => {
    let alive = true;

    const load = async () => {
      setErrorMsg(null);

      if (!isEdit) {
        // reset para create
        setCompanyName("");
        setCountry("CL");
        setFiscalId("");
        setContactEmail("");
        setTradeName("");
        setUseBillingAddress(true);
        setRegion("");
        setCity("");
        setStreet("");
        setStreetNumber("");
        setUnit("");
        setPostalCode("");
        setCurrency("CLP");
        return;
      }

      const { data: s } = await supabase.auth.getSession();
      if (!s.session?.user) {
        setErrorMsg("No hay sesión activa. Inicia sesión.");
        return;
      }

      const { data, error } = await supabase
        .from("companies")
        .select("id,name,country,fiscal_id,contact_email,trade_name,currency,billing_address")
        .eq("id", companyId as string)
        .maybeSingle();

      if (!alive) return;
      if (error || !data) {
        setErrorMsg("No pudimos cargar la empresa para editar.");
        return;
      }

      setCompanyName(data.name ?? "");
      setCountry((data.country as CountryKey) ?? "CL");
      setFiscalId(data.fiscal_id ?? "");
      setContactEmail(data.contact_email ?? "");
      setTradeName(data.trade_name ?? "");
      setCurrency((data.currency as CurrencyKey) ?? "CLP");

      const addr = (data.billing_address as any) || null;
      if (addr) {
        setUseBillingAddress(true);
        setRegion(addr.region ?? "");
        setCity(addr.city ?? "");
        setStreet(addr.street ?? "");
        setStreetNumber(addr.street_number ?? "");
        setUnit(addr.unit ?? "");
        setPostalCode(addr.postal_code ?? "");
      } else {
        setUseBillingAddress(false);
        setRegion("");
        setCity("");
        setStreet("");
        setStreetNumber("");
        setUnit("");
        setPostalCode("");
      }
    };

    load();
    return () => {
      alive = false;
    };
  }, [isEdit, companyId]);

  const canContinue = useMemo(() => {
    if (!companyName.trim()) return false;
    if (!contactEmail.trim()) return false;
    if (!fiscalId.trim()) return false;

    if (useBillingAddress) {
      if (!region.trim()) return false;
      if (!city.trim()) return false;
      if (!street.trim()) return false;
      if (!streetNumber.trim()) return false;
    }
    return true;
  }, [
    companyName,
    contactEmail,
    fiscalId,
    useBillingAddress,
    region,
    city,
    street,
    streetNumber,
  ]);

  const onSave = async () => {
    if (!canContinue || saving) return;

    setSaving(true);
    setErrorMsg(null);

    try {
      const { data: s } = await supabase.auth.getSession();
      const user = s.session?.user;
      if (!user) {
        setErrorMsg("No hay sesión activa. Inicia sesión nuevamente.");
        return;
      }

      const billing_address = useBillingAddress
        ? {
            country,
            region,
            city,
            street,
            street_number: streetNumber,
            unit,
            postal_code: postalCode,
          }
        : null;

      // CREATE (RPC)
      if (!isEdit) {
        const { data: companyIdCreated, error: rpcErr } = await supabase.rpc(
          "create_company_with_owner",
          {
            p_name: companyName.trim(),
            p_country: country,
            p_fiscal_id: fiscalId.trim(),
            p_contact_email: contactEmail.trim(),
            p_trade_name: tradeName.trim() || null,
            p_currency: currency,
            p_billing_address: billing_address,
          }
        );

        if (rpcErr || !companyIdCreated) {
          setErrorMsg(`No se pudo guardar: ${rpcErr?.message ?? "sin mensaje"}`);
          return;
        }

        onSaved();
        onClose();
        return;
      }

      // UPDATE
      const { error: upErr } = await supabase
        .from("companies")
        .update({
          name: companyName.trim(),
          country,
          fiscal_id: fiscalId.trim(),
          contact_email: contactEmail.trim(),
          trade_name: tradeName.trim() || null,
          currency,
          billing_address,
        })
        .eq("id", companyId as string);

      if (upErr) {
        setErrorMsg("No se pudo actualizar la empresa. Revisa RLS/policies.");
        return;
      }

      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {errorMsg ? (
        <div className="rounded-2xl bg-rose-50 p-4 text-[12px] text-rose-900 ring-1 ring-rose-200">
          ⚠️ {errorMsg}
        </div>
      ) : null}

      <Section
        title="Datos principales"
        subtitle="Lo mínimo para empezar. Puedes editarlo después."
      >
        <Grid>
          <Field label="Nombre de la empresa *" hint="Ej: Comunidad Feliz SpA">
            <input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className={inputCls}
              placeholder="Ej: Empresa XYZ S.A."
            />
          </Field>

          <Field label="País *" hint="🔒 Esto fija reglas futuras (impuestos, formatos, regiones).">
            <select
              value={country}
              onChange={(e) => {
                const next = e.target.value as CountryKey;
                setCountry(next);

                // reset address
                setRegion("");
                setCity("");
                setStreet("");
                setStreetNumber("");
                setUnit("");
                setPostalCode("");

                setCurrency(next === country ? currency : suggestedCurrency);
              }}
              className={inputCls}
            >
              {COUNTRIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label={`ID fiscal * (${country === "CL" ? "RUT" : country === "MX" ? "RFC" : "NIF/CIF"})`}
            hint="Se usa en documentos y facturación."
          >
            <input
              value={fiscalId}
              onChange={(e) => setFiscalId(e.target.value)}
              className={inputCls}
              placeholder={
                country === "CL"
                  ? "Ej: 76.123.456-7"
                  : country === "MX"
                  ? "Ej: ABCD010101AAA"
                  : "Ej: B12345678"
              }
            />
          </Field>

          <Field label="Email de contacto *" hint="Para notificaciones importantes.">
            <input
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              className={inputCls}
              placeholder="Ej: finanzas@empresa.com"
              inputMode="email"
              autoComplete="email"
            />
          </Field>

          <Field label="Nombre comercial (opcional)" hint="Ej: 'Empresa XYZ' (marca).">
            <input
              value={tradeName}
              onChange={(e) => setTradeName(e.target.value)}
              className={inputCls}
              placeholder="Ej: Mi Marca"
            />
          </Field>

          <Field label="Moneda de visualización *" hint="En qué moneda se mostrarán montos y reportes.">
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as CurrencyKey)}
              className={inputCls}
            >
              {CURRENCIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
        </Grid>

        <div className="mt-3 rounded-2xl bg-emerald-50 p-4 text-[12px] text-emerald-900 ring-1 ring-emerald-200">
          ✅ Tip: Puedes crear más empresas después (multi-empresa). Cada una será un tenant separado.
        </div>
      </Section>

      <Section
        title="Dirección de facturación (opcional)"
        subtitle="Recomendado si emitirás documentos desde la plataforma."
        right={
          <label className="flex items-center gap-2 text-[12px] font-extrabold text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={useBillingAddress}
              onChange={(e) => setUseBillingAddress(e.target.checked)}
              className="cursor-pointer"
            />
            Quiero registrar dirección ahora
          </label>
        }
      >
        {useBillingAddress ? (
          <div className="space-y-4">
            <Grid>
              <Field label={`${regionMeta.label} *`} hint="Depende del país seleccionado.">
                <select
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  className={inputCls}
                >
                  <option value="">Selecciona…</option>
                  {regionMeta.options.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </Field>

              <Field
                label={country === "CL" ? "Ciudad / Comuna *" : "Ciudad / Municipio *"}
                hint="Puedes escribir directo (MVP)."
              >
                <input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className={inputCls}
                  placeholder="Ej: Las Condes"
                />
              </Field>

              <Field label="Calle / Avenida *" hint="Ej: Av. Apoquindo">
                <input
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  className={inputCls}
                  placeholder="Ej: Av. Apoquindo"
                />
              </Field>

              <Field label="Número *" hint="Permite letras: 123B">
                <input
                  value={streetNumber}
                  onChange={(e) => setStreetNumber(e.target.value)}
                  className={inputCls}
                  placeholder="Ej: 4501"
                />
              </Field>

              <Field label="Departamento / Oficina / Interior (opcional)" hint="Ej: Of. 1203">
                <input
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className={inputCls}
                  placeholder="Ej: Of. 1203"
                />
              </Field>

              <Field label="Código postal (opcional)" hint="Depende del país">
                <input
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  className={inputCls}
                  placeholder="Ej: 7550000"
                />
              </Field>
            </Grid>

            <div className="rounded-2xl bg-amber-50 p-4 text-[12px] text-amber-900 ring-1 ring-amber-200">
              ℹ️ Modo MVP: estos campos son simples. Luego agregamos autocompletado y catálogos por país.
            </div>
          </div>
        ) : (
          <div className="rounded-2xl bg-slate-50 p-4 text-[13px] text-slate-700 ring-1 ring-slate-200">
            Sin problema. Puedes agregar la dirección después.
          </div>
        )}
      </Section>

      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="text-[12px] text-slate-500">* Campos obligatorios. Te tomará menos de 2 minutos.</div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-11 rounded-2xl bg-white ring-1 ring-slate-200 px-4 text-slate-900 font-extrabold text-[14px] hover:bg-slate-50 cursor-pointer"
          >
            Cancelar
          </button>

          <button
            type="button"
            disabled={!canContinue || saving}
            onClick={onSave}
            className={[
              "h-11 rounded-2xl px-4 text-[14px] font-extrabold transition",
              canContinue && !saving
                ? "bg-[#123b63] text-white hover:opacity-95 cursor-pointer"
                : "bg-slate-200 text-slate-500 cursor-not-allowed",
            ].join(" ")}
          >
            {saving ? "Guardando..." : isEdit ? "Guardar cambios" : "Guardar empresa"}
          </button>
        </div>
      </div>

      <div className="rounded-2xl bg-[#0b2b4f] p-4 text-[12px] text-white/90">
        <div className="font-extrabold">🔐 Multi-tenant (sin cruce de información)</div>
        <div className="mt-1 text-white/80">
          Todo quedará asociado a esta empresa (tenant). Luego, cada tabla llevará <b>company_id</b> y RLS impedirá ver datos de otra empresa.
        </div>
      </div>
    </div>
  );
}

/* =========================
   Página Resumen (con modal)
========================= */

export default function EmpresaResumenPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Company[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [editingId, setEditingId] = useState<string | null>(null);

  const openCreate = () => {
    setModalMode("create");
    setEditingId(null);
    setModalOpen(true);
  };

  const openEdit = (id: string) => {
    setModalMode("edit");
    setEditingId(id);
    setModalOpen(true);
  };

  const closeModal = () => setModalOpen(false);

  const load = async () => {
    setLoading(true);
    setErrorMsg(null);

    // 1) Si no hay sesión, a login
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      router.push("/login");
      return;
    }

    // 2) Traer empresas (RLS debe filtrar solo las tuyas)
    const { data, error } = await supabase
      .from("companies")
      .select("id,name,fiscal_id,country,currency,created_at")
      .order("created_at", { ascending: false });

    if (error) {
      setErrorMsg(
        `No pudimos cargar tus empresas: ${error.message} (code: ${(error as any).code ?? ""})`
      );
      setItems([]);
    } else {
      setItems((data ?? []) as Company[]);
    }

    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const count = items.length;

  return (
    <div>
      {/* Top */}
      <div className="flex items-center justify-between gap-3">
        <Link href="/onboarding" className="text-[13px] font-bold text-slate-700 hover:underline cursor-pointer">
          ← Volver
        </Link>

        <div className="rounded-2xl bg-white px-3 py-2 text-[12px] font-extrabold ring-1 ring-slate-200">
          Paso 2 de 3 — Empresas
        </div>
      </div>

      {/* Card */}
      <div className="mt-4 overflow-hidden rounded-3xl bg-white ring-1 ring-slate-200 shadow-[0_15px_60px_rgba(15,23,42,0.12)]">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#0b2b4f] via-[#123b63] to-[#0b2b4f] px-6 py-6 text-white">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-2xl bg-white/10 px-3 py-2 text-[12px] font-extrabold ring-1 ring-white/15">
                ✅ Tus empresas
              </div>
              <h1 className="mt-3 text-2xl font-black">Empresas registradas</h1>
              <p className="mt-2 text-[13px] text-white/85">
                Aquí verás todas tus empresas (tenants). Puedes editar, agregar otra o seguir al equipo.
              </p>
            </div>

            <div className="rounded-2xl bg-white/10 px-3 py-2 text-[12px] font-extrabold ring-1 ring-white/15">
              {loading ? "Cargando..." : `${count} empresa(s)`}
            </div>
          </div>

          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-white/15">
            <div className="h-2 w-2/3 rounded-full bg-white" />
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {errorMsg && (
            <div className="rounded-2xl bg-rose-50 p-4 text-[12px] text-rose-900 ring-1 ring-rose-200">
              ⚠️ {errorMsg}
            </div>
          )}

          {/* List */}
          <div className="space-y-3">
            {loading ? (
              <SkeletonList />
            ) : items.length === 0 ? (
              <div className="rounded-3xl bg-slate-50 p-5 ring-1 ring-slate-200">
                <div className="text-[14px] font-black text-slate-900">Aún no tienes empresas</div>
                <div className="mt-1 text-[13px] text-slate-600">
                  Crea tu primera empresa para continuar.
                </div>

                <button
                  onClick={openCreate}
                  className="mt-4 h-11 rounded-2xl bg-[#123b63] px-4 text-white font-extrabold text-[14px] hover:opacity-95 cursor-pointer"
                >
                  + Registrar empresa
                </button>
              </div>
            ) : (
              items.map((c) => (
                <CompanyCard key={c.id} company={c} onEdit={() => openEdit(c.id)} />
              ))
            )}
          </div>

          {/* Actions */}
          <div className="grid gap-2 md:grid-cols-2">
            <button
              type="button"
              onClick={openCreate}
              className="h-12 rounded-2xl bg-white ring-1 ring-slate-200 px-4 text-slate-900 font-extrabold text-[14px] hover:bg-slate-50 cursor-pointer"
            >
              + Agregar otra empresa
            </button>

            <button
              type="button"
              onClick={() => router.push("/onboarding/equipo")}
              className={[
                "h-12 rounded-2xl px-4 text-white font-extrabold text-[14px] transition",
                !loading && items.length === 0
                  ? "bg-slate-300 text-slate-500 cursor-not-allowed"
                  : "bg-[#123b63] hover:opacity-95 cursor-pointer",
              ].join(" ")}
              disabled={!loading && items.length === 0}
              title={!loading && items.length === 0 ? "Registra al menos una empresa para continuar" : ""}
            >
              Seguir al Paso 3: Equipo →
            </button>
          </div>

          <div className="rounded-2xl bg-emerald-50 p-4 text-[12px] text-emerald-900 ring-1 ring-emerald-200">
            🔒 Multi-tenant activo: cada empresa es un espacio separado y no se cruzan datos.
          </div>
        </div>
      </div>

      {/* MODAL */}
      <Modal
        open={modalOpen}
        title={modalMode === "edit" ? "Editar empresa" : "Registrar empresa"}
        subtitle="Esto crea tu “espacio de trabajo” (tenant). Todo quedará asociado a esta empresa."
        onClose={closeModal}
      >
        <EmpresaFormModal
          mode={modalMode}
          companyId={editingId}
          onSaved={load}
          onClose={closeModal}
        />
      </Modal>
    </div>
  );
}

function CompanyCard({
  company,
  onEdit,
}: {
  company: Company;
  onEdit: () => void;
}) {
  const countryLabel = useMemo(
    () => COUNTRY_LABEL[company.country] ?? company.country,
    [company.country]
  );

  return (
    <div className="rounded-3xl bg-slate-50 p-5 ring-1 ring-slate-200">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[12px] font-extrabold tracking-wide text-slate-700 uppercase">
            Empresa
          </div>
          <div className="mt-1 text-[18px] font-black text-slate-900">
            {company.name}
          </div>

          <div className="mt-2 text-[13px] text-slate-700">
            <span className="font-extrabold">ID Fiscal:</span> {company.fiscal_id}
          </div>
          <div className="mt-1 text-[13px] text-slate-700">
            <span className="font-extrabold">País:</span> {countryLabel}
          </div>
          <div className="mt-1 text-[13px] text-slate-700">
            <span className="font-extrabold">Moneda:</span> {company.currency}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="rounded-2xl bg-white px-3 py-2 text-[12px] font-extrabold text-slate-700 ring-1 ring-slate-200">
            Tenant ✅
          </div>

          <button
            type="button"
            onClick={onEdit}
            className="h-9 rounded-xl bg-white ring-1 ring-slate-200 px-3 text-slate-900 font-extrabold text-[12px] hover:bg-slate-50 cursor-pointer"
          >
            ✏️ Editar
          </button>
        </div>
      </div>
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="space-y-3">
      {[1, 2].map((i) => (
        <div
          key={i}
          className="rounded-3xl bg-slate-50 p-5 ring-1 ring-slate-200"
        >
          <div className="h-4 w-40 bg-slate-200 rounded mb-3" />
          <div className="h-5 w-72 bg-slate-200 rounded mb-2" />
          <div className="h-4 w-56 bg-slate-200 rounded mb-2" />
          <div className="h-4 w-44 bg-slate-200 rounded" />
        </div>
      ))}
    </div>
  );
}

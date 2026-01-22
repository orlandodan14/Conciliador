"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

/** ===================== TIPOS ===================== */
type Role = "OWNER" | "EDITOR" | "LECTOR";
type Status = "INVITED" | "ACTIVE" | "DISABLED";

type MyProfile = { id: string; full_name: string | null };

type CompanyRow = { id: string; name: string };

type MyCompanyMembershipRow = {
  company_id: string;
  role: Role;
  status: Status;
  companies: CompanyRow | null;
};

type TeamMemberRowRaw = {
  company_id: string;
  user_id: string;
  role: Role;
  status: Status;
};

/** ✅ CAMBIO: agregamos profile_email */
type TeamMemberRow = TeamMemberRowRaw & {
  profile_full_name: string | null;
  profile_email: string | null;
};

/** ✅ INVITES (team_invites) */
type InviteRow = {
  id: string;
  company_id: string;
  email: string;
  full_name: string | null;
  role: Role;
  status: string; // normalmente "INVITED"
  created_at: string;
  accepted_at: string | null;
  token: string;
};

/** ===================== HELPERS ===================== */
function cls(...s: Array<string | false | null | undefined>) {
  return s.filter(Boolean).join(" ");
}

/** ======= CORPORATIVO ======= */
const BRAND = {
  navy1: "#0b2b4f",
  navy2: "#123b63",
  accent: "#5fb1ff",
};

function Pill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "green" | "blue" | "amber" | "red";
}) {
  const map = {
    neutral: "bg-slate-100 text-slate-800 border-slate-200",
    green: "bg-emerald-50 text-emerald-700 border-emerald-200",
    blue: "bg-sky-50 text-sky-700 border-sky-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    red: "bg-rose-50 text-rose-700 border-rose-200",
  };
  return (
    <span
      className={cls(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-extrabold",
        map[tone]
      )}
    >
      {children}
    </span>
  );
}

function roleTone(role: Role) {
  if (role === "OWNER") return "blue";
  if (role === "EDITOR") return "neutral";
  return "neutral";
}

function statusTone(status: Status) {
  if (status === "ACTIVE") return "green";
  if (status === "INVITED") return "amber";
  return "red";
}

/* ===================== MODAL SHELL (igual onboarding) ===================== */
function ModalShell({
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
    <div className="fixed inset-0 z-[100]">
      <button
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-label="Cerrar modal"
      />
      <div className="absolute left-1/2 top-[6%] w-[92vw] max-w-4xl -translate-x-1/2">
        <div className="overflow-hidden rounded-[28px] bg-white shadow-[0_30px_90px_rgba(0,0,0,0.35)]">
          {/* header azul igual onboarding */}
          <div
            className="px-8 py-6"
            style={{
              background: `linear-gradient(180deg, ${BRAND.navy1}, #071a2b)`,
            }}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-white text-3xl font-extrabold tracking-tight">
                  {title}
                </div>
                {subtitle ? (
                  <div className="mt-2 text-white/80 text-sm">{subtitle}</div>
                ) : null}
              </div>

              <button
                onClick={onClose}
                className="h-10 rounded-xl bg-white/10 px-4 text-white font-extrabold hover:bg-white/15"
              >
                ✕ Cerrar
              </button>
            </div>
          </div>

          {/* body scroll */}
          <div className="max-h-[72vh] overflow-auto px-8 py-6">{children}</div>
        </div>
      </div>
    </div>
  );
}

/* ===================== EMPRESA FORM (copiado del onboarding, dentro del mismo archivo) ===================== */
type CountryKey = "CL" | "MX" | "ES";
type CurrencyKey = "CLP" | "MXN" | "EUR" | "USD";

const COUNTRIES: { key: CountryKey; label: string }[] = [
  { key: "CL", label: "Chile" },
  { key: "MX", label: "México" },
  { key: "ES", label: "España" },
];

const CURRENCIES: { key: CurrencyKey; label: string }[] = [
  { key: "CLP", label: "CLP — Peso chileno" },
  { key: "MXN", label: "MXN — Peso mexicano" },
  { key: "EUR", label: "EUR — Euro" },
  { key: "USD", label: "USD — Dólar" },
];

// MVP: opciones básicas (si ya tienes el REGIONS_BY_COUNTRY real en onboarding, pega el tuyo)
const REGIONS_BY_COUNTRY: Record<CountryKey, { label: string; options: string[] }> =
  {
    CL: {
      label: "Región",
      options: ["Región Metropolitana (MVP)"],
    },
    MX: {
      label: "Estado",
      options: ["CDMX (MVP)"],
    },
    ES: {
      label: "Provincia",
      options: ["Madrid (MVP)"],
    },
  };

const inputCls =
  "h-11 w-full rounded-2xl bg-white ring-1 ring-slate-200 px-4 text-slate-900 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-[rgba(95,177,255,0.25)]";

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
    <div className="rounded-3xl bg-white ring-1 ring-slate-200 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-slate-900 font-extrabold tracking-wide">{title}</div>
          {subtitle ? <div className="mt-1 text-sm text-slate-600">{subtitle}</div> : null}
        </div>
        {right ? <div>{right}</div> : null}
      </div>

      <div className="mt-5">{children}</div>
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-5 md:grid-cols-2">{children}</div>;
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
    <div className="space-y-1.5">
      <div className="text-[12px] font-extrabold text-slate-700">{label}</div>
      {children}
      {hint ? <div className="text-[12px] text-slate-500">{hint}</div> : null}
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
  }, [companyName, contactEmail, fiscalId, useBillingAddress, region, city, street, streetNumber]);

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
        ? { country, region, city, street, street_number: streetNumber, unit, postal_code: postalCode }
        : null;

      // CREATE (RPC recomendado)
      if (!isEdit) {
        const { data: companyIdCreated, error: rpcErr } = await supabase.rpc("create_company_with_owner", {
          p_name: companyName.trim(),
          p_country: country,
          p_fiscal_id: fiscalId.trim(),
          p_contact_email: contactEmail.trim(),
          p_trade_name: tradeName.trim() || null,
          p_currency: currency,
          p_billing_address: billing_address,
        });

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

      <Section title="Datos principales" subtitle="Lo mínimo para empezar. Puedes editarlo después.">
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
            <select value={currency} onChange={(e) => setCurrency(e.target.value as CurrencyKey)} className={inputCls}>
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
                <select value={region} onChange={(e) => setRegion(e.target.value)} className={inputCls}>
                  <option value="">Selecciona…</option>
                  {regionMeta.options.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label={country === "CL" ? "Ciudad / Comuna *" : "Ciudad / Municipio *"} hint="Puedes escribir directo (MVP).">
                <input value={city} onChange={(e) => setCity(e.target.value)} className={inputCls} placeholder="Ej: Las Condes" />
              </Field>

              <Field label="Calle / Avenida *" hint="Ej: Av. Apoquindo">
                <input value={street} onChange={(e) => setStreet(e.target.value)} className={inputCls} placeholder="Ej: Av. Apoquindo" />
              </Field>

              <Field label="Número *" hint="Permite letras: 123B">
                <input value={streetNumber} onChange={(e) => setStreetNumber(e.target.value)} className={inputCls} placeholder="Ej: 4501" />
              </Field>

              <Field label="Departamento / Oficina / Interior (opcional)" hint="Ej: Of. 1203">
                <input value={unit} onChange={(e) => setUnit(e.target.value)} className={inputCls} placeholder="Ej: Of. 1203" />
              </Field>

              <Field label="Código postal (opcional)" hint="Depende del país">
                <input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} className={inputCls} placeholder="Ej: 7550000" />
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
            className={cls(
              "h-11 rounded-2xl px-4 text-[14px] font-extrabold transition",
              canContinue && !saving
                ? "bg-[#123b63] text-white hover:opacity-95 cursor-pointer"
                : "bg-slate-200 text-slate-500 cursor-not-allowed"
            )}
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

/* ===================== INVITAR MIEMBRO MODAL (simple, dentro del mismo archivo) ===================== */
function InviteMemberModal({
  open,
  onClose,
  onInvite,
  inviting,
  inviteEmail,
  setInviteEmail,
  inviteFullName,
  setInviteFullName,
  inviteRole,
  setInviteRole,
}: {
  open: boolean;
  onClose: () => void;
  onInvite: () => void;
  inviting: boolean;
  inviteEmail: string;
  setInviteEmail: (v: string) => void;
  inviteFullName: string;
  setInviteFullName: (v: string) => void;
  inviteRole: Role;
  setInviteRole: (v: Role) => void;
}) {
  return (
    <ModalShell
      open={open}
      title="Invitar miembro"
      subtitle="Se enviará un correo (Magic Link). Quedará como INVITED hasta que acepte."
      onClose={onClose}
    >
      <div className="space-y-4">
        <div className="rounded-2xl bg-slate-50 p-4 text-[13px] text-slate-700 ring-1 ring-slate-200">
          Consejo: si necesitas “cambiar correo”, lo correcto es <b>eliminar + reinvitar</b>.
        </div>

        <div className="space-y-2">
          <div className="text-[12px] font-extrabold text-slate-700">Email</div>
          <input
            className={inputCls}
            placeholder="correo@dominio.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            autoFocus
          />
        </div>

        <div className="space-y-2">
          <div className="text-[12px] font-extrabold text-slate-700">Nombre (opcional)</div>
          <input
            className={inputCls}
            placeholder="Ej: Juan Pérez"
            value={inviteFullName}
            onChange={(e) => setInviteFullName(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <div className="text-[12px] font-extrabold text-slate-700">Rol</div>
          <select className={inputCls} value={inviteRole} onChange={(e) => setInviteRole(e.target.value as Role)}>
            <option value="OWNER">OWNER</option>
            <option value="EDITOR">EDITOR</option>
            <option value="LECTOR">LECTOR</option>
          </select>
        </div>

        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="h-11 rounded-2xl bg-white ring-1 ring-slate-200 px-4 text-slate-900 font-extrabold text-[14px] hover:bg-slate-50 cursor-pointer"
            disabled={inviting}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onInvite}
            className={cls(
              "h-11 rounded-2xl px-4 text-[14px] font-extrabold transition",
              inviting ? "bg-slate-200 text-slate-500 cursor-not-allowed" : "bg-[#5fb1ff] text-[#0b2b4f] hover:brightness-105 cursor-pointer"
            )}
            disabled={inviting}
          >
            {inviting ? "Enviando..." : "Enviar invitación"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

/* ===================== PAGE ===================== */
export default function AccountSettingsPage() {
  const router = useRouter();

  // helper: Enter o Space ejecuta acción (accesibilidad)
  const onEnterOrSpace =
    (action: () => void) =>
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        action();
      }
    };

  const goSelectCompany = () => {
    router.push("/onboarding/select-company");
  };

  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [fullName, setFullName] = useState("");

  // Password
  const [currentPass, setCurrentPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");

  // Empresas
  const [memberships, setMemberships] = useState<MyCompanyMembershipRow[]>([]);
  const [expandedCompanyId, setExpandedCompanyId] = useState<string | null>(null);
  const [teamByCompany, setTeamByCompany] = useState<Record<string, TeamMemberRow[]>>({});

  /** ✅ INVITES por empresa */
  const [invitesByCompany, setInvitesByCompany] = useState<Record<string, InviteRow[]>>({});

  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Modal empresa (create/edit)
  const [openCompanyModal, setOpenCompanyModal] = useState(false);
  const [companyModalMode, setCompanyModalMode] = useState<"create" | "edit">("create");
  const [companyModalId, setCompanyModalId] = useState<string | null>(null);

  // Modal invitar
  const [inviteCompanyId, setInviteCompanyId] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteFullName, setInviteFullName] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("LECTOR");
  const [inviting, setInviting] = useState(false);

  const membershipsByCompany = useMemo(() => {
    const m = new Map<string, MyCompanyMembershipRow>();
    memberships.forEach((x) => m.set(x.company_id, x));
    return m;
  }, [memberships]);

  const canManageCompany = (companyId: string) => {
    const m = membershipsByCompany.get(companyId);
    return m?.role === "OWNER" && m?.status === "ACTIVE";
  };

  async function loadAll() {
    setLoading(true);
    setErr(null);
    setMsg(null);

    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user) {
      setErr("No estás autenticado.");
      setLoading(false);
      return;
    }

    const uid = authData.user.id;
    setUserEmail(authData.user.email ?? null);

    const { data: p, error: pErr } = await supabase.from("profiles").select("id, full_name").eq("id", uid).single();

    if (pErr) {
      setErr(`Error cargando perfil: ${pErr.message}`);
      setLoading(false);
      return;
    }

    setProfile({ id: p.id, full_name: p.full_name ?? null });
    setFullName(p.full_name ?? "");

    const { data: ms, error: msErr } = await supabase
      .from("company_members")
      .select("company_id, role, status, companies:companies(id, name)")
      .eq("user_id", uid)
      .order("created_at", { ascending: false });

    if (msErr) {
      setErr(`Error cargando empresas: ${msErr.message}`);
      setLoading(false);
      return;
    }

    setMemberships((ms ?? []) as unknown as MyCompanyMembershipRow[]);
    setLoading(false);
  }

  /**
   * ✅ TEAM: members + profiles (nombre/email)
   */
  async function loadTeam(companyId: string) {
    setErr(null);

    const { data: cm, error: cmErr } = await supabase
      .from("company_members")
      .select("company_id, user_id, role, status")
      .eq("company_id", companyId)
      .order("role", { ascending: true });

    if (cmErr) {
      setErr(`Error cargando equipo: ${cmErr.message}`);
      return;
    }

    const rows = (cm ?? []) as unknown as TeamMemberRowRaw[];
    const userIds = Array.from(new Set(rows.map((r) => r.user_id)));

    // Si no hay miembros, listo
    if (userIds.length === 0) {
      setTeamByCompany((prev) => ({ ...prev, [companyId]: [] }));
      return;
    }

    // profiles con email (si existe en tu tabla)
    const { data: ps, error: psErr } = await supabase.from("profiles").select("id, full_name, email").in("id", userIds);

    if (psErr) {
      const mergedFallback: TeamMemberRow[] = rows.map((r) => ({
        ...r,
        profile_full_name: null,
        profile_email: null,
      }));
      setTeamByCompany((prev) => ({ ...prev, [companyId]: mergedFallback }));
      setErr(`Equipo cargado, pero no pude leer perfiles: ${psErr.message}`);
      return;
    }

    const map = new Map<string, { full_name: string | null; email: string | null }>();
    (ps ?? []).forEach((p: any) => map.set(p.id, { full_name: p.full_name ?? null, email: p.email ?? null }));

    const merged: TeamMemberRow[] = rows.map((r) => {
      const prof = map.get(r.user_id);
      return {
        ...r,
        profile_full_name: prof?.full_name ?? null,
        profile_email: prof?.email ?? null,
      };
    });

    setTeamByCompany((prev) => ({ ...prev, [companyId]: merged }));
  }

  /**
   * ✅ INVITES: team_invites (status INVITED)
   */
  async function loadInvites(companyId: string) {
    setErr(null);

    const { data, error } = await supabase
      .from("team_invites")
      .select("id,company_id,email,full_name,role,status,created_at,accepted_at,token")
      .eq("company_id", companyId)
      .eq("status", "INVITED")
      .order("created_at", { ascending: false });

    if (error) {
      // no matamos la pantalla, solo mostramos sin invites
      setInvitesByCompany((prev) => ({ ...prev, [companyId]: [] }));
      return;
    }

    setInvitesByCompany((prev) => ({ ...prev, [companyId]: (data ?? []) as InviteRow[] }));
  }

  async function loadCompanyPeople(companyId: string) {
    await Promise.all([loadTeam(companyId), loadInvites(companyId)]);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSaveName() {
    setErr(null);
    setMsg(null);
    if (!profile) return;

    const clean = fullName.trim();

    // 1) Profiles (fuente de verdad)
    const { error: pErr } = await supabase.from("profiles").update({ full_name: clean || null }).eq("id", profile.id);
    if (pErr) return setErr(`No se pudo actualizar el nombre: ${pErr.message}`);

    // 2) Auth metadata (opcional)
    const { error: aErr } = await supabase.auth.updateUser({ data: { full_name: clean || null } });
    if (aErr) setMsg("Nombre actualizado (pero no pude sincronizarlo con Auth).");
    else setMsg("Nombre actualizado.");

    window.dispatchEvent(new CustomEvent("profile:updated"));
  }

  async function onChangePassword() {
    setErr(null);
    setMsg(null);

    if (!userEmail) return setErr("No pude detectar tu email de sesión.");
    if (!currentPass || !newPass || !confirmPass) return setErr("Completa todos los campos.");
    if (newPass !== confirmPass) return setErr("La nueva contraseña y la confirmación no coinciden.");
    if (newPass.length < 8) return setErr("La nueva contraseña debe tener al menos 8 caracteres.");

    const { error: reErr } = await supabase.auth.signInWithPassword({ email: userEmail, password: currentPass });
    if (reErr) return setErr("Contraseña actual incorrecta.");

    const { error: upErr } = await supabase.auth.updateUser({ password: newPass });
    if (upErr) return setErr(`No se pudo cambiar la contraseña: ${upErr.message}`);

    setMsg("Contraseña actualizada.");
    setCurrentPass("");
    setNewPass("");
    setConfirmPass("");
  }

  async function onOwnerRemoveMember(companyId: string, userId: string) {
    setErr(null);
    setMsg(null);

    const ok = window.confirm("¿Eliminar este usuario de la empresa?");
    if (!ok) return;

    const { error } = await supabase.rpc("owner_remove_member", {
      p_company_id: companyId,
      p_user_id: userId,
    });
    if (error) return setErr(`No se pudo eliminar el miembro: ${error.message}`);

    setMsg("Miembro eliminado.");
    await loadCompanyPeople(companyId);
  }

  async function onOwnerUpdateMember(companyId: string, userId: string, role: Role, status: Status) {
    setErr(null);
    setMsg(null);

    const { error } = await supabase.rpc("owner_update_member", {
      p_company_id: companyId,
      p_user_id: userId,
      p_role: role,
      p_status: status,
    });
    if (error) return setErr(`No se pudo actualizar el miembro: ${error.message}`);

    setMsg("Miembro actualizado.");
    await loadCompanyPeople(companyId);
  }

  // ======================
  // Helper: enviar OTP con token (misma lógica que Equipo)
  // ======================
  const sendInviteEmailOtp = async (emailLower: string, tokenStr: string) => {
    const redirectTo = `${window.location.origin}/auth/callback?invite_token=${encodeURIComponent(tokenStr)}`;
    const { error: otpErr } = await supabase.auth.signInWithOtp({
      email: emailLower,
      options: { emailRedirectTo: redirectTo },
    });
    if (otpErr) throw otpErr;
  };

  // ======================
  // INVITAR (Account): registra invite + envía correo (OTP)
  // ======================
  async function onInviteMember() {
    setErr(null);
    setMsg(null);

    if (!inviteCompanyId) return;
    if (!canManageCompany(inviteCompanyId)) return setErr("No autorizado (requiere OWNER ACTIVE).");

    const email = inviteEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) return setErr("Ingresa un email válido.");

    setInviting(true);
    try {
      // 1) crear invitación y obtener token (igual Equipo)
      const { data: rpcData, error: rpcErr } = await supabase.rpc("invite_member_by_email", {
        p_company_id: inviteCompanyId,
        p_email: email,
        p_full_name: inviteFullName.trim() || null,
        p_role: inviteRole,
      });

      if (rpcErr) return setErr(`No se pudo invitar: ${rpcErr.message}`);

      const token = (Array.isArray(rpcData) ? (rpcData as any)?.[0]?.token : (rpcData as any)?.token) ?? null;
      if (!token) return setErr("Invitación registrada, pero no pude obtener el token (RPC no devolvió token).");

      // 2) enviar magic link
      try {
        await sendInviteEmailOtp(email, String(token));
      } catch (otpErr: any) {
        return setErr(`Invitación registrada, pero no se pudo enviar el correo: ${otpErr?.message || "Error OTP"}`);
      }

      const cid = inviteCompanyId;

      // limpiar modal
      setInviteEmail("");
      setInviteFullName("");
      setInviteRole("LECTOR");
      setInviteCompanyId(null);

      setMsg("Invitación enviada (correo enviado).");
      await loadCompanyPeople(cid);
    } finally {
      setInviting(false);
    }
  }

  // ======================
  // INVITES: Reenviar (rota token + envía OTP)
  // ======================
  async function onResendInvite(companyId: string, inviteId: string, email: string) {
    setErr(null);
    setMsg(null);

    const ok = window.confirm(`¿Reenviar invitación a ${email}? (Se generará un link nuevo)`);
    if (!ok) return;

    try {
      setLoading(true);

      const { data: tokenData, error: tokenErr } = await supabase.rpc("rotate_team_invite_token", {
        p_invite_id: inviteId,
      });

      if (tokenErr) {
        setErr(`No se pudo reenviar: ${tokenErr.message}`);
        return;
      }

      const tokenStr = String(tokenData ?? "");
      if (!tokenStr) {
        setErr("No se pudo reenviar: RPC no devolvió token.");
        return;
      }

      await sendInviteEmailOtp(email.trim().toLowerCase(), tokenStr);

      setMsg("Invitación reenviada.");
      await loadInvites(companyId);
    } catch (e: any) {
      setErr(`No se pudo reenviar: ${e?.message || "Error"}`);
    } finally {
      setLoading(false);
    }
  }

  // ======================
  // INVITES: Eliminar/Cancelar
  // ======================
  async function onCancelInvite(companyId: string, inviteId: string, email: string) {
    setErr(null);
    setMsg(null);

    const ok = window.confirm(`¿Eliminar (cancelar) invitación para ${email}?`);
    if (!ok) return;

    try {
      setLoading(true);
      const { error } = await supabase.rpc("cancel_team_invite", { p_invite_id: inviteId });
      if (error) {
        setErr(`No se pudo cancelar: ${error.message}`);
        return;
      }
      setMsg("Invitación cancelada.");
      await loadInvites(companyId);
    } finally {
      setLoading(false);
    }
  }

  /* ===================== UI (alineada a onboarding) ===================== */
  const userDisplayName = fullName?.trim() || "Tu cuenta";

  return (
    <div className="min-h-[calc(100vh-56px)] bg-slate-100">
      <div className="mx-auto max-w-6xl px-4 py-8">
        {/* HERO como onboarding */}
        <div className="rounded-[28px] border border-white/10 bg-gradient-to-b from-[#0b2b4f] to-[#071a2b] shadow-[0_25px_70px_rgba(2,6,23,0.25)] overflow-hidden">
          <div className="p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/15 px-3 py-1 text-emerald-100 text-xs font-extrabold">
                  ✅ Cuenta activa
                </div>

                <h1 className="mt-4 text-white text-3xl font-extrabold tracking-tight">Configuración de cuenta</h1>
                <p className="mt-2 text-white/80 text-sm max-w-2xl">
                  Edita tu nombre, cambia tu contraseña y administra tus empresas y equipo.
                </p>
              </div>

              <div className="rounded-2xl bg-white/10 border border-white/10 px-5 py-4 min-w-[260px]">
                <div className="text-white/80 text-xs font-bold">Usuario</div>
                <div className="mt-1 text-white font-extrabold truncate">{userDisplayName}</div>
                <div className="mt-1 text-white/70 text-xs truncate">{userEmail ?? ""}</div>
                <div className="mt-4 grid gap-2">
                  <button
                    onClick={loadAll}
                    className="h-10 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-white font-extrabold"
                    type="button"
                  >
                    Refrescar
                  </button>

                  {/* ✅ NUEVO: Ir a seleccionar empresa */}
                  <button
                    type="button"
                    onClick={goSelectCompany}
                    onKeyDown={onEnterOrSpace(goSelectCompany)}
                    className="h-10 rounded-xl bg-emerald-300 text-slate-950 font-extrabold hover:opacity-95"
                    title="Selecciona la empresa con la que vas a trabajar"
                  >
                    Volver →
                  </button>
                </div>
              </div>
            </div>
          </div>

          {(err || msg) && (
            <div className="px-8 pb-6">
              {err && (
                <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-rose-50">{err}</div>
              )}
              {msg && (
                <div className="mt-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-emerald-50">
                  {msg}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Cards como onboarding */}
        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          {/* PERFIL */}
          <div className="space-y-6 lg:col-span-1">
            <div className="rounded-3xl bg-white border border-slate-200 shadow-sm p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-slate-900 font-extrabold text-lg">Perfil</div>
                  <div className="mt-1 text-slate-600 text-sm">Actualiza tu nombre visible.</div>
                </div>
                <Pill tone="blue">Cuenta</Pill>
              </div>

              <div className="mt-4 space-y-3">
                <label className="text-xs font-bold text-slate-600">Nombre</label>
                <input
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-slate-900 outline-none focus:border-slate-300 focus:ring-2 focus:ring-[rgba(95,177,255,0.25)]"
                  placeholder="Tu nombre"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
                <button
                  onClick={onSaveName}
                  className="h-11 w-full rounded-xl bg-[#5fb1ff] text-[#0b2b4f] font-extrabold hover:brightness-105"
                  disabled={loading}
                >
                  Guardar cambios
                </button>
              </div>
            </div>

            {/* SEGURIDAD */}
            <div className="rounded-3xl bg-white border border-slate-200 shadow-sm p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-slate-900 font-extrabold text-lg">Seguridad</div>
                  <div className="mt-1 text-slate-600 text-sm">Cambia tu contraseña.</div>
                </div>
                <Pill tone="neutral">Login</Pill>
              </div>

              <div className="mt-4 space-y-3">
                <input
                  type="password"
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-slate-900 outline-none focus:border-slate-300 focus:ring-2 focus:ring-[rgba(95,177,255,0.25)]"
                  placeholder="Contraseña actual"
                  value={currentPass}
                  onChange={(e) => setCurrentPass(e.target.value)}
                />
                <input
                  type="password"
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-slate-900 outline-none focus:border-slate-300 focus:ring-2 focus:ring-[rgba(95,177,255,0.25)]"
                  placeholder="Nueva contraseña"
                  value={newPass}
                  onChange={(e) => setNewPass(e.target.value)}
                />
                <input
                  type="password"
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-slate-900 outline-none focus:border-slate-300 focus:ring-2 focus:ring-[rgba(95,177,255,0.25)]"
                  placeholder="Confirmar nueva contraseña"
                  value={confirmPass}
                  onChange={(e) => setConfirmPass(e.target.value)}
                />
                <button
                  onClick={onChangePassword}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-slate-900 text-white font-extrabold hover:bg-slate-800"
                >
                  Cambiar contraseña
                </button>
                <div className="text-xs text-slate-500">Tip: mínimo 8 caracteres, mezcla letras y números.</div>
              </div>
            </div>
          </div>

          {/* EMPRESAS */}
          <div className="lg:col-span-2">
            <div className="rounded-3xl bg-white border border-slate-200 shadow-sm p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-slate-900 font-extrabold text-lg">Empresas</div>
                  <div className="mt-1 text-slate-600 text-sm">
                    Tus accesos. Si eres <b>OWNER</b> puedes administrar empresa y equipo.
                  </div>
                </div>

                <button
                  onClick={() => {
                    setCompanyModalMode("create");
                    setCompanyModalId(null);
                    setOpenCompanyModal(true);
                  }}
                  className="h-11 rounded-xl bg-[#5fb1ff] px-5 text-[#0b2b4f] font-extrabold hover:brightness-105 whitespace-nowrap"
                >
                  + Agregar empresa
                </button>
              </div>

              {loading ? (
                <div className="mt-6 text-slate-600">Cargando...</div>
              ) : memberships.length === 0 ? (
                <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-slate-700">
                  No tienes empresas asociadas.
                </div>
              ) : (
                <div className="mt-6 space-y-3">
                  {memberships.map((m) => {
                    const c = m.companies;
                    const companyId = m.company_id;
                    const expanded = expandedCompanyId === companyId;
                    const isOwner = canManageCompany(companyId);

                    const team = teamByCompany[companyId] ?? [];
                    const invites = invitesByCompany[companyId] ?? [];

                    return (
                      <div key={companyId} className="rounded-3xl border border-slate-200 bg-slate-50 overflow-hidden">
                        <button
                          type="button"
                          onClick={async () => {
                            const next = expanded ? null : companyId;
                            setExpandedCompanyId(next);
                            if (!expanded) await loadCompanyPeople(companyId);
                          }}
                          className="w-full px-5 py-4 flex items-center justify-between gap-4 hover:bg-slate-100"
                        >
                          <div className="min-w-0 text-left">
                            <div className="text-slate-900 font-extrabold truncate">{c?.name ?? "Empresa"}</div>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <Pill tone={roleTone(m.role) as any}>{m.role}</Pill>
                              <Pill tone={statusTone(m.status) as any}>{m.status}</Pill>
                              {isOwner ? <Pill tone="blue">ADMIN</Pill> : null}
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <span className="text-slate-700 font-extrabold">{expanded ? "Ocultar" : "Ver"}</span>
                            <ChevronDown className={cls("h-4 w-4 text-slate-600 transition", expanded && "rotate-180")} />
                          </div>
                        </button>

                        {expanded && (
                          <div className="px-5 pb-5">
                            <div className="h-px bg-slate-200" />

                            <div className="mt-4 flex flex-wrap items-center gap-2">
                              <button
                                onClick={() => loadCompanyPeople(companyId)}
                                className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-slate-900 font-extrabold hover:bg-slate-50"
                              >
                                Refrescar equipo
                              </button>

                              {isOwner ? (
                                <button
                                  onClick={() => {
                                    setCompanyModalMode("edit");
                                    setCompanyModalId(companyId);
                                    setOpenCompanyModal(true);
                                  }}
                                  className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-slate-900 font-extrabold hover:bg-slate-50"
                                >
                                  Editar empresa
                                </button>
                              ) : null}

                              <div className="flex-1" />

                              <button
                                onClick={() => setInviteCompanyId(companyId)}
                                className={cls(
                                  "h-10 rounded-xl px-4 font-extrabold whitespace-nowrap",
                                  isOwner ? "bg-[#5fb1ff] text-[#0b2b4f] hover:brightness-105" : "bg-slate-200 text-slate-500 cursor-not-allowed"
                                )}
                                disabled={!isOwner}
                                title={!isOwner ? "Solo OWNER puede invitar" : "Invitar miembro"}
                              >
                                + Invitar miembro
                              </button>
                            </div>

                            {/* TEAM */}
                            <div className="mt-4 rounded-3xl border border-slate-200 bg-white p-5">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="text-slate-900 font-extrabold">Equipo</div>
                                  <div className="mt-1 text-slate-600 text-sm">Miembros con acceso a esta empresa.</div>
                                </div>
                                <Pill tone="neutral">{team.length} miembros</Pill>
                              </div>

                              <div className="mt-4 space-y-2">
                                {team.length === 0 ? (
                                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-slate-700">
                                    No hay miembros (o no tienes permiso).
                                  </div>
                                ) : (
                                  team.map((tm) => {
                                    const name = tm.profile_full_name ?? "(sin nombre en profile)";
                                    const email = tm.profile_email ?? "—";

                                    return (
                                      <div key={tm.user_id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                          <div className="min-w-[220px]">
                                            <div className="text-slate-900 font-extrabold">{name}</div>

                                            <div className="mt-1 text-slate-600 text-xs truncate">{email}</div>

                                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                              <Pill tone={roleTone(tm.role) as any}>{tm.role}</Pill>
                                              <Pill tone={statusTone(tm.status) as any}>{tm.status}</Pill>
                                            </div>
                                          </div>

                                          {isOwner ? (
                                            <div className="flex flex-wrap items-center gap-2">
                                              <select
                                                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-slate-900 font-extrabold outline-none"
                                                value={tm.role}
                                                onChange={(e) =>
                                                  onOwnerUpdateMember(companyId, tm.user_id, e.target.value as Role, tm.status)
                                                }
                                              >
                                                <option value="OWNER">OWNER</option>
                                                <option value="EDITOR">EDITOR</option>
                                                <option value="LECTOR">LECTOR</option>
                                              </select>

                                              <select
                                                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-slate-900 font-extrabold outline-none"
                                                value={tm.status}
                                                onChange={(e) =>
                                                  onOwnerUpdateMember(companyId, tm.user_id, tm.role, e.target.value as Status)
                                                }
                                              >
                                                <option value="ACTIVE">ACTIVE</option>
                                                <option value="DISABLED">DISABLED</option>
                                              </select>

                                              <button
                                                onClick={() => onOwnerRemoveMember(companyId, tm.user_id)}
                                                className="h-10 rounded-xl border border-rose-200 bg-rose-50 px-4 text-rose-700 font-extrabold hover:bg-rose-100"
                                              >
                                                Eliminar
                                              </button>
                                            </div>
                                          ) : (
                                            <div className="text-slate-500 font-bold">Solo visual</div>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                            </div>

                            {/* ✅ INVITES PENDIENTES */}
                            <div className="mt-4 rounded-3xl border border-slate-200 bg-white p-5">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="text-slate-900 font-extrabold">Invitaciones pendientes</div>
                                  <div className="mt-1 text-slate-600 text-sm">Correos enviados que aún no han aceptado.</div>
                                </div>
                                <Pill tone="amber">{invites.length} INVITED</Pill>
                              </div>

                              <div className="mt-4 space-y-2">
                                {invites.length === 0 ? (
                                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-slate-700">
                                    No hay invitaciones pendientes.
                                  </div>
                                ) : (
                                  invites.map((iv) => (
                                    <div key={iv.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                                      <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div className="min-w-[220px]">
                                          <div className="text-slate-900 font-extrabold">
                                            {iv.full_name || "Invitado (pendiente)"}
                                          </div>
                                          <div className="mt-1 text-slate-600 text-xs truncate">{iv.email}</div>

                                          <div className="mt-2 flex flex-wrap items-center gap-2">
                                            <Pill tone={roleTone(iv.role) as any}>{iv.role}</Pill>
                                            <Pill tone="amber">INVITED</Pill>
                                          </div>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-2">
                                          <button
                                            onClick={() => onResendInvite(companyId, iv.id, iv.email)}
                                            className={cls(
                                              "h-10 rounded-xl border border-slate-200 bg-white px-4 text-slate-900 font-extrabold hover:bg-slate-50",
                                              !isOwner && "opacity-60 cursor-not-allowed"
                                            )}
                                            disabled={!isOwner}
                                            title={!isOwner ? "Solo OWNER puede reenviar" : "Reenviar invitación (link nuevo)"}
                                          >
                                            Reenviar
                                          </button>

                                          <button
                                            onClick={() => onCancelInvite(companyId, iv.id, iv.email)}
                                            className={cls(
                                              "h-10 rounded-xl border border-rose-200 bg-rose-50 px-4 text-rose-700 font-extrabold hover:bg-rose-100",
                                              !isOwner && "opacity-60 cursor-not-allowed"
                                            )}
                                            disabled={!isOwner}
                                            title={!isOwner ? "Solo OWNER puede eliminar" : "Eliminar invitación"}
                                          >
                                            Eliminar
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  ))
                                )}
                              </div>

                              <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-[12px] text-slate-700 ring-1 ring-slate-200">
                                Tip: “Reenviar” genera un link nuevo (rota el token) y vuelve a mandar el correo.
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ======= MODALES ======= */}
      <ModalShell
        open={openCompanyModal}
        title={companyModalMode === "create" ? "Registrar empresa" : "Editar empresa"}
        subtitle="Esto crea tu “espacio de trabajo” (tenant). Todo quedará asociado a esta empresa."
        onClose={() => setOpenCompanyModal(false)}
      >
        <EmpresaFormModal
          mode={companyModalMode}
          companyId={companyModalId}
          onSaved={async () => {
            await loadAll();
            if (expandedCompanyId) await loadCompanyPeople(expandedCompanyId);
          }}
          onClose={() => setOpenCompanyModal(false)}
        />
      </ModalShell>

      <InviteMemberModal
        open={!!inviteCompanyId}
        onClose={() => {
          setInviteCompanyId(null);
          setInviteEmail("");
          setInviteFullName("");
          setInviteRole("LECTOR");
        }}
        onInvite={onInviteMember}
        inviting={inviting}
        inviteEmail={inviteEmail}
        setInviteEmail={setInviteEmail}
        inviteFullName={inviteFullName}
        setInviteFullName={setInviteFullName}
        inviteRole={inviteRole}
        setInviteRole={setInviteRole}
      />
    </div>
  );
}

function ChevronDown({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.94l3.71-3.71a.75.75 0 1 1 1.06 1.06l-4.24 4.24a.75.75 0 0 1-1.06 0L5.21 8.29a.75.75 0 0 1 .02-1.08Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

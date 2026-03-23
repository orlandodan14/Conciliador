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
 * Modal (estilo azul)
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
      className="fixed inset-0 z-[60] bg-slate-950/45 p-4 backdrop-blur-[2px] sm:p-6"
      role="dialog"
      aria-modal="true"
    >
      <div className="mx-auto flex h-full max-w-4xl items-center justify-center">
        <div
          className={cls(
            "w-full overflow-hidden rounded-[28px] bg-white shadow-[0_25px_90px_rgba(2,6,23,0.35)] ring-1 ring-slate-200",
            "max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3rem)]"
          )}
        >
          {/* Header azul */}
          <div className="relative overflow-hidden bg-gradient-to-r from-[#0b2b4f] via-[#123b63] to-[#0b2b4f] px-6 py-5 text-white">
            <div className="pointer-events-none absolute -top-20 -right-16 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 -left-16 h-56 w-56 rounded-full bg-white/10 blur-3xl" />

            <div className="relative flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-white/75">
                  Configuración contable
                </div>
                <div className="mt-1 truncate text-xl font-black leading-tight text-white">
                  {title}
                </div>
                <div className="mt-1 text-xs font-semibold text-white/80">
                  Asigna la cuenta por defecto para este proceso
                </div>
              </div>

              <button
                onClick={onClose}
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 text-lg font-bold text-white ring-1 ring-white/15 transition hover:bg-white/15"
                aria-label="Cerrar"
                title="Cerrar"
                type="button"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Body */}
          <div
            className={cls(
              "overflow-y-auto bg-white px-6 py-5",
              footer
                ? "max-h-[calc(100vh-2rem-188px)] sm:max-h-[calc(100vh-3rem-188px)]"
                : "max-h-[calc(100vh-2rem-118px)] sm:max-h-[calc(100vh-3rem-118px)]"
            )}
          >
            {children}
          </div>

          {/* Footer */}
          {footer ? (
            <div className="border-t border-slate-200 bg-slate-50/95 px-6 py-4 backdrop-blur">
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
type ProcModule =
  | "Ventas"
  | "Compras"
  | "Bancos"
  | "Inventario"
  | "Nómina"
  | "Contabilidad";

type Proc = {
  key: string;
  name: string;
  module: ProcModule;
  hint?: string;
  requires?: Array<"tax" | "payment_method" | "currency" | "dimension">;
};

type DefaultRow = {
  id: string;
  company_id: string;
  process_key: string;
  account_node_id: string | null;
  is_active: boolean;
  notes: string | null;
};

type AccountNodeLite = {
  id: string;
  code: string | null;
  name: string | null;
  level?: number | null;
};

/**
 * =========================
 * Catálogo PROCESOS (v2)
 * =========================
 * Se agregan procesos específicos para:
 * - Nota de débito de venta
 * - Nota de crédito de compra
 * - Nota de débito de compra
 * - Reembolsos / cobros asociados a NC cuando aplique
 */
const PROCESS_CATALOG: Proc[] = [
  // =========================
  // Ventas
  // =========================
  {
    key: "SALE_REVENUE_TAXED",
    name: "Ventas afectas (Ingreso)",
    module: "Ventas",
    hint: "Cuenta de ingresos para líneas afectas.",
  },
  {
    key: "SALE_REVENUE_EXEMPT",
    name: "Ventas exentas (Ingreso)",
    module: "Ventas",
    hint: "Cuenta de ingresos para líneas exentas / 0%.",
  },
  {
    key: "SALE_DISCOUNTS_GIVEN",
    name: "Descuentos otorgados (Contra-ingreso)",
    module: "Ventas",
  },
  {
    key: "SALE_RETURNS_CREDIT_NOTE",
    name: "Notas de crédito de venta / devoluciones (Contra-ingreso)",
    module: "Ventas",
    hint: "Reduce ingresos por devolución, anulación parcial o ajuste comercial.",
  },
  {
    key: "SALE_DEBIT_NOTE_REVENUE",
    name: "Notas de débito de venta (Ingreso / ajuste adicional)",
    module: "Ventas",
    hint: "Ingreso adicional por recargo, diferencia o ajuste sobre una venta.",
  },
  {
    key: "AR_CUSTOMERS",
    name: "Clientes / Cuentas por cobrar (AR)",
    module: "Ventas",
  },
  {
    key: "CUSTOMER_ADVANCES",
    name: "Anticipos de clientes (Pasivo)",
    module: "Ventas",
  },
  {
    key: "SALE_TAX_OUTPUT",
    name: "Impuesto venta (IVA débito / output)",
    module: "Ventas",
    hint: "Cuenta de IVA débito / VAT output. También sirve para ND y reversa de NC según signo del asiento.",
    requires: ["tax"],
  },

  {
    key: "SALE_PAYMENT_CASH",
    name: "Cobro venta en efectivo",
    module: "Ventas",
    hint: "Cuenta contable para la porción cobrada en efectivo.",
  },
  {
    key: "SALE_PAYMENT_TRANSFER",
    name: "Cobro venta por transferencia",
    module: "Ventas",
    hint: "Cuenta contable para la porción cobrada por transferencia.",
  },
  {
    key: "SALE_PAYMENT_CARD_DEBIT",
    name: "Cobro venta por tarjeta débito",
    module: "Ventas",
    hint: "Cuenta contable para la porción cobrada con tarjeta débito.",
  },
  {
    key: "SALE_PAYMENT_CARD_CREDIT",
    name: "Cobro venta por tarjeta crédito",
    module: "Ventas",
    hint: "Cuenta contable para la porción cobrada con tarjeta crédito.",
  },
  {
    key: "SALE_PAYMENT_CHECK",
    name: "Cobro venta por cheque",
    module: "Ventas",
    hint: "Cuenta contable para la porción cobrada con cheque.",
  },
  {
    key: "SALE_PAYMENT_OTHER",
    name: "Cobro venta por otro medio",
    module: "Ventas",
    hint: "Cuenta contable para la porción cobrada por otros medios.",
  },
  {
    key: "SALE_PAYMENT_CREDIT",
    name: "Cobro venta a crédito / saldo cliente",
    module: "Ventas",
    hint: "Cuenta contable para el saldo pendiente del cliente.",
  },

  // Reembolsos de NC de venta cuando realmente se devuelve dinero
  {
    key: "SALE_CREDIT_NOTE_REFUND_CASH",
    name: "Reembolso NC venta en efectivo",
    module: "Ventas",
    hint: "Usar cuando una nota de crédito de venta devuelve dinero en efectivo al cliente.",
  },
  {
    key: "SALE_CREDIT_NOTE_REFUND_TRANSFER",
    name: "Reembolso NC venta por transferencia",
    module: "Ventas",
    hint: "Usar cuando una nota de crédito de venta devuelve dinero por transferencia.",
  },
  {
    key: "SALE_CREDIT_NOTE_REFUND_CARD",
    name: "Reembolso NC venta a tarjeta / reversa pasarela",
    module: "Ventas",
    hint: "Usar cuando una nota de crédito revierte un cobro con tarjeta o pasarela.",
  },

  // =========================
  // Compras
  // =========================
  {
    key: "AP_SUPPLIERS",
    name: "Proveedores / Cuentas por pagar (AP)",
    module: "Compras",
  },
  {
    key: "PURCHASE_EXPENSE_TAXED",
    name: "Compras/Gastos afectos",
    module: "Compras",
    hint: "Gasto o inventario (según tu modelo).",
  },
  {
    key: "PURCHASE_EXPENSE_EXEMPT",
    name: "Compras/Gastos exentos",
    module: "Compras",
  },
  {
    key: "PURCHASE_DISCOUNTS_RECEIVED",
    name: "Descuentos recibidos (Contra-gasto)",
    module: "Compras",
  },
  {
    key: "PURCHASE_CREDIT_NOTE_RECOVERY",
    name: "Notas de crédito de compra (Contra-gasto / recuperación)",
    module: "Compras",
    hint: "Reduce gasto o inventario por devolución, descuento posterior o corrección del proveedor.",
  },
  {
    key: "PURCHASE_DEBIT_NOTE_EXPENSE",
    name: "Notas de débito de compra (Gasto / ajuste adicional)",
    module: "Compras",
    hint: "Aumenta gasto o inventario por recargo, diferencia o ajuste del proveedor.",
  },
  {
    key: "SUPPLIER_ADVANCES",
    name: "Anticipos a proveedores (Activo)",
    module: "Compras",
  },
  {
    key: "PURCHASE_TAX_INPUT",
    name: "Impuesto compra (IVA crédito / input)",
    module: "Compras",
    hint: "Cuenta de IVA crédito. También sirve para ND y reversa de NC según signo del asiento.",
    requires: ["tax"],
  },
  {
    key: "WITHHOLDINGS_PAYABLE",
    name: "Retenciones por pagar (Pasivo)",
    module: "Compras",
    requires: ["tax"],
  },

  // Cobro / abono asociado a NC de compra, cuando el proveedor devuelve dinero o compensa
  {
    key: "PURCHASE_CREDIT_NOTE_SETTLEMENT_BANK",
    name: "Cobro / abono NC compra a banco",
    module: "Compras",
    hint: "Usar cuando el proveedor devuelve dinero o abona una NC directamente al banco.",
  },
  {
    key: "PURCHASE_CREDIT_NOTE_SETTLEMENT_CASH",
    name: "Cobro / abono NC compra en caja",
    module: "Compras",
    hint: "Usar cuando la nota de crédito de compra se recupera en efectivo.",
  },

  // =========================
  // Bancos / pagos
  // =========================
  {
    key: "CASH",
    name: "Caja",
    module: "Bancos",
  },
  {
    key: "BANK_DEFAULT",
    name: "Banco por defecto",
    module: "Bancos",
  },
  {
    key: "PAYMENT_GATEWAY_CLEARING",
    name: "Clearing pasarela (en tránsito)",
    module: "Bancos",
    hint: "Stripe/WebPay/MercadoPago: cobro vs depósito.",
    requires: ["payment_method"],
  },
  {
    key: "PAYMENT_GATEWAY_FEES",
    name: "Comisiones pasarela (Gasto)",
    module: "Bancos",
  },
  {
    key: "BANK_FEES",
    name: "Comisiones / gastos bancarios",
    module: "Bancos",
  },
  {
    key: "BANK_INTEREST_INCOME",
    name: "Intereses ganados",
    module: "Bancos",
  },
  {
    key: "BANK_INTEREST_EXPENSE",
    name: "Intereses pagados",
    module: "Bancos",
  },
  {
    key: "TRANSFER_BRIDGE",
    name: "Cuenta puente transferencias internas",
    module: "Bancos",
    hint: "Para mover entre bancos/caja sin ensuciar resultados.",
  },
  {
    key: "RECONCILIATION_DIFF",
    name: "Diferencias de conciliación (ajuste)",
    module: "Bancos",
  },
  {
    key: "FX_GAIN",
    name: "Ganancia por tipo de cambio",
    module: "Bancos",
  },
  {
    key: "FX_LOSS",
    name: "Pérdida por tipo de cambio",
    module: "Bancos",
  },
  {
    key: "ROUNDING_DIFF",
    name: "Redondeo / diferencias menores",
    module: "Bancos",
  },

  // =========================
  // Inventario
  // =========================
  {
    key: "INVENTORY",
    name: "Inventario",
    module: "Inventario",
  },
  {
    key: "COGS",
    name: "Costo de ventas (COGS)",
    module: "Inventario",
  },
  {
    key: "INVENTORY_ADJUST",
    name: "Ajustes / merma inventario",
    module: "Inventario",
  },

  // =========================
  // Nómina
  // =========================
  {
    key: "PAYROLL_WAGES",
    name: "Sueldos (Gasto)",
    module: "Nómina",
    requires: ["dimension"],
  },
  {
    key: "PAYROLL_SOCIAL_CHARGES",
    name: "Cargas sociales (Gasto)",
    module: "Nómina",
    requires: ["dimension"],
  },
  {
    key: "PAYROLL_WITHHOLDINGS_PAYABLE",
    name: "Retenciones nómina por pagar (Pasivo)",
    module: "Nómina",
  },
  {
    key: "PAYROLL_PROVISIONS",
    name: "Provisiones nómina (Vacaciones, etc.)",
    module: "Nómina",
  },

  // =========================
  // Contabilidad general
  // =========================
  {
    key: "OPENING_BALANCE",
    name: "Apertura de saldos",
    module: "Contabilidad",
  },
  {
    key: "YEAR_RESULT",
    name: "Resultado del ejercicio / cierre",
    module: "Contabilidad",
  },
  {
    key: "GENERAL_ADJUSTMENTS",
    name: "Ajustes contables (control)",
    module: "Contabilidad",
  },
];

/**
 * =========================
 * Tablas reales en tu BBDD
 * =========================
 */
const DEFAULTS_TABLE_CANDIDATES = ["account_defaults"];
const ACCOUNTS_TABLE_CANDIDATES = ["account_nodes"];

/**
 * =========================
 * UI helpers por módulo
 * =========================
 */
function moduleBadgeClass(module: ProcModule) {
  switch (module) {
    case "Ventas":
      return "bg-sky-100 text-sky-800 ring-1 ring-sky-200";
    case "Compras":
      return "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200";
    case "Bancos":
      return "bg-amber-100 text-amber-800 ring-1 ring-amber-200";
    case "Inventario":
      return "bg-violet-100 text-violet-800 ring-1 ring-violet-200";
    case "Nómina":
      return "bg-pink-100 text-pink-800 ring-1 ring-pink-200";
    case "Contabilidad":
      return "bg-slate-200 text-slate-800 ring-1 ring-slate-300";
    default:
      return "bg-slate-100 text-slate-700 ring-1 ring-slate-200";
  }
}

function moduleRowAccent(module: ProcModule) {
  switch (module) {
    case "Ventas":
      return "border-l-[4px] border-l-sky-400";
    case "Compras":
      return "border-l-[4px] border-l-emerald-400";
    case "Bancos":
      return "border-l-[4px] border-l-amber-400";
    case "Inventario":
      return "border-l-[4px] border-l-violet-400";
    case "Nómina":
      return "border-l-[4px] border-l-pink-400";
    case "Contabilidad":
      return "border-l-[4px] border-l-slate-400";
    default:
      return "border-l-[4px] border-l-slate-200";
  }
}

// Supabase suele devolver code "42P01" si tabla no existe.
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

export default function CuentasPorDefectoPage() {
  const [companyId, setCompanyId] = useState<string | null>(null);

  useEffect(() => {
    const fromLS =
      localStorage.getItem("active_company_id") ||
      localStorage.getItem("company_id") ||
      localStorage.getItem("activeCompanyId");

    if (fromLS && fromLS.length >= 10) setCompanyId(fromLS);
    else setCompanyId(null);
  }, []);

  const [role, setRole] = useState<"OWNER" | "EDITOR" | "LECTOR" | null>(null);
  const canEdit = role === "OWNER" || role === "EDITOR";

  useEffect(() => {
    if (!companyId) return;
    getMyRoleForCompany(companyId).then(setRole);
  }, [companyId]);

  const [defaultsTable, setDefaultsTable] = useState<string | null>(null);
  const [accountsTable, setAccountsTable] = useState<string | null>(null);

  const [defaults, setDefaults] = useState<DefaultRow[]>([]);
  const [accounts, setAccounts] = useState<AccountNodeLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [qText, setQText] = useState("");
  const [qModule, setQModule] = useState<"" | ProcModule>("");

  const [openPick, setOpenPick] = useState(false);
  const [pickProc, setPickProc] = useState<Proc | null>(null);
  const [pickAccountNodeId, setPickAccountNodeId] = useState<string | null>(null);
  const [pickNotes, setPickNotes] = useState<string>("");
  const [saving, setSaving] = useState(false);

  async function loadAccountNodes(at: string, cid: string) {
    const try1 = await supabase
      .from(at)
      .select("id, code, name, level")
      .eq("company_id", cid)
      .eq("level", 4)
      .order("code", { ascending: true });

    if (!try1.error) return (try1.data ?? []) as AccountNodeLite[];

    const try3 = await supabase
      .from(at)
      .select("id, code, name, level")
      .eq("level", 4)
      .order("code", { ascending: true })
      .limit(5000);

    if (!try3.error) return (try3.data ?? []) as AccountNodeLite[];

    const try4 = await supabase
      .from(at)
      .select("id, name")
      .eq("company_id", cid)
      .order("name", { ascending: true });

    if (try4.error) throw try4.error;

    return [];
  }

  async function bootstrap(cid: string) {
    setLoading(true);
    setError(null);

    try {
      const dt = await detectTable(DEFAULTS_TABLE_CANDIDATES, "id");
      const at = await detectTable(ACCOUNTS_TABLE_CANDIDATES, "id");

      setDefaultsTable(dt);
      setAccountsTable(at);

      if (at) {
        const list = await loadAccountNodes(at, cid);
        setAccounts(list);
      } else {
        setAccounts([]);
      }

      if (dt) {
        const { data, error } = await supabase
          .from(dt)
          .select("id, company_id, process_key, account_node_id, is_active, notes")
          .eq("company_id", cid)
          .order("process_key", { ascending: true });

        if (error) throw error;

        setDefaults(((data as any[]) ?? []) as any);
      } else {
        setDefaults([]);
      }
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

  function procLabel(p: Proc) {
    return p.name;
  }

  function findDefault(processKey: string) {
    return defaults.find((d) => d.process_key === processKey) ?? null;
  }

  function accountLabel(accountNodeId: string | null) {
    if (!accountNodeId) return "—";
    const a = accounts.find((x) => x.id === accountNodeId);
    if (!a) return `Cuenta: ${accountNodeId.slice(0, 8)}…`;
    const c = a.code ? String(a.code) : "";
    const n = a.name ? String(a.name) : "";
    return c && n ? `${c} • ${n}` : n || c || a.id;
  }

  const modules = useMemo(() => {
    const s = new Set<ProcModule>();
    PROCESS_CATALOG.forEach((p) => s.add(p.module));
    return Array.from(s);
  }, []);

  const filtered = useMemo(() => {
    const t = qText.trim().toLowerCase();
    return PROCESS_CATALOG
      .filter((p) => (qModule ? p.module === qModule : true))
      .filter((p) => {
        if (!t) return true;
        const hay = `${p.key} ${p.name} ${p.module} ${p.hint ?? ""}`.toLowerCase();
        return hay.includes(t);
      });
  }, [qText, qModule]);

  function openAssign(p: Proc) {
    const d = findDefault(p.key);
    setPickProc(p);
    setPickAccountNodeId(d?.account_node_id ?? null);
    setPickNotes(d?.notes ?? "");
    setOpenPick(true);
  }

  async function saveAssign() {
    if (!companyId || !pickProc) return;

    if (!defaultsTable) {
      alert("No existe la tabla account_defaults. Debes crearla para poder guardar.");
      return;
    }
    if (!canEdit) {
      alert("No tienes permisos para editar cuentas por defecto.");
      return;
    }

    setSaving(true);
    try {
      const uid = await getAuthUserId();
      const existing = findDefault(pickProc.key);

      if (existing) {
        const { data, error } = await supabase
          .from(defaultsTable)
          .update({
            account_node_id: pickAccountNodeId,
            is_active: true,
            notes: pickNotes.trim() ? pickNotes.trim() : null,
            updated_by: uid,
          } as any)
          .eq("id", existing.id)
          .eq("company_id", companyId)
          .select("id, company_id, process_key, account_node_id, is_active, notes")
          .single();

        if (error) throw error;

        setDefaults((prev) =>
          prev.map((x) => (x.id === existing.id ? ((data as any) as DefaultRow) : x))
        );
      } else {
        const { data, error } = await supabase
          .from(defaultsTable)
          .insert({
            company_id: companyId,
            process_key: pickProc.key,
            account_node_id: pickAccountNodeId,
            is_active: true,
            notes: pickNotes.trim() ? pickNotes.trim() : null,
            created_by: uid,
            updated_by: uid,
          } as any)
          .select("id, company_id, process_key, account_node_id, is_active, notes")
          .single();

        if (error) throw error;

        setDefaults((prev) => [((data as any) as DefaultRow), ...prev]);
      }

      setOpenPick(false);
    } catch (e: any) {
      alert(`Error guardando: ${e?.message ?? "Error"}`);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(p: Proc) {
    if (!companyId) return;
    if (!defaultsTable) return;
    if (!canEdit) {
      alert("No tienes permisos para activar/desactivar.");
      return;
    }

    const d = findDefault(p.key);
    if (!d) {
      alert("Primero asigna una cuenta para poder activar/desactivar.");
      return;
    }

    const next = !d.is_active;
    const before = defaults;

    setDefaults((prev) =>
      prev.map((x) => (x.id === d.id ? { ...x, is_active: next } : x))
    );

    try {
      const uid = await getAuthUserId();
      const { error } = await supabase
        .from(defaultsTable)
        .update({ is_active: next, updated_by: uid } as any)
        .eq("id", d.id)
        .eq("company_id", companyId);

      if (error) throw error;
    } catch (e: any) {
      setDefaults(before);
      alert(`Error: ${e?.message ?? "No se pudo actualizar."}`);
    }
  }

  const gridCols = "grid-cols-[220px_2fr_2fr_140px_180px]";
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
                Cuentas por defecto
              </h1>
              <div className="mt-2 text-[13px] text-white/85">
                Mapea procesos contables → cuentas. Esto habilita asientos automáticos para facturas, NC y ND.
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
                    placeholder="Proceso, key, módulo..."
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
                  Módulo
                </div>
                <select
                  value={qModule}
                  onChange={(e) => setQModule(e.target.value as any)}
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-[12px] font-extrabold text-slate-900 outline-none focus:ring-2 focus:ring-slate-200"
                >
                  <option value="">Todos</option>
                  {modules.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
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
                  <div className={cls(cellBase, "text-[11px] font-extrabold uppercase text-slate-600")}>Módulo</div>
                  <div className={cls(cellBase, "pl-4 border-l border-slate-200 text-[11px] font-extrabold uppercase text-slate-600")}>Proceso</div>
                  <div className={cls(cellBase, "pl-4 border-l border-slate-200 text-[11px] font-extrabold uppercase text-slate-600")}>Cuenta asignada</div>
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
                  filtered.map((p) => {
                    const d = findDefault(p.key);
                    const assigned = d?.account_node_id ?? null;

                    return (
                      <div
                        key={p.key}
                        className={cls(
                          "grid items-center px-5 py-2 border-b border-slate-100 hover:bg-slate-50",
                          gridCols,
                          moduleRowAccent(p.module)
                        )}
                      >
                        <div className={cls(cellBase, "text-[13px] font-black text-slate-900 whitespace-nowrap")}>
                          <span
                            className={cls(
                              "inline-flex items-center rounded-full px-3 py-1 text-[11px] font-black whitespace-nowrap",
                              moduleBadgeClass(p.module)
                            )}
                          >
                            {p.module}
                          </span>
                        </div>

                        <div className={cls(cellBase, "pl-4 border-l border-slate-200")}>
                          <div className="text-[13px] font-extrabold text-slate-800 line-clamp-2">
                            {procLabel(p)}
                          </div>
                          <div className="mt-0.5 text-[12px] text-slate-500 truncate">
                            <span className="font-semibold">{p.key}</span>
                            {p.hint ? <span className="text-slate-400"> • {p.hint}</span> : null}
                          </div>
                        </div>

                        <div className={cls(cellBase, "pl-4 border-l border-slate-200")}>
                          <div className="text-[13px] font-semibold text-slate-900 truncate">
                            {accountLabel(assigned)}
                          </div>
                          {d?.notes ? <div className="text-[12px] text-slate-500 truncate">{d.notes}</div> : null}
                          {!assigned ? (
                            <div className="mt-1 text-[12px] text-amber-700">
                              Sin cuenta: este proceso no podrá postear automático.
                            </div>
                          ) : null}
                          {p.requires?.includes("dimension") ? (
                            <div className="mt-1 text-[12px] text-indigo-700">
                              Nota: este proceso soporta overrides por dimensiones (v2).
                            </div>
                          ) : null}
                        </div>

                        <div className={cls(cellBase, "pl-4 border-l border-slate-200")}>
                          <span
                            className={cls(
                              "inline-flex items-center rounded-full px-3 py-1 text-[11px] font-black whitespace-nowrap",
                              d?.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700"
                            )}
                          >
                            {d ? (d.is_active ? "Activo" : "Inactivo") : "No configurado"}
                          </span>
                        </div>

                        <div className={cls(cellBase, "pl-4 border-l border-slate-200")}>
                          <div className="flex justify-end gap-2 flex-wrap">
                            <button
                              type="button"
                              onClick={() => openAssign(p)}
                              disabled={!canEdit}
                              className={cls(
                                "rounded-2xl border px-3 py-2 text-[12px] font-extrabold whitespace-nowrap",
                                canEdit
                                  ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                                  : "border-slate-200 bg-white text-slate-400 opacity-60 cursor-not-allowed"
                              )}
                              title={!canEdit ? "Solo OWNER/EDITOR" : "Asignar/editar cuenta"}
                            >
                              {assigned ? "Editar" : "Asignar"}
                            </button>

                            <button
                              type="button"
                              onClick={() => toggleActive(p)}
                              disabled={!canEdit || !d}
                              className={cls(
                                "rounded-2xl border px-3 py-2 text-[12px] font-extrabold whitespace-nowrap",
                                canEdit && d
                                  ? d.is_active
                                    ? "border-amber-200 bg-white text-amber-700 hover:bg-amber-50"
                                    : "border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50"
                                  : "border-slate-200 bg-white text-slate-400 opacity-60 cursor-not-allowed"
                              )}
                              title={!d ? "Primero configura la cuenta" : d.is_active ? "Desactivar" : "Activar"}
                            >
                              {d ? (d.is_active ? "Desactivar" : "Activar") : "Activar"}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="px-5 py-14 text-center text-[13px] text-slate-600">
                    No hay procesos para mostrar.
                  </div>
                )}

                <div className="border-t border-slate-200 bg-slate-50 px-5 py-3 text-[12px] text-slate-600">
                  Tip: primero configura los procesos críticos de ventas y compras, luego AR/AP, IVA, bancos y finalmente NC/ND y reembolsos.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 text-center text-[12px] text-slate-500">
        ConciliaciónPro • Configuración contable
      </div>

      {/* Modal asignación */}
      <Modal
        open={openPick}
        title={pickProc ? `Asignar cuenta • ${pickProc.name}` : "Asignar cuenta"}
        onClose={() => setOpenPick(false)}
        footer={
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => setOpenPick(false)}
              className="rounded-full px-5 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
              type="button"
              disabled={saving}
            >
              Cancelar
            </button>

            <button
              onClick={saveAssign}
              className="rounded-full bg-[#0b2b4f] px-5 py-2 text-sm font-semibold text-white hover:bg-[#123b63] disabled:opacity-60"
              type="button"
              disabled={saving || !canEdit}
              title={!canEdit ? "Solo OWNER/EDITOR" : "Guardar"}
            >
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        }
      >
        {!accountsTable ? (
          <div className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-800 ring-1 ring-amber-100">
            No se detectó <b>account_nodes</b> como tabla de plan de cuentas.
          </div>
        ) : null}

        <div className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-700 ring-1 ring-slate-200">
          Selecciona el <b>account_node</b> que el sistema usará por defecto para este proceso.
          En v2 agregamos overrides por centro de costo, sucursal y unidad de negocio.
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-12">
          <div className="sm:col-span-12">
            <div className="text-xs font-black uppercase text-slate-600">Cuenta</div>
            <select
              value={pickAccountNodeId ?? ""}
              onChange={(e) => setPickAccountNodeId(e.target.value ? e.target.value : null)}
              disabled={!canEdit}
              className={cls(
                "mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200",
                !canEdit ? "opacity-60 cursor-not-allowed" : ""
              )}
            >
              <option value="">— Sin asignar —</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {`${a.code ?? ""}${a.code ? " • " : ""}${a.name ?? a.id}`}
                </option>
              ))}
            </select>
            <div className="mt-1 text-xs text-slate-500">
              Recomendación: usa cuentas de control para clearing, puente, reembolsos y devoluciones.
            </div>
          </div>

          <div className="sm:col-span-12">
            <div className="text-xs font-black uppercase text-slate-600">Notas (opcional)</div>
            <input
              value={pickNotes}
              onChange={(e) => setPickNotes(e.target.value)}
              placeholder="Ej: IVA débito general, banco principal, NC compras proveedor, etc."
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-200"
              disabled={!canEdit}
            />
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          <b>Resumen:</b> {pickProc?.key ?? "—"} • Cuenta: <b>{accountLabel(pickAccountNodeId)}</b>
        </div>
      </Modal>
    </div>
  );
}
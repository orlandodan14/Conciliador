"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import * as XLSX from "xlsx";

/**
 * =========================
 * Helpers
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

function toNum(v: any) {
  const s = String(v ?? "").trim().replace(",", ".");
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function formatNumber(val: number, decimals: number) {
  try {
    return val.toLocaleString("es-CL", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  } catch {
    return String(val);
  }
}

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function folioLabel(series?: string | null, number?: string | null) {
  const s = String(series ?? "").trim();
  const n = String(number ?? "").trim();
  if (!s && !n) return "—";
  return s ? `${s}-${n}` : n;
}

function ellipsis(s: string, max: number) {
  const t = String(s ?? "");
  if (t.length <= max) return t;
  return t.slice(0, Math.max(0, max - 1)) + "…";
}

function calcLineAmounts(l: DocLine) {
  const qty = Math.max(0, toNum(l.qty));
  const unit = Math.max(0, toNum(l.unit_price));
  const base = qty * unit;

  const rate = Math.max(0, toNum(l.tax_rate));

  // ===== Defaults calculados =====
  let ex_calc = l.is_taxable ? 0 : base;
  let af_calc = l.is_taxable ? base : 0;
  let iva_calc = l.is_taxable && af_calc > 0 && rate > 0 ? af_calc * (rate / 100) : 0;
  let total_calc = ex_calc + af_calc + iva_calc;

  // ===== Overrides contables =====
  const ex_o = String(l.ex_override || "").trim();
  const af_o = String(l.af_override || "").trim();
  const iva_o = String(l.iva_override || "").trim();
  const tot_o = String(l.total_override || "").trim();

  const ex = ex_o !== "" ? Math.max(0, toNum(ex_o)) : ex_calc;
  const af = af_o !== "" ? Math.max(0, toNum(af_o)) : af_calc;
  const iva = iva_o !== "" ? Math.max(0, toNum(iva_o)) : iva_calc;

  // total: si lo overridean, manda. Si no, se recalcula con lo que haya (calc u override)
  const total = tot_o !== "" ? Math.max(0, toNum(tot_o)) : ex + af + iva;

  return { qty, unit, base, rate, ex, af, iva, total };
}

function isUnknownColumnError(err: any) {
  const msg = String(err?.message ?? "");
  return /column .* does not exist/i.test(msg) || /does not exist in the rowset/i.test(msg);
}

async function safeUpsertSalesDoc(args: {
  companyId: string;
  docId: string | null;
  payloadFull: any;
  payloadFallback: any;
}) {
  const { companyId, docId, payloadFull, payloadFallback } = args;

  if (!docId) {
    const tryInsert = async (payload: any) => {
      const { data, error } = await supabase.from("trade_docs").insert(payload).select("id,status").single();
      if (error) throw error;
      return data as any;
    };

    try {
      return await tryInsert(payloadFull);
    } catch (e: any) {
      if (isUnknownColumnError(e)) return await tryInsert(payloadFallback);
      throw e;
    }
  } else {
    const tryUpdate = async (payload: any) => {
      const { error } = await supabase
        .from("trade_docs")
        .update(payload)
        .eq("company_id", companyId)
        .eq("id", docId);
      if (error) throw error;
    };

    try {
      await tryUpdate(payloadFull);
      return { id: docId, status: payloadFull.status };
    } catch (e: any) {
      if (isUnknownColumnError(e)) {
        await tryUpdate(payloadFallback);
        return { id: docId, status: payloadFallback.status };
      }
      throw e;
    }
  }
}

/** Insert masivo con fallback si faltan columnas */
async function safeInsertMany(table: string, rowsFull: any[], rowsFallback: any[]) {
  if (!rowsFull.length && !rowsFallback.length) return;

  const tryInsert = async (rows: any[]) => {
    const { error } = await supabase.from(table as any).insert(rows as any);
    if (error) throw error;
  };

  try {
    await tryInsert(rowsFull.length ? rowsFull : rowsFallback);
  } catch (e: any) {
    if (isUnknownColumnError(e)) {
      await tryInsert(rowsFallback);
      return;
    }
    throw e;
  }
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
  if (data.status && data.status !== "active" && data.status !== "ACTIVE") return null;
  return data.role as any;
}

/**
 * =========================
 * Theme
 * =========================
 */
const theme = {
  shell:
    "overflow-hidden rounded-[28px] bg-white ring-1 ring-slate-200 shadow-[0_18px_70px_rgba(15,23,42,0.10)]",
  header:
    "relative bg-gradient-to-r from-[#0b2b4f] via-[#123b63] to-[#0b2b4f] text-white",
  glowA:
    "pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-white/10 blur-3xl",
  glowB:
    "pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-white/10 blur-3xl",
  btnGlass:
    "rounded-2xl bg-white/10 px-4 py-2 text-[12px] font-extrabold ring-1 ring-white/15 hover:bg-white/15 transition",
  btnPrimary:
    "rounded-lg px-3 py-2 text-sm text-white bg-slate-900 hover:bg-slate-800",
  btnSoft: "rounded-lg border px-3 py-2 text-sm hover:bg-slate-50",
  card: "rounded-2xl border bg-white shadow-sm overflow-hidden",
};

function LabelInline({
  label,
  field,
  className,
}: {
  label: string;
  field: string;
  className?: string;
}) {
  return (
    <div className={cls("flex items-baseline gap-1 text-xs font-medium text-slate-600", className)}>
      <span>{label}</span>
      <span className="text-slate-300">/</span>
      <span className="text-[11px] font-normal text-slate-500">{field}</span>
    </div>
  );
}

function Modal({
  open,
  title,
  subtitle,
  children,
  onClose,
  footer,
  widthClass = "w-[min(1200px,96vw)]",
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
  footer?: React.ReactNode;
  widthClass?: string;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/45" onClick={onClose} />
      <div className={cls("absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2", widthClass)}>
        <div className="flex h-[min(84vh,780px)] flex-col overflow-hidden rounded-[22px] bg-white shadow-xl ring-1 ring-black/5">
          <div className={cls("relative px-5 py-4", theme.header)}>
            <div className={theme.glowA} />
            <div className={theme.glowB} />
            <div className="relative flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-extrabold uppercase text-white/80">{subtitle || "Ventas"}</div>
                <h3 className="truncate text-lg font-black text-white">{title}</h3>
              </div>
              <button
                className="ml-3 rounded-xl px-3 py-1.5 text-sm font-extrabold text-white/90 hover:bg-white/10"
                onClick={onClose}
                title="Cerrar"
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>
          </div>

          {/* ⛔️ Importante: NO overflow-x */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden p-5">{children}</div>

          {footer ? (
            <div className="shrink-0 border-t bg-white/95 backdrop-blur px-5 py-3">{footer}</div>
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
type DocType = "FACTURA" | "BOLETA" | "NC" | "ND";
type DocStatus = "BORRADOR" | "VIGENTE" | "CANCELADO";

type DocHeader = {
  doc_type: DocType;
  fiscal_doc_code: string;

  status: DocStatus;

  issue_date: string;
  due_date: string;

  series: string;
  number: string;

  currency_code: string;

  counterparty_identifier: string;
  counterparty_name: string;

  reference: string;
  notes: string;

  cancelled_at: string;
  cancel_reason: string;

  origin_doc_id: string | null;
  origin_label: string;
};

type FiscalDocTypeLite = {
  id: string;
  code: string;
  name: string;
  scope: "VENTA" | "COMPRA" | "AMBOS";
  is_active: boolean;
};

type FiscalDocSettingsLite = {
  enabled: boolean;
  require_sales: boolean;
  default_sales_doc_type_id: string | null; // ✅ nombre real
};



type DocLine = {
  line_no: number;
  sku: string;
  description: string;

  qty: string;
  unit_price: string;

  // ✅ reemplazaremos tax_kind por boolean (punto 2)
  is_taxable: boolean;   // true = afecto, false = exento
  tax_rate: string;      // % IVA, solo si afecto

  // ✅ OVERRIDES contables (si el usuario escribe, se usa esto)
  ex_override: string;     // monto exento manual
  af_override: string;     // monto afecto manual (neto)
  iva_override: string;    // iva manual
  total_override: string;  // total manual
};

type PaymentRow = {
  id: string;
  method: "EFECTIVO" | "TRANSFERENCIA" | "TARJETA" | "CHEQUE" | "OTRO";
  amount: string;

  card_kind: "" | "DEBITO" | "CREDITO";
  card_last4: string;
  auth_code: string;

  reference: string;
};

type JournalLine = {
  line_no: number;
  account_code: string;
  description: string;
  debit: string;
  credit: string;
  cost_center_code: string;
  business_line_code: string;
  branch_code: string;
};

type OriginDocLite = {
  id: string;
  series?: string | null;
  number?: string | null;
  issue_date?: string | null;
  grand_total?: number | null;
  currency_code?: string | null;
};

type DraftRow = {
  id: string;
  company_id: string;

  doc_type: DocType;
  fiscal_doc_code: string | null;

  status: DocStatus;

  issue_date: string | null;
  series: string | null;
  number: string | null;

  counterparty_identifier: string | null;
  counterparty_name: string | null;

  net_taxable: number | null;
  net_exempt: number | null;
  tax_total: number | null;
  grand_total: number | null;

  created_at: string | null;
};

/**
 * =========================
 * Defaults
 * =========================
 */
function makeDocLine(no: number): DocLine {
  return {
    line_no: no,
    sku: "",
    description: "",
    qty: "1",
    unit_price: "",
    is_taxable: true,
    tax_rate: "19",
    ex_override: "",
    af_override: "",
    iva_override: "",
    total_override: "",
  };
}

function makeJournalLine(no: number): JournalLine {
  return {
    line_no: no,
    account_code: "",
    description: "",
    debit: "",
    credit: "",
    cost_center_code: "",
    business_line_code: "",
    branch_code: "",
  };
}
function makePaymentRow(): PaymentRow {
  return {
    id: uid(),
    method: "TRANSFERENCIA",
    amount: "",
    card_kind: "",
    card_last4: "",
    auth_code: "",
    reference: "",
  };
}

type EditorTab = "CABECERA" | "LINEAS" | "PAGOS" | "ASIENTO";

/**
 * =========================
 * Page
 * =========================
 */
export default function Page() {
  const [companyId, setCompanyId] = useState<string>("");
  const [role, setRole] = useState<"OWNER" | "EDITOR" | "LECTOR" | null>(null);
  const canEdit = role === "OWNER" || role === "EDITOR";

  const [moneyDecimals, setMoneyDecimals] = useState<number>(0);
  const [baseCurrency, setBaseCurrency] = useState<string>("CLP");

  const [defaultTaxRate, setDefaultTaxRate] = useState<string>("19");

  // ✅ Documentos fiscales (config)
  const [fiscalCfg, setFiscalCfg] = useState<FiscalDocSettingsLite>({
  enabled: false,
  require_sales: false,
  default_sales_doc_type_id: null,
  });
  const [fiscalDocTypes, setFiscalDocTypes] = useState<FiscalDocTypeLite[]>([]);
  const [defaultFiscalCodeSales, setDefaultFiscalCodeSales] = useState<string>("");

  // ✅ NUEVO: permiso de cancelación (fallback true si columna no existe)
  const [allowCancelSales, setAllowCancelSales] = useState<boolean>(true);

  // editor modal
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorTab, setEditorTab] = useState<EditorTab>("CABECERA");

  const [docId, setDocId] = useState<string | null>(null);

  const [header, setHeader] = useState<DocHeader>({
    doc_type: "FACTURA",
    fiscal_doc_code: "",
    status: "BORRADOR",
    issue_date: todayISO(),
    due_date: todayISO(),
    series: "",
    number: "",
    currency_code: "CLP",
    counterparty_identifier: "",
    counterparty_name: "",
    reference: "",
    notes: "",
    cancelled_at: "",
    cancel_reason: "",
    origin_doc_id: null,
    origin_label: "",
  });

  const [lines, setLines] = useState<DocLine[]>(Array.from({ length: 10 }, (_, i) => makeDocLine(i + 1)));

  // ✅ Default: Crédito (sin pagos)
  const [payments, setPayments] = useState<PaymentRow[]>([]);

  const [journalLines, setJournalLines] = useState<JournalLine[]>(
    Array.from({ length: 10 }, (_, i) => makeJournalLine(i + 1))
  );

  const [messages, setMessages] = useState<Array<{ level: "error" | "warn"; text: string }>>([]);

  // Origin PANEL
  const needsOrigin = header.doc_type === "NC" || header.doc_type === "ND";
  const [originPanelOpen, setOriginPanelOpen] = useState(false);
  const [originQuery, setOriginQuery] = useState("");
  const [originLoading, setOriginLoading] = useState(false);
  const [originResults, setOriginResults] = useState<OriginDocLite[]>([]);

  // Drafts list
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [loadingDrafts, setLoadingDrafts] = useState(false);

  // ✅ Selección borradores
  const [selectedDrafts, setSelectedDrafts] = useState<Record<string, boolean>>({});
  const selectedIds = useMemo(() => Object.keys(selectedDrafts).filter((id) => selectedDrafts[id]), [selectedDrafts]);
  const allSelected = useMemo(
    () => drafts.length > 0 && selectedIds.length === drafts.length,
    [drafts.length, selectedIds.length]
  );

  function toggleDraft(id: string, v?: boolean) {
    setSelectedDrafts((p) => ({ ...p, [id]: v ?? !p[id] }));
  }
  function clearSelection() {
    setSelectedDrafts({});
  }
  function selectAllDrafts() {
    const next: Record<string, boolean> = {};
    drafts.forEach((d) => (next[d.id] = true));
    setSelectedDrafts(next);
  }
  function toggleSelectAll() {
    if (allSelected) clearSelection();
    else selectAllDrafts();
  }

  // =========================
  // Carga masiva (Excel)
  // =========================
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);

  const headerCell =
    "text-left text-[12px] font-semibold text-slate-700 border border-slate-200 bg-slate-50/70 px-2 py-1 align-bottom";
  const headerSub = "block text-[10px] font-normal text-slate-500 leading-3 mt-0.5";
  const bodyCell = "border border-slate-200 px-2 py-1 align-middle";
  const cellInputBase = "w-full bg-transparent outline-none px-1 py-0.5 text-[13px] leading-5";
  const cellInputRight = "text-right";

  /**
   * boot + settings
   */
  useEffect(() => {
    const id = localStorage.getItem("active_company_id") || "";
    setCompanyId(id);
  }, []);

  useEffect(() => {
    if (!companyId) return;

    (async () => {
      const r = await getMyRoleForCompany(companyId);
      setRole(r);

      const { data: s } = await supabase
        .from("accounting_settings")
        .select("money_decimals")
        .eq("company_id", companyId)
        .maybeSingle();
      if (s?.money_decimals != null) setMoneyDecimals(Number(s.money_decimals));

      const { data: cc } = await supabase
        .from("company_currencies")
        .select("code,is_base,is_active")
        .eq("company_id", companyId)
        .eq("is_base", true)
        .eq("is_active", true)
        .maybeSingle();

      // ✅ IVA default desde tax_rates (vigente hoy)
      try {
        const today = todayISO();

        const { data: tr, error: trErr } = await supabase
          .from("tax_rates")
          .select("rate,label,valid_from,valid_to")
          .eq("company_id", companyId)
          .lte("valid_from", today)
          .or(`valid_to.is.null,valid_to.gte.${today}`)
          .order("valid_from", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (trErr) throw trErr;

        const rateNum = tr?.rate != null ? Number(tr.rate) : 19;
        setDefaultTaxRate(String(rateNum));

        // ✅ si estás creando nuevo doc, también actualiza líneas vacías
        setLines((prev) =>
          prev.map((l) => ({
            ...l,
            tax_rate: String(rateNum), // siempre aplicar el default a líneas nuevas
          }))
        );
      } catch {
        // si falla, dejamos 19
        setDefaultTaxRate("19");
      }

      const base = (cc as any)?.code || "CLP";
      setBaseCurrency(base);
      setHeader((h) => ({ ...h, currency_code: base }));

      // ✅ Cargar configuración + catálogo de Documentos Fiscales (VENTAS) + allow_sales_cancellation (fallback)
      try {
        let cfg: any = null;

        try {
          const r1 = await supabase
            .from("fiscal_doc_settings")
            .select("enabled,require_sales,default_sales_doc_type_id,allow_sales_cancellation")
            .eq("company_id", companyId)
            .maybeSingle();
          if (r1.error) throw r1.error;
          cfg = r1.data;
          setAllowCancelSales(Boolean((cfg as any)?.allow_sales_cancellation ?? true));
        } catch (e: any) {
          // fallback si la columna allow_sales_cancellation no existe aún
          if (isUnknownColumnError(e)) {
            const r2 = await supabase
              .from("fiscal_doc_settings")
              .select("enabled,require_sales,default_sales_doc_type_id")
              .eq("company_id", companyId)
              .maybeSingle();
            if (r2.error) throw r2.error;
            cfg = r2.data;
            setAllowCancelSales(true); // ✅ fallback pro
          } else {
            throw e;
          }
        }

        const nextCfg: FiscalDocSettingsLite = {
          enabled: Boolean((cfg as any)?.enabled),
          require_sales: Boolean((cfg as any)?.require_sales),
          default_sales_doc_type_id: (cfg as any)?.default_sales_doc_type_id ?? null,
        };
        setFiscalCfg(nextCfg);

        const { data: dts } = await supabase
          .from("fiscal_doc_types")
          .select("id,code,name,scope,is_active,sort_order")
          .eq("company_id", companyId)
          .eq("is_active", true)
          .in("scope", ["VENTA", "AMBOS"])
          .order("sort_order", { ascending: true })
          .order("code", { ascending: true });

        const list: FiscalDocTypeLite[] = ((dts as any[]) || []).map((x) => ({
          id: x.id,
          code: x.code,
          name: x.name,
          scope: x.scope,
          is_active: Boolean(x.is_active),
        }));
        setFiscalDocTypes(list);

        const defId = nextCfg.default_sales_doc_type_id;
        const defCode = defId ? (list.find((t) => t.id === defId)?.code ?? "") : "";
        setDefaultFiscalCodeSales(defCode);
      } catch {
        setFiscalCfg({ enabled: false, require_sales: false, default_sales_doc_type_id: null });
        setFiscalDocTypes([]);
        setDefaultFiscalCodeSales("");
        setAllowCancelSales(true); // fallback seguro
      }
    })();
  }, [companyId]);

  /**
   * Totales doc con montos afecto/exento
   */
  const totals = useMemo(() => {
    let net_taxable = 0;
    let net_exempt = 0;
    let tax_total = 0;

    for (const l of lines) {
      const { ex, af, iva } = calcLineAmounts(l);
      net_exempt += ex;
      net_taxable += af;
      tax_total += iva;
    }

    const grand_total = net_exempt + net_taxable + tax_total;

    const paid = payments.reduce((s, p) => s + toNum(p.amount), 0);
    const balance = grand_total - paid;

    return { net_taxable, net_exempt, tax_total, grand_total, paid, balance };
  }, [lines, payments]);

  const draftsSummary = useMemo(() => {
    const count = drafts.length;
    const sumTotal = drafts.reduce((s, d) => s + Number(d.grand_total || 0), 0);
    const byType: Record<string, number> = {};
    drafts.forEach((d) => (byType[d.doc_type] = (byType[d.doc_type] || 0) + 1));
    return { count, sumTotal, byType };
  }, [drafts]);

  /**
   * UI ops
   */
  function setHeaderPatch(patch: Partial<DocHeader>) {
    setHeader((h) => ({ ...h, ...patch }));
  }
  function renumber<T extends { line_no: number }>(arr: T[]) {
    return arr.map((x, i) => ({ ...x, line_no: i + 1 }));
  }

  // Lines
  function addDocLine() {
    setLines((p) =>
      renumber([
        ...p,
        { ...makeDocLine(p.length + 1), tax_rate: defaultTaxRate || "19" },
      ])
    );
  }
  function removeDocLine(idx: number) {
    setLines((p) => {
      const next = p.filter((_, i) => i !== idx);
      return next.length ? renumber(next) : [makeDocLine(1)];
    });
  }
  function updateDocLine(idx: number, patch: Partial<DocLine>) {
    setLines((p) => p.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  // Payments
  function addPaymentRow() {
    setPayments((p) => [...p, makePaymentRow()]);
  }
  function removePaymentRow(id: string) {
    setPayments((p) => p.filter((x) => x.id !== id));
  }
  function updatePaymentRow(id: string, patch: Partial<PaymentRow>) {
    setPayments((p) => p.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }

  // Journal
  function addJournalLine() {
    setJournalLines((p) => renumber([...p, makeJournalLine(p.length + 1)]));
  }
  function removeJournalLine(idx: number) {
    setJournalLines((p) => {
      const next = p.filter((_, i) => i !== idx);
      return next.length ? renumber(next) : [makeJournalLine(1)];
    });
  }
  function updateJournalLine(idx: number, patch: Partial<JournalLine>) {
    setJournalLines((p) => p.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  function clearForm() {
    setDocId(null);
    setHeader({
      doc_type: "FACTURA",
      fiscal_doc_code: fiscalCfg.enabled ? (defaultFiscalCodeSales || "") : "",
      status: "BORRADOR",
      issue_date: todayISO(),
      due_date: todayISO(),
      series: "",
      number: "",
      currency_code: baseCurrency,
      counterparty_identifier: "",
      counterparty_name: "",
      reference: "",
      notes: "",
      cancelled_at: "",
      cancel_reason: "",
      origin_doc_id: null,
      origin_label: "",
    });

    setLines(
      Array.from({ length: 10 }, (_, i) => ({
        ...makeDocLine(i + 1),
        tax_rate: defaultTaxRate || "19",
      }))
    );
    setPayments([]);
    setJournalLines(Array.from({ length: 10 }, (_, i) => makeJournalLine(i + 1)));

    setMessages([]);
    setOriginPanelOpen(false);
    setOriginQuery("");
    setOriginResults([]);
    setOriginLoading(false);
  }

  function openNewDoc() {
    clearForm();
    setEditorTab("CABECERA");
    setEditorOpen(true);
  }

  function closeEditor() {
    setEditorOpen(false);
    setOriginPanelOpen(false);
  }

  /**
   * Origin search
   */
  async function searchOriginDocs() {
    if (!companyId) return;
    setOriginLoading(true);
    try {
      const q = originQuery.trim();

      let query = supabase
        .from("trade_docs")
        .select("id,series,number,issue_date,grand_total,currency_code,status,doc_type")
        .eq("company_id", companyId)
        .in("doc_type", ["FACTURA", "BOLETA"])
        .neq("status", "CANCELADO")
        .order("issue_date", { ascending: false })
        .limit(30);

      if (q) query = query.or(`number.ilike.%${q}%,series.ilike.%${q}%`) as any;

      const { data, error } = await query;
      if (error) throw error;

      setOriginResults(((data as any) || []) as OriginDocLite[]);
    } catch (e: any) {
      setOriginResults([]);
      setMessages([{ level: "error", text: e?.message || "No se pudo buscar documentos." }]);
    } finally {
      setOriginLoading(false);
    }
  }

  function pickOrigin(d: OriginDocLite) {
    setHeaderPatch({
      origin_doc_id: d.id,
      origin_label: folioLabel(d.series, d.number),
    });
    setOriginPanelOpen(false);
  }

  /**
   * Drafts load (vista principal)
   */
  async function loadDrafts() {
    if (!companyId) return;
    setLoadingDrafts(true);
    try {
      const { data, error } = await supabase
        .from("trade_docs")
        .select(
          [
            "id",
            "company_id",
            "doc_type",
            "status",
            "issue_date",
            "series",
            "number",
            "counterparty_identifier",
            "counterparty_name",
            "fiscal_doc_code",
            "net_taxable",
            "net_exempt",
            "tax_total",
            "grand_total",
            "created_at",
          ].join(",")
        )
        .eq("company_id", companyId)
        .eq("status", "BORRADOR")
        .order("issue_date", { ascending: false })
        .limit(200);

      if (error) throw error;
      setDrafts(((data as any) || []) as DraftRow[]);
    } catch (e: any) {
      setDrafts([]);
      setMessages((prev) => [{ level: "error", text: e?.message || "No se pudieron cargar borradores." }, ...prev]);
    } finally {
      setLoadingDrafts(false);
    }
  }

  useEffect(() => {
    if (!companyId) return;
    loadDrafts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  /**
   * Save / status
   */
  async function saveDraftMVP() {
    if (!companyId || !canEdit) return;
    
    try {
      setMessages([]);

      const headerPayloadFull: any = {
        company_id: companyId,
        doc_type: header.doc_type,
        status: "BORRADOR",
        issue_date: header.issue_date,
        due_date: header.due_date,
        series: header.series || null,
        number: header.number || null,
        currency_code: header.currency_code,

        fiscal_doc_code: header.fiscal_doc_code || null,

        counterparty_identifier: header.counterparty_identifier || null,
        counterparty_name: header.counterparty_name || null,
        reference: header.reference || null,
        notes: header.notes || null,
        origin_doc_id: header.origin_doc_id,

        net_taxable: totals.net_taxable,
        net_exempt: totals.net_exempt,
        tax_total: totals.tax_total,
        grand_total: totals.grand_total,
      };

      const headerPayloadFallback: any = {
        company_id: companyId,
        doc_type: header.doc_type,
        status: "BORRADOR",
        issue_date: header.issue_date,
        due_date: header.due_date,
        series: header.series || null,
        number: header.number || null,
        currency_code: header.currency_code,
        counterparty_identifier: header.counterparty_identifier || null,
        counterparty_name: header.counterparty_name || null,
        reference: header.reference || null,
        notes: header.notes || null,
        origin_doc_id: header.origin_doc_id,
        grand_total: totals.grand_total,
      };

      const saved = await safeUpsertSalesDoc({
        companyId,
        docId,
        payloadFull: headerPayloadFull,
        payloadFallback: headerPayloadFallback,
      });

      const savedId = (saved as any).id as string;
      setDocId(savedId);
      setHeaderPatch({ status: (saved as any).status || "BORRADOR" });

      // lines: reemplazo total
      await supabase.from("trade_doc_lines").delete().eq("company_id", companyId).eq("trade_doc_id", savedId);

      const usedLines = lines
        .filter((l) => {
          const { base } = calcLineAmounts(l);
          return l.description.trim() || l.sku.trim() || base > 0;
        })
        .map((l, i) => {
          const { qty, unit, ex, af, rate, iva, total } = calcLineAmounts(l);

          return {
            company_id: companyId,
            trade_doc_id: savedId,
            line_no: i + 1,
            sku: l.sku || null,
            description: l.description || null,

            // NUEVOS
            qty,
            unit_price: unit,
            tax_kind: l.is_taxable ? "AFECTO" : "EXENTO",

            // COMPATIBILIDAD / TOTALES
            exempt_amount: ex,
            taxable_amount: af,
            tax_rate: rate,
            tax_amount: iva,
            line_total: total,
          };
        });

      const usedLinesFallback = usedLines.map((x) => ({
        company_id: x.company_id,
        trade_doc_id: x.trade_doc_id,
        line_no: x.line_no,
        sku: x.sku,
        description: x.description,
        qty: 1,
        unit_price: x.line_total,
        discount_amount: 0,
        tax_rate: x.tax_rate,
      }));

      if (usedLines.length) {
        await safeInsertMany("trade_doc_lines", usedLines, usedLinesFallback);
      }

      // payments
      await supabase.from("trade_doc_payments").delete().eq("company_id", companyId).eq("trade_doc_id", savedId);

      const usedPayments = payments
        .filter((p) => toNum(p.amount) > 0)
        .map((p) => ({
          company_id: companyId,
          trade_doc_id: savedId,
          method: p.method,
          amount: toNum(p.amount),
          reference: p.reference || null,
          card_kind: p.method === "TARJETA" ? (p.card_kind || null) : null,
          card_last4: p.method === "TARJETA" ? (p.card_last4 || null) : null,
          auth_code: p.method === "TARJETA" ? (p.auth_code || null) : null,
        }));

      const usedPaymentsFallback = usedPayments.map((x) => {
        const { card_kind, card_last4, auth_code, ...rest } = x as any;
        return rest;
      });

      if (usedPayments.length) {
        await safeInsertMany("trade_doc_payments", usedPayments, usedPaymentsFallback);
      }

      // journal
      await supabase.from("trade_doc_journal_lines").delete().eq("company_id", companyId).eq("trade_doc_id", savedId);

      const usedJ = journalLines
        .filter(
          (l) =>
            l.account_code.trim() ||
            toNum(l.debit) > 0 ||
            toNum(l.credit) > 0 ||
            l.description.trim() ||
            l.cost_center_code.trim() ||
            l.business_line_code.trim() ||
            l.branch_code.trim()
        )
        .map((l, i) => ({
          company_id: companyId,
          trade_doc_id: savedId,
          line_no: i + 1,
          account_code: l.account_code || null,
          description: l.description || null,
          debit: toNum(l.debit),
          credit: toNum(l.credit),
          cost_center_code: l.cost_center_code || null,
          business_line_code: l.business_line_code || null,
          branch_code: l.branch_code || null,
        }));

      if (usedJ.length) {
        const { error } = await supabase.from("trade_doc_journal_lines").insert(usedJ as any);
        if (error) throw error;
      }

      setMessages([{ level: "warn", text: "Borrador guardado." }]);
      await loadDrafts();
    } catch (e: any) {
      setMessages([{ level: "error", text: e?.message || "No se pudo guardar el borrador." }]);
    }
  }

  async function markAsVigenteMVP() {
    if (!companyId || !docId || !canEdit) return;
    try {
      const { error } = await supabase
        .from("trade_docs")
        .update({ status: "VIGENTE", cancelled_at: null, cancel_reason: null })
        .eq("company_id", companyId)
        .eq("id", docId);
      if (error) throw error;

      setHeaderPatch({ status: "VIGENTE", cancelled_at: "", cancel_reason: "" });
      setMessages([{ level: "warn", text: "Documento marcado como VIGENTE." }]);
      await loadDrafts();
      closeEditor();
    } catch (e: any) {
      setMessages([{ level: "error", text: e?.message || "No se pudo actualizar el estatus." }]);
    }
  }

  async function cancelDocMVP() {
    // ✅ Seguridad extra: solo permitir si está configurado y si está VIGENTE
    if (!allowCancelSales) {
      setMessages([{ level: "error", text: "La empresa tiene deshabilitada la cancelación de ventas." }]);
      return;
    }
    if (header.status !== "VIGENTE") {
      setMessages([{ level: "error", text: "Solo puedes cancelar documentos VIGENTES." }]);
      return;
    }

    if (!companyId || !docId || !canEdit) return;

    const ok = confirm("¿Cancelar este documento? Se guardará fecha y motivo.");
    if (!ok) return;

    try {
      const cancelled_at = header.cancelled_at || todayISO();

      const { error } = await supabase
        .from("trade_docs")
        .update({
          status: "CANCELADO",
          cancelled_at,
          cancel_reason: header.cancel_reason || null,
        })
        .eq("company_id", companyId)
        .eq("id", docId);

      if (error) throw error;

      setHeaderPatch({ status: "CANCELADO", cancelled_at });
      setMessages([{ level: "warn", text: `Documento CANCELADO (${cancelled_at}).` }]);
      await loadDrafts();
    } catch (e: any) {
      setMessages([{ level: "error", text: e?.message || "No se pudo cancelar el documento." }]);
    }
  }

  async function openDraft(draftId: string) {
    if (!companyId) return;

    try {
      setMessages([]);

      const { data: h, error: he } = await supabase
        .from("trade_docs")
        .select(
          [
            "id",
            "doc_type",
            "status",
            "issue_date",
            "due_date",
            "series",
            "number",
            "currency_code",
            "counterparty_identifier",
            "counterparty_name",
            "reference",
            "notes",
            "cancelled_at",
            "cancel_reason",
            "origin_doc_id",
            "fiscal_doc_code",
          ].join(",")
        )
        .eq("company_id", companyId)
        .eq("id", draftId)
        .single();
      if (he) throw he;

      // Lines: intentamos esquema nuevo, si falla volvemos a esquema viejo
      let ls: any[] = [];
      try {
        const { data, error } = await supabase
          .from("trade_doc_lines")
         .select("line_no,sku,description,qty,unit_price,tax_kind,exempt_amount,taxable_amount,tax_rate,tax_amount,line_total")
          .eq("company_id", companyId)
          .eq("trade_doc_id", draftId)
          .order("line_no", { ascending: true });
        if (error) throw error;
        ls = (data as any[]) || [];
      } catch (e: any) {
        if (!isUnknownColumnError(e)) throw e;

        const { data, error } = await supabase
          .from("trade_doc_lines")
          .select("line_no,sku,description,qty,unit_price,discount_amount,tax_rate")
          .eq("company_id", companyId)
          .eq("trade_doc_id", draftId)
          .order("line_no", { ascending: true });
        if (error) throw error;

        ls = ((data as any[]) || []).map((r) => {
          const qty = Number(r.qty || 0);
          const unit = Number(r.unit_price || 0);
          const disc = Number(r.discount_amount || 0);
          const base = Math.max(0, qty * unit - disc);
          return {
            line_no: r.line_no,
            sku: r.sku,
            description: r.description,
            exempt_amount: 0,
            taxable_amount: base,
            tax_rate: Number(r.tax_rate || 0),
            tax_amount: base * (Number(r.tax_rate || 0) / 100),
            line_total: base + base * (Number(r.tax_rate || 0) / 100),
          };
        });
      }

      const { data: ps, error: pe } = await supabase
        .from("trade_doc_payments")
        .select("method,amount,reference,card_kind,card_last4,auth_code")
        .eq("company_id", companyId)
        .eq("trade_doc_id", draftId);
      if (pe) throw pe;

      const { data: js, error: je } = await supabase
        .from("trade_doc_journal_lines")
        .select("line_no,account_code,description,debit,credit,cost_center_code,business_line_code,branch_code")
        .eq("company_id", companyId)
        .eq("trade_doc_id", draftId)
        .order("line_no", { ascending: true });
      if (je) throw je;

      setDocId((h as any).id);

      const originId = (h as any).origin_doc_id ?? null;
      let originLabel = "";
      if (originId) {
        const { data: od } = await supabase
          .from("trade_docs")
          .select("series,number")
          .eq("company_id", companyId)
          .eq("id", originId)
          .maybeSingle();
        originLabel = folioLabel((od as any)?.series, (od as any)?.number);
      }

      setHeader({
        doc_type: (h as any).doc_type,
        fiscal_doc_code: String((h as any).fiscal_doc_code ?? ""),
        status: (h as any).status,
        issue_date: (h as any).issue_date || todayISO(),
        due_date: (h as any).due_date || (h as any).issue_date || todayISO(),
        series: (h as any).series || "",
        number: (h as any).number || "",
        currency_code: (h as any).currency_code || baseCurrency,
        counterparty_identifier: (h as any).counterparty_identifier || "",
        counterparty_name: (h as any).counterparty_name || "",
        reference: (h as any).reference || "",
        notes: (h as any).notes || "",
        cancelled_at: (h as any).cancelled_at || "",
        cancel_reason: (h as any).cancel_reason || "",
        origin_doc_id: originId,
        origin_label: originLabel,
      });

      const parsedLines: DocLine[] = (ls || []).map((r: any) => ({
        line_no: Number(r.line_no) || 1,
        sku: r.sku || "",
        description: r.description || "",

        qty: r.qty != null ? String(r.qty) : "1",
        unit_price: r.unit_price != null ? String(r.unit_price) : "",

        // ✅ boolean para UI
        is_taxable: r.tax_kind === "EXENTO" ? false : true,

        tax_rate: r.tax_rate != null ? String(r.tax_rate) : (defaultTaxRate || "19"),

        // ✅ overrides vacíos al abrir (por ahora)
        ex_override: "",
        af_override: "",
        iva_override: "",
        total_override: "",
      }));

      setLines(
        parsedLines.length >= 10
          ? renumber(parsedLines)
          : renumber([
              ...parsedLines,
              ...Array.from({ length: 10 - parsedLines.length }, (_, i) => makeDocLine(parsedLines.length + i + 1)),
            ])
      );

      const parsedPayments: PaymentRow[] =
        (((ps as any) || []) as any[]).length > 0
          ? (((ps as any) || []) as any[]).map((r: any) => ({
              id: uid(),
              method: r.method || "TRANSFERENCIA",
              amount: r.amount != null ? String(r.amount) : "",
              reference: r.reference || "",
              card_kind: r.card_kind || "",
              card_last4: r.card_last4 || "",
              auth_code: r.auth_code || "",
            }))
          : [];
      setPayments(parsedPayments);

      const parsedJ: JournalLine[] = (((js as any) || []) as any[]).map((r: any) => ({
        line_no: Number(r.line_no) || 1,
        account_code: r.account_code || "",
        description: r.description || "",
        debit: r.debit != null && Number(r.debit) > 0 ? String(r.debit) : "",
        credit: r.credit != null && Number(r.credit) > 0 ? String(r.credit) : "",
        cost_center_code: r.cost_center_code || "",
        business_line_code: r.business_line_code || "",
        branch_code: r.branch_code || "",
      }));

      setJournalLines(
        parsedJ.length >= 10
          ? renumber(parsedJ)
          : renumber([
              ...parsedJ,
              ...Array.from({ length: 10 - parsedJ.length }, (_, i) => makeJournalLine(parsedJ.length + i + 1)),
            ])
      );

      setEditorTab("CABECERA");
      setOriginPanelOpen(false);
      setEditorOpen(true);
    } catch (e: any) {
      setMessages([{ level: "error", text: e?.message || "No se pudo abrir el borrador." }]);
    }
  }

  async function deleteDraft(draftId: string) {
    if (!companyId || !canEdit) return;
    const ok = confirm("¿Eliminar este borrador? No se puede deshacer.");
    if (!ok) return;

    setDrafts((prev) => prev.filter((d) => d.id !== draftId));
    setSelectedDrafts((prev) => {
      const next = { ...prev };
      delete next[draftId];
      return next;
    });

    try {
      await supabase.from("trade_doc_lines").delete().eq("company_id", companyId).eq("trade_doc_id", draftId);
      await supabase.from("trade_doc_payments").delete().eq("company_id", companyId).eq("trade_doc_id", draftId);
      await supabase.from("trade_doc_journal_lines").delete().eq("company_id", companyId).eq("trade_doc_id", draftId);

      const { error } = await supabase
        .from("trade_docs")
        .delete()
        .eq("company_id", companyId)
        .eq("id", draftId)
        .eq("status", "BORRADOR");
      if (error) throw error;

      if (docId === draftId) clearForm();
      setMessages([{ level: "warn", text: "Borrador eliminado." }]);
      await loadDrafts();
    } catch (e: any) {
      setMessages([{ level: "error", text: e?.message || "No se pudo eliminar el borrador." }]);
      await loadDrafts();
    }
  }

  const badgeStatus = useMemo(() => {
    return header.status === "VIGENTE"
      ? "bg-emerald-100 text-emerald-800"
      : header.status === "CANCELADO"
      ? "bg-rose-100 text-rose-800"
      : "bg-slate-100 text-slate-800";
  }, [header.status]);

  const badgeType = useMemo(() => {
    const map: Record<DocType, string> = {
      FACTURA: "bg-sky-100 text-sky-800",
      BOLETA: "bg-indigo-100 text-indigo-800",
      NC: "bg-amber-100 text-amber-900",
      ND: "bg-fuchsia-100 text-fuchsia-800",
    };
    return map[header.doc_type];
  }, [header.doc_type]);

  const tabs: Array<{ key: EditorTab; label: string; hint: string }> = [
    { key: "CABECERA", label: "Cabecera", hint: "datos generales y estatus" },
    { key: "LINEAS", label: "Líneas", hint: "montos afecto/exento + IVA" },
    { key: "PAGOS", label: "Formas de pago", hint: "métodos y montos" },
    { key: "ASIENTO", label: "Asiento contable", hint: "distribución manual" },
  ];

  // =========================
  // Excel import handlers
  // =========================
  function openImport() {
    setImportErrors([]);
    setImportPreview([]);
    setImportOpen(true);
  }
  function closeImport() {
    setImportOpen(false);
  }

  async function onPickExcel(file: File) {
    setImportErrors([]);
    setImportPreview([]);

    try {
      const ab = await file.arrayBuffer();
      const wb = XLSX.read(ab, { type: "array" });

      const ws = wb.Sheets["Ventas"] || wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: "" }) as any[];

      const cleaned = rows
        .map((r) => ({
          doc_type: String(r.doc_type || r.DocType || r.tipo || "FACTURA").toUpperCase(),
          fiscal_doc_code: String(r.fiscal_doc_code || r.fiscal || r.codigo_fiscal || "").trim(),
          issue_date: String(r.issue_date || r.emision || r.fecha_emision || todayISO()).slice(0, 10),
          due_date: String(r.due_date || r.vencimiento || r.fecha_vencimiento || r.issue_date || todayISO()).slice(0, 10),
          series: String(r.series || r.serie || "").trim(),
          number: String(r.number || r.folio || r.numero || "").trim(),
          currency_code: String(r.currency_code || r.moneda || baseCurrency || "CLP").toUpperCase(),
          counterparty_identifier: String(r.counterparty_identifier || r.rut || r.rfc || r.nit || "").trim(),
          counterparty_name: String(r.counterparty_name || r.nombre || r.razon_social || "").trim(),
          reference: String(r.reference || r.referencia || "").trim(),
          notes: String(r.notes || r.notas || "").trim(),
        }))
        .filter((x) => x.counterparty_identifier || x.counterparty_name || x.number || x.series);

      const errs: string[] = [];
      cleaned.forEach((x, i) => {
        if (!x.doc_type) errs.push(`Fila ${i + 2}: doc_type vacío.`);
        if (!x.issue_date) errs.push(`Fila ${i + 2}: issue_date vacío.`);
        if (fiscalCfg.enabled && fiscalCfg.require_sales && !x.fiscal_doc_code) {
          errs.push(`Fila ${i + 2}: fiscal_doc_code obligatorio según configuración.`);
        }
      });

      setImportErrors(errs);
      setImportPreview(cleaned.slice(0, 200));
    } catch (e: any) {
      setImportErrors([e?.message || "No se pudo leer el archivo."]);
    }
  }

  async function confirmImportToDrafts() {
    if (!companyId || !canEdit) return;
    if (importErrors.length) return;
    if (!importPreview.length) return;

    setImporting(true);
    try {
      const payload = importPreview.map((x) => ({
        company_id: companyId,
        doc_type: x.doc_type,
        status: "BORRADOR",
        issue_date: x.issue_date || todayISO(),
        due_date: x.due_date || x.issue_date || todayISO(),
        series: x.series || null,
        number: x.number || null,
        currency_code: x.currency_code || baseCurrency,

        fiscal_doc_code: x.fiscal_doc_code || null,

        counterparty_identifier: x.counterparty_identifier || null,
        counterparty_name: x.counterparty_name || null,
        reference: x.reference || null,
        notes: x.notes || null,

        net_taxable: 0,
        net_exempt: 0,
        tax_total: 0,
        grand_total: 0,
      }));

      const chunkSize = 200;
      for (let i = 0; i < payload.length; i += chunkSize) {
        const chunk = payload.slice(i, i + chunkSize);
        const { error } = await supabase.from("trade_docs").insert(chunk as any);
        if (error) throw error;
      }

      setMessages([{ level: "warn", text: `Carga masiva OK: ${payload.length} borradores creados.` }]);
      closeImport();
      await loadDrafts();
    } catch (e: any) {
      setMessages([{ level: "error", text: e?.message || "No se pudo importar." }]);
    } finally {
      setImporting(false);
    }
  }

  async function bulkRegisterSelected() {
    if (!canEdit || !companyId) return;
    if (selectedIds.length === 0) return;

    const ok = confirm(`¿Registrar ${selectedIds.length} borrador(es) como VIGENTE?`);
    if (!ok) return;

    try {
      const chunk = 200;
      for (let i = 0; i < selectedIds.length; i += chunk) {
        const part = selectedIds.slice(i, i + chunk);
        const { error } = await supabase
          .from("trade_docs")
          .update({ status: "VIGENTE" })
          .eq("company_id", companyId)
          .in("id", part)
          .eq("status", "BORRADOR");
        if (error) throw error;
      }
      setMessages([{ level: "warn", text: "Borradores registrados." }]);
      clearSelection();
      await loadDrafts();
    } catch (e: any) {
      setMessages([{ level: "error", text: e?.message || "No se pudo registrar." }]);
      await loadDrafts();
    }
  }

  async function bulkDeleteSelected() {
    if (!canEdit || !companyId) return;
    if (selectedIds.length === 0) return;

    const ok = confirm(`¿Eliminar ${selectedIds.length} borrador(es)? No se puede deshacer.`);
    if (!ok) return;

    try {
      const chunk = 100;
      for (let i = 0; i < selectedIds.length; i += chunk) {
        const part = selectedIds.slice(i, i + chunk);

        await supabase.from("trade_doc_lines").delete().eq("company_id", companyId).in("trade_doc_id", part);
        await supabase.from("trade_doc_payments").delete().eq("company_id", companyId).in("trade_doc_id", part);
        await supabase.from("trade_doc_journal_lines").delete().eq("company_id", companyId).in("trade_doc_id", part);

        const { error } = await supabase
          .from("trade_docs")
          .delete()
          .eq("company_id", companyId)
          .in("id", part)
          .eq("status", "BORRADOR");
        if (error) throw error;
      }

      setMessages([{ level: "warn", text: "Borradores eliminados." }]);
      clearSelection();
      await loadDrafts();
    } catch (e: any) {
      setMessages([{ level: "error", text: e?.message || "No se pudo eliminar." }]);
      await loadDrafts();
    }
  }

  // ✅ Estatus solo visible cuando el documento ya existe (borrador / vigente / cancelado)
  const showStatusSection = Boolean(docId);

  // ✅ regla visual: botón cancelar solo si es VIGENTE (contabilizado) + permitido por settings
  const showCancelButton = allowCancelSales && canEdit && Boolean(docId) && header.status === "VIGENTE";

  return (
    <div className="p-6">
      <div className={theme.shell}>
        <div className={cls(theme.header, "px-7 py-7")}>
          <div className={theme.glowA} />
          <div className={theme.glowB} />

          <div className="relative flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[12px] font-extrabold uppercase text-white/80">Ventas</div>
              <h1 className="mt-1 text-3xl font-black leading-tight">Documentos tributarios</h1>

              <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/90">
                <span className="inline-flex items-center rounded-full bg-white/10 px-2 py-0.5 ring-1 ring-white/15">
                  Borradores: <b className="ml-1">{draftsSummary.count}</b>
                </span>
                <span className="inline-flex items-center rounded-full bg-white/10 px-2 py-0.5 ring-1 ring-white/15">
                  Total borradores: <b className="ml-1">{formatNumber(draftsSummary.sumTotal, moneyDecimals)}</b>
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button className={theme.btnGlass} onClick={loadDrafts}>
                {loadingDrafts ? "Cargando..." : "Refrescar"}
              </button>

              <button
                className={cls(theme.btnGlass, !canEdit && "opacity-60 cursor-not-allowed")}
                disabled={!canEdit}
                onClick={openImport}
                title="Importar documentos desde Excel"
              >
                ⬆️ Cargar Excel
              </button>

              <button
                className={cls(theme.btnGlass, !canEdit && "opacity-60 cursor-not-allowed")}
                disabled={!canEdit}
                onClick={openNewDoc}
                title="Crear un borrador nuevo"
              >
                + Nuevo documento
              </button>
            </div>
          </div>
        </div>

        {messages.length ? (
          <div className="border-t bg-white px-7 py-4">
            <div className="space-y-2">
              {messages.slice(0, 8).map((m, i) => (
                <div
                  key={i}
                  className={cls(
                    "rounded-xl border px-3 py-2 text-sm",
                    m.level === "error" ? "border-rose-200 bg-rose-50 text-rose-900" : "border-amber-200 bg-amber-50 text-amber-900"
                  )}
                >
                  {m.text}
                </div>
              ))}
            </div>

            {!canEdit ? (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                Modo solo lectura (role: {role || "—"}).
              </div>
            ) : null}
          </div>
        ) : !canEdit ? (
          <div className="border-t bg-white px-7 py-4">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Modo solo lectura (role: {role || "—"}).
            </div>
          </div>
        ) : null}

        <div className="p-7">
          <div className={theme.card}>
            <div className="px-4 py-3 border-b flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="font-semibold text-slate-900">Borradores</h2>
                <div className="text-[11px] text-slate-500">Sin scroll horizontal: columnas ajustadas.</div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button className={theme.btnSoft} onClick={loadDrafts}>
                  {loadingDrafts ? "Cargando..." : "Refrescar"}
                </button>

                {drafts.length ? (
                  <>
                    <button className={theme.btnSoft} onClick={toggleSelectAll} disabled={!canEdit}>
                      {allSelected ? "Quitar selección" : "Seleccionar todo"}
                    </button>
                    <button className={theme.btnSoft} onClick={clearSelection}>
                      Limpiar
                    </button>

                    <button
                      className={cls(theme.btnPrimary, (!canEdit || selectedIds.length === 0) && "opacity-60 cursor-not-allowed")}
                      disabled={!canEdit || selectedIds.length === 0}
                      onClick={bulkRegisterSelected}
                      title="Registrar seleccionados"
                    >
                      Registrar ({selectedIds.length})
                    </button>

                    <button
                      className={cls(theme.btnSoft, (!canEdit || selectedIds.length === 0) && "opacity-60 cursor-not-allowed")}
                      disabled={!canEdit || selectedIds.length === 0}
                      onClick={bulkDeleteSelected}
                      title="Eliminar seleccionados"
                    >
                      Eliminar ({selectedIds.length})
                    </button>
                  </>
                ) : null}
              </div>
            </div>

            {/* ✅ sin scroll horizontal: usamos % */}
            <div className="border-t border-slate-200 overflow-x-hidden">
              <div className="overflow-hidden">
                <table className="w-full table-fixed border-collapse text-sm">
                  <colgroup>
                    <col style={{ width: "4%" }} />
                    <col style={{ width: "10%" }} />
                    <col style={{ width: "6%" }} />
                    <col style={{ width: "12%" }} />
                    <col style={{ width: "12%" }} />
                    <col style={{ width: "18%" }} />
                    <col style={{ width: "9%" }} />
                    <col style={{ width: "9%" }} />
                    <col style={{ width: "9%" }} />
                    <col style={{ width: "9%" }} />
                    <col style={{ width: "12%" }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th className={headerCell}>
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={toggleSelectAll}
                          disabled={!canEdit || drafts.length === 0}
                          title="Seleccionar todo"
                        />
                      </th>
                      <th className={headerCell}><b>Emisión</b><span className={headerSub}>issue_date</span></th>
                      <th className={headerCell}><b>Cód</b><span className={headerSub}>fiscal</span></th>
                      <th className={headerCell}><b>Folio</b><span className={headerSub}>serie/n°</span></th>
                      <th className={headerCell}><b>RUT/NIC</b><span className={headerSub}>titular</span></th>
                      <th className={headerCell}><b>Nombre Contraparte</b><span className={headerSub}>titular</span></th>
                      <th className={cls(headerCell, "text-right")}><b>Afecto</b><span className={headerSub}>net</span></th>
                      <th className={cls(headerCell, "text-right")}><b>Exento</b><span className={headerSub}>ex</span></th>
                      <th className={cls(headerCell, "text-right")}><b>IVA</b><span className={headerSub}>iva</span></th>
                      <th className={cls(headerCell, "text-right")}><b>Total</b><span className={headerSub}>total</span></th>
                      <th className={cls(headerCell, "text-right")}><span className={headerSub}>acciones</span></th>
                    </tr>
                  </thead>
                </table>
              </div>

              <div className="max-h-[520px] overflow-y-auto overflow-x-hidden">
                <table className="w-full table-fixed border-collapse text-sm">
                  <colgroup>
                    <col style={{ width: "4%" }} />
                    <col style={{ width: "10%" }} />
                    <col style={{ width: "6%" }} />
                    <col style={{ width: "12%" }} />
                    <col style={{ width: "12%" }} />
                    <col style={{ width: "18%" }} />
                    <col style={{ width: "9%" }} />
                    <col style={{ width: "9%" }} />
                    <col style={{ width: "9%" }} />
                    <col style={{ width: "9%" }} />
                    <col style={{ width: "12%" }} />
                  </colgroup>

                  <tbody>
                    {drafts.length === 0 ? (
                      <tr>
                        <td className="p-4 text-sm text-slate-600" colSpan={11}>
                          No hay borradores.
                        </td>
                      </tr>
                    ) : (
                      drafts.map((d, idx) => {
                        const rowBg = idx % 2 === 0 ? "bg-slate-50/80" : "bg-slate-100/50";
                        const checked = Boolean(selectedDrafts[d.id]);
                        return (
                          <tr key={d.id} className={cls(rowBg, "hover:bg-sky-50/30")}>
                            <td className={cls(bodyCell, "text-center")}>
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={!canEdit}
                                onChange={(e) => toggleDraft(d.id, e.target.checked)}
                                title="Seleccionar"
                              />
                            </td>

                            <td className={cls(bodyCell, "text-xs")}>{d.issue_date || "—"}</td>
                            <td className={cls(bodyCell, "font-semibold")}>{d.fiscal_doc_code || "—"}</td>
                            <td className={bodyCell}>
                              <div className="truncate" title={folioLabel(d.series, d.number)}>
                                {folioLabel(d.series, d.number)}
                              </div>
                              <div className="text-[11px] text-slate-500">{d.doc_type}</div>
                            </td>
                            <td className={cls(bodyCell, "truncate")} title={d.counterparty_identifier || ""}>
                              {d.counterparty_identifier || "—"}
                            </td>
                            <td className={bodyCell} title={d.counterparty_name || ""}>
                              {ellipsis(d.counterparty_name || "—", 28)}
                            </td>
                            <td className={cls(bodyCell, "text-right")}>{formatNumber(Number(d.net_taxable || 0), moneyDecimals)}</td>
                            <td className={cls(bodyCell, "text-right")}>{formatNumber(Number(d.net_exempt || 0), moneyDecimals)}</td>
                            <td className={cls(bodyCell, "text-right")}>{formatNumber(Number(d.tax_total || 0), moneyDecimals)}</td>
                            <td className={cls(bodyCell, "text-right")}>{formatNumber(Number(d.grand_total || 0), moneyDecimals)}</td>
                            <td className={cls(bodyCell, "text-right")}>
                              <div className="flex justify-end gap-2">
                                <button className={theme.btnSoft} onClick={() => openDraft(d.id)}>
                                  Editar
                                </button>
                                <button
                                  className={cls(
                                    "rounded-lg px-3 py-2 text-sm text-white",
                                    !canEdit ? "bg-slate-400" : "bg-slate-900 hover:bg-slate-800"
                                  )}
                                  disabled={!canEdit}
                                  onClick={async () => {
                                    try {
                                      const { error } = await supabase
                                        .from("trade_docs")
                                        .update({ status: "VIGENTE" })
                                        .eq("company_id", companyId)
                                        .eq("id", d.id)
                                        .eq("status", "BORRADOR");
                                      if (error) throw error;
                                      setMessages([{ level: "warn", text: "Documento registrado (VIGENTE)." }]);
                                      clearSelection();
                                      await loadDrafts();
                                    } catch (e: any) {
                                      setMessages([{ level: "error", text: e?.message || "No se pudo registrar." }]);
                                      await loadDrafts();
                                    }
                                  }}
                                >
                                  Registrar
                                </button>
                                <button
                                  className={cls(theme.btnSoft, !canEdit ? "opacity-60 cursor-not-allowed" : "hover:text-rose-700")}
                                  disabled={!canEdit}
                                  onClick={() => deleteDraft(d.id)}
                                >
                                  Eliminar
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="mt-6 text-center text-[12px] text-slate-500">ConciliaciónPro • Ventas</div>
        </div>
      </div>

      {/* =======================
          EDITOR MODAL
         ======================= */}
      <Modal
        open={editorOpen}
        title={docId ? `Editar documento (${docId.slice(0, 8)}…)` : "Nuevo documento"}
        subtitle="Ventas • Editor"
        onClose={closeEditor}
        widthClass="w-[min(1200px,96vw)]"
        footer={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2 text-xs text-slate-700">
              <span className={cls("inline-flex items-center rounded-full px-2 py-0.5", badgeType)}>
                Tipo: <b className="ml-1">{header.doc_type}</b>
              </span>
              <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5">
                Cód: <b className="ml-1">{header.fiscal_doc_code || "—"}</b>
              </span>
              <span className={cls("inline-flex items-center rounded-full px-2 py-0.5", badgeStatus)}>
                Estatus: <b className="ml-1">{header.status}</b>
              </span>
              <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5">
                Afecto: <b className="ml-1">{formatNumber(totals.net_taxable, moneyDecimals)}</b>
                <span className="mx-2 text-slate-300">|</span>
                Exento: <b className="ml-1">{formatNumber(totals.net_exempt, moneyDecimals)}</b>
                <span className="mx-2 text-slate-300">|</span>
                IVA: <b className="ml-1">{formatNumber(totals.tax_total, moneyDecimals)}</b>
                <span className="mx-2 text-slate-300">|</span>
                Total: <b className="ml-1">{formatNumber(totals.grand_total, moneyDecimals)}</b>
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button className={theme.btnSoft} onClick={closeEditor}>
                Cerrar
              </button>

              <button
                className={cls(theme.btnSoft, !canEdit && "opacity-60 cursor-not-allowed")}
                disabled={!canEdit}
                onClick={saveDraftMVP}
              >
                Guardar borrador
              </button>

              <button
                className={cls(theme.btnPrimary, (!canEdit || !docId) && "opacity-60 cursor-not-allowed")}
                disabled={!canEdit || !docId}
                onClick={markAsVigenteMVP}
              >
                Registrar (vigente)
              </button>

              {/* ✅ SOLO VIGENTE + permitido por settings */}
              {showCancelButton ? (
                <button className={theme.btnSoft} onClick={cancelDocMVP}>
                  Cancelar
                </button>
              ) : null}
            </div>
          </div>
        }
      >
        {/* Tabs */}
        <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-2">
          <div className="flex flex-wrap gap-2">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => {
                  setEditorTab(t.key);
                  if (t.key !== "CABECERA") setOriginPanelOpen(false);
                }}
                className={cls(
                  "rounded-2xl px-4 py-2 text-[12px] font-extrabold transition ring-1",
                  editorTab === t.key
                    ? "bg-slate-900 text-white ring-slate-900"
                    : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
                )}
                title={t.hint}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* CABECERA */}
        {editorTab === "CABECERA" ? (
          <div className="space-y-4">
            <div className={theme.card}>
              <div className="px-4 py-3 border-b">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Cabecera</div>
                    <div className="text-[11px] text-slate-500">Datos generales del documento.</div>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Moneda base: <b className="text-slate-700">{baseCurrency}</b>
                  </div>
                </div>
              </div>

              <div className="px-4 py-3 grid grid-cols-1 md:grid-cols-4 gap-3">
                {/* ✅ Fila 1: layout custom sin romper el resto */}
                <div className="md:col-span-4">
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                    {/* Tipo documento MÁS ANCHO */}
                    <div className="md:col-span-6">
                      <label className="block">
                        <LabelInline label="Tipo documento" field="doc_type / fiscal_doc_code" />
                      </label>

                      <div className="mt-1 grid grid-cols-[220px_1fr] gap-2">
                        <select
                          className="w-full rounded-lg border px-2 py-2 text-sm"
                          disabled={!canEdit}
                          value={header.doc_type}
                          onChange={(e) => {
                            const v = e.target.value as DocType;
                            setHeaderPatch({
                              doc_type: v,
                              origin_doc_id: v === "NC" || v === "ND" ? header.origin_doc_id : null,
                              origin_label: v === "NC" || v === "ND" ? header.origin_label : "",
                            });
                            if (v !== "NC" && v !== "ND") setOriginPanelOpen(false);
                          }}
                        >
                          <option value="FACTURA">FACTURA</option>
                          <option value="NC">NOTA DE CRÉDITO</option>
                          <option value="ND">NOTA DE DÉBITO</option>
                        </select>

                        {fiscalCfg.enabled ? (
                          <select
                            className="w-full rounded-lg border px-2 py-2 text-sm"
                            disabled={!canEdit}
                            value={header.fiscal_doc_code}
                            onChange={(e) => setHeaderPatch({ fiscal_doc_code: e.target.value })}
                            title="Selecciona el tipo fiscal configurado"
                          >
                            <option value="">
                              {fiscalCfg.require_sales ? "Selecciona (obligatorio)" : "Selecciona (opcional)"}
                            </option>
                            {fiscalDocTypes.map((t) => (
                              <option key={t.id} value={t.code}>
                                {t.code} • {t.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            className="w-full rounded-lg border px-2 py-2 text-sm"
                            disabled={!canEdit}
                            value={header.fiscal_doc_code}
                            onChange={(e) => setHeaderPatch({ fiscal_doc_code: e.target.value })}
                            placeholder="Ej: CL 33 / MX I"
                            title="Código fiscal libre (activa Documentos Fiscales para usar catálogo)"
                          />
                        )}
                      </div>

                      {fiscalCfg.enabled && fiscalCfg.require_sales ? (
                        <div className="mt-1 text-[11px] text-slate-500">
                          * Obligatorio (según configuración de Documentos fiscales).
                        </div>
                      ) : null}
                    </div>

                    <div className="md:col-span-2">
                      <label className="block">
                        <LabelInline label="Emisión" field="issue_date" />
                      </label>
                      <input
                        type="date"
                        className="mt-1 w-full rounded-lg border px-2 py-2 text-sm"
                        disabled={!canEdit}
                        value={header.issue_date}
                        onChange={(e) => setHeaderPatch({ issue_date: e.target.value })}
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block">
                        <LabelInline label="Vencimiento" field="due_date" />
                      </label>
                      <input
                        type="date"
                        className="mt-1 w-full rounded-lg border px-2 py-2 text-sm"
                        disabled={!canEdit}
                        value={header.due_date}
                        onChange={(e) => setHeaderPatch({ due_date: e.target.value })}
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block">
                        <LabelInline label="Moneda" field="currency_code" />
                      </label>
                      <input
                        className="mt-1 w-full rounded-lg border px-2 py-2 text-sm"
                        disabled={!canEdit}
                        value={header.currency_code}
                        onChange={(e) => setHeaderPatch({ currency_code: e.target.value.toUpperCase() })}
                        placeholder={baseCurrency}
                      />
                    </div>
                  </div>
                </div>

                {/* Serie + Folio */}
                <div className="md:col-span-2">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-1">
                      <label className="block">
                        <LabelInline label="Serie (opcional)" field="series" />
                      </label>
                      <input
                        className="mt-1 w-full rounded-lg border px-2 py-2 text-sm"
                        disabled={!canEdit}
                        value={header.series}
                        onChange={(e) => setHeaderPatch({ series: e.target.value })}
                        placeholder="F001"
                      />
                    </div>

                    <div className="col-span-2">
                      <label className="block">
                        <LabelInline label="Folio" field="number" />
                      </label>
                      <input
                        className="mt-1 w-full rounded-lg border px-2 py-2 text-sm"
                        disabled={!canEdit}
                        value={header.number}
                        onChange={(e) => setHeaderPatch({ number: e.target.value })}
                        placeholder="000123 / Folio largo (MX)"
                      />
                    </div>
                  </div>
                </div>

                <div className="md:col-span-2">
                  <label className="block">
                    <LabelInline label="Referencia" field="reference" />
                  </label>
                  <input
                    className="mt-1 w-full rounded-lg border px-2 py-2 text-sm"
                    disabled={!canEdit}
                    value={header.reference}
                    onChange={(e) => setHeaderPatch({ reference: e.target.value })}
                    placeholder="OC-123 / Pedido-456"
                  />
                </div>

                <div>
                  <label className="block">
                    <LabelInline label="RUT/NIT/RFC" field="counterparty_identifier" />
                  </label>
                  <input
                    className="mt-1 w-full rounded-lg border px-2 py-2 text-sm"
                    disabled={!canEdit}
                    value={header.counterparty_identifier}
                    onChange={(e) => setHeaderPatch({ counterparty_identifier: e.target.value })}
                    placeholder="Identificador"
                  />
                </div>

                <div className="md:col-span-3">
                  <label className="block">
                    <LabelInline label="Nombre titular" field="counterparty_name" />
                  </label>
                  <input
                    className="mt-1 w-full rounded-lg border px-2 py-2 text-sm"
                    disabled={!canEdit}
                    value={header.counterparty_name}
                    onChange={(e) => setHeaderPatch({ counterparty_name: e.target.value })}
                    placeholder="Razón social"
                  />
                </div>

                <div className="md:col-span-4">
                  <label className="block">
                    <LabelInline label="Notas" field="notes" />
                  </label>
                  <textarea
                    className="mt-1 w-full rounded-lg border px-2 py-2 text-sm max-h-[38px]"
                    disabled={!canEdit}
                    value={header.notes}
                    onChange={(e) => setHeaderPatch({ notes: e.target.value })}
                    placeholder="Observaciones internas..."
                  />
                </div>
              </div>

              {/* ORIGEN NC/ND */}
              {needsOrigin ? (
                <div className="px-4 pb-4">
                  <div className="rounded-2xl border bg-slate-50 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">Documento origen (NC/ND)</div>
                        <div className="text-[11px] text-slate-600">Busca por folio/serie/número y asigna la NC/ND.</div>
                      </div>

                      <div className="flex gap-2">
                        <button
                          className={cls(theme.btnSoft, !canEdit ? "opacity-60 cursor-not-allowed" : "hover:bg-white")}
                          disabled={!canEdit}
                          onClick={() => {
                            setOriginPanelOpen((v) => !v);
                            setOriginResults([]);
                            setOriginQuery("");
                          }}
                        >
                          {originPanelOpen ? "Cerrar búsqueda" : "Buscar"}
                        </button>

                        {header.origin_doc_id ? (
                          <button
                            className={cls(
                              theme.btnSoft,
                              !canEdit ? "opacity-60 cursor-not-allowed" : "hover:bg-white hover:text-rose-700"
                            )}
                            disabled={!canEdit}
                            onClick={() => setHeaderPatch({ origin_doc_id: null, origin_label: "" })}
                          >
                            Quitar
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-2">
                      <div className="md:col-span-2">
                        <div className="text-[11px] text-slate-600">Asignado</div>
                        <div className="mt-1 rounded-lg border bg-white px-3 py-2 text-sm">
                          {header.origin_doc_id ? (
                            <span>
                              <b>{header.origin_label || "Documento"}</b>{" "}
                              <span className="text-slate-500">— id {header.origin_doc_id.slice(0, 8)}…</span>
                            </span>
                          ) : (
                            <span className="text-slate-500">Sin documento origen.</span>
                          )}
                        </div>
                      </div>
                      <div className="text-sm text-slate-700">
                        <div className="text-[11px] text-slate-600">Nota</div>
                        Luego validamos monto vs origen.
                      </div>
                    </div>

                    {originPanelOpen ? (
                      <div className="mt-3 rounded-2xl border bg-white p-3">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                          <div className="md:col-span-2">
                            <label className="text-xs text-slate-600 font-medium">Buscar por serie/folio/número</label>
                            <input
                              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                              value={originQuery}
                              onChange={(e) => setOriginQuery(e.target.value)}
                              placeholder="Ej: F001 o 000123"
                            />
                          </div>
                          <div className="flex items-end gap-2">
                            <button
                              className={cls(
                                "w-full rounded-lg px-3 py-2 text-sm text-white",
                                originLoading ? "bg-slate-400" : "bg-slate-900 hover:bg-slate-800"
                              )}
                              onClick={searchOriginDocs}
                              disabled={originLoading}
                            >
                              {originLoading ? "Buscando..." : "Buscar"}
                            </button>
                          </div>
                        </div>

                        <div className="mt-3 rounded-xl border overflow-hidden">
                          <div className="bg-slate-50 px-3 py-2 text-xs text-slate-600">Resultados</div>
                          <div className="max-h-[260px] overflow-y-auto overflow-x-hidden">
                            {originResults.length === 0 ? (
                              <div className="p-3 text-sm text-slate-600">Sin resultados.</div>
                            ) : (
                              <table className="w-full text-sm border-collapse table-fixed">
                                <colgroup>
                                  <col style={{ width: "34%" }} />
                                  <col style={{ width: "18%" }} />
                                  <col style={{ width: "18%" }} />
                                  <col style={{ width: "15%" }} />
                                  <col style={{ width: "15%" }} />
                                </colgroup>
                                <thead>
                                  <tr className="bg-white">
                                    <th className="border px-2 py-2 text-left">Folio</th>
                                    <th className="border px-2 py-2 text-left">Fecha</th>
                                    <th className="border px-2 py-2 text-right">Total</th>
                                    <th className="border px-2 py-2 text-left">Moneda</th>
                                    <th className="border px-2 py-2 text-right"> </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {originResults.map((r) => {
                                    const folio = folioLabel(r.series, r.number);
                                    return (
                                      <tr key={r.id} className="hover:bg-sky-50/30">
                                        <td className="border px-2 py-2">
                                          <b>{folio}</b>{" "}
                                          <span className="text-xs text-slate-500">({r.id.slice(0, 8)}…)</span>
                                        </td>
                                        <td className="border px-2 py-2">{r.issue_date || "—"}</td>
                                        <td className="border px-2 py-2 text-right">
                                          {formatNumber(Number(r.grand_total || 0), moneyDecimals)}
                                        </td>
                                        <td className="border px-2 py-2">{r.currency_code || "—"}</td>
                                        <td className="border px-2 py-2 text-right">
                                          <button
                                            className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800"
                                            onClick={() => pickOrigin(r)}
                                          >
                                            Asignar
                                          </button>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            )}
                          </div>
                        </div>

                        <div className="mt-2 flex justify-end">
                          <button className={theme.btnSoft} onClick={() => setOriginPanelOpen(false)}>
                            Cerrar búsqueda
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {/* ESTATUS */}
              {showStatusSection ? (
                <div className="px-4 pb-4">
                  <div className="rounded-2xl border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">Estatus</div>
                        <div className="text-[11px] text-slate-600">Default BORRADOR. Puedes registrar o cancelar.</div>
                      </div>
                      <div className="text-[11px] text-slate-500">Luego hacemos RPC contable de cancelación.</div>
                    </div>

                    <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <LabelInline label="status" field="status" className="text-[11px] font-semibold" />
                        <input
                          className="mt-1 w-full rounded-lg border px-2 py-2 text-sm bg-slate-50"
                          value={header.status}
                          readOnly
                        />
                      </div>
                      <div>
                        <LabelInline label="cancelled_at" field="cancelled_at" className="text-[11px] font-semibold" />
                        <input
                          type="date"
                          className="mt-1 w-full rounded-lg border px-2 py-2 text-sm"
                          disabled={!canEdit || header.status !== "CANCELADO"}
                          value={header.cancelled_at}
                          onChange={(e) => setHeaderPatch({ cancelled_at: e.target.value })}
                        />
                      </div>
                      <div className="md:col-span-3">
                        <LabelInline label="Motivo" field="cancel_reason" />
                        <input
                          className="mt-1 w-full rounded-lg border px-2 py-2 text-sm"
                          disabled={!canEdit || header.status !== "CANCELADO"}
                          value={header.cancel_reason}
                          onChange={(e) => setHeaderPatch({ cancel_reason: e.target.value })}
                          placeholder="Motivo cancelación"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

            </div>
          </div>
        ) : null}

        {/* LINEAS */}
        {editorTab === "LINEAS" ? (
          <div className={theme.card}>
            <div className="px-4 py-3 border-b flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-semibold text-slate-900">Líneas del documento</h2>
                <div className="text-[11px] text-slate-500">Exento es MONTO. Sin scroll horizontal.</div>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-sm text-slate-700">
                  <b>Afecto:</b> {formatNumber(totals.net_taxable, moneyDecimals)}{" "}
                  <span className="mx-2 text-slate-300">|</span>
                  <b>Exento:</b> {formatNumber(totals.net_exempt, moneyDecimals)}{" "}
                  <span className="mx-2 text-slate-300">|</span>
                  <b>IVA:</b> {formatNumber(totals.tax_total, moneyDecimals)}{" "}
                  <span className="mx-2 text-slate-300">|</span>
                  <b>Total:</b> {formatNumber(totals.grand_total, moneyDecimals)}
                </div>

                <button
                  className={cls(theme.btnPrimary, !canEdit ? "opacity-60 cursor-not-allowed" : "")}
                  disabled={!canEdit}
                  onClick={addDocLine}
                >
                  + Línea
                </button>
              </div>
            </div>

            <div className="border-t border-slate-200 overflow-x-hidden">
              {/* HEADER LINEAS */}
              <div className="overflow-hidden">
                <table className="w-full table-fixed border-collapse text-sm">
                  {/* col widths: N°, SKU, Descripción, Cant, P.Unit, Afecto, Exento, Neto, %IVA, IVA, Total, Acc */}
                  <colgroup>
                    <col style={{ width: "4%" }} />
                    <col style={{ width: "7%" }} />
                    <col style={{ width: "20%" }} />
                    <col style={{ width: "5%" }} />
                    <col style={{ width: "9%" }} />
                    <col style={{ width: "5%" }} />
                    <col style={{ width: "10%" }} />
                    <col style={{ width: "10%" }} />
                    <col style={{ width: "5%" }} />
                    <col style={{ width: "10%" }} />
                    <col style={{ width: "10%" }} />
                    <col style={{ width: "4%" }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th className={headerCell}>N°<span className={headerSub}>line_no</span></th>
                      <th className={headerCell}><b>SKU</b><span className={headerSub}>sku</span></th>
                      <th className={headerCell}><b>Descripción</b><span className={headerSub}>description</span></th>

                      <th className={cls(headerCell, "text-right")}><b>Cant</b><span className={headerSub}>qty</span></th>
                      <th className={cls(headerCell, "text-right")}><b>P.Unit</b><span className={headerSub}>unit_price</span></th>
                      <th className={headerCell}><b>Afecto</b><span className={headerSub}>sí/no</span></th>

                      <th className={cls(headerCell, "text-right")}><b>Exento</b><span className={headerSub}>$</span></th>
                      <th className={cls(headerCell, "text-right")}><b>Afecto</b><span className={headerSub}>$</span></th>

                      <th className={cls(headerCell, "text-right")}><b>% IVA</b><span className={headerSub}>rate</span></th>
                      <th className={cls(headerCell, "text-right")}><b>IVA $</b><span className={headerSub}>calc</span></th>
                      <th className={cls(headerCell, "text-right")}><b>Total</b><span className={headerSub}>calc</span></th>

                      <th className={cls(headerCell, "text-right")}><span className={headerSub}> </span></th>
                    </tr>
                  </thead>
                </table>
              </div>

              <div className="max-h-[380px] overflow-y-auto overflow-x-hidden">
                <table className="w-full table-fixed border-collapse text-sm">
                  <colgroup>
                    <col style={{ width: "4%" }} />
                    <col style={{ width: "7%" }} />
                    <col style={{ width: "20%" }} />
                    <col style={{ width: "5%" }} />
                    <col style={{ width: "9%" }} />
                    <col style={{ width: "5%" }} />
                    <col style={{ width: "10%" }} />
                    <col style={{ width: "10%" }} />
                    <col style={{ width: "5%" }} />
                    <col style={{ width: "10%" }} />
                    <col style={{ width: "10%" }} />
                    <col style={{ width: "4%" }} />
                  </colgroup>

                  <tbody>
                    {lines.map((l, idx) => {
                      const { ex, af, iva, total } = calcLineAmounts(l);
                      const rowBg = idx % 2 === 0 ? "bg-slate-50/80" : "bg-slate-100/50";

                      return (
                        <tr key={idx} className={cls(rowBg, "hover:bg-sky-50/30")}>
                          <td className={cls(bodyCell, "text-slate-600 text-xs text-center")}>{l.line_no}</td>

                          {/* SKU */}
                          <td className={bodyCell}>
                            <input
                              className={cellInputBase}
                              value={l.sku}
                              disabled={!canEdit}
                              onChange={(e) => updateDocLine(idx, { sku: e.target.value })}
                              placeholder="SKU"
                            />
                          </td>

                          {/* Descripción */}
                          <td className={bodyCell}>
                            <input
                              className={cellInputBase}
                              value={l.description}
                              disabled={!canEdit}
                              onChange={(e) => updateDocLine(idx, { description: e.target.value })}
                              placeholder="Descripción"
                            />
                          </td>

                          {/* Cantidad */}
                          <td className={bodyCell}>
                            <input
                              className={cls(cellInputBase, cellInputRight)}
                              value={l.qty}
                              disabled={!canEdit}
                              onChange={(e) => updateDocLine(idx, { qty: e.target.value })}
                              inputMode="decimal"
                              placeholder="1"
                            />
                          </td>

                          {/* Precio unitario */}
                          <td className={bodyCell}>
                            <input
                              className={cls(cellInputBase, cellInputRight)}
                              value={l.unit_price}
                              disabled={!canEdit}
                              onChange={(e) => updateDocLine(idx, { unit_price: e.target.value })}
                              inputMode="decimal"
                              placeholder="0"
                            />
                          </td>

                          {/* Tipo */}
                          {/* Afecto (checkbox) */}
                          <td className={cls(bodyCell, "text-center")}>
                            <input
                              type="checkbox"
                              checked={Boolean(l.is_taxable)}
                              disabled={!canEdit}
                              onChange={(e) => {
                                const v = e.target.checked;
                                updateDocLine(idx, {
                                  is_taxable: v,

                                  // ✅ limpiamos overrides para evitar basura cuando cambias el tipo
                                  ex_override: v ? "" : l.ex_override,
                                  af_override: v ? l.af_override : "",
                                  iva_override: v ? l.iva_override : "",
                                });
                              }}
                            />
                          </td>

                          {/* Exento calc */}
                          <td className={bodyCell}>
                            <input
                              className={cls(cellInputBase, cellInputRight)}
                              disabled={!canEdit || l.is_taxable}
                              value={l.ex_override}
                              onChange={(e) => updateDocLine(idx, { ex_override: e.target.value })}
                              inputMode="decimal"
                              placeholder={formatNumber(ex, moneyDecimals)}
                            />
                          </td>

                          {/* Afecto calc */}
                          <td className={bodyCell}>
                            <input
                              className={cls(cellInputBase, cellInputRight)}
                              disabled={!canEdit || !l.is_taxable}
                              value={l.af_override}
                              onChange={(e) => updateDocLine(idx, { af_override: e.target.value })}
                              inputMode="decimal"
                              placeholder={formatNumber(af, moneyDecimals)}
                            />
                          </td>

                          {/* %IVA */}
                          <td className={bodyCell}>
                            <input
                              className={cls(cellInputBase, cellInputRight)}
                              value={l.tax_rate}
                              disabled={!canEdit || !l.is_taxable}
                              onChange={(e) => updateDocLine(idx, { tax_rate: e.target.value })}
                              inputMode="decimal"
                              placeholder="19"
                            />
                          </td>

                          {/* IVA calc */}
                          <td className={bodyCell}>
                            <input
                              className={cls(cellInputBase, cellInputRight)}
                              disabled={!canEdit || !l.is_taxable}
                              value={l.iva_override}
                              onChange={(e) => updateDocLine(idx, { iva_override: e.target.value })}
                              inputMode="decimal"
                              placeholder={formatNumber(iva, moneyDecimals)}
                            />
                          </td>

                          {/* Total calc */}
                          <td className={bodyCell}>
                            <input
                              className={cls(cellInputBase, cellInputRight)}
                              disabled={!canEdit}
                              value={l.total_override}
                              onChange={(e) => updateDocLine(idx, { total_override: e.target.value })}
                              inputMode="decimal"
                              placeholder={formatNumber(total, moneyDecimals)}
                            />
                          </td>

                          {/* Eliminar */}
                          <td className={cls(bodyCell, "text-right")}>
                            <button
                              className={cls(
                                "text-xs rounded border border-slate-200 px-2 py-1 hover:bg-white hover:text-rose-700",
                                !canEdit ? "opacity-60 cursor-not-allowed" : ""
                              )}
                              disabled={!canEdit}
                              onClick={() => removeDocLine(idx)}
                              title="Eliminar línea"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="px-4 py-3 border-t bg-white text-sm text-slate-700">
                <b>Regla:</b> IVA se calcula sobre <b>Afecto</b> (por ahora). Exento no genera IVA.
              </div>
            </div>
          </div>
        ) : null}

        {/* PAGOS */}
        {editorTab === "PAGOS" ? (
          <div className={theme.card}>
            <div className="px-4 py-3 border-b flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-semibold text-slate-900">Formas de pago</h2>
                <div className="text-[11px] text-slate-500">Sin scroll horizontal.</div>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-sm text-slate-700">
                  <b>Pagado:</b> {formatNumber(totals.paid, moneyDecimals)}{" "}
                  <span className="mx-2 text-slate-300">|</span>
                  <b>Saldo:</b> {formatNumber(totals.balance, moneyDecimals)}
                </div>

                <button
                  className={cls(theme.btnPrimary, !canEdit ? "opacity-60 cursor-not-allowed" : "")}
                  disabled={!canEdit}
                  onClick={addPaymentRow}
                >
                  + Forma
                </button>
              </div>
            </div>

            <div className="border-t border-slate-200 overflow-x-hidden">
              <div className="overflow-hidden">
                <table className="w-full table-fixed border-collapse text-sm">
                  <colgroup>
                    <col style={{ width: "16%" }} />
                    <col style={{ width: "34%" }} />
                    <col style={{ width: "14%" }} />
                    <col style={{ width: "30%" }} />
                    <col style={{ width: "6%" }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th className={headerCell}><b>Método</b><span className={headerSub}>method</span></th>
                      <th className={headerCell}><b>Tarjeta</b><span className={headerSub}>tipo/4/aut</span></th>
                      <th className={cls(headerCell, "text-right")}><b>Monto</b><span className={headerSub}>amount</span></th>
                      <th className={headerCell}><b>Referencia</b><span className={headerSub}>reference</span></th>
                      <th className={cls(headerCell, "text-right")}><span className={headerSub}> </span></th>
                    </tr>
                  </thead>
                </table>
              </div>

              <div className="max-h-[340px] overflow-y-auto overflow-x-hidden">
                <table className="w-full table-fixed border-collapse text-sm">
                  <colgroup>
                    <col style={{ width: "16%" }} />
                    <col style={{ width: "34%" }} />
                    <col style={{ width: "14%" }} />
                    <col style={{ width: "30%" }} />
                    <col style={{ width: "6%" }} />
                  </colgroup>

                  <tbody>
                    {payments.length === 0 ? (
                      <tr>
                        <td className="p-4 text-sm text-slate-600" colSpan={5}>
                          <b>Crédito</b> (sin formas de pago registradas).
                          <span className="ml-2 text-slate-500">Usa “+ Forma” si deseas registrar pagos.</span>
                        </td>
                      </tr>
                    ) : (
                      payments.map((p, idx) => {
                        const rowBg = idx % 2 === 0 ? "bg-slate-50/80" : "bg-slate-100/50";
                        const isCard = p.method === "TARJETA";

                        return (
                          <tr key={p.id} className={cls(rowBg, "hover:bg-sky-50/30")}>
                            <td className={bodyCell}>
                              <select
                                className={cls(cellInputBase, "h-[30px]")}
                                disabled={!canEdit}
                                value={p.method}
                                onChange={(e) => {
                                  const method = e.target.value as PaymentRow["method"];
                                  updatePaymentRow(p.id, {
                                    method,
                                    card_kind: method === "TARJETA" ? p.card_kind : "",
                                    card_last4: method === "TARJETA" ? p.card_last4 : "",
                                    auth_code: method === "TARJETA" ? p.auth_code : "",
                                  });
                                }}
                              >
                                <option value="EFECTIVO">EFECTIVO</option>
                                <option value="TRANSFERENCIA">TRANSFERENCIA</option>
                                <option value="TARJETA">TARJETA</option>
                                <option value="CHEQUE">CHEQUE</option>
                                <option value="OTRO">OTRO</option>
                              </select>
                            </td>

                            <td className={bodyCell}>
                              {isCard ? (
                                <div className="grid grid-cols-3 gap-2">
                                  <select
                                    className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-sm"
                                    disabled={!canEdit}
                                    value={p.card_kind}
                                    onChange={(e) => updatePaymentRow(p.id, { card_kind: e.target.value as any })}
                                  >
                                    <option value="">Tipo</option>
                                    <option value="DEBITO">Débito</option>
                                    <option value="CREDITO">Crédito</option>
                                  </select>

                                  <input
                                    className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-sm"
                                    disabled={!canEdit}
                                    value={p.card_last4}
                                    onChange={(e) =>
                                      updatePaymentRow(p.id, {
                                        card_last4: e.target.value.replace(/\D/g, "").slice(0, 4),
                                      })
                                    }
                                    placeholder="Últ.4"
                                    inputMode="numeric"
                                  />

                                  <input
                                    className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-sm"
                                    disabled={!canEdit}
                                    value={p.auth_code}
                                    onChange={(e) => updatePaymentRow(p.id, { auth_code: e.target.value })}
                                    placeholder="Aut."
                                  />
                                </div>
                              ) : (
                                <div className="text-xs text-slate-500 px-1">—</div>
                              )}
                            </td>

                            <td className={bodyCell}>
                              <input
                                className={cls(cellInputBase, cellInputRight)}
                                disabled={!canEdit}
                                value={p.amount}
                                onChange={(e) => updatePaymentRow(p.id, { amount: e.target.value })}
                                inputMode="decimal"
                                placeholder="0"
                              />
                            </td>

                            <td className={bodyCell}>
                              <input
                                className={cellInputBase}
                                disabled={!canEdit}
                                value={p.reference}
                                onChange={(e) => updatePaymentRow(p.id, { reference: e.target.value })}
                                placeholder="N° operación / voucher / referencia"
                              />
                            </td>

                            <td className={cls(bodyCell, "text-right")}>
                              <button
                                className={cls(
                                  "text-xs rounded border border-slate-200 px-2 py-1 hover:bg-white hover:text-rose-700",
                                  !canEdit ? "opacity-60 cursor-not-allowed" : ""
                                )}
                                disabled={!canEdit}
                                onClick={() => removePaymentRow(p.id)}
                                title="Eliminar"
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}

        {/* ASIENTO */}
        {editorTab === "ASIENTO" ? (
          <div className={theme.card}>
            <div className="px-4 py-3 border-b flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-semibold text-slate-900">Distribución contable</h2>
                <div className="text-[11px] text-slate-500">Sin scroll horizontal.</div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  className={cls(theme.btnPrimary, !canEdit ? "opacity-60 cursor-not-allowed" : "")}
                  disabled={!canEdit}
                  onClick={addJournalLine}
                >
                  + Línea
                </button>

                <button
                  className={cls(theme.btnSoft, !canEdit ? "opacity-60 cursor-not-allowed" : "")}
                  disabled={!canEdit}
                  onClick={() =>
                    setMessages([{ level: "warn", text: "MVP: luego generaremos este asiento automáticamente por reglas." }])
                  }
                >
                  Generar (futuro)
                </button>
              </div>
            </div>

            <div className="border-t border-slate-200 overflow-x-hidden">
              <div className="overflow-hidden">
                <table className="w-full table-fixed border-collapse text-sm">
                  <colgroup>
                    <col style={{ width: "5%" }} />
                    <col style={{ width: "14%" }} />
                    <col style={{ width: "26%" }} />
                    <col style={{ width: "12%" }} />
                    <col style={{ width: "12%" }} />
                    <col style={{ width: "9%" }} />
                    <col style={{ width: "9%" }} />
                    <col style={{ width: "9%" }} />
                    <col style={{ width: "4%" }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th className={headerCell}>N°<span className={headerSub}>line_no</span></th>
                      <th className={headerCell}><b>Cuenta</b><span className={headerSub}>account_code</span></th>
                      <th className={headerCell}><b>Glosa</b><span className={headerSub}>description</span></th>
                      <th className={cls(headerCell, "text-right")}><b>Debe</b><span className={headerSub}>debit</span></th>
                      <th className={cls(headerCell, "text-right")}><b>Haber</b><span className={headerSub}>credit</span></th>
                      <th className={headerCell}><b>CC</b><span className={headerSub}>cost</span></th>
                      <th className={headerCell}><b>CU</b><span className={headerSub}>bu</span></th>
                      <th className={headerCell}><b>SUC</b><span className={headerSub}>branch</span></th>
                      <th className={cls(headerCell, "text-right")}><span className={headerSub}> </span></th>
                    </tr>
                  </thead>
                </table>
              </div>

              <div className="max-h-[380px] overflow-y-auto overflow-x-hidden">
                <table className="w-full table-fixed border-collapse text-sm">
                  <colgroup>
                    <col style={{ width: "5%" }} />
                    <col style={{ width: "14%" }} />
                    <col style={{ width: "26%" }} />
                    <col style={{ width: "12%" }} />
                    <col style={{ width: "12%" }} />
                    <col style={{ width: "9%" }} />
                    <col style={{ width: "9%" }} />
                    <col style={{ width: "9%" }} />
                    <col style={{ width: "4%" }} />
                  </colgroup>

                  <tbody>
                    {journalLines.map((l, idx) => {
                      const rowBg = idx % 2 === 0 ? "bg-slate-50/80" : "bg-slate-100/50";
                      return (
                        <tr key={idx} className={cls(rowBg, "hover:bg-sky-50/30")}>
                          <td className={cls(bodyCell, "text-slate-600 text-xs text-center")}>{l.line_no}</td>

                          <td className={bodyCell}>
                            <input
                              className={cellInputBase}
                              disabled={!canEdit}
                              value={l.account_code}
                              onChange={(e) => updateJournalLine(idx, { account_code: e.target.value })}
                              placeholder="1020101"
                            />
                          </td>

                          <td className={bodyCell}>
                            <input
                              className={cellInputBase}
                              disabled={!canEdit}
                              value={l.description}
                              onChange={(e) => updateJournalLine(idx, { description: e.target.value })}
                              placeholder="Glosa línea asiento"
                            />
                          </td>

                          <td className={bodyCell}>
                            <input
                              className={cls(cellInputBase, cellInputRight)}
                              disabled={!canEdit}
                              value={l.debit}
                              onChange={(e) => updateJournalLine(idx, { debit: e.target.value })}
                              inputMode="decimal"
                              placeholder="0"
                            />
                          </td>

                          <td className={bodyCell}>
                            <input
                              className={cls(cellInputBase, cellInputRight)}
                              disabled={!canEdit}
                              value={l.credit}
                              onChange={(e) => updateJournalLine(idx, { credit: e.target.value })}
                              inputMode="decimal"
                              placeholder="0"
                            />
                          </td>

                          <td className={bodyCell}>
                            <input
                              className={cellInputBase}
                              disabled={!canEdit}
                              value={l.cost_center_code}
                              onChange={(e) => updateJournalLine(idx, { cost_center_code: e.target.value })}
                              placeholder="CC"
                            />
                          </td>

                          <td className={bodyCell}>
                            <input
                              className={cellInputBase}
                              disabled={!canEdit}
                              value={l.business_line_code}
                              onChange={(e) => updateJournalLine(idx, { business_line_code: e.target.value })}
                              placeholder="CU"
                            />
                          </td>

                          <td className={bodyCell}>
                            <input
                              className={cellInputBase}
                              disabled={!canEdit}
                              value={l.branch_code}
                              onChange={(e) => updateJournalLine(idx, { branch_code: e.target.value })}
                              placeholder="SUC"
                            />
                          </td>

                          <td className={cls(bodyCell, "text-right")}>
                            <button
                              className={cls(
                                "text-xs rounded border border-slate-200 px-2 py-1 hover:bg-white hover:text-rose-700",
                                !canEdit ? "opacity-60 cursor-not-allowed" : ""
                              )}
                              disabled={!canEdit}
                              onClick={() => removeJournalLine(idx)}
                              title="Eliminar"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="px-4 py-3 border-t bg-white text-sm text-slate-700">
                <b>Tip:</b> luego agregamos validación de cuadratura y generación automática.
              </div>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* =======================
          IMPORT MODAL
         ======================= */}
      <Modal
        open={importOpen}
        title="Carga masiva"
        subtitle="Ventas • Excel → Borradores"
        onClose={closeImport}
        widthClass="w-[min(900px,96vw)]"
        footer={
          <div className="flex items-center justify-between gap-2">
            <button className={theme.btnSoft} onClick={closeImport} disabled={importing}>
              Cerrar
            </button>
            <button
              className={cls(
                theme.btnPrimary,
                (!canEdit || importing || !importPreview.length || importErrors.length > 0) && "opacity-60 cursor-not-allowed"
              )}
              disabled={!canEdit || importing || !importPreview.length || importErrors.length > 0}
              onClick={confirmImportToDrafts}
            >
              {importing ? "Importando..." : "Crear borradores"}
            </button>
          </div>
        }
      >
        <div className="rounded-2xl border bg-slate-50 p-3 text-sm text-slate-700">
          Sube un Excel con columnas:{" "}
          <b>
            doc_type, fiscal_doc_code, issue_date, due_date, series, number, currency_code,
            counterparty_identifier, counterparty_name, reference, notes
          </b>
          .
          <div className="mt-1 text-xs text-slate-500">Hoja recomendada: “Ventas”.</div>
        </div>

        <div className="mt-3">
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onPickExcel(f);
              e.currentTarget.value = "";
            }}
          />
        </div>

        {importErrors.length ? (
          <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
            <b>Errores:</b>
            <ul className="mt-2 list-disc pl-5">
              {importErrors.slice(0, 12).map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {importPreview.length ? (
          <div className="mt-3 rounded-2xl border overflow-hidden">
            <div className="bg-slate-50 px-3 py-2 text-xs text-slate-600">Preview ({importPreview.length} filas)</div>
            <div className="max-h-[360px] overflow-y-auto overflow-x-hidden">
              <table className="w-full text-sm table-fixed border-collapse">
                <colgroup>
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "16%" }} />
                  <col style={{ width: "16%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "32%" }} />
                </colgroup>
                <thead>
                  <tr className="bg-white">
                    <th className="border px-2 py-2 text-left">doc_type</th>
                    <th className="border px-2 py-2 text-left">fiscal</th>
                    <th className="border px-2 py-2 text-left">issue</th>
                    <th className="border px-2 py-2 text-left">due</th>
                    <th className="border px-2 py-2 text-left">folio</th>
                    <th className="border px-2 py-2 text-left">counterparty</th>
                  </tr>
                </thead>
                <tbody>
                  {importPreview.slice(0, 50).map((r, i) => (
                    <tr key={i} className="hover:bg-sky-50/30">
                      <td className="border px-2 py-2">{r.doc_type}</td>
                      <td className="border px-2 py-2">{r.fiscal_doc_code || "—"}</td>
                      <td className="border px-2 py-2">{r.issue_date}</td>
                      <td className="border px-2 py-2">{r.due_date}</td>
                      <td className="border px-2 py-2">{folioLabel(r.series, r.number)}</td>
                      <td className="border px-2 py-2">
                        {ellipsis(r.counterparty_name || r.counterparty_identifier || "—", 40)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t bg-slate-50 px-3 py-2 text-xs text-slate-500">Mostrando 50 filas en preview.</div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
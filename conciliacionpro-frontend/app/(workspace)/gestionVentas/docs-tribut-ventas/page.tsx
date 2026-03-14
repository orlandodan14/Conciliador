"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import * as XLSX from "xlsx";
import { CounterpartyCreateModal, Counterparty as CPCounterparty } from "@/app/(workspace)/components/counterparties/CounterpartyCreateModal";
import { Pencil, CheckCircle2, Trash2 } from "lucide-react";
import { TradeDocEditorModal } from "@/app/(workspace)/gestionVentas/docs-tribut-ventas/components/tradeDocs/TradeDocEditorModal";

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

function normalizeIdentifier(raw: string) {
  // Igual que en el modal (multi-país): solo alfanumérico + uppercase
  return String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^0-9A-Z]+/g, "");
}

function calcLineAmounts(l: DocLine) {
  // tú igual puedes dejar qty/unit por si quieres, pero no se usan si tú llenas manual
  const qty = Math.max(0, toNum(l.qty));
  const unit = Math.max(0, toNum(l.unit_price));
  const base = qty * unit;

  const rate = Math.max(0, toNum(l.tax_rate));

  // ✅ tú llenas SIEMPRE exento y afecto manual
  const ex_o = String(l.ex_override || "").trim();
  const af_o = String(l.af_override || "").trim();
  const tot_o = String(l.total_override || "").trim();

  // Si no escribiste ex/af, usamos un fallback (por si alguien usa qty/unit)
  const ex = ex_o !== "" ? Math.max(0, toNum(ex_o)) : (l.is_taxable ? 0 : base);
  const af = af_o !== "" ? Math.max(0, toNum(af_o)) : (l.is_taxable ? base : 0);

  // ✅ IVA SIEMPRE se calcula desde AFECTO
  const iva = af > 0 && rate > 0 ? af * (rate / 100) : 0;

  // ✅ Total “real” (el que usaremos para totales)
  const total_calc = ex + af + iva;

  // ✅ Total editable: si lo escriben, solo se muestra, NO afecta cálculos
  const total_display = tot_o !== "" ? Math.max(0, toNum(tot_o)) : total_calc;

  return {
    qty,
    unit,
    base,
    rate,
    ex,
    af,
    iva,
    total: total_calc,        // ✅ este es el real
    total_display,            // ✅ este es el que se muestra si overridean
  };
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


async function safeDeleteByCompanyAndEntry(table: string, companyId: string, journalEntryId: string) {
  const { error } = await supabase
    .from(table as any)
    .delete()
    .eq("company_id", companyId)
    .eq("journal_entry_id", journalEntryId);

  if (error) throw error;
}

async function upsertDraftJournalEntry(args: {
  companyId: string;
  docId: string;
  entryDate: string;
  description: string;
  reference: string | null;
  currencyCode: string;
  userId: string | null;
  headerDocType: DocType;
  fiscalDocCode: string | null;
  series: string | null;
  number: string | null;
  existingJournalEntryId: string | null;
  journalMode: "AUTO" | "MANUAL";
}) {
  const {
    companyId,
    docId,
    entryDate,
    description,
    reference,
    currencyCode,
    userId,
    headerDocType,
    fiscalDocCode,
    series,
    number,
    existingJournalEntryId,
    journalMode,
  } = args;

  const accountingPeriodId = await getCurrentAccountingPeriodId(companyId, entryDate);
  if (!accountingPeriodId) {
    throw new Error(`No existe período contable para la fecha ${entryDate}.`);
  }

  const payload = {
    company_id: companyId,
    accounting_period_id: accountingPeriodId,
    entry_date: entryDate,
    description,
    reference,
    currency_code: currencyCode,
    status: "DRAFT",
    created_by: userId,
    posted_at: null,
    posted_by: null,
    extra: {
      source: "trade_docs_sales",
      trade_doc_id: docId,
      doc_type: headerDocType,
      fiscal_doc_code: fiscalDocCode || null,
      folio: folioLabel(series, number),
      journal_mode: journalMode,
    },
  };

  if (!existingJournalEntryId) {
    const { data, error } = await supabase
      .from("journal_entries")
      .insert(payload as any)
      .select("id")
      .single();

    if (error) throw error;
    return data.id as string;
  }

  const { error } = await supabase
    .from("journal_entries")
    .update(payload as any)
    .eq("company_id", companyId)
    .eq("id", existingJournalEntryId);

  if (error) throw error;

  return existingJournalEntryId;
}

async function deleteDraftPaymentsByTradeDoc(companyId: string, tradeDocId: string) {
  const { data: allocRows, error: allocRowsError } = await supabase
    .from("payment_allocations")
    .select("payment_id")
    .eq("company_id", companyId)
    .eq("trade_doc_id", tradeDocId);

  if (allocRowsError) throw allocRowsError;

  const paymentIds = Array.from(
    new Set(((allocRows as any[]) || []).map((x) => x.payment_id).filter(Boolean))
  );

  const { error: deleteAllocError } = await supabase
    .from("payment_allocations")
    .delete()
    .eq("company_id", companyId)
    .eq("trade_doc_id", tradeDocId);

  if (deleteAllocError) throw deleteAllocError;

  if (paymentIds.length > 0) {
    const { error: deletePaymentsError } = await supabase
      .from("payments")
      .delete()
      .eq("company_id", companyId)
      .in("id", paymentIds);

    if (deletePaymentsError) throw deletePaymentsError;
  }
}

async function getPaymentIdsByTradeDoc(companyId: string, tradeDocId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("payment_allocations")
    .select("payment_id")
    .eq("company_id", companyId)
    .eq("trade_doc_id", tradeDocId);

  if (error) throw error;

  return Array.from(
    new Set(((data as any[]) || []).map((x) => x.payment_id).filter(Boolean))
  );
}

async function deletePaymentsByIds(companyId: string, tradeDocId: string, paymentIds: string[]) {
  if (!paymentIds.length) return;

  const { error: allocError } = await supabase
    .from("payment_allocations")
    .delete()
    .eq("company_id", companyId)
    .eq("trade_doc_id", tradeDocId)
    .in("payment_id", paymentIds);

  if (allocError) throw allocError;

  const { error: payError } = await supabase
    .from("payments")
    .delete()
    .eq("company_id", companyId)
    .in("id", paymentIds);

  if (payError) throw payError;
}

async function rollbackDraftArtifacts(args: {
  companyId: string;
  tradeDocId: string | null;
  journalEntryId: string | null;
}) {
  const { companyId, tradeDocId, journalEntryId } = args;

  // 1) pagos + allocations
  if (tradeDocId) {
    try {
      await deleteDraftPaymentsByTradeDoc(companyId, tradeDocId);
    } catch {}
  }

  // 2) líneas asiento + asiento borrador
  if (journalEntryId) {
    try {
      await supabase
        .from("journal_entry_lines")
        .delete()
        .eq("company_id", companyId)
        .eq("journal_entry_id", journalEntryId);
    } catch {}

    try {
      await supabase
        .from("journal_entries")
        .delete()
        .eq("company_id", companyId)
        .eq("id", journalEntryId)
        .eq("status", "DRAFT");
    } catch {}
  }

  // 3) líneas documento
  if (tradeDocId) {
    try {
      await supabase
        .from("trade_doc_lines")
        .delete()
        .eq("company_id", companyId)
        .eq("trade_doc_id", tradeDocId);
    } catch {}
  }

  // 4) documento solo si sigue BORRADOR
  if (tradeDocId) {
    try {
      await supabase
        .from("trade_docs")
        .delete()
        .eq("company_id", companyId)
        .eq("id", tradeDocId)
        .eq("status", "BORRADOR");
    } catch {}
  }
}

async function getCurrentAccountingPeriodId(companyId: string, issueDate: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("accounting_periods")
    .select("id,start_date,end_date,status,is_current")
    .eq("company_id", companyId)
    .lte("start_date", issueDate)
    .gte("end_date", issueDate)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.id ?? null;
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

const iconBtn =
  "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50";

const iconBtnPrimary =
  "inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white hover:bg-slate-800";

const iconBtnDanger =
  "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-rose-200 bg-white text-rose-700 hover:bg-rose-50";

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
type DocType = "INVOICE" | "CREDIT_NOTE" | "DEBIT_NOTE";
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
  branch_id: string;

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

type BranchLite = {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  is_default: boolean;
};

type ItemLite = {
  id: string;
  sku: string;
  name: string;
  description?: string | null;
  price_sale: number;
  tax_exempt: boolean;
  is_active: boolean;
  business_line_id?: string | null;
};

type DocLine = {
  line_no: number;
  item_id: string | null;
  sku: string;
  description: string;

  qty: string;
  unit_price: string;

  is_taxable: boolean;
  tax_rate: string;

  ex_override: string;
  af_override: string;
  iva_override: string;
  total_override: string;
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

  cost_center_id: string | null;
  business_line_id: string | null;
  branch_id: string | null;

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

  counterparty_identifier_snapshot: string | null;
  counterparty_name_snapshot: string | null;

  net_taxable: number | null;
  net_exempt: number | null;
  tax_total: number | null;
  grand_total: number | null;

  created_at: string | null;
};

type AccountNodeLite = {
  id: string;
  code: string;
  name: string;
};

type AccountDefaultRow = {
  id: string;
  company_id: string;
  process_key: string;
  account_node_id: string | null;
  is_active: boolean;
  notes: string | null;
};

type BusinessLineLite = {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
};

type AccountPostingPolicyLite = {
  id: string;
  company_id: string;
  account_node_id: string;
  require_cc: boolean;
  require_cu: boolean;
  require_suc: boolean;
  require_item: boolean;
  require_cp: boolean;
  enforcement: string;
  is_active: boolean;
  effective_from: string;
  effective_to: string | null;
};

/**
 * =========================
 * Defaults
 * =========================
 */
function makeDocLine(no: number): DocLine {
  return {
    line_no: no,
    item_id: null,
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

    cost_center_id: null,
    business_line_id: null,
    branch_id: null,

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
  const [branches, setBranches] = useState<BranchLite[]>([]);
  const [items, setItems] = useState<ItemLite[]>([]);
  const [businessLines, setBusinessLines] = useState<BusinessLineLite[]>([]);
  const [accountPostingPolicies, setAccountPostingPolicies] = useState<AccountPostingPolicyLite[]>([]);

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
    doc_type: "INVOICE",
    fiscal_doc_code: "",
    status: "BORRADOR",
    issue_date: todayISO(),
    due_date: todayISO(),
    series: "",
    number: "",
    currency_code: "CLP",
    branch_id: "",
    counterparty_identifier: "",
    counterparty_name: "",
    reference: "",
    notes: "",
    cancelled_at: "",
    cancel_reason: "",
    origin_doc_id: null,
    origin_label: "",
  });

  const [lines, setLines] = useState<DocLine[]>(Array.from({ length: 8 }, (_, i) => makeDocLine(i + 1)));

  // ✅ Default: Crédito (sin pagos)
  const [payments, setPayments] = useState<PaymentRow[]>([]);

  const [journalLines, setJournalLines] = useState<JournalLine[]>(
    Array.from({ length: 8 }, (_, i) => makeJournalLine(i + 1))
  );

  const [journalAutoMode, setJournalAutoMode] = useState(true);

  const [messages, setMessages] = useState<Array<{ level: "error" | "warn"; text: string }>>([]);

  const [accounts, setAccounts] = useState<AccountNodeLite[]>([]);
  const [accByCode, setAccByCode] = useState<Record<string, AccountNodeLite>>({});
  const [accById, setAccById] = useState<Record<string, AccountNodeLite>>({});
  const [branchById, setBranchById] = useState<Record<string, BranchLite>>({});
  const [branchByCode, setBranchByCode] = useState<Record<string, BranchLite>>({});

  const [businessLineById, setBusinessLineById] = useState<Record<string, BusinessLineLite>>({});
  const [businessLineByCode, setBusinessLineByCode] = useState<Record<string, BusinessLineLite>>({});
 
  const [postingPolicyByAccountCode, setPostingPolicyByAccountCode] = useState<Record<string, AccountPostingPolicyLite>>({});
  const [accountDefaults, setAccountDefaults] = useState<AccountDefaultRow[]>([]);
  const [defaultAccountCodeByProcess, setDefaultAccountCodeByProcess] = useState<Record<string, string>>({});

  // =========================
  // Counterparties (para botón Crear)
  // =========================
  const [counterpartiesAvailable, setCounterpartiesAvailable] = useState<boolean>(true);
  const [counterpartyMap, setCounterpartyMap] = useState<Record<string, CPCounterparty>>({});

  // Modal reusable
  const [cpModal, setCpModal] = useState<{ open: boolean; identifier: string }>({
    open: false,
    identifier: "",
  });

  // Origin PANEL
  const needsOrigin = header.doc_type === "CREDIT_NOTE" || header.doc_type === "DEBIT_NOTE";
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

      // =========================
      // Load branches
      // =========================
      try {
        const { data: branchData, error: branchError } = await supabase
          .from("branches")
          .select("id,code,name,is_active,is_default")
          .eq("company_id", companyId)
          .eq("is_active", true)
          .order("is_default", { ascending: false })
          .order("code", { ascending: true });

        if (branchError) throw branchError;

        const branchList = ((branchData as any[]) || []).map((b) => ({
          id: String(b.id),
          code: String(b.code || ""),
          name: String(b.name || ""),
          is_active: Boolean(b.is_active),
          is_default: Boolean(b.is_default),
        })) as BranchLite[];

        setBranches(branchList);

        const byId: Record<string, BranchLite> = {};
        const byCode: Record<string, BranchLite> = {};

        for (const b of branchList) {
          byId[b.id] = b;
          byCode[String(b.code).trim()] = b;
        }

        setBranchById(byId);
        setBranchByCode(byCode);

        const defaultBranch = branchList.find((b) => b.is_default) || branchList[0];
        if (defaultBranch) {
          setHeader((h) => ({
            ...h,
            branch_id: h.branch_id || defaultBranch.id,
          }));
        }
      } catch {
        setBranches([]);
        setBranchById({});
        setBranchByCode({});
      }

      // =========================
      // Load business lines
      // =========================
      try {
        const { data: buData, error: buError } = await supabase
          .from("business_lines")
          .select("id,code,name,is_active")
          .eq("company_id", companyId)
          .eq("is_active", true)
          .order("code", { ascending: true });

        if (buError) throw buError;

        const buList = ((buData as any[]) || []).map((x) => ({
          id: String(x.id),
          code: String(x.code || ""),
          name: String(x.name || ""),
          is_active: Boolean(x.is_active),
        })) as BusinessLineLite[];

        setBusinessLines(buList);

        const byId: Record<string, BusinessLineLite> = {};
        const byCode: Record<string, BusinessLineLite> = {};
        for (const bu of buList) {
          byId[bu.id] = bu;
          byCode[String(bu.code).trim()] = bu;
        }

        setBusinessLineById(byId);
        setBusinessLineByCode(byCode);
      } catch {
        setBusinessLines([]);
        setBusinessLineById({});
        setBusinessLineByCode({});
      }

      // =========================
      // Load items
      // =========================
      try {
        const { data: itemData, error: itemError } = await supabase
          .from("items")
          .select("id,sku,name,description,price_sale,tax_exempt,is_active,business_line_id")
          .eq("company_id", companyId)
          .eq("is_active", true)
          .order("sku", { ascending: true });

        if (itemError) throw itemError;

        const itemList = ((itemData as any[]) || []).map((it) => ({
          id: String(it.id),
          sku: String(it.sku || ""),
          name: String(it.name || ""),
          description: it.description || null,
          price_sale: Number(it.price_sale || 0),
          tax_exempt: Boolean(it.tax_exempt),
          is_active: Boolean(it.is_active),
          business_line_id: it.business_line_id || null,
        })) as ItemLite[];

        setItems(itemList);
      } catch {
        setItems([]);
      }

      // =========================
      // Load counterparties (para resolver y botón Crear)
      // =========================
      try {
        const { data: cps, error: cpe } = await supabase
          .from("counterparties")
          .select("id,company_id,identifier,identifier_normalized,name,type,is_active,email,phone,address,notes,extra")
          .eq("company_id", companyId)
          .eq("is_active", true);

        if (cpe) {
          setCounterpartiesAvailable(false);
          setCounterpartyMap({});
        } else {
          const m: Record<string, CPCounterparty> = {};
          for (const c of (cps as any) || []) {
            // guardamos por clave normalizada (para que 12.345.678-9 y 123456789 coincidan)
            const key = normalizeIdentifier(c.identifier);
            if (key) m[key] = c as any;
          }
          setCounterpartyMap(m);
          setCounterpartiesAvailable(true);
        }
      } catch {
        setCounterpartiesAvailable(false);
        setCounterpartyMap({});
      }

      // =========================
      // Load account_nodes (posteables)
      // =========================
      try {
        const { data: acs, error: ace } = await supabase
          .from("account_nodes")
          .select("id,code,name,level")
          .eq("company_id", companyId)
          .order("code", { ascending: true });

        if (ace) throw ace;

        const list = ((acs as any[]) || []).map((x) => ({
          id: x.id,
          code: String(x.code || ""),
          name: String(x.name || ""),
        })) as AccountNodeLite[];

        setAccounts(list);

        const byCode: Record<string, AccountNodeLite> = {};
        const byId: Record<string, AccountNodeLite> = {};
        for (const a of list) {
          byCode[String(a.code).trim()] = a;
          byId[a.id] = a;
        }

        setAccByCode(byCode);
        setAccById(byId);
      } catch {
        setAccounts([]);
        setAccByCode({});
        setAccById({});
      }

      // =========================
      // Load account posting policies
      // =========================
      try {
        const today = todayISO();

        const { data: pols, error: polErr } = await supabase
          .from("account_imputation_policies")
          .select(`
            id,
            company_id,
            account_node_id,
            require_cc,
            require_cu,
            require_suc,
            require_item,
            require_cp,
            enforcement,
            is_active,
            effective_from,
            effective_to
          `)
          .eq("company_id", companyId)
          .eq("is_active", true)
          .lte("effective_from", today)
          .or(`effective_to.is.null,effective_to.gte.${today}`);

        if (polErr) throw polErr;

        const list = (((pols as any[]) || []).map((x) => ({
          id: String(x.id),
          company_id: String(x.company_id),
          account_node_id: String(x.account_node_id),
          require_cc: Boolean(x.require_cc),
          require_cu: Boolean(x.require_cu),
          require_suc: Boolean(x.require_suc),
          require_item: Boolean(x.require_item),
          require_cp: Boolean(x.require_cp),
          enforcement: String(x.enforcement || "OPTIONAL"),
          is_active: Boolean(x.is_active),
          effective_from: String(x.effective_from),
          effective_to: x.effective_to ? String(x.effective_to) : null,
        })) as AccountPostingPolicyLite[]);

        setAccountPostingPolicies(list);
      } catch {
        setAccountPostingPolicies([]);
        setPostingPolicyByAccountCode({});
      }

      // =========================
      // Load account_defaults
      // =========================
      try {
        const { data: defs, error: defErr } = await supabase
          .from("account_defaults")
          .select("id,company_id,process_key,account_node_id,is_active,notes")
          .eq("company_id", companyId)
          .eq("is_active", true);

        if (defErr) throw defErr;

        const rows = (((defs as any[]) || []) as AccountDefaultRow[]);
        setAccountDefaults(rows);

        const byProcess: Record<string, string> = {};

        for (const d of rows) {
          if (!d.account_node_id) continue;
          const acc = d.account_node_id ? accById[d.account_node_id] : null;
          if (acc?.code) byProcess[d.process_key] = acc.code;
        }

        // OJO: si accById aún no estaba listo, recalculamos más abajo también
        setDefaultAccountCodeByProcess(byProcess);
      } catch {
        setAccountDefaults([]);
        setDefaultAccountCodeByProcess({});
      }

    })();
  }, [companyId]);

  useEffect(() => {
    const byProcess: Record<string, string> = {};

    for (const d of accountDefaults) {
      if (!d.is_active || !d.account_node_id) continue;
      const acc = accById[d.account_node_id];
      if (acc?.code) byProcess[d.process_key] = acc.code;
    }

    setDefaultAccountCodeByProcess(byProcess);
  }, [accountDefaults, accById]);

  useEffect(() => {
    const byCode: Record<string, AccountPostingPolicyLite> = {};

    for (const p of accountPostingPolicies) {
      const acc = accById[String(p.account_node_id)];
      const code = String(acc?.code || "").trim().toUpperCase();

      if (code) {
        byCode[code] = p;
      }
    }

    console.log("POLICIES RAW", accountPostingPolicies);
    console.log("ACCOUNTS BY ID", accById);
    console.log("POLICY MAP BY CODE", byCode);

    setPostingPolicyByAccountCode(byCode);
  }, [accountPostingPolicies, accById]);

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

  useEffect(() => {
    if (!journalAutoMode) return;

    const hasMeaningfulLines = lines.some((l) => {
      const { ex, af } = calcLineAmounts(l);
      return l.description.trim() || l.sku.trim() || ex > 0 || af > 0;
    });

    if (!hasMeaningfulLines) {
      setJournalLines(Array.from({ length: 8 }, (_, i) => makeJournalLine(i + 1)));
      return;
    }

    const result = buildJournalFromDoc();

    if (result.error) {
      setMessages([{ level: "error", text: result.error }]);
      return;
    }

    setJournalLines(result.lines);
  }, [
    journalAutoMode,
    lines,
    payments,
    items,
    accByCode,
    postingPolicyByAccountCode,
    businessLineByCode,
    branchByCode,
    branchById,
    businessLineById,
    header.branch_id,
    header.fiscal_doc_code,
    header.doc_type,
    totals.net_taxable,
    totals.net_exempt,
    totals.tax_total,
    totals.grand_total,
  ]);

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

  function openCreateCounterparty(identifier: string) {
    setCpModal({ open: true, identifier: normalizeIdentifier(identifier) });
  }

  function onCounterpartyCreated(created: CPCounterparty) {
    const key = normalizeIdentifier(created.identifier);

    setCounterpartyMap((m) => ({ ...m, [key]: created }));
    setCounterpartiesAvailable(true);

    // Completar cabecera (identifier + nombre)
    setHeader((h) => ({
      ...h,
      counterparty_identifier: created.identifier, // guardamos "bonito" tal cual lo creó
      counterparty_name: created.name || h.counterparty_name,
    }));

    setMessages((prev) => [
      { level: "warn", text: `Tercero creado: ${created.identifier} — ${created.name}` },
      ...prev,
    ]);
  }

  function resolveCounterpartyHeader() {
    const raw = header.counterparty_identifier || "";
    const key = normalizeIdentifier(raw);

    // normalizamos visualmente lo que escribió (sin obligar formato, pero al menos trim)
    setHeader((h) => ({ ...h, counterparty_identifier: raw.trim() }));

    if (!key) return;

    const cp = counterpartyMap[key];
    if (cp?.name) {
      setHeader((h) => ({ ...h, counterparty_name: cp.name }));
    }
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
    setJournalAutoMode(false);
    setJournalLines((p) => renumber([...p, makeJournalLine(p.length + 1)]));
  }

  function removeJournalLine(idx: number) {
    setJournalAutoMode(false);
    setJournalLines((p) => {
      const next = p.filter((_, i) => i !== idx);
      return next.length ? renumber(next) : [makeJournalLine(1)];
    });
  }

  function updateJournalLine(idx: number, patch: Partial<JournalLine>) {
    setJournalAutoMode(false);

    setJournalLines((prev) =>
      prev.map((line, i) => {
        if (i !== idx) return line;

        let next: JournalLine = {
          ...line,
          ...patch,
        };

        // Resolver branch manual si editaron código
        if (patch.branch_code !== undefined) {
          const typedBranchCode = String(patch.branch_code || "").trim();
          const foundBranch = typedBranchCode ? branchByCode[typedBranchCode] : null;
          next.branch_code = typedBranchCode;
          next.branch_id = foundBranch?.id || null;
        }

        // Resolver branch manual si editaron id
        if (patch.branch_id !== undefined) {
          const foundBranch = patch.branch_id ? branchById[patch.branch_id] : null;
          next.branch_id = foundBranch?.id || null;
          next.branch_code = foundBranch?.code || "";
        }

        // Resolver CU manual si editaron código
        if (patch.business_line_code !== undefined) {
          const typedBUCode = String(patch.business_line_code || "").trim();
          const foundBU = typedBUCode ? businessLineByCode[typedBUCode] : null;
          next.business_line_code = typedBUCode;
          next.business_line_id = foundBU?.id || null;
        }

        // Resolver CU manual si editaron id
        if (patch.business_line_id !== undefined) {
          const foundBU = patch.business_line_id ? businessLineById[patch.business_line_id] : null;
          next.business_line_id = foundBU?.id || null;
          next.business_line_code = foundBU?.code || "";
        }

        // Aplicar política real de la cuenta
        next = normalizeLineDimensionsByPolicy(next);

        return next;
      })
    );
  }

  function recalcJournalAuto() {
    setJournalAutoMode(true);
    setMessages([]);

    const result = buildJournalFromDoc();

    if (result.error) {
      setMessages([{ level: "error", text: result.error }]);
      return;
    }

    setJournalLines(result.lines);
  }

  function sumJournal(jl: JournalLine[]) {
    const debe = jl.reduce((s, x) => s + toNum(x.debit), 0);
    const haber = jl.reduce((s, x) => s + toNum(x.credit), 0);
    return { debe, haber };
  }



  
  async function resolveCounterpartyIdByIdentifier(identifierRaw: string): Promise<string | null> {
    const key = normalizeIdentifier(identifierRaw || "");
    if (!key) return null;

    const local = counterpartyMap[key];
    if ((local as any)?.id) return (local as any).id as string;

    const { data, error } = await supabase
      .from("counterparties")
      .select("id,identifier")
      .eq("company_id", companyId)
      .eq("is_active", true);

    if (error) throw error;

    const found = ((data as any[]) || []).find(
      (x) => normalizeIdentifier(x.identifier) === key
    );

    return found?.id ?? null;
  }


  function getDefaultAccountCode(processKey: string): string {
    return String(defaultAccountCodeByProcess[processKey] || "").trim();
  }

  function getPaymentProcessKey(p: PaymentRow): string {
    if (p.method === "EFECTIVO") return "SALE_PAYMENT_CASH";
    if (p.method === "TRANSFERENCIA") return "SALE_PAYMENT_TRANSFER";
    if (p.method === "CHEQUE") return "SALE_PAYMENT_CHECK";
    if (p.method === "OTRO") return "SALE_PAYMENT_OTHER";

    if (p.method === "TARJETA") {
      if (p.card_kind === "DEBITO") return "SALE_PAYMENT_CARD_DEBIT";
      if (p.card_kind === "CREDITO") return "SALE_PAYMENT_CARD_CREDIT";
      return "SALE_PAYMENT_CARD_CREDIT";
    }

    return "SALE_PAYMENT_OTHER";
  }

    function getUsedDocLines() {
    return lines
      .map((l, idx) => {
        const amounts = calcLineAmounts(l);
        const item =
          l.item_id
            ? items.find((it) => it.id === l.item_id) || null
            : items.find(
                (it) =>
                  String(it.sku || "").trim().toUpperCase() ===
                  String(l.sku || "").trim().toUpperCase()
              ) || null;

        return {
          idx,
          line: l,
          item,
          business_line_id: item?.business_line_id || null,
          ...amounts,
        };
      })
      .filter((x) => {
        return (
          String(x.line.description || "").trim() !== "" ||
          String(x.line.sku || "").trim() !== "" ||
          x.ex > 0 ||
          x.af > 0
        );
      });
  }

  function getPostingPolicyByAccountCode(accountCodeRaw: string): AccountPostingPolicyLite | null {
    const accountCode = String(accountCodeRaw || "").trim().toUpperCase();
    if (!accountCode) return null;
    return postingPolicyByAccountCode[accountCode] || null;
  }

  function getDefaultBusinessLineFromDoc(): { id: string; code: string } | null {
    const usedDocLines = getUsedDocLines();

    for (const row of usedDocLines) {
      if (row.business_line_id) {
        const bu = businessLineById[row.business_line_id];
        if (bu) {
          return { id: bu.id, code: bu.code };
        }
      }
    }

    return null;
  }

  function normalizeLineDimensionsByPolicy(line: JournalLine): JournalLine {
    const next: JournalLine = { ...line };

    const accountCode = String(next.account_code || "").trim().toUpperCase();
    const policy = getPostingPolicyByAccountCode(accountCode);
    const defaultBU = getDefaultBusinessLineFromDoc();
    const docBranch = header.branch_id ? branchById[header.branch_id] : null;

    // normalizar branch manual
    if (!next.branch_id && next.branch_code) {
      const br = branchByCode[String(next.branch_code).trim()];
      next.branch_id = br?.id || null;
      next.branch_code = br?.code || "";
    } else if (next.branch_id && !next.branch_code) {
      const br = branchById[next.branch_id];
      next.branch_code = br?.code || "";
    }

    // normalizar CU manual
    if (!next.business_line_id && next.business_line_code) {
      const bu = businessLineByCode[String(next.business_line_code).trim()];
      next.business_line_id = bu?.id || null;
      next.business_line_code = bu?.code || "";
    } else if (next.business_line_id && !next.business_line_code) {
      const bu = businessLineById[next.business_line_id];
      next.business_line_code = bu?.code || "";
    }

    // si no hay policy, no tocar dimensiones
    if (!policy) {
      console.log("SIN POLICY PARA CUENTA", accountCode, postingPolicyByAccountCode);
      return next;
    }

    // SUCURSAL solo si la política lo exige
    if (policy.require_suc) {
      if (!header.branch_id || !docBranch) {
        throw new Error(
          `La cuenta ${accountCode} exige sucursal, pero el documento no tiene una sucursal válida en cabecera.`
        );
      }

      next.branch_id = docBranch.id;
      next.branch_code = docBranch.code || "";
    } else {
      next.branch_id = null;
      next.branch_code = "";
    }

    // CU solo si la política lo exige
    if (policy.require_cu) {
      if (!next.business_line_id) {
        next.business_line_id = defaultBU?.id || null;
        next.business_line_code = defaultBU?.code || "";
      } else {
        const bu = businessLineById[next.business_line_id];
        next.business_line_code = bu?.code || next.business_line_code || "";
      }
    } else {
      next.business_line_id = null;
      next.business_line_code = "";
    }

    if (!policy.require_cc) {
      next.cost_center_id = null;
      next.cost_center_code = "";
    }

    console.log("normalizeLineDimensionsByPolicy", {
      accountCode,
      policy,
      header_branch_id: header.branch_id,
      docBranch,
      result_branch_id: next.branch_id,
      result_branch_code: next.branch_code,
    });

    return next;
  }


  function buildJournalFromDoc(): { lines: JournalLine[]; error?: string } {
    const glosaBase = header.fiscal_doc_code || "VENTA";
    const tol = 0.5;
    const docGlosa = `${glosaBase} - ${folioLabel(header.series, header.number)}`.trim();

    const usedDocLines = getUsedDocLines();

    // =========================
    // Formas de pago:
    // - si tienen cuenta => van a su cuenta
    // - si NO tienen cuenta => ese monto irá a CxC
    // =========================
    const usedPayments = payments.filter((p) => toNum(p.amount) > 0);

    const payLines: JournalLine[] = [];
    let mappedPaymentsTotal = 0;

    for (const p of usedPayments) {
      const amount = toNum(p.amount);
      if (amount <= 0) continue;

      const processKey = getPaymentProcessKey(p);
      const accountCode = getDefaultAccountCode(processKey);

      // Si esta forma de pago no tiene cuenta configurada, NO revienta:
      // simplemente no crea línea y su monto quedará en CxC.
      if (!accountCode) continue;

      const line = normalizeLineDimensionsByPolicy({
        line_no: payLines.length + 1,
        account_code: accountCode,
        description: docGlosa,
        debit: String(amount),
        credit: "",

        cost_center_id: null,
        business_line_id: null,
        branch_id: null,

        cost_center_code: "",
        business_line_code: "",
        branch_code: "",
      });

      payLines.push(line);
      mappedPaymentsTotal += amount;
    }

    const diff = totals.grand_total - mappedPaymentsTotal;

    if (diff < -tol) {
      return {
        lines: [],
        error: "Error: La suma de formas de pago aplicadas es MAYOR al total del documento.",
      };
    }

    const next: JournalLine[] = [...payLines];

    // Todo lo que no cayó en cuentas de pago configuradas => CxC
    if (diff > tol) {
      const arAccount =
        getDefaultAccountCode("SALE_PAYMENT_CREDIT") ||
        getDefaultAccountCode("AR_CUSTOMERS");

      if (!arAccount) {
        return {
          lines: [],
          error: "Falta configurar la cuenta predeterminada de cuentas por cobrar.",
        };
      }

      next.push(
        normalizeLineDimensionsByPolicy({
          line_no: next.length + 1,
          account_code: arAccount,
          description: docGlosa,
          debit: String(diff),
          credit: "",

          cost_center_id: null,
          business_line_id: null,
          branch_id: null,

          cost_center_code: "",
          business_line_code: "",
          branch_code: "",
        })
      );
    }

    if (totals.tax_total > 0) {
      const taxAccount = getDefaultAccountCode("SALE_TAX_OUTPUT");
      if (!taxAccount) {
        return {
          lines: [],
          error: "Falta configurar la cuenta predeterminada de IVA débito fiscal.",
        };
      }

      next.push(
        normalizeLineDimensionsByPolicy({
          line_no: next.length + 1,
          account_code: taxAccount,
          description: docGlosa,
          debit: "",
          credit: String(totals.tax_total),

          cost_center_id: null,
          business_line_id: null,
          branch_id: null,

          cost_center_code: "",
          business_line_code: "",
          branch_code: "",
        })
      );
    }

    // =========================
    // Ingresos agrupados por línea de negocio
    // =========================
    const taxedAccount = getDefaultAccountCode("SALE_REVENUE_TAXED");
    const exemptAccount = getDefaultAccountCode("SALE_REVENUE_EXEMPT");

    const revenueBuckets = new Map<
      string,
      {
        account_code: string;
        description: string;
        business_line_id: string | null;
        business_line_code: string;
        amount: number;
      }
    >();

    for (const row of usedDocLines) {
      if (row.af > 0) {
        if (!taxedAccount) {
          return {
            lines: [],
            error: "Falta configurar la cuenta predeterminada de ingresos afectos.",
          };
        }

        const bu = row.business_line_id ? businessLineById[row.business_line_id] : null;
        const key = `${taxedAccount}__${row.business_line_id || "NO_BU"}`;

        const prev = revenueBuckets.get(key);
        if (prev) {
          prev.amount += row.af;
        } else {
          revenueBuckets.set(key, {
            account_code: taxedAccount,
            description: docGlosa,
            business_line_id: row.business_line_id || null,
            business_line_code: bu?.code || "",
            amount: row.af,
          });
        }
      }

      if (row.ex > 0) {
        if (!exemptAccount) {
          return {
            lines: [],
            error: "Falta configurar la cuenta predeterminada de ingresos exentos.",
          };
        }

        const bu = row.business_line_id ? businessLineById[row.business_line_id] : null;
        const key = `${exemptAccount}__${row.business_line_id || "NO_BU"}`;

        const prev = revenueBuckets.get(key);
        if (prev) {
          prev.amount += row.ex;
        } else {
          revenueBuckets.set(key, {
            account_code: exemptAccount,
            description: docGlosa,
            business_line_id: row.business_line_id || null,
            business_line_code: bu?.code || "",
            amount: row.ex,
          });
        }
      }
    }

    for (const bucket of revenueBuckets.values()) {
      next.push(
        normalizeLineDimensionsByPolicy({
          line_no: next.length + 1,
          account_code: bucket.account_code,
          description: bucket.description,
          debit: "",
          credit: String(bucket.amount),

          cost_center_id: null,
          business_line_id: bucket.business_line_id,
          branch_id: null,

          cost_center_code: "",
          business_line_code: bucket.business_line_code || "",
          branch_code: "",
        })
      );
    }

    // =========================
    // Validación de políticas
    // =========================
    for (const jl of next) {
      const acc = accByCode[String(jl.account_code || "").trim()];
      const policy = getPostingPolicyByAccountCode(jl.account_code);

      if (!acc) {
        return {
          lines: [],
          error: `La cuenta contable ${jl.account_code} no existe.`,
        };
      }

      if (policy?.require_suc && !jl.branch_id) {
        return {
          lines: [],
          error: `La cuenta ${jl.account_code} exige sucursal, pero la línea no la tiene.`,
        };
      }

      if (policy?.require_cu && !jl.business_line_id) {
        return {
          lines: [],
          error: `La cuenta ${jl.account_code} exige línea de negocio (CU), pero la línea no la tiene.`,
        };
      }
    }

    const { debe, haber } = sumJournal(next);

    if (Math.abs(debe - haber) > tol) {
      return {
        lines: [],
        error: `Asiento no cuadra: Debe ${debe} ≠ Haber ${haber}`,
      };
    }

    console.log("BUILD JOURNAL RAW", next);
    console.log("HEADER BRANCH DEBUG", {
      header_branch_id: header.branch_id,
      docBranch: header.branch_id ? branchById[header.branch_id] : null,
    });

    return {
      lines: next.map((x, i) => ({ ...x, line_no: i + 1 })),
    };
  }

  function buildJournalFromManual(): { lines: JournalLine[]; error?: string } {
    const tol = 0.5;

    const used: JournalLine[] = journalLines
      .map((l, i) => normalizeLineDimensionsByPolicy({
        ...l,
        line_no: i + 1,
        account_code: String(l.account_code || "").trim(),
        description: String(l.description || "").trim(),
        debit: String(l.debit || "").trim(),
        credit: String(l.credit || "").trim(),
        cost_center_id: null,
        cost_center_code: "",
        business_line_code: String(l.business_line_code || "").trim(),
        branch_code: String(l.branch_code || "").trim(),
      }))
      .filter((l) => {
        return (
          l.account_code ||
          l.description ||
          l.debit ||
          l.credit ||
          l.business_line_code ||
          l.branch_code
        );
      });

    if (used.length === 0) {
      return { lines: [], error: "Debes ingresar al menos 1 línea en el asiento." };
    }

    const invalidLine = used.find((l) => {
      const debit = toNum(l.debit);
      const credit = toNum(l.credit);

      return (
        !l.account_code ||
        (debit <= 0 && credit <= 0) ||
        (debit > 0 && credit > 0)
      );
    });

    if (invalidLine) {
      return {
        lines: [],
        error: "Cada línea del asiento manual debe tener cuenta y solo Debe o Haber.",
      };
    }

    for (const l of used) {
      const acc = accByCode[String(l.account_code || "").trim()];
      if (!acc) {
        return {
          lines: [],
          error: `La cuenta contable ${l.account_code} no existe.`,
        };
      }

      const policy = getPostingPolicyByAccountCode(l.account_code);

      if (policy?.require_suc && !l.branch_id) {
        return {
          lines: [],
          error: `La cuenta ${l.account_code} exige sucursal (SUC) válida.`,
        };
      }

      if (policy?.require_cu && !l.business_line_id) {
        return {
          lines: [],
          error: `La cuenta ${l.account_code} exige línea de negocio (CU) válida.`,
        };
      }
    }

    const { debe, haber } = sumJournal(used);

    if (Math.abs(debe - haber) > tol) {
      return {
        lines: [],
        error: `Asiento no cuadra: Debe ${debe} ≠ Haber ${haber}`,
      };
    }

    return { lines: used };
  }

  async function registerDraftById(tradeDocId: string): Promise<void> {
    if (!companyId) throw new Error("Falta companyId.");
    if (!canEdit) throw new Error("No tienes permisos para registrar.");

    const userId = await getAuthUserId();

    const { data: doc, error: docError } = await supabase
      .from("trade_docs")
      .select(`
        id,
        issue_date,
        due_date,
        currency_code,
        reference,
        notes,
        doc_type,
        fiscal_doc_code,
        series,
        number,
        net_taxable,
        net_exempt,
        tax_total,
        grand_total,
        counterparty_id,
        counterparty_identifier_snapshot,
        counterparty_name_snapshot,
        status,
        journal_entry_id
      `)
      .eq("company_id", companyId)
      .eq("id", tradeDocId)
      .single();

    if (docError) throw docError;
    if (!doc) throw new Error("No se encontró el documento.");
    if (doc.status !== "BORRADOR") throw new Error("Solo se pueden registrar documentos en BORRADOR.");
    if (!doc.journal_entry_id) throw new Error("Este documento no tiene asiento borrador asociado.");

    const { data: draftLines, error: draftLinesError } = await supabase
      .from("journal_entry_lines")
      .select("id")
      .eq("company_id", companyId)
      .eq("journal_entry_id", doc.journal_entry_id);

    if (draftLinesError) throw draftLinesError;
    if (!draftLines || draftLines.length === 0) {
      throw new Error("El asiento borrador no tiene líneas.");
    }

    const issueDate = doc.issue_date || todayISO();
    const accountingPeriodId = await getCurrentAccountingPeriodId(companyId, issueDate);
    if (!accountingPeriodId) {
      throw new Error(`No existe período contable para la fecha ${doc.issue_date}.`);
    }

    const { error: entryUpdateError } = await supabase
      .from("journal_entries")
      .update({
        accounting_period_id: accountingPeriodId,
        status: "POSTED",
        posted_at: new Date().toISOString(),
        posted_by: userId,
      })
      .eq("company_id", companyId)
      .eq("id", doc.journal_entry_id)
      .eq("status", "DRAFT");

    if (entryUpdateError) throw entryUpdateError;

    const { error: updateDocError } = await supabase
      .from("trade_docs")
      .update({
        status: "VIGENTE",
        cancelled_at: null,
        cancel_reason: null,
      })
      .eq("company_id", companyId)
      .eq("id", tradeDocId)
      .eq("status", "BORRADOR");

    if (updateDocError) throw updateDocError;
  }
  
  function clearForm() {
    setDocId(null);
    setJournalAutoMode(true);

    setHeader({
      doc_type: "INVOICE",
      fiscal_doc_code: fiscalCfg.enabled ? (defaultFiscalCodeSales || "") : "",
      status: "BORRADOR",
      issue_date: todayISO(),
      due_date: todayISO(),
      series: "",
      number: "",
      currency_code: baseCurrency,
      branch_id: branches.find((b) => b.is_default)?.id || branches[0]?.id || "",
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
      Array.from({ length: 8 }, (_, i) => ({
        ...makeDocLine(i + 1),
        tax_rate: defaultTaxRate || "19",
      }))
    );
    setPayments([]);
    setJournalLines(Array.from({ length: 8 }, (_, i) => makeJournalLine(i + 1)));

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
        .in("doc_type", ["INVOICE"])
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
            "counterparty_identifier_snapshot",
            "counterparty_name_snapshot",
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

    let savedIdForRollback: string | null = null;
    let journalEntryIdForRollback: string | null = null;
    let createdNewTradeDoc = false;
    let previousJournalLines: any[] = [];

    try {
      setMessages([]);

      const userId = await getAuthUserId();

      const usedLines = lines
        .filter((l) => {
          const { ex, af } = calcLineAmounts(l);
          return (
            String(l.description || "").trim() !== "" ||
            String(l.sku || "").trim() !== "" ||
            ex > 0 ||
            af > 0
          );
        })
        .map((l, i) => {
          const { qty, unit, ex, af, rate, iva, total } = calcLineAmounts(l);

          return {
            company_id: companyId,
            trade_doc_id: "", // se completa después
            line_no: i + 1,
            item_id: l.item_id || null,
            sku: l.sku || null,
            description: l.description || null,
            qty,
            unit_price: unit,
            tax_kind: l.is_taxable ? "AFECTO" : "EXENTO",
            exempt_amount: ex,
            taxable_amount: af,
            tax_rate: rate,
            tax_amount: iva,
            line_total: total,
          };
        });

      if (usedLines.length === 0) {
        throw new Error("El documento debe tener al menos 1 línea con descripción, SKU o monto.");
      }

      const headerPayloadFull: any = {
        company_id: companyId,
        doc_type: header.doc_type,
        status: "BORRADOR",
        issue_date: header.issue_date,
        due_date: header.due_date,
        series: header.series || null,
        number: header.number || null,
        currency_code: header.currency_code,
        branch_id: header.branch_id || null,
        fiscal_doc_code: header.fiscal_doc_code || null,
        counterparty_id: (() => {
          const key = normalizeIdentifier(header.counterparty_identifier || "");
          const cp = key ? counterpartyMap[key] : null;
          return (cp as any)?.id ?? null;
        })(),
        counterparty_identifier_snapshot: header.counterparty_identifier || null,
        counterparty_name_snapshot: header.counterparty_name || null,
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
        series: null,
        number: header.number || null,
        currency_code: header.currency_code,
        branch_id: header.branch_id || null,
        counterparty_identifier_snapshot: header.counterparty_identifier || null,
        counterparty_name_snapshot: header.counterparty_name || null,
        reference: header.reference || null,
        notes: header.notes || null,
        origin_doc_id: header.origin_doc_id,
        grand_total: totals.grand_total,
      };

      const result = journalAutoMode
        ? buildJournalFromDoc()
        : buildJournalFromManual();

      if (result.error) throw new Error(result.error);

      const invalidJournalLine = result.lines.find(
        (l) => !String(l.account_code || "").trim()
      );

      if (invalidJournalLine) {
        throw new Error("Faltan cuentas contables por configurar en el asiento.");
      }

      const wasNewDoc = !docId;

      const saved = await safeUpsertSalesDoc({
        companyId,
        docId,
        payloadFull: headerPayloadFull,
        payloadFallback: headerPayloadFallback,
      });

      const savedId = (saved as any).id as string;
      const newStatus = (saved as any).status || "BORRADOR";

      savedIdForRollback = savedId;
      createdNewTradeDoc = wasNewDoc;

      setDocId(savedId);
      setHeaderPatch({ status: newStatus });

      const finalUsedLines = usedLines.map((x) => ({
        ...x,
        trade_doc_id: savedId,
      }));

      const usedLinesFallback = finalUsedLines.map((x) => ({
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

      const { error: upsertLinesError } = await supabase
        .from("trade_doc_lines")
        .upsert(finalUsedLines as any, {
          onConflict: "company_id,trade_doc_id,line_no",
        });

      if (upsertLinesError) {
        if (isUnknownColumnError(upsertLinesError)) {
          const { error: upsertFallbackError } = await supabase
            .from("trade_doc_lines")
            .upsert(usedLinesFallback as any, {
              onConflict: "company_id,trade_doc_id,line_no",
            });

          if (upsertFallbackError) throw upsertFallbackError;
        } else {
          throw upsertLinesError;
        }
      }

      const { data: existingRows, error: existingRowsError } = await supabase
        .from("trade_doc_lines")
        .select("line_no")
        .eq("company_id", companyId)
        .eq("trade_doc_id", savedId);

      if (existingRowsError) throw existingRowsError;

      const validLineNos = new Set(finalUsedLines.map((x) => x.line_no));
      const extraLineNos = ((existingRows as any[]) || [])
        .map((r) => Number(r.line_no))
        .filter((n) => !validLineNos.has(n));

      if (extraLineNos.length > 0) {
        const { error: deleteExtrasError } = await supabase
          .from("trade_doc_lines")
          .delete()
          .eq("company_id", companyId)
          .eq("trade_doc_id", savedId)
          .in("line_no", extraLineNos);

        if (deleteExtrasError) throw deleteExtrasError;
      }

      // =========================
      // Asiento borrador
      // =========================
      const { data: currentDoc, error: currentDocError } = await supabase
        .from("trade_docs")
        .select("journal_entry_id")
        .eq("company_id", companyId)
        .eq("id", savedId)
        .single();

      if (currentDocError) throw currentDocError;

      
      const draftJournalEntryId = await upsertDraftJournalEntry({
        companyId,
        docId: savedId,
        entryDate: header.issue_date,
        description: `${header.fiscal_doc_code || "VENTA"} ${folioLabel(header.series, header.number)}`.trim(),
        reference: header.reference || null,
        currencyCode: header.currency_code || baseCurrency,
        userId,
        headerDocType: header.doc_type,
        fiscalDocCode: header.fiscal_doc_code || null,
        series: header.series || null,
        number: header.number || null,
        existingJournalEntryId: (currentDoc as any)?.journal_entry_id ?? null,
        journalMode: journalAutoMode ? "AUTO" : "MANUAL",
      });

      journalEntryIdForRollback = draftJournalEntryId;

      const { data: previousJournalLinesData, error: previousJournalLinesError } = await supabase
        .from("journal_entry_lines")
        .select("*")
        .eq("company_id", companyId)
        .eq("journal_entry_id", draftJournalEntryId);

      if (previousJournalLinesError) throw previousJournalLinesError;

      previousJournalLines = previousJournalLinesData || [];

      await safeDeleteByCompanyAndEntry("journal_entry_lines", companyId, draftJournalEntryId);

      let counterpartyId: string | null = null;
      const key = normalizeIdentifier(header.counterparty_identifier || "");
      if (key && counterpartyMap[key]?.id) {
        counterpartyId = counterpartyMap[key].id;
      } else if (header.counterparty_identifier) {
        counterpartyId = await resolveCounterpartyIdByIdentifier(header.counterparty_identifier);
      }

        const journalLineRows = result.lines.map((rawLine, idx) => {
          const l = normalizeLineDimensionsByPolicy(rawLine);

          const acc = accByCode[String(l.account_code).trim()];
          if (!acc?.id) {
            throw new Error(`La cuenta contable ${l.account_code} no existe.`);
          }

          const policy = getPostingPolicyByAccountCode(l.account_code);

          if (policy?.require_suc && !l.branch_id) {
            throw new Error(`La cuenta ${acc.code} exige sucursal (SUC).`);
          }

          if (policy?.require_cu && !l.business_line_id) {
            throw new Error(`La cuenta ${acc.code} exige línea de negocio (CU).`);
          }

          return {
            company_id: companyId,
            journal_entry_id: draftJournalEntryId,
            line_no: idx + 1,
            account_node_id: acc.id,
            line_description: l.description || null,
            line_reference: header.reference || null,
            debit: toNum(l.debit),
            credit: toNum(l.credit),
            counterparty_id: counterpartyId,

            cost_center_id: null,
            business_line_id: l.business_line_id || null,
            branch_id: l.branch_id || null,

            item_id: null,
            tax_id: null,
            tax_rate_id: null,

            account_code_snapshot: acc.code,
            account_name_snapshot: acc.name,

            counterparty_identifier_snapshot: header.counterparty_identifier || null,
            counterparty_name_snapshot: header.counterparty_name || null,

            created_by: userId,
          };
        });

      const { error: journalInsertError } = await supabase
        .from("journal_entry_lines")
        .insert(journalLineRows as any);

      if (journalInsertError) throw journalInsertError;

      const { error: docUpdateError } = await supabase
        .from("trade_docs")
        .update({
          journal_entry_id: draftJournalEntryId,
        })
        .eq("company_id", companyId)
        .eq("id", savedId);

      if (docUpdateError) throw docUpdateError;

      // =========================
      // Payments
      // =========================
      const oldPaymentIds = await getPaymentIdsByTradeDoc(companyId, savedId);

      const usedPayments = payments.filter((p) => {
        return toNum(p.amount) > 0 || String(p.reference || "").trim() !== "";
      });

      if (usedPayments.length > 0) {
        const paymentRows = usedPayments.map((p) => ({
          company_id: companyId,
          payment_date: header.issue_date,
          currency_code: header.currency_code || baseCurrency,
          method: p.method,
          reference: p.reference || null,
          card_kind: p.method === "TARJETA" ? (p.card_kind || null) : null,
          card_last4: p.method === "TARJETA" ? (p.card_last4 || null) : null,
          auth_code: p.method === "TARJETA" ? (p.auth_code || null) : null,
          total_amount: toNum(p.amount),
          notes: null,
          extra: {
            source: "trade_docs_sales",
            trade_doc_id: savedId,
            draft: true,
            ui_payment_row_id: p.id,
          },
          created_by: userId,
        }));

        const { data: insertedPayments, error: insertedPaymentsError } = await supabase
          .from("payments")
          .insert(paymentRows as any)
          .select("id,total_amount,extra");

        if (insertedPaymentsError) throw insertedPaymentsError;

        const allocRows = ((insertedPayments as any[]) || []).map((dbRow) => ({
          company_id: companyId,
          payment_id: dbRow.id,
          trade_doc_id: savedId,
          allocated_amount: Number(dbRow.total_amount || 0),
          created_by: userId,
        }));

        if (allocRows.length > 0) {
          const { error: allocInsertError } = await supabase
            .from("payment_allocations")
            .insert(allocRows as any);

          if (allocInsertError) throw allocInsertError;
        }

        await deletePaymentsByIds(companyId, savedId, oldPaymentIds);
      } else {
        await deletePaymentsByIds(companyId, savedId, oldPaymentIds);
      }

      setMessages([{ level: "warn", text: "Borrador guardado." }]);
      await loadDrafts();
      closeEditor();
        } catch (e: any) {
          // rollback solo si el documento era nuevo;
          // si era edición, no queremos borrar el borrador existente entero
          if (createdNewTradeDoc && savedIdForRollback) {
            try {
              await rollbackDraftArtifacts({
                companyId,
                tradeDocId: savedIdForRollback,
                journalEntryId: journalEntryIdForRollback,
              });
            } catch {}
          }

          // restaurar líneas anteriores del asiento si era edición
          if (!createdNewTradeDoc && journalEntryIdForRollback) {
            try {
              const { data: existingAfterFail } = await supabase
                .from("journal_entry_lines")
                .select("id")
                .eq("company_id", companyId)
                .eq("journal_entry_id", journalEntryIdForRollback);

              if (!existingAfterFail || existingAfterFail.length === 0) {
                const backupLines = (previousJournalLines || []).map((r: any) => {
                  const { id, ...rest } = r;
                  return rest;
                });

                if (backupLines.length > 0) {
                  await supabase.from("journal_entry_lines").insert(backupLines as any);
                }
              }
            } catch {}
          }

          setMessages([
            {
              level: "error",
              text: e?.message || "No se pudo guardar el borrador.",
            },
          ]);
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
            "branch_id",
            "counterparty_identifier_snapshot",
            "counterparty_name_snapshot",
            "reference",
            "notes",
            "cancelled_at",
            "cancel_reason",
            "origin_doc_id",
            "fiscal_doc_code",
            "journal_entry_id",
          ].join(",")
        )
        .eq("company_id", companyId)
        .eq("id", draftId)
        .single();
      if (he) throw he;

      // Lines: intentamos esquema nuevo, si falla volvemos a esquema viejo
      let ls: any[] = [];

      const { data, error } = await supabase
        .from("trade_doc_lines")
        .select("line_no,item_id,sku,description,qty,unit_price,tax_kind,exempt_amount,taxable_amount,tax_rate,tax_amount,line_total")
        .eq("company_id", companyId)
        .eq("trade_doc_id", draftId)
        .order("line_no", { ascending: true });

      if (error) throw error;

      ls = (data as any[]) || [];

            // Payments del borrador
            const { data: payData, error: payError } = await supabase
              .from("payment_allocations")
              .select(`
                allocated_amount,
                payments (
                  id,
                  method,
                  reference,
                  card_kind,
                  card_last4,
                  auth_code,
                  total_amount,
                  extra
                )
              `)
              .eq("company_id", companyId)
              .eq("trade_doc_id", draftId);

            if (payError) throw payError;

            let parsedPayments: PaymentRow[] = (((payData as any[]) || []).map((r: any) => {
              const p = Array.isArray(r.payments) ? r.payments[0] : r.payments;

              return {
                id: String(p?.id || uid()),
                method: (p?.method || "TRANSFERENCIA") as PaymentRow["method"],
                amount: r.allocated_amount != null
                  ? String(r.allocated_amount)
                  : String(p?.total_amount ?? ""),
                card_kind: (p?.card_kind || "") as PaymentRow["card_kind"],
                card_last4: String(p?.card_last4 || ""),
                auth_code: String(p?.auth_code || ""),
                reference: String(p?.reference || ""),
              };
            })) as PaymentRow[];

            if (parsedPayments.length === 0) {
              const { data: payFallback, error: payFallbackError } = await supabase
                .from("payments")
                .select("id,method,reference,card_kind,card_last4,auth_code,total_amount,extra")
                .eq("company_id", companyId);

              if (payFallbackError) throw payFallbackError;

              parsedPayments = (((payFallback as any[]) || [])
                .filter((p: any) => p?.extra?.trade_doc_id === draftId)
                .map((p: any) => ({
                  id: String(p.id || uid()),
                  method: (p.method || "TRANSFERENCIA") as PaymentRow["method"],
                  amount: String(p.total_amount ?? ""),
                  card_kind: (p.card_kind || "") as PaymentRow["card_kind"],
                  card_last4: String(p.card_last4 || ""),
                  auth_code: String(p.auth_code || ""),
                  reference: String(p.reference || ""),
                }))) as PaymentRow[];
            }
            
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
        branch_id: (h as any).branch_id || "",
        counterparty_identifier: (h as any).counterparty_identifier_snapshot || "",
        counterparty_name: (h as any).counterparty_name_snapshot || "",
        reference: (h as any).reference || "",
        notes: (h as any).notes || "",
        cancelled_at: (h as any).cancelled_at || "",
        cancel_reason: (h as any).cancel_reason || "",
        origin_doc_id: originId,
        origin_label: originLabel,
      });

      const parsedLines: DocLine[] = (ls || []).map((r: any) => {
        const taxKind = String(r.tax_kind || "").toUpperCase();
        const isTaxable = taxKind === "EXENTO" ? false : true;

        const exemptAmount = Number(r.exempt_amount || 0);
        const taxableAmount = Number(r.taxable_amount || 0);
        const taxAmount = Number(r.tax_amount || 0);
        const lineTotal = Number(r.line_total || 0);

        return {
          line_no: Number(r.line_no) || 1,
          item_id: r.item_id || null,
          sku: r.sku || "",
          description: r.description || "",

          qty: r.qty != null ? String(r.qty) : "1",
          unit_price: r.unit_price != null ? String(r.unit_price) : "",

          is_taxable: isTaxable,
          tax_rate: r.tax_rate != null ? String(r.tax_rate) : (defaultTaxRate || "19"),

          // ✅ al reabrir, cargar lo que realmente guardaste
          ex_override: exemptAmount > 0 ? String(exemptAmount) : "",
          af_override: taxableAmount > 0 ? String(taxableAmount) : "",
          iva_override: taxAmount > 0 ? String(taxAmount) : "",
          total_override: lineTotal > 0 ? String(lineTotal) : "",
        };
      });

      setLines(
        parsedLines.length >= 8
          ? renumber(parsedLines)
          : renumber([
              ...parsedLines,
              ...Array.from({ length: 8 - parsedLines.length }, (_, i) => makeDocLine(parsedLines.length + i + 1)),
            ])
      );

      setPayments(parsedPayments);

      
      // =========================
      // Cargar asiento borrador si existe
      // =========================
      let draftJournalLines: JournalLine[] = [];

      const journalEntryId = (h as any).journal_entry_id ?? null;

      let savedJournalMode: "AUTO" | "MANUAL" = "AUTO";

      if (journalEntryId) {
        const { data: jeRow } = await supabase
          .from("journal_entries")
          .select("extra")
          .eq("company_id", companyId)
          .eq("id", journalEntryId)
          .maybeSingle();

        savedJournalMode =
          (jeRow as any)?.extra?.journal_mode === "MANUAL" ? "MANUAL" : "AUTO";
          
        const { data: jlData, error: jlError } = await supabase
          .from("journal_entry_lines")
          .select(`
            line_no,
            line_description,
            debit,
            credit,
            account_code_snapshot,
            business_line_id,
            branch_id,
            business_lines (
              id,
              code,
              name
            ),
            branches (
              id,
              code,
              name
            )
          `)
          .eq("company_id", companyId)
          .eq("journal_entry_id", journalEntryId)
          .order("line_no", { ascending: true });

        if (jlError) throw jlError;

        draftJournalLines = ((jlData as any[]) || []).map((r) => {
          const bu = Array.isArray(r.business_lines) ? r.business_lines[0] : r.business_lines;
          const br = Array.isArray(r.branches) ? r.branches[0] : r.branches;

          return {
            line_no: Number(r.line_no) || 1,
            account_code: String(r.account_code_snapshot || ""),
            description: String(r.line_description || ""),
            debit: r.debit != null ? String(r.debit) : "",
            credit: r.credit != null ? String(r.credit) : "",

            cost_center_id: null,
            business_line_id: r.business_line_id || null,
            branch_id: r.branch_id || null,

            cost_center_code: "",
            business_line_code: String(bu?.code || ""),
            branch_code: String(br?.code || ""),
          };
        });
      }

      setJournalAutoMode(savedJournalMode === "AUTO");
      setJournalLines(
        draftJournalLines.length >= 8
          ? renumber(draftJournalLines)
          : renumber([
              ...draftJournalLines,
              ...Array.from(
                { length: Math.max(8 - draftJournalLines.length, 0) },
                (_, i) => makeJournalLine(draftJournalLines.length + i + 1)
              ),
            ])
      );

      setEditorTab("CABECERA");
      setOriginPanelOpen(false);
      setEditorOpen(true);
    } catch (e: any) {
      setMessages([{ level: "error", text: e?.message || "No se pudo abrir el borrador." }]);
    }
  }


  async function deleteDraftInternal(draftId: string) {
    if (!companyId) throw new Error("Falta companyId.");

    const { data: docRow, error: docRowError } = await supabase
      .from("trade_docs")
      .select("journal_entry_id,status")
      .eq("company_id", companyId)
      .eq("id", draftId)
      .maybeSingle();

    if (docRowError) throw docRowError;

    const { data: paymentRows, error: paymentRowsError } = await supabase
      .from("payment_allocations")
      .select("payment_id")
      .eq("company_id", companyId)
      .eq("trade_doc_id", draftId);

    if (paymentRowsError) throw paymentRowsError;

    const paymentIds = Array.from(
      new Set(((paymentRows as any[]) || []).map((x) => x.payment_id).filter(Boolean))
    );

    const { error: deleteDocLinesError } = await supabase
      .from("trade_doc_lines")
      .delete()
      .eq("company_id", companyId)
      .eq("trade_doc_id", draftId);

    if (deleteDocLinesError) throw deleteDocLinesError;

    const { error: deleteAllocError } = await supabase
      .from("payment_allocations")
      .delete()
      .eq("company_id", companyId)
      .eq("trade_doc_id", draftId);

    if (deleteAllocError) throw deleteAllocError;

    if (paymentIds.length > 0) {
      const { error: deletePaymentsError } = await supabase
        .from("payments")
        .delete()
        .eq("company_id", companyId)
        .in("id", paymentIds);

      if (deletePaymentsError) throw deletePaymentsError;
    }

    if ((docRow as any)?.journal_entry_id) {
      const journalEntryId = (docRow as any).journal_entry_id as string;

      const { data: journalRow, error: journalRowError } = await supabase
        .from("journal_entries")
        .select("id,status")
        .eq("company_id", companyId)
        .eq("id", journalEntryId)
        .maybeSingle();

      if (journalRowError) throw journalRowError;

      if (journalRow && journalRow.status === "DRAFT") {
        const { error: deleteJournalLinesError } = await supabase
          .from("journal_entry_lines")
          .delete()
          .eq("company_id", companyId)
          .eq("journal_entry_id", journalEntryId);

        if (deleteJournalLinesError) throw deleteJournalLinesError;

        const { error: deleteJournalEntryError } = await supabase
          .from("journal_entries")
          .delete()
          .eq("company_id", companyId)
          .eq("id", journalEntryId)
          .eq("status", "DRAFT");

        if (deleteJournalEntryError) throw deleteJournalEntryError;
      }
    }

    const { error } = await supabase
      .from("trade_docs")
      .delete()
      .eq("company_id", companyId)
      .eq("id", draftId)
      .eq("status", "BORRADOR");

    if (error) throw error;
  }


  async function deleteDraft(draftId: string) {
    if (!companyId || !canEdit) return;
    const ok = confirm("¿Eliminar este borrador? No se puede deshacer.");
    if (!ok) return;

    try {
      await deleteDraftInternal(draftId);

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
      INVOICE: "bg-sky-100 text-sky-800",
      DEBIT_NOTE: "bg-fuchsia-100 text-fuchsia-800",
      CREDIT_NOTE: "bg-amber-100 text-amber-900",
    };
    return map[header.doc_type];
  }, [header.doc_type]);

  
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
          doc_type: String(r.doc_type || r.DocType || r.tipo || "INVOICE").toUpperCase(),
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
      
      const mapped = cleaned.map((x) => ({
        ...x,
        doc_type:
          x.doc_type === "NC" ? "CREDIT_NOTE" :
          x.doc_type === "ND" ? "DEBIT_NOTE" :
          x.doc_type === "FACTURA" || x.doc_type === "BOLETA" ? "INVOICE" :
          x.doc_type,
      }));

      const errs: string[] = [];
      mapped.forEach((x, i) => {
        if (!x.doc_type) errs.push(`Fila ${i + 2}: doc_type vacío.`);
        if (!x.issue_date) errs.push(`Fila ${i + 2}: issue_date vacío.`);
        if (fiscalCfg.enabled && fiscalCfg.require_sales && !x.fiscal_doc_code) {
          errs.push(`Fila ${i + 2}: fiscal_doc_code obligatorio según configuración.`);
        }
      });

      setImportErrors(errs);
      setImportPreview(mapped.slice(0, 200));
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
        branch_id: branches.find((b) => b.is_default)?.id || branches[0]?.id || null,
        fiscal_doc_code: x.fiscal_doc_code || null,

        counterparty_id: null,
        counterparty_identifier_snapshot: x.counterparty_identifier || null,
        counterparty_name_snapshot: x.counterparty_name || null,
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

    const ok = confirm(`¿Registrar ${selectedIds.length} borrador(es) como VIGENTE y crear sus asientos?`);
    if (!ok) return;

    try {
      setMessages([]);

      let okCount = 0;
      const errors: string[] = [];

      for (const id of selectedIds) {
        try {
          await registerDraftById(id);
          okCount += 1;
        } catch (e: any) {
          errors.push(`Documento ${id.slice(0, 8)}…: ${e?.message || "Error al registrar"}`);
        }
      }

      clearSelection();
      await loadDrafts();

      if (errors.length === 0) {
        setMessages([{ level: "warn", text: `Se registraron ${okCount} documento(s) correctamente.` }]);
      } else {
        setMessages([
          {
            level: "warn",
            text: `Se registraron ${okCount} documento(s). ${errors.length} quedaron con error.`,
          },
          ...errors.slice(0, 7).map((text) => ({ level: "error" as const, text })),
        ]);
      }
    } catch (e: any) {
      setMessages([{ level: "error", text: e?.message || "No se pudo completar el registro masivo." }]);
      await loadDrafts();
    }
  }

  async function bulkDeleteSelected() {
    if (!canEdit || !companyId) return;
    if (selectedIds.length === 0) return;

    const ok = confirm(`¿Eliminar ${selectedIds.length} borrador(es)? No se puede deshacer.`);
    if (!ok) return;

    try {
      for (const id of selectedIds) {
        await deleteDraftInternal(id);
        if (docId === id) clearForm();
      }

      setMessages([{ level: "warn", text: "Borradores eliminados." }]);
      clearSelection();
      await loadDrafts();
    } catch (e: any) {
      setMessages([{ level: "error", text: e?.message || "No se pudo eliminar." }]);
      await loadDrafts();
    }
  }

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
                            </td>
                            <td className={cls(bodyCell, "truncate")} title={d.counterparty_identifier_snapshot || ""}>
                              {d.counterparty_identifier_snapshot || "—"}
                            </td>
                            <td className={bodyCell} title={d.counterparty_name_snapshot || ""}>
                              {ellipsis(d.counterparty_name_snapshot || "—", 28)}
                            </td>
                            <td className={cls(bodyCell, "text-right")}>{formatNumber(Number(d.net_taxable || 0), moneyDecimals)}</td>
                            <td className={cls(bodyCell, "text-right")}>{formatNumber(Number(d.net_exempt || 0), moneyDecimals)}</td>
                            <td className={cls(bodyCell, "text-right")}>{formatNumber(Number(d.tax_total || 0), moneyDecimals)}</td>
                            <td className={cls(bodyCell, "text-right")}>{formatNumber(Number(d.grand_total || 0), moneyDecimals)}</td>
                            <td className={cls(bodyCell, "text-right")}>
                              <div className="flex justify-end gap-1">
                                {/* Editar */}
                                <button
                                  type="button"
                                  className={iconBtn}
                                  onClick={() => openDraft(d.id)}
                                  title="Editar"
                                  aria-label="Editar"
                                >
                                  <Pencil className="h-4 w-4" />
                                </button>

                                {/* Registrar */}
                                <button
                                  type="button"
                                  className={cls(iconBtnPrimary, !canEdit && "opacity-60 cursor-not-allowed")}
                                  disabled={!canEdit}
                                  onClick={async () => {
                                    try {
                                      setMessages([]);
                                      await registerDraftById(d.id);
                                      setMessages([{ level: "warn", text: "Documento registrado (VIGENTE) y asiento creado." }]);
                                      clearSelection();
                                      await loadDrafts();
                                    } catch (e: any) {
                                      setMessages([{ level: "error", text: e?.message || "No se pudo registrar." }]);
                                      await loadDrafts();
                                    }
                                  }}
                                  title="Registrar"
                                  aria-label="Registrar"
                                >
                                  <CheckCircle2 className="h-4 w-4" />
                                </button>

                                {/* Eliminar */}
                                <button
                                  type="button"
                                  className={cls(iconBtnDanger, !canEdit && "opacity-60 cursor-not-allowed")}
                                  disabled={!canEdit}
                                  onClick={() => deleteDraft(d.id)}
                                  title="Eliminar"
                                  aria-label="Eliminar"
                                >
                                  <Trash2 className="h-4 w-4" />
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
      <TradeDocEditorModal
        open={editorOpen}
        onClose={closeEditor}
        theme={{
          header: theme.header,
          glowA: theme.glowA,
          glowB: theme.glowB,
          btnPrimary: theme.btnPrimary,
          btnSoft: theme.btnSoft,
          card: theme.card,
        }}
        title={docId ? `Editar documento (${docId.slice(0, 8)}…)` : "Nuevo documento"}
        subtitle="Ventas • Editor"
        widthClass="w-[min(1200px,96vw)]"
        canEdit={canEdit}
        showCancelButton={showCancelButton}
        docId={docId}
        header={header}
        setHeader={setHeader}
        editorTab={editorTab}
        setEditorTab={setEditorTab}
        fiscalCfg={fiscalCfg}
        fiscalDocTypes={fiscalDocTypes}
        baseCurrency={baseCurrency}
        branches={branches}
        items={items}
        businessLines={businessLines}
        counterpartiesAvailable={counterpartiesAvailable}
        counterpartyMap={counterpartyMap}
        openCreateCounterparty={openCreateCounterparty}
        resolveCounterpartyHeader={resolveCounterpartyHeader}
        needsOrigin={needsOrigin}
        originPanelOpen={originPanelOpen}
        setOriginPanelOpen={setOriginPanelOpen}
        originQuery={originQuery}
        setOriginQuery={setOriginQuery}
        originLoading={originLoading}
        originResults={originResults}
        searchOriginDocs={searchOriginDocs}
        pickOrigin={pickOrigin}
        lines={lines}
        setLines={setLines}
        addDocLine={addDocLine}
        removeDocLine={removeDocLine}
        updateDocLine={updateDocLine}
        payments={payments}
        addPaymentRow={addPaymentRow}
        removePaymentRow={removePaymentRow}
        updatePaymentRow={updatePaymentRow}
        journalLines={journalLines}
        addJournalLine={addJournalLine}
        removeJournalLine={removeJournalLine}
        updateJournalLine={updateJournalLine}
        journalAutoMode={journalAutoMode}
        recalcJournalAuto={recalcJournalAuto}
        accounts={accounts}
        accByCode={accByCode}
        headerCell={headerCell}
        headerSub={headerSub}
        bodyCell={bodyCell}
        cellInputBase={cellInputBase}
        cellInputRight={cellInputRight}
        moneyDecimals={moneyDecimals}
        totals={totals}
        badgeTypeClass={badgeType}
        badgeStatusClass={badgeStatus}
        formatNumber={formatNumber}
        calcLineAmounts={(l) => {
          const { ex, af, iva, total, total_display } = calcLineAmounts(l);
          return { ex, af, iva, total, total_display };
        }}
        ellipsis={ellipsis}
        folioLabel={folioLabel}
        saveDraftMVP={saveDraftMVP}
        markAsVigenteMVP={async () => {}}
        cancelDocMVP={cancelDocMVP}
      />

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

      {/* Modal crear tercero (reutilizable) */}
      <CounterpartyCreateModal
        open={cpModal.open}
        companyId={companyId}
        initialIdentifier={cpModal.identifier}
        onClose={() => setCpModal({ open: false, identifier: "" })}
        onCreated={onCounterpartyCreated}
      />
    </div>
  );
}
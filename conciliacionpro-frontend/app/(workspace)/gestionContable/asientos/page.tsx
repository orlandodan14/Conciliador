"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Pencil, CheckCircle2, Trash2, Eye, ChevronsUpDown, ChevronUp, ChevronDown } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import CounterpartyCreateModal from "@/app/(workspace)/components/counterparties/CounterpartyCreateModal";
import FilterActionButtons from "@/app/(workspace)/components/FilterActionButtons";
import AsientosFiltersModal, {
  type AsientosFilters,
  EMPTY_ASIENTOS_FILTERS,
} from "@/app/(workspace)/gestionContable/asientos/components/AsientosFiltersModal";
import AsientosImportModal, {
  type AsientosImportIssue,
  type AsientosImportPreviewRow,
} from "@/app/(workspace)/gestionContable/asientos/components/AsientosImportModal";
import TradeDocViewerModal from "@/app/(workspace)/gestionContable/asientos/components/TradeDocViewerModal";
import CobroViewerModal    from "@/app/(workspace)/gestionContable/asientos/components/CobroViewerModal";

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

function excelDateToISO(v: any): string {
  if (!v) return "";

  // Si ya viene como Date (cuando usamos cellDates: true)
  if (v instanceof Date && !isNaN(v.getTime())) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  // Si viene como número serial de Excel
  if (typeof v === "number" && Number.isFinite(v)) {
    // Excel serial date: días desde 1899-12-30
    const base = new Date(Date.UTC(1899, 11, 30));
    const dt = new Date(base.getTime() + v * 86400000);
    const y = dt.getUTCFullYear();
    const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
    const d = String(dt.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  // Si viene como string: tratamos de quedarnos con YYYY-MM-DD
  const s = String(v).trim();
  if (!s) return "";
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    const y = m[1];
    const mm = String(m[2]).padStart(2, "0");
    const dd = String(m[3]).padStart(2, "0");
    return `${y}-${mm}-${dd}`;
  }

  return "";
}

function normalizeCode(v: any) {
  return String(v ?? "").trim();
}

/** Acepta "." del teclado numérico (y también ",") */
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
    .select("role,status")
    .eq("company_id", companyId)
    .eq("user_id", uid)
    .maybeSingle();

  if (error || !data) return null;
  if (data.status && data.status !== "active" && data.status !== "ACTIVE")
    return null;
  return data.role as any;
}

/**
 * =========================
 * Tipos
 * =========================
 */
type MoneyDecimals = number;

type AccountNode = {
  id: string;
  company_id: string;
  code: string;
  name: string;
  level: number;
};

type ImputationPolicy = {
  account_node_id: string;
  require_cc: boolean;
  require_cu: boolean;
  require_suc: boolean;
  require_item: boolean;
  require_cp: boolean;
};

type SimpleDim = { id: string; code: string; name: string };

type AccountingSettings = {
  money_decimals: number;
  posting_tolerance: number;
};

type CompanyCurrency = {
  code: string;
  is_base: boolean;
  decimals: number;
};

type Counterparty = {
  id: string;
  company_id: string;
  identifier: string;
  name: string;
  type: "CLIENTE" | "PROVEEDOR" | "OTRO";
  is_active: boolean;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
  extra?: any;
};

type EntryHeader = {
  entry_date: string;
  description: string;
  currency_code: string;
};

type EntryLine = {
  line_no: number;
  excel_row?: number; // fila real en Excel (para mensajes)

  // Códigos (teclado) + resoluciones
  account_code: string;
  account_node_id: string | null;
  account_name: string;

  line_description: string;

  // strings para permitir decimales mientras escribe
  debit: string;
  credit: string;

  // en UI se escribe identifier, pero en DB guardamos counterparty_id
  counterparty_identifier: string;
  counterparty_name_resolved: string;

  // segmentación por código (teclado)
  cost_center_code: string;
  business_line_code: string;
  branch_code: string;

  details_open: boolean;

  // UI: marcar celdas con error sin ensuciar inputs
  cellErrors?: Partial<
    Record<
      | "account_code"
      | "line_description"
      | "debit"
      | "credit"
      | "counterparty_identifier"
      | "cost_center_code"
      | "business_line_code"
      | "branch_code",
      boolean
    >
  >;
};

type ValidationIssue = {
  level: "error" | "warn";
  code: string;
  message: string;
  lineNo?: number;
  field?: string;
};

type DraftHeaderRow = {
  id: string;
  company_id: string;
  entry_date: string;
  description: string;
  entry_number_formatted?: string | null;
  counterparty_id?: string | null;
  currency_code: string;
  status: string;
  created_at?: string | null;
  extra?: any;
};

type DraftWithLines = {
  header: DraftHeaderRow;
  lines: Array<{
    line_no: number;
    account_node_id: string | null;
    line_description: string | null;
    debit: number | null;
    credit: number | null;
    counterparty_id: string | null;
    cost_center_id: string | null;
    business_line_id?: string | null;
    branch_id?: string | null;
  }>;
};

type ExcelEntryParsed = {
  entry_key: string;
  header: EntryHeader;
  lines: EntryLine[];
};

/**
 * =========================
 * Modal simple
 * =========================
 */
function Modal({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute left-1/2 top-1/2 w-[min(820px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white shadow-xl border">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="font-semibold text-slate-900">{title}</h3>
          <button
            className="text-slate-500 hover:text-slate-800"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

/**
 * =========================
 * Defaults
 * =========================
 */
function makeLine(no: number): EntryLine {
  return {
    line_no: no,

    account_code: "",
    account_node_id: null,
    account_name: "",

    line_description: "",

    debit: "",
    credit: "",

    counterparty_identifier: "",
    counterparty_name_resolved: "",

    cost_center_code: "",
    business_line_code: "",
    branch_code: "",

    details_open: false,

    cellErrors: {},
  };
}

function makeLines(n: number): EntryLine[] {
  return Array.from({ length: n }, (_, i) => makeLine(i + 1));
}

/**
 * =========================
 * SourceDocCard — muestra info del documento de origen
 * =========================
 */
function SourceDocCard({
  doc,
  source,
  moneyDecimals,
}: {
  doc: any;
  source: string;
  moneyDecimals: number;
}) {
  const statusCls =
    doc.status === "VIGENTE"
      ? "bg-emerald-100 text-emerald-800"
      : doc.status === "CANCELADO"
      ? "bg-rose-100 text-rose-800"
      : "bg-amber-100 text-amber-800";

  const moduleLabel =
    source === "cobros"
      ? "Cobros"
      : source === "docs-tribut-ventas" || source === "trade_docs"
      ? "Documentos Tributarios"
      : source === "otros-docs-ingresos"
      ? "Otros Ingresos"
      : source;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 flex flex-wrap gap-x-6 gap-y-2 text-xs">
      <div>
        <div className="text-slate-400 uppercase tracking-wide font-medium">
          Módulo
        </div>
        <div className="font-semibold text-slate-800 mt-0.5">{moduleLabel}</div>
      </div>
      {(doc.counterparty_name_snapshot || doc.counterparty_identifier_snapshot) && (
        <div>
          <div className="text-slate-400 uppercase tracking-wide font-medium">
            Tercero
          </div>
          <div className="font-semibold text-slate-800 mt-0.5">
            {doc.counterparty_name_snapshot || ""}
            {doc.counterparty_identifier_snapshot && (
              <span className="ml-1 text-slate-500 font-normal">
                ({doc.counterparty_identifier_snapshot})
              </span>
            )}
          </div>
        </div>
      )}
      {(doc.payment_date || doc.issue_date) && (
        <div>
          <div className="text-slate-400 uppercase tracking-wide font-medium">
            Fecha
          </div>
          <div className="font-semibold text-slate-800 mt-0.5">
            {doc.payment_date || doc.issue_date}
          </div>
        </div>
      )}
      {(doc.total_amount !== undefined || doc.grand_total !== undefined) && (
        <div>
          <div className="text-slate-400 uppercase tracking-wide font-medium">
            Monto
          </div>
          <div className="font-mono font-semibold text-slate-800 mt-0.5">
            {formatNumber(
              Number(doc.total_amount ?? doc.grand_total ?? 0),
              moneyDecimals
            )}{" "}
            {doc.currency_code || ""}
          </div>
        </div>
      )}
      {doc.status && (
        <div>
          <div className="text-slate-400 uppercase tracking-wide font-medium">
            Estado
          </div>
          <span
            className={cls(
              "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium mt-0.5",
              statusCls
            )}
          >
            {doc.status}
          </span>
        </div>
      )}
      {doc.description && (
        <div className="min-w-[120px]">
          <div className="text-slate-400 uppercase tracking-wide font-medium">
            Descripción
          </div>
          <div className="text-slate-700 mt-0.5">{doc.description}</div>
        </div>
      )}
    </div>
  );
}

/**
 * =========================
 * Page
 * =========================
 */
export default function Page() {
  const [companyId, setCompanyId] = useState<string>("");

  const [role, setRole] = useState<"OWNER" | "EDITOR" | "LECTOR" | null>(null);
  const canEdit = role === "OWNER" || role === "EDITOR";

  const [importState, setImportState] = useState<
    "idle" | "reading" | "parsing" | "validating" | "saving" | "done"
  >("idle");
  const [importOpen, setImportOpen] = useState(false);
  const [importParsedEntries, setImportParsedEntries] = useState<ExcelEntryParsed[]>([]);
  const [importPreviewRows, setImportPreviewRows] = useState<AsientosImportPreviewRow[]>([]);
  const [importModalIssues, setImportModalIssues] = useState<AsientosImportIssue[]>([]);

  // ── Viewers de documento origen ────────────────────────────────────────────
  const [tradeDocViewerId, setTradeDocViewerId] = useState<string | null>(null);
  const [cobroViewerId,    setCobroViewerId]    = useState<string | null>(null);


  const [settings, setSettings] = useState<AccountingSettings | null>(null);
  const moneyDecimals: MoneyDecimals = settings?.money_decimals ?? 0;
  const postingTolerance = Number(settings?.posting_tolerance ?? 0);

  const [baseCurrency, setBaseCurrency] = useState<CompanyCurrency | null>(null);

  const [accounts, setAccounts] = useState<AccountNode[]>([]);
  const [accByCode, setAccByCode] = useState<Record<string, AccountNode>>({});
  const [accById, setAccById] = useState<Record<string, AccountNode>>({});
  const [policiesByAccount, setPoliciesByAccount] = useState<
    Record<string, ImputationPolicy | null>
  >({});

  const [costCenters, setCostCenters] = useState<SimpleDim[]>([]);
  const [businessLines, setBusinessLines] = useState<SimpleDim[]>([]);
  const [branches, setBranches] = useState<SimpleDim[]>([]);
  const [items, setItems] = useState<SimpleDim[]>([]);

  const [taxes, setTaxes] = useState<
    Array<{ id: string; code: string; name: string }>
  >([]);
  const [taxByCode, setTaxByCode] = useState<
    Record<string, { id: string; code: string; name: string }>
  >({});
  const [taxRatesByTax, setTaxRatesByTax] = useState<
    Record<string, Array<{ id: string; rate: number }>>
  >({});

  const [counterpartiesAvailable, setCounterpartiesAvailable] =
    useState<boolean>(true);
  const [counterpartyMap, setCounterpartyMap] = useState<
    Record<string, Counterparty>
  >({});

  const cpById = useMemo(() => {
    const m: Record<string, Counterparty> = {};
    Object.values(counterpartyMap).forEach((c) => (m[c.id] = c));
    return m;
  }, [counterpartyMap]);

  const [header, setHeader] = useState<EntryHeader>({
    entry_date: todayISO(),
    description: "",
    currency_code: "—",
  });

  const [lines, setLines] = useState<EntryLine[]>(() => makeLines(10));
  const [issues, setIssues] = useState<ValidationIssue[]>([]);

  // Draft/post state
  const [entryId, setEntryId] = useState<string | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [posting, setPosting] = useState(false);

  // drafts list
  const [drafts, setDrafts] = useState<DraftWithLines[]>([]);
  const [loadingDrafts, setLoadingDrafts] = useState(false);
  const [loadingMoreDrafts, setLoadingMoreDrafts] = useState(false);
  const [draftsHasMore, setDraftsHasMore] = useState(false);

  // Counterparty modal
  // Counterparty modal (REUTILIZABLE)
  const [cpModal, setCpModal] = useState<{ open: boolean; identifier: string }>({
    open: false,
    identifier: "",
  });

  // ── Tabs, modal editor, expand ─────────────────────────────────
  const [activeTab, setActiveTab] = useState<"drafts" | "registered">("drafts");
  const [registered, setRegistered] = useState<DraftWithLines[]>([]);
  const [loadingRegistered, setLoadingRegistered] = useState(false);
  const [loadingMoreRegistered, setLoadingMoreRegistered] = useState(false);
  const [registeredHasMore, setRegisteredHasMore] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [modalReadOnly, setModalReadOnly] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pageMsg, setPageMsg] = useState<{ level: "error" | "success"; text: string } | null>(null);
  const [sourceDocMap, setSourceDocMap] = useState<Record<string, any>>({});
  // tabla sort
  const [sortCol, setSortCol] = useState<string>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  // selección de filas
  const [selectedRows, setSelectedRows] = useState<Record<string, boolean>>({});

  // ── Filtros ─────────────────────────────────────────────────────────────────
  const [filters, setFilters] = useState<AsientosFilters>(EMPTY_ASIENTOS_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);

  /**
   * =========================
   * Maps por código (dims)
   * =========================
   */
  const ccByCode = useMemo(() => {
    const m: Record<string, SimpleDim> = {};
    costCenters.forEach((x) => (m[String(x.code).trim()] = x));
    return m;
  }, [costCenters]);

  const cuByCode = useMemo(() => {
    const m: Record<string, SimpleDim> = {};
    businessLines.forEach((x) => (m[String(x.code).trim()] = x));
    return m;
  }, [businessLines]);

  const brByCode = useMemo(() => {
    const m: Record<string, SimpleDim> = {};
    branches.forEach((x) => (m[String(x.code).trim()] = x));
    return m;
  }, [branches]);

  const itByCode = useMemo(() => {
    const m: Record<string, SimpleDim> = {};
    items.forEach((x) => (m[String(x.code).trim()] = x)); // code = sku
    return m;
  }, [items]);

  const ccById = useMemo(() => {
    const m: Record<string, SimpleDim> = {};
    costCenters.forEach((x) => (m[x.id] = x));
    return m;
  }, [costCenters]);

  const cuById = useMemo(() => {
    const m: Record<string, SimpleDim> = {};
    businessLines.forEach((x) => (m[x.id] = x));
    return m;
  }, [businessLines]);

  const brById = useMemo(() => {
    const m: Record<string, SimpleDim> = {};
    branches.forEach((x) => (m[x.id] = x));
    return m;
  }, [branches]);

  const itById = useMemo(() => {
    const m: Record<string, SimpleDim> = {};
    items.forEach((x) => (m[x.id] = x)); // items: {id, code=sku, name}
    return m;
  }, [items]);

  // ── hasActiveFilters ──────────────────────────────────────────────────────
  const hasActiveFilters = useMemo(() => {
    const f = filters;
    return !!(
      f.entry_date_from || f.entry_date_to ||
      f.source || f.currency_code ||
      f.counterparty_identifier || f.counterparty_name || f.description ||
      (f.debit_filter.op && f.debit_filter.value1) ||
      (f.credit_filter.op && f.credit_filter.value1)
    );
  }, [filters]);

  // ── Filtrado client-side ──────────────────────────────────────────────────
  function applyNumericFilter(
    value: number,
    f: AsientosFilters["debit_filter"]
  ): boolean {
    if (!f.op) return true;
    const v1 = Number(f.value1 || 0);
    const v2 = Number(f.value2 || 0);
    switch (f.op) {
      case "eq":      return value === v1;
      case "neq":     return value !== v1;
      case "gt":      return value > v1;
      case "gte":     return value >= v1;
      case "lt":      return value < v1;
      case "lte":     return value <= v1;
      case "between": return value >= v1 && value <= v2;
      default:        return true;
    }
  }

  function filterRows(rows: DraftWithLines[]): DraftWithLines[] {
    const f = filters;
    return rows.filter((d) => {
      const h = d.header;
      const source: string = (h as any).extra?.source || "";

      if (f.entry_date_from && h.entry_date < f.entry_date_from) return false;
      if (f.entry_date_to   && h.entry_date > f.entry_date_to)   return false;

      if (f.source) {
        const ok = (() => {
          switch (f.source) {
            case "manual":
              return !source;
            case "trade_docs":
              return (
                source === "trade_docs_sales" ||
                source === "docs-tribut-ventas" ||
                source === "trade_docs"
              );
            case "non_fiscal":
              return (
                source.startsWith("trade_docs_non") ||
                source === "otros-docs-ingresos"
              );
            case "cobros":
              return source === "cobros" || source.startsWith("cobros_");
            case "import":
              return source === "trade_doc_mass_import";
            default:
              return true;
          }
        })();
        if (!ok) return false;
      }

      if (f.currency_code) {
        if (h.currency_code !== f.currency_code.toUpperCase()) return false;
      }

      const cp = h.counterparty_id ? cpById[h.counterparty_id] : null;
      if (f.counterparty_identifier) {
        if (
          !(cp?.identifier || "")
            .toLowerCase()
            .includes(f.counterparty_identifier.toLowerCase())
        )
          return false;
      }
      if (f.counterparty_name) {
        if (
          !(cp?.name || "")
            .toLowerCase()
            .includes(f.counterparty_name.toLowerCase())
        )
          return false;
      }

      if (f.description) {
        if (
          !(h.description || "")
            .toLowerCase()
            .includes(f.description.toLowerCase())
        )
          return false;
      }

      const sumD = d.lines.reduce((s, x) => s + Number(x.debit  || 0), 0);
      const sumC = d.lines.reduce((s, x) => s + Number(x.credit || 0), 0);
      if (!applyNumericFilter(sumD, f.debit_filter))  return false;
      if (!applyNumericFilter(sumC, f.credit_filter)) return false;

      return true;
    });
  }

  const filteredDrafts = useMemo(
    () => filterRows(drafts),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [drafts, filters, cpById]
  );

  const filteredRegistered = useMemo(
    () => filterRows(registered),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [registered, filters, cpById]
  );

  /**
   * =========================
   * Keyboard focus grid (línea visible)
   * =========================
   */
  type MainCol =
    | "account_code"
    | "line_description"
    | "debit"
    | "credit"
    | "counterparty_identifier";

  const mainCols: MainCol[] = [
    "account_code",
    "line_description",
    "debit",
    "credit",
    "counterparty_identifier",
  ];

  // ── Infinite scroll ─────────────────────────────────────────────────────────
  const PAGE_SIZE = 20;
  const draftsOffsetRef         = useRef(0);
  const registeredOffsetRef     = useRef(0);
  const draftsSentinelRef       = useRef<HTMLTableRowElement | null>(null);
  const registeredSentinelRef   = useRef<HTMLTableRowElement | null>(null);
  const tableContainerRef       = useRef<HTMLDivElement | null>(null);
  // Locks sincrónicos: evitan que dos llamadas concurrentes lean el mismo offset
  const fetchingDraftsRef       = useRef(false);
  const fetchingRegisteredRef   = useRef(false);

  const cellRefs = useRef<Record<string, HTMLElement | null>>({});
  const setCellRef =
    (rowIdx: number, col: string) => (el: HTMLElement | null) => {
      cellRefs.current[`${rowIdx}-${col}`] = el;
    };

  function focusCell(rowIdx: number, col: string) {
    const el = cellRefs.current[`${rowIdx}-${col}`];
    if (el && typeof (el as any).focus === "function") (el as any).focus();
  }

  function moveFocusMain(rowIdx: number, col: MainCol, dir: 1 | -1) {
    const colIndex = mainCols.indexOf(col);
    if (colIndex < 0) return;

    let nextRow = rowIdx;
    let nextColIndex = colIndex + dir;

    if (nextColIndex >= mainCols.length) {
      nextColIndex = 0;
      nextRow = rowIdx + 1;
    } else if (nextColIndex < 0) {
      nextColIndex = mainCols.length - 1;
      nextRow = rowIdx - 1;
    }

    if (nextRow < 0) nextRow = 0;
    if (nextRow > lines.length - 1) nextRow = lines.length - 1;

    focusCell(nextRow, mainCols[nextColIndex]);
  }

  function handleMainKeyDown(
    e: React.KeyboardEvent,
    rowIdx: number,
    col: MainCol
  ) {
    // Ctrl+Enter => abrir/cerrar detalles (prioridad)
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      toggleDetails(rowIdx);
      return;
    }

    // Enter = como Tab; Shift+Enter = atrás
    if (e.key === "Enter") {
      e.preventDefault();
      moveFocusMain(rowIdx, col, e.shiftKey ? -1 : 1);
      return;
    }

    // flechas arriba/abajo => misma columna
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusCell(Math.min(lines.length - 1, rowIdx + 1), col);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      focusCell(Math.max(0, rowIdx - 1), col);
      return;
    }
  }

  /**
   * =======================
   * boot company id
   * =======================
   */
  useEffect(() => {
    const id = localStorage.getItem("active_company_id") || "";
    setCompanyId(id);
  }, []);

  /**
   * =======================
   * load catalogs
   * =======================
   */
  useEffect(() => {
    if (!companyId) return;

    (async () => {
      const r = await getMyRoleForCompany(companyId);
      setRole(r);

      const { data: s } = await supabase
        .from("accounting_settings")
        .select("money_decimals,posting_tolerance")
        .eq("company_id", companyId)
        .maybeSingle();
      if (s) setSettings(s as any);

      const { data: cc } = await supabase
        .from("company_currencies")
        .select("code,is_base,decimals,is_active")
        .eq("company_id", companyId)
        .eq("is_base", true)
        .eq("is_active", true)
        .maybeSingle();

      if (cc) {
        setBaseCurrency(cc as any);
        setHeader((h) => ({ ...h, currency_code: (cc as any).code }));
      } else {
        setHeader((h) => ({ ...h, currency_code: "CLP" }));
      }

      const { data: ac } = await supabase
        .from("account_nodes")
        .select("id,company_id,code,name,level")
        .eq("company_id", companyId)
        .eq("level", 4)
        .order("code", { ascending: true });

      const accList = (((ac as any) || []) as AccountNode[]);
      setAccounts(accList);

      const byCode: Record<string, AccountNode> = {};
      const byId: Record<string, AccountNode> = {};
      for (const a of accList) {
        byCode[String(a.code).trim()] = a;
        byId[a.id] = a;
      }
      setAccByCode(byCode);
      setAccById(byId);

      const { data: pol } = await supabase
        .from("account_imputation_policies")
        .select(
          "account_node_id,require_cc,require_cu,require_suc,require_item,require_cp,is_active"
        )
        .eq("company_id", companyId)
        .eq("is_active", true);

      const map: Record<string, ImputationPolicy | null> = {};
      for (const p of (pol as any) || []) map[p.account_node_id] = p;
      setPoliciesByAccount(map);

      const [ccs, bls, brs, its] = await Promise.all([
        supabase
          .from("cost_centers")
          .select("id,code,name,is_active")
          .eq("company_id", companyId)
          .eq("is_active", true)
          .order("code", { ascending: true }),
        supabase
          .from("business_lines")
          .select("id,code,name,is_active")
          .eq("company_id", companyId)
          .eq("is_active", true)
          .order("code", { ascending: true }),
        supabase
          .from("branches")
          .select("id,code,name,is_active")
          .eq("company_id", companyId)
          .eq("is_active", true)
          .order("code", { ascending: true }),
        // ✅ Items: en tu DB es sku (no code)
        supabase
          .from("items")
          .select("id,sku,name,is_active")
          .eq("company_id", companyId)
          .eq("is_active", true)
          .order("sku", { ascending: true }),
      ]);

      setCostCenters(((ccs.data as any) || []) as SimpleDim[]);
      setBusinessLines(((bls.data as any) || []) as SimpleDim[]);
      setBranches(((brs.data as any) || []) as SimpleDim[]);

      const itemsRaw = ((its.data as any) || []) as Array<{
        id: string;
        sku: string;
        name: string;
        is_active: boolean;
      }>;
      setItems(itemsRaw.map((x) => ({ id: x.id, code: x.sku, name: x.name })));

      const { data: tx } = await supabase
        .from("taxes")
        .select("id,code,name,is_active")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("code", { ascending: true });

      const txList = (tx as any) || [];
      setTaxes(txList);

      const txMap: Record<string, { id: string; code: string; name: string }> =
        {};
      txList.forEach((t: any) => (txMap[String(t.code).trim()] = t));
      setTaxByCode(txMap);

      const { data: tr } = await supabase
        .from("tax_rates")
        .select("id,tax_id,rate,is_active")
        .eq("company_id", companyId)
        .eq("is_active", true);

      const rateMap: Record<string, Array<{ id: string; rate: number }>> = {};
      for (const row of (tr as any) || []) {
        if (!rateMap[row.tax_id]) rateMap[row.tax_id] = [];
        rateMap[row.tax_id].push({ id: row.id, rate: Number(row.rate) });
      }
      setTaxRatesByTax(rateMap);

      // counterparties
      try {
        const { data: cps, error: cpe } = await supabase
          .from("counterparties")
          .select(
            "id,company_id,identifier,name,type,is_active,email,phone,address,notes,extra"
          )
          .eq("company_id", companyId)
          .eq("is_active", true);

        if (cpe) {
          setCounterpartiesAvailable(false);
          setCounterpartyMap({});
        } else {
          const m: Record<string, Counterparty> = {};
          for (const c of (cps as any) || [])
            m[String(c.identifier).trim()] = c;
          setCounterpartyMap(m);
          setCounterpartiesAvailable(true);
        }
      } catch {
        setCounterpartiesAvailable(false);
        setCounterpartyMap({});
      }
    })();
  }, [companyId]);

  /**
   * =======================
   * totals (solo líneas usadas)
   * =======================
   */
  const usedLines = useMemo(() => {
    return lines.filter((l) => {
      const hasAmount = toNum(l.debit) > 0 || toNum(l.credit) > 0;
      const hasAcc = !!l.account_code.trim();
      const hasDesc = !!l.line_description.trim();
      const hasCp = !!String(l.counterparty_identifier || "").trim();
      return hasAmount || hasAcc || hasDesc || hasCp;
    });
  }, [lines]);

  const totals = useMemo(() => {
    const debit = usedLines.reduce((s, l) => s + toNum(l.debit), 0);
    const credit = usedLines.reduce((s, l) => s + toNum(l.credit), 0);
    const diff = debit - credit;
    return { debit, credit, diff };
  }, [usedLines]);

  /**
   * =======================
   * line ops
   * =======================
   */
  function renumber(next: EntryLine[]) {
    return next.map((l, i) => ({ ...l, line_no: i + 1 }));
  }

  function addMoreLines(count: number) {
    const start = lines.length + 1;
    const extra = Array.from({ length: count }, (_, i) => makeLine(start + i));
    setLines((p) => renumber([...p, ...extra]));
    setTimeout(() => focusCell(start - 1, "account_code"), 0);
  }

  function removeLine(idx: number) {
    const next = lines.filter((_, i) => i !== idx);
    setLines(next.length ? renumber(next) : makeLines(10));
    setTimeout(() => focusCell(Math.max(0, idx - 1), "account_code"), 0);
  }

  function updateLine(idx: number, patch: Partial<EntryLine>) {
    setLines((p) =>
      p.map((l, i) => {
        if (i !== idx) return l;
        const next: EntryLine = { ...l, ...patch };

        // limpiar marcas visuales al tipear
        if (next.cellErrors && patch) {
          const ce = { ...(next.cellErrors || {}) };
          Object.keys(patch).forEach((k) => delete (ce as any)[k]);
          next.cellErrors = ce;
        }

        // si setean debit, limpian credit (y viceversa)
        if (patch.debit !== undefined && toNum(patch.debit) > 0) next.credit = "";
        if (patch.credit !== undefined && toNum(patch.credit) > 0) next.debit = "";

        // resolver contraparte (nombre)
        if (patch.counterparty_identifier !== undefined) {
          const key = normalizeCode(patch.counterparty_identifier || "");
          const cp = key ? counterpartyMap[key] : undefined;
          next.counterparty_name_resolved = cp?.name ?? "";
        }

        return next;
      })
    );
  }

  function toggleDetails(idx: number) {
    setLines((p) =>
      p.map((l, i) => (i === idx ? { ...l, details_open: !l.details_open } : l))
    );
  }

  /**
   * =======================
   * Resoluciones por teclado (onBlur)
   * =======================
   */
  function resolveAccount(idx: number) {
    const code = normalizeCode(lines[idx]?.account_code);
    const acc = code ? accByCode[code] : undefined;
    updateLine(idx, {
      account_code: code,
      account_node_id: acc?.id ?? null,
      account_name: acc?.name ?? "",
    });
  }

  function resolveTrimField(
    idx: number,
    field:
      | "counterparty_identifier"
      | "cost_center_code"
      | "business_line_code"
      | "branch_code"
  ) {
    const raw = normalizeCode((lines[idx] as any)?.[field]);
    updateLine(idx, { [field]: raw } as any);
  }

  /**
   * =======================
   * validation
   * =======================
   */
  function validateAll(strictBalanced: boolean): ValidationIssue[] {
    const out: ValidationIssue[] = [];

    if (!header.entry_date)
      out.push({
        level: "error",
        code: "DATE_REQUIRED",
        message: "Falta entry_date.",
      });
    if (!header.description.trim())
      out.push({
        level: "error",
        code: "DESC_REQUIRED",
        message: "Falta description.",
      });

    if (usedLines.length < 2) {
      out.push({
        level: "error",
        code: "MIN_LINES",
        message: "El asiento debe tener al menos 2 líneas con monto.",
      });
    }

    if (strictBalanced && Math.abs(totals.diff) > postingTolerance) {
      out.push({
        level: "error",
        code: "NOT_BALANCED",
        message: `El asiento no cuadra. diff=${formatNumber(
          totals.diff,
          moneyDecimals
        )} (tol ${formatNumber(postingTolerance, moneyDecimals)}).`,
      });
    }

    usedLines.forEach((l) => {
      const ln = l.line_no;

      const accCode = normalizeCode(l.account_code);
      const acc = accCode ? accByCode[accCode] : undefined;

      if (!accCode) {
        out.push({
          level: "error",
          code: "ACCOUNT_REQUIRED",
          message: "Falta account_code.",
          lineNo: ln,
          field: "account_code",
        });
      } else if (!acc) {
        out.push({
          level: "error",
          code: "ACCOUNT_NOT_FOUND",
          message: `Cuenta no existe: ${accCode}`,
          lineNo: ln,
          field: "account_code",
        });
      }

      const d = toNum(l.debit);
      const c = toNum(l.credit);

      if (d > 0 && c > 0)
        out.push({
          level: "error",
          code: "BOTH_SIDES",
          message: "No puede tener debit y credit.",
          lineNo: ln,
        });
      if (d <= 0 && c <= 0)
        out.push({
          level: "error",
          code: "AMOUNT_REQUIRED",
          message: "Ingresa debit o credit.",
          lineNo: ln,
        });

      // decimales
      const checkDecimals = (label: "debit" | "credit", raw: string) => {
        const s = String(raw ?? "").trim();
        if (!s) return;
        const n = s.replace(",", ".");
        const parts = n.split(".");
        if (parts.length === 2 && parts[1].length > moneyDecimals) {
          out.push({
            level: "error",
            code: "TOO_MANY_DECIMALS",
            message: `${label} admite máximo ${moneyDecimals} decimales.`,
            lineNo: ln,
            field: label,
          });
        }
      };
      checkDecimals("debit", l.debit);
      checkDecimals("credit", l.credit);

      const pol = acc?.id ? policiesByAccount[acc.id] : null;
      const reqCC = !!pol?.require_cc;
      const reqCU = !!pol?.require_cu;
      const reqBR = !!pol?.require_suc;
      const reqIT = !!pol?.require_item;
      const reqCP = !!pol?.require_cp;

      const cpKey = normalizeCode(l.counterparty_identifier);
      if (reqCP && !cpKey) {
        out.push({
          level: "error",
          code: "CP_REQUIRED",
          message: "Falta counterparty_identifier.",
          lineNo: ln,
          field: "counterparty_identifier",
        });
      }
      if (cpKey && counterpartiesAvailable && !counterpartyMap[cpKey]) {
        out.push({
          level: "warn",
          code: "CP_NOT_FOUND",
          message: `Tercero no existe: "${cpKey}".`,
          lineNo: ln,
          field: "counterparty_identifier",
        });
      }

      const cc = normalizeCode(l.cost_center_code);
      const cu = normalizeCode(l.business_line_code);
      const br = normalizeCode(l.branch_code);

      if (reqCC) {
        if (!cc)
          out.push({
            level: "error",
            code: "CC_REQUIRED",
            message: "Falta cost_center_code.",
            lineNo: ln,
            field: "cost_center_code",
          });
        else if (!ccByCode[cc])
          out.push({
            level: "error",
            code: "CC_NOT_FOUND",
            message: `Centro costo no existe: "${cc}"`,
            lineNo: ln,
            field: "cost_center_code",
          });
      } else if (cc && !ccByCode[cc]) {
        out.push({
          level: "warn",
          code: "CC_NOT_FOUND",
          message: `Centro costo no existe: "${cc}"`,
          lineNo: ln,
          field: "cost_center_code",
        });
      }

      if (reqCU) {
        if (!cu)
          out.push({
            level: "error",
            code: "CU_REQUIRED",
            message: "Falta business_line_code.",
            lineNo: ln,
            field: "business_line_code",
          });
        else if (!cuByCode[cu])
          out.push({
            level: "error",
            code: "CU_NOT_FOUND",
            message: `Línea negocio no existe: "${cu}"`,
            lineNo: ln,
            field: "business_line_code",
          });
      } else if (cu && !cuByCode[cu]) {
        out.push({
          level: "warn",
          code: "CU_NOT_FOUND",
          message: `Línea negocio no existe: "${cu}"`,
          lineNo: ln,
          field: "business_line_code",
        });
      }

      if (reqBR) {
        if (!br)
          out.push({
            level: "error",
            code: "BR_REQUIRED",
            message: "Falta branch_code.",
            lineNo: ln,
            field: "branch_code",
          });
        else if (!brByCode[br])
          out.push({
            level: "error",
            code: "BR_NOT_FOUND",
            message: `Sucursal no existe: "${br}"`,
            lineNo: ln,
            field: "branch_code",
          });
      } else if (br && !brByCode[br]) {
        out.push({
          level: "warn",
          code: "BR_NOT_FOUND",
          message: `Sucursal no existe: "${br}"`,
          lineNo: ln,
          field: "branch_code",
        });
      }
    });

    return out;
  }

  function applyCellErrorsFromIssues(v: ValidationIssue[]) {
    setLines((prev) => prev.map((l) => ({ ...l, cellErrors: {} })));

    const byLine: Record<number, Record<string, boolean>> = {};
    v.forEach((x) => {
      if (!x.lineNo || !x.field) return;
      if (!byLine[x.lineNo]) byLine[x.lineNo] = {};
      byLine[x.lineNo][x.field] = true;
    });

    setLines((prev) =>
      prev.map((l) => {
        const map = byLine[l.line_no];
        if (!map) return l;
        return {
          ...l,
          cellErrors: { ...(l.cellErrors || {}), ...(map as any) },
        };
      })
    );
  }

  function runValidate(strictBalanced: boolean) {
    const v = validateAll(strictBalanced);
    setIssues(v);
    applyCellErrorsFromIssues(v);
    return v;
  }

  /**
   * =======================
   * Descargar plantilla desde /public/templates
   * =======================
   */
  function downloadTemplate() {
    const fileName = "Formato_Asientos_Contables.xlsx";
    const url = `/templates/${encodeURIComponent(fileName)}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  /**
   * =======================
   * Counterparty modal
   * =======================
   */
    function openCreateCounterparty(identifier: string) {
      setCpModal({ open: true, identifier: String(identifier || "").trim() });
    }

    function onCounterpartyCreated(created: Counterparty) {
      // Mantén tu mapa por identifier (como lo tienes hoy)
      const key = String(created.identifier || "").trim();

      setCounterpartyMap((m) => ({ ...m, [key]: created }));
      setCounterpartiesAvailable(true);

      // Actualizar nombre en líneas que tengan ese identifier
      setLines((prev) =>
        prev.map((l) => {
          if (normalizeCode(l.counterparty_identifier) !== key) return l;
          return { ...l, counterparty_name_resolved: created.name };
        })
      );

      setIssues((prev) => [
        {
          level: "warn",
          code: "CP_CREATED",
          message: `Tercero creado: ${created.identifier} — ${created.name}`,
        },
        ...prev,
      ]);
    }

  /**
   * =======================
   * Guardar borrador / Contabilizar
   * =======================
   */
  function resolveLineIdsForSave(l: EntryLine) {
    const cpKey = normalizeCode(l.counterparty_identifier);
    const cp = cpKey ? counterpartyMap[cpKey] : null;

    const ccCode = normalizeCode(l.cost_center_code);
    const cuCode = normalizeCode(l.business_line_code);
    const brCode = normalizeCode(l.branch_code);

    const cc = ccCode ? ccByCode[ccCode] : null;
    const cu = cuCode ? cuByCode[cuCode] : null;
    const br = brCode ? brByCode[brCode] : null;

    return {
      counterparty_id: cp?.id ?? null,
      cost_center_id: cc?.id ?? null,
      business_line_id: cu?.id ?? null,
      branch_id: br?.id ?? null,
    };
  }


  async function saveDraft(): Promise<string> {
    if (!companyId) throw new Error("Falta companyId.");

    // Para borrador: validación más relajada (no exigimos cuadrar)
    const v = runValidate(false);
    const hardErrors = v.filter((x) => x.level === "error");
    if (hardErrors.length) {
      throw new Error("Corrige los errores antes de guardar el borrador.");
    }

    const headerPayload: any = {
      company_id: companyId,
      entry_date: header.entry_date,
      description: header.description.trim(),
      currency_code: header.currency_code,
      status: "DRAFT",
    };

    let savedId = entryId;

    if (!savedId) {
      const { data, error } = await supabase
        .from("journal_entries")
        .insert(headerPayload)
        .select("id")
        .single();
      if (error) throw error;
      savedId = (data as any).id as string;
      setEntryId(savedId);
    } else {
      const { error } = await supabase
        .from("journal_entries")
        .update(headerPayload)
        .eq("id", savedId)
        .eq("company_id", companyId);
      if (error) throw error;
    }

    // ✅ OJO: tu tabla usa journal_entry_id (no entry_id)
    const { error: delErr } = await supabase
      .from("journal_entry_lines")
      .delete()
      .eq("journal_entry_id", savedId)
      .eq("company_id", companyId);
    if (delErr) throw delErr;

    const linePayloads = usedLines.map((l) => {
      const ids = resolveLineIdsForSave(l);

      const payload: any = {
        company_id: companyId,
        journal_entry_id: savedId,
        line_no: l.line_no,
        account_node_id: l.account_node_id,
        line_description: l.line_description?.trim() || null,
        debit: toNum(l.debit),
        credit: toNum(l.credit),

        counterparty_id: ids.counterparty_id,
        cost_center_id: ids.cost_center_id,
        business_line_id: ids.business_line_id,
        branch_id: ids.branch_id,
      };

      return payload;
    });

    if (linePayloads.length) {
      const { error: insErr } = await supabase
        .from("journal_entry_lines")
        .insert(linePayloads);
      if (insErr) throw insErr;
    }

    setIssues((prev) => [
      {
        level: "warn",
        code: "DRAFT_SAVED",
        message: `Borrador guardado (${savedId}).`,
      },
      ...prev,
    ]);

    // refrescar lista de borradores
    await loadDrafts();

    return savedId;
  }

  async function onSaveDraftClick() {
    if (!canEdit) return;
    setSavingDraft(true);
    try {
      await saveDraft();
      resetNew(); // ✅ limpiar al guardar borrador
    } catch (e: any) {
      setIssues([
        {
          level: "error",
          code: "SAVE_DRAFT_FAILED",
          message: e?.message || "No se pudo guardar borrador.",
        },
      ]);
    } finally {
      setSavingDraft(false);
    }
  }

  async function onPostClick() {
    if (!canEdit) return;
    setPosting(true);
    try {
      // Para contabilizar: validación estricta (cuadrar)
      const v = runValidate(true);
      const hardErrors = v.filter((x) => x.level === "error");
      if (hardErrors.length)
        throw new Error("Corrige los errores antes de contabilizar.");

      const id = await saveDraft();

      const { error } = await supabase.rpc("post_journal_entry", {
        _entry_id: id,
      });
      if (error) throw error;

      setIssues((prev) => [
        {
          level: "warn",
          code: "POSTED",
          message: `Asiento contabilizado (${id}).`,
        },
        ...prev,
      ]);

      await loadDrafts();
      resetNew(); // ✅ limpiar al contabilizar
    } catch (e: any) {
      setIssues([
        {
          level: "error",
          code: "POST_FAILED",
          message: e?.message || "No se pudo contabilizar.",
        },
      ]);
    } finally {
      setPosting(false);
    }
  }

  /**
   * =======================
   * reset
   * =======================
   */
  function resetNew() {
    setEntryId(null);
    setHeader({
      entry_date: todayISO(),
      description: "",
      currency_code: baseCurrency?.code || "CLP",
    });
    setLines(makeLines(10));
    setIssues([]);
  }

  /**
   * =======================
   * Drafts list (ver/editar/eliminar)
   * =======================
   */
  async function loadDrafts(reset = true) {
    if (!companyId) return;
    // Lock sincrónico: evita llamadas concurrentes que leerían el mismo offset
    if (fetchingDraftsRef.current) return;
    fetchingDraftsRef.current = true;

    if (reset) {
      setLoadingDrafts(true);
      draftsOffsetRef.current = 0;
    } else {
      setLoadingMoreDrafts(true);
    }

    const from = reset ? 0 : draftsOffsetRef.current;
    const to   = from + PAGE_SIZE - 1;
    // Reservar el rango ANTES del await para que llamadas concurrentes no lean el mismo offset
    draftsOffsetRef.current = from + PAGE_SIZE;

    try {
      const { data: hs, error: he } = await supabase
        .from("journal_entries")
        .select(
          "id,company_id,entry_date,description,entry_number_formatted,counterparty_id,currency_code,status,created_at,extra"
        )
        .eq("company_id", companyId)
        .eq("status", "DRAFT")
        .order("created_at", { ascending: false })
        .range(from, to);

      if (he) throw he;

      const headers = ((hs as any) || []) as DraftHeaderRow[];
      setDraftsHasMore(headers.length === PAGE_SIZE);
      // Corregir offset al valor real (por si llegaron menos de PAGE_SIZE)
      draftsOffsetRef.current = from + headers.length;

      // Batch-fetch lines (una sola query)
      const results: DraftWithLines[] = [];
      if (headers.length > 0) {
        const headerIds = headers.map((h) => h.id);
        const { data: allLines, error: le } = await supabase
          .from("journal_entry_lines")
          .select(
            "line_no,account_node_id,line_description,debit,credit,counterparty_id,cost_center_id,business_line_id,branch_id,journal_entry_id"
          )
          .in("journal_entry_id", headerIds)
          .order("line_no", { ascending: true });

        if (le) throw le;

        const linesByEntry: Record<string, any[]> = {};
        for (const l of ((allLines as any) || [])) {
          if (!linesByEntry[l.journal_entry_id]) linesByEntry[l.journal_entry_id] = [];
          linesByEntry[l.journal_entry_id].push(l);
        }
        for (const h of headers) {
          results.push({ header: h, lines: linesByEntry[h.id] || [] });
        }
      }

      if (reset) {
        setDrafts(results);
      } else {
        setDrafts((prev) => {
          // Deduplicar por si acaso: filtrar IDs ya presentes
          const existingIds = new Set(prev.map((x) => x.header.id));
          const fresh = results.filter((x) => !existingIds.has(x.header.id));
          return [...prev, ...fresh];
        });
      }
    } catch (e: any) {
      // En error, restaurar el offset al valor anterior para poder reintentar
      draftsOffsetRef.current = from;
      setPageMsg({
        level: "error",
        text: `Error al cargar borradores: ${e?.message || "Error desconocido"}`,
      });
    } finally {
      fetchingDraftsRef.current = false;
      setLoadingDrafts(false);
      setLoadingMoreDrafts(false);
    }
  }

  useEffect(() => {
    if (!companyId) return;
    loadDrafts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  useEffect(() => {
    if (!companyId || activeTab !== "registered") return;
    loadRegistered();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, activeTab]);

  // ── Auto-fill: si el contenido no genera scrollbar, carga más ───────────────
  useEffect(() => {
    const el = tableContainerRef.current;
    if (!el || loadingMoreDrafts || !draftsHasMore || activeTab !== "drafts") return;
    if (el.scrollHeight <= el.clientHeight + 10) {
      loadDrafts(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drafts, draftsHasMore, loadingMoreDrafts, activeTab]);

  useEffect(() => {
    const el = tableContainerRef.current;
    if (!el || loadingMoreRegistered || !registeredHasMore || activeTab !== "registered") return;
    if (el.scrollHeight <= el.clientHeight + 10) {
      loadRegistered(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registered, registeredHasMore, loadingMoreRegistered, activeTab]);

  /**
   * =======================
   * Registrados list
   * =======================
   */
  async function loadRegistered(reset = true) {
    if (!companyId) return;
    // Lock sincrónico: evita llamadas concurrentes que leerían el mismo offset
    if (!reset && fetchingRegisteredRef.current) return;
    fetchingRegisteredRef.current = true;

    if (reset) {
      setLoadingRegistered(true);
      registeredOffsetRef.current = 0;
    } else {
      setLoadingMoreRegistered(true);
    }

    const from = reset ? 0 : registeredOffsetRef.current;
    const to   = from + PAGE_SIZE - 1;
    // Reservar el rango ANTES del await para que llamadas concurrentes no lean el mismo offset
    registeredOffsetRef.current = from + PAGE_SIZE;

    try {
      const { data: hs, error: he } = await supabase
        .from("journal_entries")
        .select(
          "id,company_id,entry_date,description,entry_number_formatted,counterparty_id,currency_code,status,created_at,extra"
        )
        .eq("company_id", companyId)
        .eq("status", "POSTED")
        .order("created_at", { ascending: false })
        .range(from, to);

      if (he) throw he;

      const headers = ((hs as any) || []) as DraftHeaderRow[];
      setRegisteredHasMore(headers.length === PAGE_SIZE);
      // Corregir offset al valor real (por si llegaron menos de PAGE_SIZE)
      registeredOffsetRef.current = from + headers.length;

      // Batch-fetch lines (una sola query)
      const results: DraftWithLines[] = [];
      if (headers.length > 0) {
        const headerIds = headers.map((h) => h.id);
        const { data: allLines, error: le } = await supabase
          .from("journal_entry_lines")
          .select(
            "line_no,account_node_id,line_description,debit,credit,counterparty_id,cost_center_id,business_line_id,branch_id,journal_entry_id"
          )
          .in("journal_entry_id", headerIds)
          .order("line_no", { ascending: true });

        if (le) throw le;

        const linesByEntry: Record<string, any[]> = {};
        for (const l of ((allLines as any) || [])) {
          if (!linesByEntry[l.journal_entry_id]) linesByEntry[l.journal_entry_id] = [];
          linesByEntry[l.journal_entry_id].push(l);
        }
        for (const h of headers) {
          results.push({ header: h as DraftHeaderRow, lines: linesByEntry[h.id] || [] });
        }
      }

      if (reset) {
        setRegistered(results);
      } else {
        setRegistered((prev) => {
          // Deduplicar por si acaso: filtrar IDs ya presentes
          const existingIds = new Set(prev.map((x) => x.header.id));
          const fresh = results.filter((x) => !existingIds.has(x.header.id));
          return [...prev, ...fresh];
        });
      }
    } catch (e: any) {
      // En error, restaurar el offset al valor anterior para poder reintentar
      registeredOffsetRef.current = from;
      setPageMsg({ level: "error", text: e?.message || "No se pudieron cargar registros." });
    } finally {
      fetchingRegisteredRef.current = false;
      setLoadingRegistered(false);
      setLoadingMoreRegistered(false);
    }
  }

  /**
   * =======================
   * Abrir asiento en modal (edit o view)
   * =======================
   */
  async function openEntryInModal(id: string, readOnly: boolean) {
    setModalReadOnly(readOnly);
    try {
      const { data: h, error: he } = await supabase
        .from("journal_entries")
        .select(
          "id,company_id,entry_date,description,currency_code,status,extra"
        )
        .eq("company_id", companyId)
        .eq("id", id)
        .single();

      if (he) throw he;

      const { data: ls, error: le } = await supabase
        .from("journal_entry_lines")
        .select(
          "line_no,account_node_id,line_description,debit,credit,counterparty_id,cost_center_id,business_line_id,branch_id,journal_entry_id"
        )
        .eq("journal_entry_id", id)
        .order("line_no", { ascending: true });

      if (le) throw le;

      setEntryId(id);
      setHeader({
        entry_date: (h as any).entry_date,
        description: (h as any).description || "",
        currency_code:
          (h as any).currency_code || (baseCurrency?.code || "CLP"),
      });

      const parsed: EntryLine[] = (((ls as any) || []) as any[]).map((r) => {
        const acc = r.account_node_id ? accById[r.account_node_id] : null;
        const cp = r.counterparty_id ? cpById[r.counterparty_id] : null;
        const cc = r.cost_center_id ? ccById[r.cost_center_id] : null;
        const cu = r.business_line_id ? cuById[r.business_line_id] : null;
        const br = r.branch_id ? brById[r.branch_id] : null;

        return {
          ...makeLine(Number(r.line_no) || 1),
          account_node_id: r.account_node_id ?? null,
          account_code: acc?.code ?? "",
          account_name: acc?.name ?? "",
          line_description: r.line_description ?? "",
          debit:
            r.debit != null && Number(r.debit) > 0 ? String(r.debit) : "",
          credit:
            r.credit != null && Number(r.credit) > 0 ? String(r.credit) : "",
          counterparty_identifier: cp?.identifier ?? "",
          counterparty_name_resolved: cp?.name ?? "",
          cost_center_code: cc?.code ?? "",
          business_line_code: cu?.code ?? "",
          branch_code: br?.code ?? "",
          details_open: false,
          cellErrors: {},
        } as EntryLine;
      });

      const normalized = renumber(parsed);
      const filled =
        normalized.length >= 10
          ? normalized
          : [...normalized, ...makeLines(10 - normalized.length)].map(
              (x, i) => ({ ...x, line_no: i + 1 })
            );

      setLines(filled);
      setIssues([]);
      setEditorOpen(true);
    } catch (e: any) {
      setPageMsg({
        level: "error",
        text: e?.message || "No se pudo abrir el asiento.",
      });
    }
  }

  /**
   * =======================
   * Expand row + carga doc origen
   * =======================
   */
  async function toggleExpandRow(id: string, extra: any) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (
      extra?.source &&
      extra.source !== "manual" &&
      !Object.prototype.hasOwnProperty.call(sourceDocMap, id)
    ) {
      await loadSourceDoc(id, extra);
    }
  }

  /** Cualquier variante de cobros: "cobros", "cobros_import", "cobros_import_batch", … */
  function isCobrosSource(src?: string) {
    return !!src && (src === "cobros" || src.startsWith("cobros_") || src === "cobros");
  }
  /** Variantes de trade_docs: docs tributarios y otros ingresos */
  function isTradeDocSource(src?: string) {
    return !!src && (
      src.startsWith("trade_docs") ||   // trade_docs_sales, trade_docs_non_fiscal, trade_docs_non_fiscal_cancel, ...
      src === "docs-tribut-ventas" ||   // valor legacy
      src === "otros-docs-ingresos"     // valor legacy
    );
  }

  async function loadSourceDoc(entryId: string, extra: any) {
    try {
      if (isCobrosSource(extra?.source) && extra?.cobro_id) {
        const { data } = await supabase
          .from("payments")
          .select(
            "id,payment_date,total_amount,currency_code,status,counterparty_name_snapshot,counterparty_identifier_snapshot,description"
          )
          .eq("id", extra.cobro_id)
          .maybeSingle();
        setSourceDocMap((m) => ({ ...m, [entryId]: (data as any) || null }));
      } else if (
        isTradeDocSource(extra?.source) &&
        (extra?.trade_doc_id || extra?.other_doc_id)
      ) {
        const docId = extra.trade_doc_id || extra.other_doc_id;
        const { data } = await supabase
          .from("trade_docs")
          .select(
            "id,issue_date,grand_total,currency_code,status,doc_type,doc_class,counterparty_name_snapshot,counterparty_identifier_snapshot,description"
          )
          .eq("id", docId)
          .maybeSingle();
        setSourceDocMap((m) => ({ ...m, [entryId]: (data as any) || null }));
      } else {
        setSourceDocMap((m) => ({ ...m, [entryId]: null }));
      }
    } catch {
      setSourceDocMap((m) => ({ ...m, [entryId]: null }));
    }
  }

  /**
   * =======================
   * Sincronizar módulo origen tras contabilizar
   * =======================
   */
  async function syncSourceAfterPost(extra: any) {
    if (!extra) return;
    try {
      if (isCobrosSource(extra.source) && extra.cobro_id) {
        await supabase
          .from("payments")
          .update({ status: "VIGENTE" })
          .eq("id", extra.cobro_id)
          .eq("company_id", companyId);
      } else if (
        (extra.source === "docs-tribut-ventas" || extra.source === "trade_docs") &&
        extra.trade_doc_id
      ) {
        await supabase
          .from("trade_docs")
          .update({ status: "VIGENTE" })
          .eq("id", extra.trade_doc_id)
          .eq("company_id", companyId);
      } else if (extra.source === "otros-docs-ingresos" && extra.other_doc_id) {
        await supabase
          .from("trade_docs")
          .update({ status: "VIGENTE" })
          .eq("id", extra.other_doc_id)
          .eq("company_id", companyId);
      }
    } catch {
      // la contabilización fue exitosa; el sync falla silenciosamente
    }
  }

  async function openDraft(draftId: string) {
    if (!companyId) return;

    try {
      const { data: h, error: he } = await supabase
        .from("journal_entries")
        .select(
          "id,company_id,entry_date,description,entry_number_formatted,counterparty_id,currency_code,status"
        )
        .eq("company_id", companyId)
        .eq("id", draftId)
        .single();

      if (he) throw he;

      const { data: ls, error: le } = await supabase
        .from("journal_entry_lines")
        .select(
          "line_no,account_node_id,line_description,debit,credit,counterparty_id,cost_center_id,business_line_id,branch_id,journal_entry_id"
        )
        .eq("journal_entry_id", draftId)
        .order("line_no", { ascending: true });

      if (le) throw le;

      setEntryId(draftId);
      setHeader({
        entry_date: (h as any).entry_date,
        description: (h as any).description || "",
        currency_code: (h as any).currency_code || (baseCurrency?.code || "CLP"),
      });

      const parsed: EntryLine[] = (((ls as any) || []) as any[]).map((r) => {
        const acc = r.account_node_id ? accById[r.account_node_id] : null;

        const cp = r.counterparty_id ? cpById[r.counterparty_id] : null;
        const cc = r.cost_center_id ? ccById[r.cost_center_id] : null;
        const cu = r.business_line_id ? cuById[r.business_line_id] : null;
        const br = r.branch_id ? brById[r.branch_id] : null;

        return {
          ...makeLine(Number(r.line_no) || 1),
          account_node_id: r.account_node_id ?? null,
          account_code: acc?.code ?? "",
          account_name: acc?.name ?? "",
          line_description: r.line_description ?? "",
          debit: r.debit != null && Number(r.debit) > 0 ? String(r.debit) : "",
          credit:
            r.credit != null && Number(r.credit) > 0 ? String(r.credit) : "",
          counterparty_identifier: cp?.identifier ?? "",
          counterparty_name_resolved: cp?.name ?? "",
          cost_center_code: cc?.code ?? "",
          business_line_code: cu?.code ?? "",
          branch_code: br?.code ?? "",
          details_open: false,
          cellErrors: {},
        } as EntryLine;
      });

      const normalized = renumber(parsed);
      const filled =
        normalized.length >= 10
          ? normalized
          : [...normalized, ...makeLines(10 - normalized.length)].map((x, i) => ({
              ...x,
              line_no: i + 1,
            }));

      setLines(filled);
      setIssues([
        {
          level: "warn",
          code: "DRAFT_OPENED",
          message: `Borrador cargado (${draftId}).`,
        },
      ]);
    } catch (e: any) {
      setIssues([
        {
          level: "error",
          code: "DRAFT_OPEN_FAILED",
          message: e?.message || "No se pudo abrir el borrador.",
        },
      ]);
    }
  }

  async function deleteDraft(draftId: string) {
    if (!companyId || !canEdit) return;

    const ok = confirm(
      "¿Eliminar este borrador? Esta acción no se puede deshacer."
    );
    if (!ok) return;

    // Optimista: lo saco de la UI altiro
    setDrafts((prev) => prev.filter((x) => x.header.id !== draftId));

    try {
      // 1) intenta borrar el header (si tienes ON DELETE CASCADE, esto borra todo)
      const { error: he } = await supabase
        .from("journal_entries")
        .delete()
        .eq("company_id", companyId)
        .eq("id", draftId)
        .eq("status", "DRAFT");

      if (!he) {
        if (entryId === draftId) resetNew();
        await loadDrafts();
        setIssues((prev) => [
          {
            level: "warn",
            code: "DRAFT_DELETED",
            message: `Borrador eliminado (${draftId}).`,
          },
          ...prev,
        ]);
        return;
      }

      // 2) Si falló (por FK sin cascade), borra líneas y reintenta
      const { error: le } = await supabase
        .from("journal_entry_lines")
        .delete()
        .eq("journal_entry_id", draftId);
      if (le) throw le;

      const { error: he2 } = await supabase
        .from("journal_entries")
        .delete()
        .eq("company_id", companyId)
        .eq("id", draftId)
        .eq("status", "DRAFT");
      if (he2) throw he2;

      if (entryId === draftId) resetNew();
      await loadDrafts();

      setIssues((prev) => [
        {
          level: "warn",
          code: "DRAFT_DELETED",
          message: `Borrador eliminado (${draftId}).`,
        },
        ...prev,
      ]);
    } catch (e: any) {
      // si falló, vuelvo a cargar para no dejar la UI inconsistente
      await loadDrafts();
      setIssues([
        {
          level: "error",
          code: "DRAFT_DELETE_FAILED",
          message: e?.message || "No se pudo eliminar el borrador.",
        },
      ]);
    }
  }

  async function postDraft(draftId: string) {
    if (!canEdit) return;
    setPosting(true);
    try {
      const draft = drafts.find((d) => d.header.id === draftId);
      const extra = (draft?.header as any)?.extra;

      const { error } = await supabase.rpc("post_journal_entry", {
        _entry_id: draftId,
      });
      if (error) throw error;

      if (extra) await syncSourceAfterPost(extra);

      await loadDrafts();
      if (activeTab === "registered") await loadRegistered();

      setIssues((prev) => [
        {
          level: "warn",
          code: "POSTED",
          message: `Asiento contabilizado (${draftId}).`,
        },
        ...prev,
      ]);
      setPageMsg({ level: "success", text: "Asiento contabilizado correctamente." });
      setTimeout(() => setPageMsg(null), 4000);
    } catch (e: any) {
      setIssues([
        {
          level: "error",
          code: "POST_FAILED",
          message: e?.message || "No se pudo contabilizar.",
        },
      ]);
    } finally {
      setPosting(false);
    }
  }

  async function postAllDrafts() {
    if (!canEdit) return;

    const ok = confirm(
      "¿Contabilizar TODOS los borradores que cuadren? Los que no cuadren se omitirán."
    );
    if (!ok) return;

    setPosting(true);
    try {
      const toPost = drafts.filter((d) => {
        const dl = d.lines.filter(
          (x) => Number(x.debit || 0) > 0 || Number(x.credit || 0) > 0
        );
        const sumD = dl.reduce((s, x) => s + Number(x.debit || 0), 0);
        const sumC = dl.reduce((s, x) => s + Number(x.credit || 0), 0);
        const diff = sumD - sumC;
        return Math.abs(diff) <= postingTolerance;
      });

      if (toPost.length === 0) {
        setIssues([
          {
            level: "warn",
            code: "POST_ALL_NONE",
            message: "No hay borradores cuadrados para contabilizar.",
          },
        ]);
        return;
      }

      let posted = 0;
      const failed: string[] = [];

      for (const d of toPost) {
        try {
          const { error } = await supabase.rpc("post_journal_entry", {
            _entry_id: d.header.id,
          });
          if (error) throw error;
          const extra = (d.header as any)?.extra;
          if (extra) await syncSourceAfterPost(extra);
          posted += 1;
        } catch (e: any) {
          failed.push(`${d.header.id.slice(0, 8)}…: ${e?.message || "error"}`);
        }
      }

      await loadDrafts();
      if (activeTab === "registered") await loadRegistered();

      setIssues((prev) => [
        {
          level: "warn",
          code: "POST_ALL_DONE",
          message: `Contabilizados: ${posted}/${toPost.length}.`,
        },
        ...(failed.length
          ? [
              {
                level: "warn",
                code: "POST_ALL_SOME_FAILED",
                message: `Fallaron ${failed.length}. Ej: ${failed
                  .slice(0, 2)
                  .join(" | ")}`,
              } as any,
            ]
          : []),
        ...prev,
      ]);
    } finally {
      setPosting(false);
    }
  }

  async function deleteAllDrafts() {
    if (!companyId || !canEdit) return;

    const ok = confirm(
      "¿Eliminar TODOS los borradores? Esta acción NO se puede deshacer."
    );
    if (!ok) return;

    setLoadingDrafts(true);

    try {
      // 1) Buscar IDs de borradores
      const { data: hs, error: he } = await supabase
        .from("journal_entries")
        .select("id")
        .eq("company_id", companyId)
        .eq("status", "DRAFT");

      if (he) throw he;

      const ids = ((hs as any) || []).map((x: any) => x.id).filter(Boolean);

      if (ids.length === 0) {
        setIssues([
          {
            level: "warn",
            code: "DELETE_ALL_NONE",
            message: "No hay borradores para eliminar.",
          },
        ]);
        return;
      }

      // 2) Borrar líneas (por si NO hay cascade)
      const { error: le } = await supabase
        .from("journal_entry_lines")
        .delete()
        .eq("company_id", companyId)
        .in("journal_entry_id", ids);

      // Si falla acá, igual intentamos borrar headers (por si SÍ hay cascade)
      // pero normalmente esto debería funcionar.
      if (le) {
        // No detenemos inmediatamente para no dejar headers “huérfanos” en UI
        console.warn("delete lines error:", le);
      }

      // 3) Borrar headers
      const { error: he2 } = await supabase
        .from("journal_entries")
        .delete()
        .eq("company_id", companyId)
        .eq("status", "DRAFT")
        .in("id", ids);

      if (he2) throw he2;

      // 4) Limpieza UI
      if (entryId && ids.includes(entryId)) resetNew();
      await loadDrafts();

      setIssues((prev) => [
        {
          level: "warn",
          code: "DELETE_ALL_DONE",
          message: `Borradores eliminados: ${ids.length}.`,
        },
        ...prev,
      ]);
    } catch (e: any) {
      await loadDrafts();
      setIssues([
        {
          level: "error",
          code: "DELETE_ALL_FAILED",
          message: e?.message || "No se pudieron eliminar los borradores.",
        },
      ]);
    } finally {
      setLoadingDrafts(false);
    }
  }

  // ── Reporte Excel ─────────────────────────────────────────────────────────
  function downloadReport() {
    const rows = activeTab === "drafts" ? filteredDrafts : filteredRegistered;

    const isFiscalSrc = (src: string) =>
      src === "trade_docs_sales" ||
      src === "docs-tribut-ventas" ||
      src === "trade_docs";
    const isNonFiscalSrc = (src: string) =>
      src.startsWith("trade_docs_non") || src === "otros-docs-ingresos";
    const isCobrosSrc = (src: string) =>
      src === "cobros" || src.startsWith("cobros_");

    const header = [
      "Fecha",
      "N° Diario",
      "RUT / NIC",
      "Nombre Contraparte",
      "Descripción",
      "Moneda",
      "Debe",
      "Haber",
      "Estado",
      "Origen",
    ];

    const dataRows = rows.map((d) => {
      const h = d.header;
      const src: string = (h as any).extra?.source || "";
      const cp = h.counterparty_id ? cpById[h.counterparty_id] : null;
      const sumD = d.lines.reduce((s, x) => s + Number(x.debit  || 0), 0);
      const sumC = d.lines.reduce((s, x) => s + Number(x.credit || 0), 0);
      const originLabel = isCobrosSrc(src)
        ? "Cobro"
        : isFiscalSrc(src)
        ? "Doc Tributario"
        : isNonFiscalSrc(src)
        ? "Otro Ingreso"
        : src === "trade_doc_mass_import"
        ? "Importación masiva"
        : "Manual";

      return [
        h.entry_date,
        h.entry_number_formatted || "",
        cp?.identifier || "",
        cp?.name || "",
        h.description,
        h.currency_code,
        sumD,
        sumC,
        h.status === "DRAFT" ? "Borrador" : "Contabilizado",
        originLabel,
      ];
    });

    const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Asientos");
    XLSX.writeFile(
      wb,
      `asientos_${activeTab}_${new Date().toISOString().slice(0, 10)}.xlsx`
    );
  }

  /**
   * =======================
   * Excel -> BORRADORES (multi entry_key)
   * =======================
   */
  function pickSheetPLANTILLA(wb: XLSX.WorkBook) {
    return (
      wb.SheetNames.find(
        (s) => String(s).toUpperCase().trim() === "PLANTILLA"
      ) ||
      wb.SheetNames.find((s) =>
        String(s).toUpperCase().includes("PLANTILLA")
      ) ||
      wb.SheetNames[0]
    );
  }

  function isRowEmpty(r: any) {
    const acc = normalizeCode(r.account_code);
    const d = toNum(r.debit);
    const c = toNum(r.credit);
    const desc = String(r.line_description ?? "").trim();
    const cp = normalizeCode(r.counterparty_identifier);
    const headerish =
      normalizeCode(r.entry_date) ||
      normalizeCode(r.description) ||
      normalizeCode(r.num_doc);
    return !headerish && !acc && d <= 0 && c <= 0 && !desc && !cp;
  }

  function validateEntryExternal(
    hdr: EntryHeader,
    entryLines: EntryLine[],
    strictBalanced: boolean
  ): ValidationIssue[] {
    const out: ValidationIssue[] = [];

    const used = entryLines.filter((l) => {
      const hasAmount = toNum(l.debit) > 0 || toNum(l.credit) > 0;
      const hasAcc = !!l.account_code.trim();
      const hasDesc = !!l.line_description.trim();
      const hasCp = !!String(l.counterparty_identifier || "").trim();
      return hasAmount || hasAcc || hasDesc || hasCp;
    });

    const debit = used.reduce((s, l) => s + toNum(l.debit), 0);
    const credit = used.reduce((s, l) => s + toNum(l.credit), 0);
    const diff = debit - credit;

    if (!hdr.entry_date)
      out.push({
        level: "error",
        code: "DATE_REQUIRED",
        message: "Falta entry_date.",
      });
    if (hdr.entry_date && !/^\d{4}-\d{2}-\d{2}$/.test(hdr.entry_date)) {
      out.push({
        level: "error",
        code: "DATE_INVALID",
        message: `entry_date inválida (usa YYYY-MM-DD): "${hdr.entry_date}"`,
      });
    }
    if (!hdr.description.trim())
      out.push({
        level: "error",
        code: "DESC_REQUIRED",
        message: "Falta description.",
      });

    if (used.length < 2) {
      out.push({
        level: "error",
        code: "MIN_LINES",
        message: "El asiento debe tener al menos 2 líneas con monto.",
      });
    }

    if (strictBalanced && Math.abs(diff) > postingTolerance) {
      out.push({
        level: "error",
        code: "NOT_BALANCED",
        message: `El asiento no cuadra. diff=${formatNumber(
          diff,
          moneyDecimals
        )} (tol ${formatNumber(postingTolerance, moneyDecimals)}).`,
      });
    }

    used.forEach((l) => {
      const ln = l.line_no;

      const accCode = normalizeCode(l.account_code);
      const acc = accCode ? accByCode[accCode] : undefined;

      if (!accCode) {
        out.push({
          level: "error",
          code: "ACCOUNT_REQUIRED",
          message: "Falta account_code.",
          lineNo: ln,
          field: "account_code",
        });
      } else if (!acc) {
        out.push({
          level: "error",
          code: "ACCOUNT_NOT_FOUND",
          message: `Cuenta no existe: ${accCode}`,
          lineNo: ln,
          field: "account_code",
        });
      }

      const d = toNum(l.debit);
      const c = toNum(l.credit);

      if (d > 0 && c > 0)
        out.push({
          level: "error",
          code: "BOTH_SIDES",
          message: "No puede tener debit y credit.",
          lineNo: ln,
        });
      if (d <= 0 && c <= 0)
        out.push({
          level: "error",
          code: "AMOUNT_REQUIRED",
          message: "Ingresa debit o credit.",
          lineNo: ln,
        });

      // decimales
      const checkDecimals = (label: "debit" | "credit", raw: string) => {
        const s = String(raw ?? "").trim();
        if (!s) return;
        const n = s.replace(",", ".");
        const parts = n.split(".");
        if (parts.length === 2 && parts[1].length > moneyDecimals) {
          out.push({
            level: "error",
            code: "TOO_MANY_DECIMALS",
            message: `${label} admite máximo ${moneyDecimals} decimales.`,
            lineNo: ln,
            field: label,
          });
        }
      };
      checkDecimals("debit", l.debit);
      checkDecimals("credit", l.credit);

      const pol = acc?.id ? policiesByAccount[acc.id] : null;
      const reqCC = !!pol?.require_cc;
      const reqCU = !!pol?.require_cu;
      const reqBR = !!pol?.require_suc;
      const reqIT = !!pol?.require_item;
      const reqCP = !!pol?.require_cp;

      const cpKey = normalizeCode(l.counterparty_identifier);
      if (reqCP && !cpKey) {
        out.push({
          level: "error",
          code: "CP_REQUIRED",
          message: "Falta counterparty_identifier.",
          lineNo: ln,
          field: "counterparty_identifier",
        });
      }
      if (cpKey && counterpartiesAvailable && !counterpartyMap[cpKey]) {
        out.push({
          level: "warn",
          code: "CP_NOT_FOUND",
          message: `Tercero no existe: "${cpKey}".`,
          lineNo: ln,
          field: "counterparty_identifier",
        });
      }

      const cc = normalizeCode(l.cost_center_code);
      const cu = normalizeCode(l.business_line_code);
      const br = normalizeCode(l.branch_code);

      if (reqCC) {
        if (!cc)
          out.push({
            level: "error",
            code: "CC_REQUIRED",
            message: "Falta cost_center_code.",
            lineNo: ln,
            field: "cost_center_code",
          });
        else if (!ccByCode[cc])
          out.push({
            level: "error",
            code: "CC_NOT_FOUND",
            message: `Centro costo no existe: "${cc}"`,
            lineNo: ln,
            field: "cost_center_code",
          });
      } else if (cc && !ccByCode[cc]) {
        out.push({
          level: "warn",
          code: "CC_NOT_FOUND",
          message: `Centro costo no existe: "${cc}"`,
          lineNo: ln,
          field: "cost_center_code",
        });
      }

      if (reqCU) {
        if (!cu)
          out.push({
            level: "error",
            code: "CU_REQUIRED",
            message: "Falta business_line_code.",
            lineNo: ln,
            field: "business_line_code",
          });
        else if (!cuByCode[cu])
          out.push({
            level: "error",
            code: "CU_NOT_FOUND",
            message: `Línea negocio no existe: "${cu}"`,
            lineNo: ln,
            field: "business_line_code",
          });
      } else if (cu && !cuByCode[cu]) {
        out.push({
          level: "warn",
          code: "CU_NOT_FOUND",
          message: `Línea negocio no existe: "${cu}"`,
          lineNo: ln,
          field: "business_line_code",
        });
      }

      if (reqBR) {
        if (!br)
          out.push({
            level: "error",
            code: "BR_REQUIRED",
            message: "Falta branch_code.",
            lineNo: ln,
            field: "branch_code",
          });
        else if (!brByCode[br])
          out.push({
            level: "error",
            code: "BR_NOT_FOUND",
            message: `Sucursal no existe: "${br}"`,
            lineNo: ln,
            field: "branch_code",
          });
      } else if (br && !brByCode[br]) {
        out.push({
          level: "warn",
          code: "BR_NOT_FOUND",
          message: `Sucursal no existe: "${br}"`,
          lineNo: ln,
          field: "branch_code",
        });
      }
    });

    return out;
  }

  function parseExcelToEntries(wb: XLSX.WorkBook): ExcelEntryParsed[] {
    const sheetName = pickSheetPLANTILLA(wb);
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: "", range: 2 }) as any[];
    // range: 2 => arranca en la fila 3 (0-index), donde están los headers reales


    const groups: Record<string, any[]> = {};
    for (const r of rows) {
      if (isRowEmpty(r)) continue;
      const k = String(r.entry_key ?? "").trim() || "1";
      if (!groups[k]) groups[k] = [];
      groups[k].push(r);
    }

    const entries: ExcelEntryParsed[] = [];
    const keys = Object.keys(groups).sort((a, b) => Number(a) - Number(b));

    for (const k of keys) {
      const g = groups[k];
      const first = g[0] || {};

      const entry_date = excelDateToISO(first.entry_date) || todayISO();
      const description = String(first.description ?? "").trim();

      const hdr: EntryHeader = {
        entry_date,
        description,
        currency_code: baseCurrency?.code || header.currency_code || "CLP",
      };

      const parsedLines: EntryLine[] = [];
      g.forEach((r: any, idx: number) => {
        const ln = Number(r.line_no || idx + 1) || idx + 1;

        // Como usas range: 2 (fila 3 = headers), la data empieza en fila 4
        // idx=0 => fila Excel 4
        const excelRow = 4 + idx;

        const accCode = normalizeCode(r.account_code);
        const acc = accCode ? accByCode[accCode] : undefined;

        const cpIdent = normalizeCode(r.counterparty_identifier);
        const cp = cpIdent ? counterpartyMap[cpIdent] : undefined;

        parsedLines.push({
          ...makeLine(ln),
          excel_row: excelRow,

          account_code: accCode,
          account_node_id: acc?.id ?? null,
          account_name: acc?.name ?? "",
          line_description: String(r.line_description ?? "").trim(),
          debit: String(r.debit ?? "").trim(),
          credit: String(r.credit ?? "").trim(),
          counterparty_identifier: cpIdent,
          counterparty_name_resolved: cp?.name ?? "",
          cost_center_code: normalizeCode(r.cost_center_code),
          business_line_code: normalizeCode(r.business_line_code),
          branch_code: normalizeCode(r.branch_code),
          details_open: false,
          cellErrors: {},
        });
      });


      entries.push({ entry_key: k, header: hdr, lines: renumber(parsedLines) });
    }

    return entries;
  }

  async function createDraftFromEntryParsed(e: ExcelEntryParsed) {
    if (!companyId) throw new Error("Falta companyId.");

    const v = validateEntryExternal(e.header, e.lines, false);
    const hardErrors = v.filter((x) => x.level === "error");
    if (hardErrors.length) {
      const msg = hardErrors
        .slice(0, 3)
        .map((x) => x.message)
        .join(" | ");
      throw new Error(`entry_key=${e.entry_key}: Corrige errores. ${msg}`);
    }

    const headerPayload: any = {
      company_id: companyId,
      entry_date: e.header.entry_date,
      description: e.header.description.trim(),
      currency_code: e.header.currency_code,
      status: "DRAFT",
      extra: { source: "asientos_import" },
    };

    const { data: h, error: he } = await supabase
      .from("journal_entries")
      .insert(headerPayload)
      .select("id")
      .single();
    if (he) throw he;

    const entryIdNew = (h as any).id as string;

    const used = e.lines.filter((l) => {
      const hasAmount = toNum(l.debit) > 0 || toNum(l.credit) > 0;
      const hasAcc = !!l.account_code.trim();
      const hasDesc = !!l.line_description.trim();
      const hasCp = !!String(l.counterparty_identifier || "").trim();
      return hasAmount || hasAcc || hasDesc || hasCp;
    });

    const linePayloads = used.map((l) => {
      const ids = resolveLineIdsForSave(l);
      return {
        company_id: companyId,
        journal_entry_id: entryIdNew,
        line_no: l.line_no,
        account_node_id: l.account_node_id,
        line_description: l.line_description?.trim() || null,
        debit: toNum(l.debit),
        credit: toNum(l.credit),
        counterparty_id: ids.counterparty_id,
        cost_center_id: ids.cost_center_id,
        business_line_id: ids.business_line_id,
        branch_id: ids.branch_id,
      };
    });

    if (linePayloads.length) {
      const { error: le } = await supabase
        .from("journal_entry_lines")
        .insert(linePayloads);
      if (le) throw le;
    }

    return entryIdNew;
  }

  async function importExcelToDrafts(file: File) {
    setImportState("reading");
    const reader = new FileReader();

    const result = await new Promise<{ entries: ExcelEntryParsed[] }>(
      (resolve, reject) => {
        reader.onload = (ev) => {
          try {
            setImportState("parsing");
            const data = new Uint8Array(ev.target?.result as ArrayBuffer);
            const wb = XLSX.read(data, { type: "array", cellDates: true });
            const entries = parseExcelToEntries(wb);
            resolve({ entries });
          } catch (err: any) {
            reject(err);
          }
        };
        reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
        reader.readAsArrayBuffer(file);
      }
    );
    
    setImportState("validating");

    if (result.entries.length === 0) {
      setIssues([
        {
          level: "error",
          code: "EXCEL_EMPTY",
          message: "El Excel no trae filas válidas en PLANTILLA.",
        },
      ]);
      return;
    }

    // ===============================
    // 1) VALIDAR TODO (sin guardar)
    // ===============================
    setImportState("validating");

    const allIssues: ValidationIssue[] = [];

    for (const e of result.entries) {
      const v = validateEntryExternal(e.header, e.lines, false);

      // ✅ SOLO errores (bloquea). Si quieres mostrar warns también, los agregamos luego.
      const errs = v.filter((x) => x.level === "error");

      for (const x of errs) {
        const line = e.lines.find((l) => l.line_no === x.lineNo);
        const excelRow = line?.excel_row;

        allIssues.push({
          level: "error",
          code: `EXCEL_${x.code}`,
          lineNo: x.lineNo,
          field: x.field,
          message: `entry_key=${e.entry_key} • ${
            excelRow ? `fila_excel=${excelRow} • ` : ""
          }${x.message}`,
        });
      }
    }

    // ✅ si hay errores, NO guardar nada
    if (allIssues.length > 0) {
      setImportState("idle");
      setSavingDraft(false);

      // IMPORTANTE: no reemplazar por mensajes "finalizado"
      setIssues(allIssues.slice(0, 200)); // muestra hasta 200 errores
      return;
    }

    // ===============================
    // 2) GUARDAR (solo si todo ok)
    // ===============================
    setImportState("saving");

    let ok = 0;

    for (const e of result.entries) {
      await createDraftFromEntryParsed(e);
      ok += 1;
    }

    await loadDrafts();

    setIssues([
      {
        level: "warn",
        code: "EXCEL_IMPORTED_OK",
        message: `Importación OK: ${ok}/${result.entries.length} borradores creados.`,
      },
    ]);

    setImportState("done");

  }

  // ── Flujo del modal de importación ──────────────────────────────────────

  function openImportModal() {
    setImportOpen(true);
    setImportParsedEntries([]);
    setImportPreviewRows([]);
    setImportModalIssues([]);
    setImportState("idle");
  }

  async function handlePickExcelForModal(file: File) {
    setImportState("reading");
    setImportParsedEntries([]);
    setImportPreviewRows([]);
    setImportModalIssues([]);

    try {
      const reader = new FileReader();
      const result = await new Promise<{ entries: ExcelEntryParsed[] }>(
        (resolve, reject) => {
          reader.onload = (ev) => {
            try {
              setImportState("parsing");
              const data = new Uint8Array(ev.target?.result as ArrayBuffer);
              const wb = XLSX.read(data, { type: "array", cellDates: true });
              const entries = parseExcelToEntries(wb);
              resolve({ entries });
            } catch (err: any) {
              reject(err);
            }
          };
          reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
          reader.readAsArrayBuffer(file);
        }
      );

      setImportState("validating");

      if (result.entries.length === 0) {
        setImportModalIssues([
          { level: "error", code: "EXCEL_EMPTY", message: "El Excel no trae filas válidas en la hoja PLANTILLA." },
        ]);
        setImportState("idle");
        return;
      }

      const allIssues: AsientosImportIssue[] = [];
      for (const e of result.entries) {
        const v = validateEntryExternal(e.header, e.lines, false);
        for (const x of v.filter((x) => x.level === "error")) {
          const line = e.lines.find((l) => l.line_no === x.lineNo);
          allIssues.push({
            level: "error",
            code: `EXCEL_${x.code}`,
            message: `entry_key=${e.entry_key} • ${
              line?.excel_row ? `fila_excel=${line.excel_row} • ` : ""
            }${x.message}`,
          });
        }
      }

      setImportModalIssues(allIssues.slice(0, 200));

      if (allIssues.length === 0) {
        setImportParsedEntries(result.entries);
        setImportPreviewRows(
          result.entries.map((e) => ({
            entry_key: e.entry_key,
            entry_date: e.header.entry_date,
            description: e.header.description,
            lines_count: e.lines.length,
            currency_code: e.header.currency_code || baseCurrency?.code || "CLP",
          }))
        );
      }

      setImportState("idle");
    } catch (err: any) {
      setImportModalIssues([
        { level: "error", code: "EXCEL_PARSE_FAILED", message: err?.message || "No se pudo procesar el archivo." },
      ]);
      setImportState("idle");
    }
  }

  async function confirmImportFromModal() {
    if (!canEdit || importParsedEntries.length === 0) return;
    setSavingDraft(true);
    setImportState("saving");
    let ok = 0;
    try {
      for (const e of importParsedEntries) {
        await createDraftFromEntryParsed(e);
        ok++;
      }
      await loadDrafts();
      setImportOpen(false);
      setImportParsedEntries([]);
      setImportPreviewRows([]);
      setImportModalIssues([]);
      setPageMsg({
        level: "success",
        text: `Importación completada: ${ok} borrador${ok !== 1 ? "es" : ""} creado${ok !== 1 ? "s" : ""}.`,
      });
    } catch (err: any) {
      setImportModalIssues([
        { level: "error", code: "EXCEL_IMPORT_FAILED", message: err?.message || "Error al guardar los borradores." },
      ]);
    } finally {
      setSavingDraft(false);
      setImportState("idle");
    }
  }

  /**
   * =======================
   * UI helpers
   * =======================
   */
  const errorCount = issues.filter((x) => x.level === "error").length;
  const warnCount = issues.filter((x) => x.level === "warn").length;

  const headerCell =
    "text-left text-[12px] font-semibold text-slate-700 border border-slate-200 bg-slate-50 px-1 py-1 align-bottom";
  const headerSub =
    "block text-[10px] font-normal text-slate-500 leading-3 mt-0.5";
  const bodyCell = "border border-slate-200 px-1 py-0 align-middle";

  const cellInputBase =
    "w-full bg-transparent outline-none px-1 py-0.5 text-[13px] leading-5";
  const cellErrorRing = "bg-rose-50/60";

  function cellClass(
    l: EntryLine,
    field: keyof NonNullable<EntryLine["cellErrors"]>
  ) {
    const has = !!l.cellErrors?.[field];
    return cls(cellInputBase, has ? cellErrorRing : "");
  }

  function resolvedLabelForDim(
    field: "cc" | "cu" | "br" | "it",
    code: string
  ) {
    const c = normalizeCode(code);
    if (!c) return "";
    if (field === "cc") return ccByCode[c]?.name ? `${ccByCode[c].name}` : "no existe";
    if (field === "cu") return cuByCode[c]?.name ? `${cuByCode[c].name}` : "no existe";
    if (field === "br") return brByCode[c]?.name ? `${brByCode[c].name}` : "no existe";
    return itByCode[c]?.name ? `${itByCode[c].name}` : "no existe";
  }

  function getPolicyForLine(l: EntryLine) {
    const acc = normalizeCode(l.account_code)
      ? accByCode[normalizeCode(l.account_code)]
      : undefined;
    const pol = acc?.id ? policiesByAccount[acc.id] : null;
    return {
      acc,
      reqCC: !!pol?.require_cc,
      reqCU: !!pol?.require_cu,
      reqBR: !!pol?.require_suc,
      reqIT: !!pol?.require_item,
      reqCP: !!pol?.require_cp,
    };
  }

  return (
    <div className="p-6">

      {/* ═══════════════════════════════════════════════════════════
          MODAL EDITOR DE ASIENTO
      ════════════════════════════════════════════════════════════ */}
      {editorOpen && (
        <div className="fixed inset-0 z-50 bg-black/45">
          <div className="absolute inset-0" onClick={() => { setEditorOpen(false); setModalReadOnly(false); }} />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(1200px,96vw)]">
            <div className="flex h-[min(84vh,780px)] flex-col overflow-hidden rounded-[22px] bg-white shadow-xl ring-1 ring-black/5">

              {/* Modal header fijo */}
              <div className="relative shrink-0 bg-gradient-to-r from-[#0b2b4f] via-[#123b63] to-[#0b2b4f] px-5 py-4 text-white">
                <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
                <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
                <div className="relative flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[11px] font-extrabold uppercase text-white/80">
                      Gestión Contable •{" "}
                      {modalReadOnly ? "Consulta" : entryId ? "Editor" : "Nuevo"}
                    </div>
                    <h2 className="truncate text-lg font-black text-white">
                      {modalReadOnly
                        ? "Ver Asiento"
                        : entryId
                        ? "Editar Asiento"
                        : "Nuevo Asiento"}
                    </h2>
                  </div>
                  <button
                    type="button"
                    className="ml-3 rounded-xl px-3 py-1.5 text-sm font-extrabold text-white/90 hover:bg-white/10"
                    onClick={() => { setEditorOpen(false); setModalReadOnly(false); }}
                    title="Cerrar"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Mensajes */}
              {issues.length > 0 && (
                <div className="shrink-0 px-4 py-2 border-b bg-slate-50">
                  <div className="space-y-1">
                    {issues.slice(0, 8).map((x, i) => (
                      <div
                        key={i}
                        className={cls(
                          "rounded-md border px-2 py-1 text-sm",
                          x.level === "error"
                            ? "border-rose-200 bg-rose-50 text-rose-900"
                            : "border-amber-200 bg-amber-50 text-amber-900"
                        )}
                      >
                        <b>{x.level === "error" ? "Error" : "Aviso"}</b> •{" "}
                        {x.code}
                        {x.lineNo ? (
                          <span className="ml-2 text-xs opacity-80">
                            line_no={x.lineNo}
                          </span>
                        ) : null}
                        <div className="text-sm">{x.message}</div>
                      </div>
                    ))}
                    {issues.length > 8 && (
                      <div className="text-xs text-slate-600">
                        +{issues.length - 8} más…
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Cabecera */}
              <div className="shrink-0 px-4 py-3 border-b grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs text-slate-700 font-semibold">
                    Fecha del asiento
                  </label>
                  <div className="text-[11px] text-slate-500">entry_date</div>
                  <input
                    type="date"
                    className="mt-1 w-full rounded-xl border border-slate-300 px-2 py-2 text-sm focus:border-[#123b63] focus:ring-1 focus:ring-[#123b63]/20 outline-none"
                    value={header.entry_date}
                    disabled={!canEdit || modalReadOnly}
                    onChange={(e) =>
                      setHeader((h) => ({ ...h, entry_date: e.target.value }))
                    }
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs text-slate-700 font-semibold">
                    Descripción general
                  </label>
                  <div className="text-[11px] text-slate-500">description</div>
                  <input
                    className="mt-1 w-full rounded-xl border border-slate-300 px-2 py-2 text-sm focus:border-[#123b63] focus:ring-1 focus:ring-[#123b63]/20 outline-none"
                    placeholder="Ej: Pago proveedor, Ajuste, Nómina..."
                    value={header.description}
                    disabled={!canEdit || modalReadOnly}
                    onChange={(e) =>
                      setHeader((h) => ({
                        ...h,
                        description: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              {/* Líneas */}
              <div className="flex flex-col flex-1 overflow-hidden">
                <div className="shrink-0 px-4 py-2 border-b flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-slate-900">Líneas</h3>
                    <div className="text-[11px] text-slate-500">
                      Enter avanza • Shift+Enter retrocede • ↑/↓ cambia de fila
                      • Ctrl+Enter abre/cierra detalles
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-sm text-slate-700">
                      <b>debit:</b> {formatNumber(totals.debit, moneyDecimals)}{" "}
                      <span className="mx-2 text-slate-300">|</span>{" "}
                      <b>credit:</b>{" "}
                      {formatNumber(totals.credit, moneyDecimals)}
                    </div>
                    {!modalReadOnly && (
                      <button
                        className={cls(
                          "rounded-lg bg-[#123b63] px-3 py-2 text-sm text-white hover:bg-[#0f3354] transition",
                          !canEdit ? "opacity-60 cursor-not-allowed" : ""
                        )}
                        disabled={!canEdit}
                        onClick={() => addMoreLines(10)}
                      >
                        + 10 líneas
                      </button>
                    )}
                  </div>
                </div>

                {/* Datalists */}
                <datalist id="dl-accounts">
                  {accounts.map((a) => (
                    <option key={a.id} value={a.code}>
                      {a.name}
                    </option>
                  ))}
                </datalist>
                <datalist id="dl-cc">
                  {costCenters.map((x) => (
                    <option key={x.id} value={x.code}>
                      {x.name}
                    </option>
                  ))}
                </datalist>
                <datalist id="dl-cu">
                  {businessLines.map((x) => (
                    <option key={x.id} value={x.code}>
                      {x.name}
                    </option>
                  ))}
                </datalist>
                <datalist id="dl-br">
                  {branches.map((x) => (
                    <option key={x.id} value={x.code}>
                      {x.name}
                    </option>
                  ))}
                </datalist>
                {/* Cabecera fija de columnas */}
                <div className="shrink-0 border-t border-slate-200 overflow-hidden pr-[12px]">
                  <table className="w-full table-fixed border-collapse text-sm">
                    <colgroup>
                      <col className="w-[58px]" />
                      <col className="w-[175px]" />
                      <col />
                      <col className="w-[125px]" />
                      <col className="w-[125px]" />
                      <col className="w-[200px]" />
                      <col className="w-[88px]" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th className={headerCell}>
                          line_no
                          <span className={headerSub}>N°</span>
                        </th>
                        <th className={headerCell}>
                          <b>Código cuenta</b>
                          <span className={headerSub}>account_code</span>
                        </th>
                        <th className={headerCell}>
                          <b>Glosa de la línea</b>
                          <span className={headerSub}>line_description</span>
                        </th>
                        <th className={headerCell}>
                          <b>Debe</b>
                          <span className={headerSub}>debit</span>
                        </th>
                        <th className={headerCell}>
                          <b>Haber</b>
                          <span className={headerSub}>credit</span>
                        </th>
                        <th className={headerCell}>
                          <b>ID tercero</b>
                          <span className={headerSub}>counterparty_id</span>
                        </th>
                        <th className={cls(headerCell, "text-center")}>
                          <b>Acciones</b>
                          <span className={headerSub}> </span>
                        </th>
                      </tr>
                    </thead>
                  </table>
                </div>

                {/* Body scrollable */}
                <div className="overflow-y-auto flex-1">
                  <table className="w-full table-fixed border-collapse text-sm">
                    <colgroup>
                      <col className="w-[58px]" />
                      <col className="w-[175px]" />
                      <col />
                      <col className="w-[125px]" />
                      <col className="w-[125px]" />
                      <col className="w-[200px]" />
                      <col className="w-[88px]" />
                    </colgroup>
                    <tbody>
                      {lines.map((l, idx) => {
                        const { acc, reqCC, reqCU, reqBR, reqIT, reqCP } =
                          getPolicyForLine(l);
                        const cpKey = normalizeCode(l.counterparty_identifier);
                        const cpFound = cpKey
                          ? !!counterpartyMap[cpKey]
                          : false;
                        const rowBg =
                          idx % 2 === 0
                            ? "bg-slate-50/80"
                            : "bg-slate-100/50";
                        return (
                          <React.Fragment key={idx}>
                            <tr className={cls(rowBg, "hover:bg-sky-50/30")}>
                              <td
                                className={cls(
                                  bodyCell,
                                  "text-slate-600 text-xs"
                                )}
                              >
                                {l.line_no}
                              </td>
                              <td className={bodyCell}>
                                <input
                                  ref={
                                    setCellRef(idx, "account_code") as any
                                  }
                                  className={cellClass(l, "account_code")}
                                  value={l.account_code}
                                  disabled={!canEdit || modalReadOnly}
                                  onChange={(e) =>
                                    updateLine(idx, {
                                      account_code: e.target.value,
                                    })
                                  }
                                  onBlur={() => resolveAccount(idx)}
                                  onKeyDown={(e) =>
                                    handleMainKeyDown(e, idx, "account_code")
                                  }
                                  placeholder="Ej: 1020101"
                                  list="dl-accounts"
                                />
                                <div className="text-[11px] text-slate-500 truncate">
                                  {acc ? (
                                    acc.name
                                  ) : l.account_code.trim() ? (
                                    <span className="text-amber-700">
                                      no existe
                                    </span>
                                  ) : (
                                    "—"
                                  )}
                                </div>
                              </td>
                              <td className={bodyCell}>
                                <input
                                  ref={
                                    setCellRef(idx, "line_description") as any
                                  }
                                  className={cellClass(l, "line_description")}
                                  value={l.line_description}
                                  disabled={!canEdit || modalReadOnly}
                                  onChange={(e) =>
                                    updateLine(idx, {
                                      line_description: e.target.value,
                                    })
                                  }
                                  onKeyDown={(e) =>
                                    handleMainKeyDown(
                                      e,
                                      idx,
                                      "line_description"
                                    )
                                  }
                                  placeholder="Ej: Pago proveedor"
                                />
                              </td>
                              <td className={bodyCell}>
                                <input
                                  ref={setCellRef(idx, "debit") as any}
                                  className={cls(
                                    cellClass(l, "debit"),
                                    "text-right"
                                  )}
                                  value={l.debit}
                                  disabled={!canEdit || modalReadOnly}
                                  onChange={(e) =>
                                    updateLine(idx, { debit: e.target.value })
                                  }
                                  onKeyDown={(e) =>
                                    handleMainKeyDown(e, idx, "debit")
                                  }
                                  placeholder={
                                    moneyDecimals
                                      ? `0.${"0".repeat(
                                          Math.min(2, moneyDecimals)
                                        )}`
                                      : "0"
                                  }
                                  inputMode="decimal"
                                />
                              </td>
                              <td className={bodyCell}>
                                <input
                                  ref={setCellRef(idx, "credit") as any}
                                  className={cls(
                                    cellClass(l, "credit"),
                                    "text-right"
                                  )}
                                  value={l.credit}
                                  disabled={!canEdit || modalReadOnly}
                                  onChange={(e) =>
                                    updateLine(idx, { credit: e.target.value })
                                  }
                                  onKeyDown={(e) =>
                                    handleMainKeyDown(e, idx, "credit")
                                  }
                                  placeholder={
                                    moneyDecimals
                                      ? `0.${"0".repeat(
                                          Math.min(2, moneyDecimals)
                                        )}`
                                      : "0"
                                  }
                                  inputMode="decimal"
                                />
                              </td>
                              <td className={bodyCell}>
                                <div className="flex items-center gap-1">
                                  <input
                                    ref={
                                      setCellRef(
                                        idx,
                                        "counterparty_identifier"
                                      ) as any
                                    }
                                    className={cls(
                                      cellClass(l, "counterparty_identifier"),
                                      reqCP ? "bg-rose-50/40" : ""
                                    )}
                                    value={l.counterparty_identifier}
                                    disabled={!canEdit || modalReadOnly}
                                    onChange={(e) =>
                                      updateLine(idx, {
                                        counterparty_identifier: e.target.value,
                                      })
                                    }
                                    onBlur={() =>
                                      resolveTrimField(
                                        idx,
                                        "counterparty_identifier"
                                      )
                                    }
                                    onKeyDown={(e) =>
                                      handleMainKeyDown(
                                        e,
                                        idx,
                                        "counterparty_identifier"
                                      )
                                    }
                                    placeholder="Ej: RUT/NIT"
                                  />
                                  {canEdit &&
                                  !modalReadOnly &&
                                  cpKey &&
                                  !cpFound &&
                                  counterpartiesAvailable ? (
                                    <button
                                      className="shrink-0 text-[11px] rounded border border-slate-200 px-1.5 py-0.5 hover:bg-white"
                                      onClick={() =>
                                        openCreateCounterparty(cpKey)
                                      }
                                      tabIndex={-1}
                                      title="Crear tercero"
                                    >
                                      Crear
                                    </button>
                                  ) : null}
                                </div>
                                <div className="text-[11px] text-slate-500 truncate">
                                  {cpFound ? (
                                    <b className="text-slate-700">
                                      {l.counterparty_name_resolved}
                                    </b>
                                  ) : cpKey ? (
                                    <span className="text-amber-700">
                                      no existe
                                    </span>
                                  ) : (
                                    "—"
                                  )}
                                </div>
                              </td>
                              <td className={cls(bodyCell, "text-right")}>
                                <div className="flex items-center justify-end gap-1 pr-1">
                                  <button
                                    className={cls(
                                      "rounded-lg border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50 transition",
                                      l.details_open ? "bg-slate-100" : ""
                                    )}
                                    onClick={() => toggleDetails(idx)}
                                    tabIndex={-1}
                                    title="Detalles"
                                  >
                                    {l.details_open ? "—" : "+"}
                                  </button>
                                  {!modalReadOnly && (
                                    <button
                                      className={cls(
                                        "rounded-lg border border-slate-200 px-2 py-1 text-xs hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition",
                                        !canEdit
                                          ? "opacity-60 cursor-not-allowed"
                                          : ""
                                      )}
                                      disabled={!canEdit}
                                      onClick={() => removeLine(idx)}
                                      tabIndex={-1}
                                      title="Eliminar fila"
                                    >
                                      ✕
                                    </button>
                                  )}
                                </div>
                                {reqCC || reqCU || reqBR || reqCP ? (
                                  <div className="mt-0.5 text-[10px] text-slate-500 text-right pr-1">
                                    {reqCC ? "CC " : ""}
                                    {reqCU ? "CU " : ""}
                                    {reqBR ? "BR " : ""}
                                    {reqCP ? "CP" : ""}
                                  </div>
                                ) : null}
                              </td>
                            </tr>

                            {l.details_open ? (
                              <tr>
                                <td
                                  colSpan={7}
                                  className="border-b border-slate-200 border-l-[3px] border-l-[#123b63]/25 bg-[#f2f6fb] px-3 py-1.5"
                                >
                                  <div className="flex items-center gap-3">
                                    {/* Indicador */}
                                    <span className="shrink-0 text-[10px] font-semibold text-[#123b63]/40">
                                      ↳ dim.
                                    </span>

                                    {/* Centro de costo */}
                                    <div className="flex min-w-0 flex-1 items-center gap-1.5">
                                      <span className={cls(
                                        "shrink-0 text-[10px] font-semibold text-slate-400",
                                        reqCC ? "text-rose-400" : ""
                                      )}>
                                        C.Costo{reqCC ? "*" : ""}
                                      </span>
                                      <div className="min-w-0 flex-1">
                                        <input
                                          className={cls(
                                            "w-full rounded border bg-white px-1.5 py-0.5 text-[12px] outline-none focus:border-[#123b63]/50 transition",
                                            l.cellErrors?.cost_center_code ? "border-rose-300" :
                                            reqCC ? "border-rose-200" : "border-slate-200"
                                          )}
                                          value={l.cost_center_code}
                                          disabled={!canEdit || modalReadOnly}
                                          onChange={(e) => updateLine(idx, { cost_center_code: e.target.value })}
                                          onBlur={() => resolveTrimField(idx, "cost_center_code")}
                                          list="dl-cc"
                                          placeholder="Código"
                                        />
                                        {l.cost_center_code.trim() && (
                                          <div className="truncate text-[10px] text-[#123b63]/60">
                                            {resolvedLabelForDim("cc", l.cost_center_code)}
                                          </div>
                                        )}
                                      </div>
                                    </div>

                                    <div className="h-6 w-px shrink-0 bg-slate-200" />

                                    {/* Línea de negocio */}
                                    <div className="flex min-w-0 flex-1 items-center gap-1.5">
                                      <span className={cls(
                                        "shrink-0 text-[10px] font-semibold text-slate-400",
                                        reqCU ? "text-rose-400" : ""
                                      )}>
                                        L.Negocio{reqCU ? "*" : ""}
                                      </span>
                                      <div className="min-w-0 flex-1">
                                        <input
                                          className={cls(
                                            "w-full rounded border bg-white px-1.5 py-0.5 text-[12px] outline-none focus:border-[#123b63]/50 transition",
                                            l.cellErrors?.business_line_code ? "border-rose-300" :
                                            reqCU ? "border-rose-200" : "border-slate-200"
                                          )}
                                          value={l.business_line_code}
                                          disabled={!canEdit || modalReadOnly}
                                          onChange={(e) => updateLine(idx, { business_line_code: e.target.value })}
                                          onBlur={() => resolveTrimField(idx, "business_line_code")}
                                          list="dl-cu"
                                          placeholder="Código"
                                        />
                                        {l.business_line_code.trim() && (
                                          <div className="truncate text-[10px] text-[#123b63]/60">
                                            {resolvedLabelForDim("cu", l.business_line_code)}
                                          </div>
                                        )}
                                      </div>
                                    </div>

                                    <div className="h-6 w-px shrink-0 bg-slate-200" />

                                    {/* Sucursal */}
                                    <div className="flex min-w-0 flex-1 items-center gap-1.5">
                                      <span className={cls(
                                        "shrink-0 text-[10px] font-semibold text-slate-400",
                                        reqBR ? "text-rose-400" : ""
                                      )}>
                                        Sucursal{reqBR ? "*" : ""}
                                      </span>
                                      <div className="min-w-0 flex-1">
                                        <input
                                          className={cls(
                                            "w-full rounded border bg-white px-1.5 py-0.5 text-[12px] outline-none focus:border-[#123b63]/50 transition",
                                            l.cellErrors?.branch_code ? "border-rose-300" :
                                            reqBR ? "border-rose-200" : "border-slate-200"
                                          )}
                                          value={l.branch_code}
                                          disabled={!canEdit || modalReadOnly}
                                          onChange={(e) => updateLine(idx, { branch_code: e.target.value })}
                                          onBlur={() => resolveTrimField(idx, "branch_code")}
                                          list="dl-br"
                                          placeholder="Código"
                                        />
                                        {l.branch_code.trim() && (
                                          <div className="truncate text-[10px] text-[#123b63]/60">
                                            {resolvedLabelForDim("br", l.branch_code)}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            ) : null}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Footer — totales + botones */}
                <div className="shrink-0 border-t bg-white px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                  {/* Lado izquierdo: info */}
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
                    <span>
                      Moneda: <b className="text-slate-900">{header.currency_code}</b>
                    </span>
                    <span className="text-slate-300">|</span>
                    <span>
                      Debe: <b className="text-slate-900">{formatNumber(totals.debit, moneyDecimals)}</b>
                    </span>
                    <span className="text-slate-300">|</span>
                    <span>
                      Haber: <b className="text-slate-900">{formatNumber(totals.credit, moneyDecimals)}</b>
                    </span>
                    <span className="text-slate-300">|</span>
                    <span className={cls(
                      "font-semibold",
                      Math.abs(totals.diff) <= postingTolerance
                        ? "text-emerald-700"
                        : "text-rose-700"
                    )}>
                      Diff: {formatNumber(totals.diff, moneyDecimals)}
                    </span>
                    {errorCount > 0 && (
                      <>
                        <span className="text-slate-300">|</span>
                        <span className="font-semibold text-rose-600">
                          {errorCount} error{errorCount !== 1 ? "es" : ""}
                        </span>
                      </>
                    )}
                    {warnCount > 0 && (
                      <>
                        <span className="text-slate-300">|</span>
                        <span className="font-semibold text-amber-600">
                          {warnCount} aviso{warnCount !== 1 ? "s" : ""}
                        </span>
                      </>
                    )}
                  </div>
                  {/* Lado derecho: botones */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-all duration-200 hover:bg-slate-50 hover:border-slate-400 hover:-translate-y-[1px] hover:shadow-sm active:translate-y-0"
                      onClick={() => { setEditorOpen(false); setModalReadOnly(false); }}
                    >
                      Cerrar
                    </button>
                    {!modalReadOnly && (
                      <>
                        <button
                          type="button"
                          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-all duration-200 hover:bg-slate-50 hover:border-slate-400 hover:-translate-y-[1px] hover:shadow-sm active:translate-y-0"
                          onClick={() => runValidate(true)}
                        >
                          Validar
                        </button>
                        <button
                          type="button"
                          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-all duration-200 hover:bg-slate-50 hover:border-slate-400 hover:-translate-y-[1px] hover:shadow-sm active:translate-y-0"
                          onClick={resetNew}
                        >
                          Limpiar
                        </button>
                        <button
                          type="button"
                          className={cls(
                            "rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-all duration-200 hover:bg-slate-50 hover:border-slate-400 hover:-translate-y-[1px] hover:shadow-sm active:translate-y-0",
                            (!canEdit || savingDraft) ? "opacity-60 cursor-not-allowed" : ""
                          )}
                          disabled={!canEdit || savingDraft}
                          onClick={onSaveDraftClick}
                        >
                          {savingDraft ? "Guardando..." : "Guardar borrador"}
                        </button>
                        <button
                          type="button"
                          className={cls(
                            "rounded-xl px-4 py-2 text-sm font-bold text-white bg-slate-900 transition-all duration-200 hover:bg-slate-800 hover:-translate-y-[1px] hover:shadow-md active:translate-y-0",
                            (!canEdit || posting) ? "opacity-60 cursor-not-allowed" : ""
                          )}
                          disabled={!canEdit || posting}
                          onClick={onPostClick}
                        >
                          {posting ? "Contabilizando..." : "Contabilizar"}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          SHELL PRINCIPAL
      ════════════════════════════════════════════════════════════ */}
      <div className="overflow-hidden rounded-[28px] bg-white ring-1 ring-slate-200 shadow-[0_18px_70px_rgba(15,23,42,0.10)]">

        {/* ── CABECERA OSCURA ── */}
        <div className="relative bg-gradient-to-r from-[#0b2b4f] via-[#123b63] to-[#0b2b4f] text-white px-7 py-7">
          <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
          <div className="relative flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[12px] font-extrabold uppercase text-white/80">
                Gestión Contable
              </div>
              <h1 className="mt-1 text-3xl font-black leading-tight">
                Asientos Contables
              </h1>
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/90">
                {activeTab === "drafts" ? (
                  <>
                    <span className="inline-flex items-center rounded-full bg-white/10 px-2 py-0.5 ring-1 ring-white/15">
                      Borradores: <b className="ml-1">{drafts.length}</b>
                    </span>
                    <span className="inline-flex items-center rounded-full bg-white/10 px-2 py-0.5 ring-1 ring-white/15">
                      Total debe:{" "}
                      <b className="ml-1">
                        {formatNumber(
                          drafts.reduce(
                            (s, d) =>
                              s + d.lines.reduce((a, l) => a + Number(l.debit || 0), 0),
                            0
                          ),
                          moneyDecimals
                        )}
                      </b>
                    </span>
                  </>
                ) : (
                  <>
                    <span className="inline-flex items-center rounded-full bg-white/10 px-2 py-0.5 ring-1 ring-white/15">
                      Registrados: <b className="ml-1">{registered.length}</b>
                    </span>
                    <span className="inline-flex items-center rounded-full bg-white/10 px-2 py-0.5 ring-1 ring-white/15">
                      Total debe:{" "}
                      <b className="ml-1">
                        {formatNumber(
                          registered.reduce(
                            (s, d) =>
                              s + d.lines.reduce((a, l) => a + Number(l.debit || 0), 0),
                            0
                          ),
                          moneyDecimals
                        )}
                      </b>
                    </span>
                  </>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="rounded-2xl bg-white/10 px-4 py-2 text-[12px] font-extrabold ring-1 ring-white/15 hover:bg-white/15 transition-all duration-200 hover:-translate-y-[1px] hover:shadow-md active:translate-y-0"
                onClick={() => { if (activeTab === "drafts") loadDrafts(); else loadRegistered(); }}
              >
                {(activeTab === "drafts" ? loadingDrafts : loadingRegistered) ? "Cargando..." : "Refrescar"}
              </button>
              <button
                type="button"
                className={cls(
                  "rounded-2xl bg-white/10 px-4 py-2 text-[12px] font-extrabold ring-1 ring-white/15 hover:bg-white/15 transition-all duration-200 hover:-translate-y-[1px] hover:shadow-md active:translate-y-0",
                  !canEdit ? "opacity-60 cursor-not-allowed" : ""
                )}
                disabled={!canEdit}
                onClick={openImportModal}
                title="Importar asientos desde Excel"
              >
                ⬆️ Cargar Excel
              </button>
              <button
                type="button"
                className="rounded-2xl bg-white/10 px-4 py-2 text-[12px] font-extrabold ring-1 ring-white/15 hover:bg-white/15 transition-all duration-200 hover:-translate-y-[1px] hover:shadow-md active:translate-y-0"
                onClick={downloadTemplate}
                title="Descargar plantilla de carga masiva"
              >
                ⬇️ Descargar formato
              </button>
              {canEdit && (
                <button
                  type="button"
                  className="rounded-2xl bg-white/10 px-4 py-2 text-[12px] font-extrabold ring-1 ring-white/15 hover:bg-white/15 transition-all duration-200 hover:-translate-y-[1px] hover:shadow-md active:translate-y-0"
                  onClick={() => {
                    resetNew();
                    setModalReadOnly(false);
                    setEditorOpen(true);
                  }}
                >
                  + Nuevo Asiento
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── CUERPO ── */}
        <div className="p-7">

          {pageMsg && (
            <div
              className={cls(
                "mb-4 rounded-xl border px-4 py-2 text-sm",
                pageMsg.level === "error"
                  ? "border-rose-200 bg-rose-50 text-rose-700"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
              )}
            >
              {pageMsg.text}
            </div>
          )}
          {!canEdit && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900">
              Modo solo lectura (role: {role || "—"}).
            </div>
          )}
          {!counterpartiesAvailable && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900">
              ⚠️ Tabla de terceros no disponible. No se puede resolver nombre.
            </div>
          )}

          <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">

            {/* ── TAB BAR ── */}
            <div className="border-b px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">

                {/* Tabs (pill style) */}
                <div>
                  <div className="flex items-center gap-2">
                    {([
                      { key: "drafts",     label: "Borradores" },
                      { key: "registered", label: "Registrados" },
                    ] as const).map(({ key, label }) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setActiveTab(key)}
                        className={cls(
                          "rounded-xl px-3 py-2 text-sm font-bold transition",
                          activeTab === key
                            ? "bg-[#123b63] text-white shadow"
                            : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 text-[11px] text-slate-500">
                    {activeTab === "drafts"
                      ? "Asientos en borrador pendientes de contabilizar."
                      : "Asientos ya contabilizados."}
                  </div>
                </div>

                {/* Acciones del tab */}
                <div className="flex flex-wrap items-center gap-2">

                  {/* ── Trio estándar: Filtros / Limpiar / Reporte ── */}
                  <FilterActionButtons
                    hasActiveFilters={hasActiveFilters}
                    onOpenFilters={() => setFiltersOpen(true)}
                    onClearFilters={() => setFilters(EMPTY_ASIENTOS_FILTERS)}
                    onReport={downloadReport}
                    reportTitle={`Descargar Excel — ${activeTab === "drafts" ? "Borradores" : "Registrados"} (con filtros aplicados)`}
                  />

                  {/* ── Acciones específicas del tab ── */}
                  {activeTab === "drafts" && canEdit && (
                    <>
                      <button
                        type="button"
                        className={cls(
                          "rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-all duration-200 hover:bg-slate-50 hover:border-slate-400 hover:-translate-y-[1px] hover:shadow-sm active:translate-y-0",
                          posting || loadingDrafts || drafts.length === 0
                            ? "opacity-60 cursor-not-allowed"
                            : ""
                        )}
                        disabled={posting || loadingDrafts || drafts.length === 0}
                        onClick={deleteAllDrafts}
                      >
                        Eliminar todos
                      </button>
                      <button
                        type="button"
                        className={cls(
                          "rounded-xl px-4 py-2 text-sm font-bold text-white bg-slate-900 transition-all duration-200 hover:bg-slate-800 hover:-translate-y-[1px] hover:shadow-md active:translate-y-0",
                          posting || loadingDrafts || drafts.length === 0
                            ? "opacity-60 cursor-not-allowed"
                            : ""
                        )}
                        disabled={posting || loadingDrafts || drafts.length === 0}
                        onClick={postAllDrafts}
                      >
                        {posting ? "Contabilizando..." : "Contabilizar todos"}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Contenido */}
        <div className="p-4">
        {(activeTab === "drafts"
          ? loadingDrafts && drafts.length === 0
          : loadingRegistered && registered.length === 0) ? (
          <div className="p-10 text-center text-[12px] text-slate-500">
            Cargando…
          </div>
        ) : (activeTab === "drafts" ? filteredDrafts : filteredRegistered).length === 0 ? (
          <div className="p-10 text-center text-[12px] text-slate-500">
            {hasActiveFilters
              ? "Sin resultados para los filtros aplicados."
              : activeTab === "drafts"
              ? "No hay borradores."
              : "No hay asientos registrados."}
          </div>
        ) : (() => {
          const rows = activeTab === "drafts" ? filteredDrafts : filteredRegistered;
          const allSelected = rows.length > 0 && rows.every(r => selectedRows[r.header.id]);
          const someSelected = rows.some(r => selectedRows[r.header.id]);
          function toggleSelectAll() {
            if (allSelected) { setSelectedRows({}); }
            else { const m: Record<string,boolean> = {}; rows.forEach(r => { m[r.header.id] = true; }); setSelectedRows(m); }
          }
          return (
          <div className="mt-0 rounded-2xl bg-white shadow-[0_8px_30px_rgba(20,12,70,0.12)] ring-1 ring-slate-200/60">
          <div
            ref={tableContainerRef}
            className="w-full overflow-x-auto rounded-2xl overflow-y-auto"
            style={{ maxHeight: "calc(100vh - 300px)" }}
            onScroll={(e) => {
              const el = e.currentTarget;
              const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 200;
              if (!nearBottom) return;
              if (activeTab === "drafts" && draftsHasMore && !loadingMoreDrafts) {
                loadDrafts(false);
              } else if (activeTab === "registered" && registeredHasMore && !loadingMoreRegistered) {
                loadRegistered(false);
              }
            }}
          >
            <table className="w-full table-fixed text-[12px]">
              <colgroup>
                {/* checkbox */}<col style={{ width: "4%" }} />
                {/* Fecha */}<col style={{ width: "7%" }} />
                {/* Origen */}<col style={{ width: "8%" }} />
                {/* E. Diario */}<col style={{ width: "8%" }} />
                {/* RUT/NIC */}<col style={{ width: "9%" }} />
                {/* Nombre Contraparte */}<col style={{ width: "14%" }} />
                {/* Referencia */}<col style={{ width: "12%" }} />
                {/* Debe */}<col style={{ width: "9%" }} />
                {/* Haber */}<col style={{ width: "9%" }} />
                {/* Estado */}<col style={{ width: "11%" }} />
                {/* Acciones */}<col style={{ width: "8%" }} />
              </colgroup>
              <thead className="sticky top-0 z-20 bg-gradient-to-b from-[#eaf2fb] via-[#dde9f7] to-[#d6e4f5] border-b-2 border-[#123b63]/40 shadow-[0_2px_0_rgba(18,59,99,0.35)]">
                <tr>
                  {/* Checkbox select-all */}
                  <th className="px-1.5 py-3 text-[10px] font-extrabold uppercase tracking-[0.06em] text-center text-[#0b2b4f] overflow-hidden">
                    <input
                      type="checkbox"
                      className="h-4 w-4 cursor-pointer"
                      checked={allSelected}
                      ref={el => { if (el) el.indeterminate = !allSelected && someSelected; }}
                      onChange={toggleSelectAll}
                      disabled={!canEdit}
                    />
                  </th>
                  {([
                    { key: "entry_date",    label: "Fecha",             align: "text-left",   sortable: true  },
                    { key: "source",        label: "Origen",            align: "text-center", sortable: true  },
                    { key: "entry_number",  label: "E. Diario",         align: "text-center", sortable: true  },
                    { key: "rut",           label: "RUT / NIC",         align: "text-center", sortable: true  },
                    { key: "counterparty",  label: "Nombre Contraparte", align: "text-left",  sortable: true  },
                    { key: "description",   label: "Referencia",        align: "text-left",   sortable: true  },
                    { key: "debit",        label: "Debe",              align: "text-right",  sortable: true  },
                    { key: "credit",       label: "Haber",             align: "text-right",  sortable: true  },
                    { key: "status",       label: "Estado",            align: "text-center", sortable: true  },
                    { key: "_actions",     label: "Acciones",    align: "text-center", sortable: false },
                  ] as { key: string; label: string; align: string; sortable: boolean }[]).map(({ key, label, align, sortable }) => (
                    <th
                      key={key}
                      className={cls(
                        "px-1.5 py-3 text-[10px] font-extrabold tracking-[0.06em] text-[#0b2b4f] overflow-hidden whitespace-nowrap",
                        align
                      )}
                    >
                      {sortable ? (
                        <button
                          type="button"
                          className={cls(
                            "mx-auto inline-flex items-center gap-1 rounded-md px-1.5 py-1 transition-colors hover:bg-white/60",
                            sortCol === key && "bg-white/70"
                          )}
                          onClick={() => {
                            if (sortCol === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
                            else { setSortCol(key); setSortDir("asc"); }
                          }}
                        >
                          {label}
                          {sortCol === key && sortDir === "asc"
                            ? <ChevronUp className="h-3.5 w-3.5 text-[#123b63]" />
                            : sortCol === key && sortDir === "desc"
                            ? <ChevronDown className="h-3.5 w-3.5 text-[#123b63]" />
                            : <ChevronsUpDown className="h-3.5 w-3.5 text-slate-400" />
                          }
                        </button>
                      ) : label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const rows = activeTab === "drafts" ? drafts : registered;
                  // client-side sort
                  const sorted = [...rows].sort((a, b) => {
                    const mul = sortDir === "asc" ? 1 : -1;
                    if (sortCol === "created_at")
                      return mul * (a.header.created_at || "").localeCompare(b.header.created_at || "");
                    if (sortCol === "entry_date")
                      return mul * a.header.entry_date.localeCompare(b.header.entry_date);
                    if (sortCol === "entry_number")
                      return mul * (a.header.entry_number_formatted || "").localeCompare(b.header.entry_number_formatted || "");
                    if (sortCol === "description")
                      return mul * (a.header.description || "").localeCompare(b.header.description || "");
                    if (sortCol === "source") {
                      const sA = (a.header as any).extra?.source || "";
                      const sB = (b.header as any).extra?.source || "";
                      return mul * sA.localeCompare(sB);
                    }
                    if (sortCol === "rut") {
                      const rA = (a.header.counterparty_id ? cpById[a.header.counterparty_id]?.identifier : "") || "";
                      const rB = (b.header.counterparty_id ? cpById[b.header.counterparty_id]?.identifier : "") || "";
                      return mul * rA.localeCompare(rB);
                    }
                    if (sortCol === "counterparty") {
                      const nA = (a.header.counterparty_id ? cpById[a.header.counterparty_id]?.name : "") || "";
                      const nB = (b.header.counterparty_id ? cpById[b.header.counterparty_id]?.name : "") || "";
                      return mul * nA.localeCompare(nB, "es", { sensitivity: "base" });
                    }
                    if (sortCol === "status")
                      return mul * (a.header.status || "").localeCompare(b.header.status || "");
                    if (sortCol === "debit") {
                      const dA = a.lines.reduce((s, x) => s + Number(x.debit || 0), 0);
                      const dB = b.lines.reduce((s, x) => s + Number(x.debit || 0), 0);
                      return mul * (dA - dB);
                    }
                    if (sortCol === "credit") {
                      const cA = a.lines.reduce((s, x) => s + Number(x.credit || 0), 0);
                      const cB = b.lines.reduce((s, x) => s + Number(x.credit || 0), 0);
                      return mul * (cA - cB);
                    }
                    return 0;
                  });
                  return (
                  <>
                  {sorted.map((d, idx) => {
                    const dl = d.lines.filter(
                      (x) => Number(x.debit || 0) > 0 || Number(x.credit || 0) > 0
                    );
                    const sumD = dl.reduce((s, x) => s + Number(x.debit || 0), 0);
                    const sumC = dl.reduce((s, x) => s + Number(x.credit || 0), 0);
                    const diff = sumD - sumC;
                    const isExpanded = expandedId === d.header.id;
                    const extra = (d.header as any).extra;
                    const source = extra?.source;

                    // Clasificación del origen — primero, porque isDocSourced depende de ellos
                    // Doc tributario fiscal: trade_docs_sales / legacy "docs-tribut-ventas" / carga masiva docs
                    const isFiscalSource = source === "trade_docs_sales" || source === "docs-tribut-ventas" || source === "trade_docs" || source === "trade_doc_mass_import";
                    // Otro ingreso (no fiscal): trade_docs_non_fiscal* / legacy "otros-docs-ingresos"
                    const isNonFiscalSource = !!(source && (source.startsWith("trade_docs_non") || source === "otros-docs-ingresos"));
                    // Importación masiva de asientos contables desde Excel
                    const isAsientosImport = source === "asientos_import";

                    // Contraparte: directo desde journal_entries.counterparty_id → cpById (ya cargado al inicio)
                    // Para asientos manuales counterparty_id es NULL → celdas vacías (correcto)
                    const headerCp = d.header.counterparty_id ? cpById[d.header.counterparty_id] : null;
                    const cpRut  = headerCp?.identifier || "";
                    const cpName = headerCp?.name       || "";

                    const originLabel = isCobrosSource(source) ? "Cobro"
                      : isFiscalSource    ? "Doc Tributario"
                      : isNonFiscalSource ? "Otro Ingreso"
                      : isAsientosImport  ? "Importado"
                      : "Manual";

                    const originBadge = isCobrosSource(source)
                      ? "bg-blue-100 text-blue-800"
                      : isFiscalSource
                      ? "bg-violet-100 text-violet-800"
                      : isNonFiscalSource
                      ? "bg-teal-100 text-teal-800"
                      : isAsientosImport
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-slate-100 text-slate-600";

                    const tdBase = "px-2 py-2 align-middle border-r last:border-r-0 border-slate-200/50";
                    const iconBtn        = "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50";
                    const iconBtnPrimary = "inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white hover:bg-slate-800";
                    const iconBtnDanger  = "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-rose-200 bg-white text-rose-700 hover:bg-rose-50";

                    return (
                      <React.Fragment key={d.header.id}>
                        <tr
                          className={cls(
                            "cursor-pointer border-t transition-colors",
                            idx % 2 === 0 ? "bg-white" : "bg-slate-50",
                            "hover:bg-sky-50/40",
                            isExpanded && "bg-sky-50/70"
                          )}
                          onClick={() => toggleExpandRow(d.header.id, extra)}
                        >
                          {/* Checkbox */}
                          <td className={cls(tdBase, "text-center")} onClick={e => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              className="h-4 w-4 cursor-pointer"
                              checked={!!selectedRows[d.header.id]}
                              onChange={() => setSelectedRows(prev => ({ ...prev, [d.header.id]: !prev[d.header.id] }))}
                              disabled={!canEdit}
                            />
                          </td>

                          {/* Fecha */}
                          <td className={cls(tdBase, "whitespace-nowrap text-slate-700")}>
                            {d.header.entry_date}
                          </td>

                          {/* Origen */}
                          <td className={cls(tdBase, "text-center")}>
                            <span className={cls("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold", originBadge)}>
                              {originLabel}
                            </span>
                          </td>

                          {/* E. Diario = entry_number_formatted */}
                          <td className={cls(tdBase, "text-center font-mono text-slate-700 whitespace-nowrap")} title={d.header.entry_number_formatted || ""}>
                            {d.header.entry_number_formatted || "—"}
                          </td>

                          {/* RUT / NIC */}
                          <td className={cls(tdBase, "text-center whitespace-nowrap")}>
                            <span className="block truncate">{cpRut || "—"}</span>
                          </td>

                          {/* Contraparte */}
                          <td className={tdBase} title={cpName || ""}>
                            <span className="block truncate">{cpName || "—"}</span>
                          </td>

                          {/* Referencia = description de journal_entries */}
                          <td className={tdBase} title={d.header.description || ""}>
                            <span className="block truncate">{d.header.description || "—"}</span>
                          </td>

                          {/* Debe */}
                          <td className={cls(tdBase, "text-right font-semibold text-slate-700")}>
                            {formatNumber(sumD, moneyDecimals)}
                          </td>

                          {/* Haber */}
                          <td className={cls(tdBase, "text-right font-semibold text-slate-700")}>
                            {formatNumber(sumC, moneyDecimals)}
                          </td>

                          {/* Estado: BORRADOR / CONTABILIZADO */}
                          <td className={cls(tdBase, "text-center")}>
                            {activeTab === "drafts" ? (
                              <span className={cls(
                                "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold",
                                Math.abs(diff) <= postingTolerance
                                  ? "bg-amber-100/70 text-amber-900"
                                  : "bg-rose-100/70 text-rose-900"
                              )}>
                                {Math.abs(diff) <= postingTolerance ? "BORRADOR" : "DESCUADRADO"}
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold bg-emerald-100/70 text-emerald-900">
                                CONTABILIZADO
                              </span>
                            )}
                          </td>

                          {/* Acciones */}
                          <td className={cls(tdBase, "text-center")} onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-1">
                              {activeTab === "drafts" && canEdit && (
                                <>
                                  {/* Editar */}
                                  <button
                                    type="button"
                                    title="Editar asiento"
                                    aria-label="Editar"
                                    className={iconBtn}
                                    onClick={() => openEntryInModal(d.header.id, false)}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </button>
                                  {/* Contabilizar */}
                                  <button
                                    type="button"
                                    title={Math.abs(diff) > postingTolerance ? "No está cuadrado" : "Contabilizar"}
                                    aria-label="Contabilizar"
                                    className={cls(iconBtnPrimary, (posting || Math.abs(diff) > postingTolerance) && "opacity-60 cursor-not-allowed")}
                                    disabled={posting || Math.abs(diff) > postingTolerance}
                                    onClick={() => postDraft(d.header.id)}
                                  >
                                    <CheckCircle2 className="h-4 w-4" />
                                  </button>
                                  {/* Eliminar */}
                                  <button
                                    type="button"
                                    title="Eliminar borrador"
                                    aria-label="Eliminar"
                                    className={iconBtnDanger}
                                    onClick={() => deleteDraft(d.header.id)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </>
                              )}
                              {activeTab === "registered" && (
                                <button
                                  type="button"
                                  title="Ver documento"
                                  aria-label="Ver"
                                  className={iconBtn}
                                  onClick={() => {
                                    const src  = (d.header as any).extra?.source;
                                    const extr = (d.header as any).extra || {};
                                    // Doc tributario FISCAL
                                    if (
                                      src === "trade_docs_sales"      ||
                                      src === "docs-tribut-ventas"    ||
                                      src === "trade_docs"            ||
                                      src === "trade_doc_mass_import"
                                    ) {
                                      setTradeDocViewerId(extr.trade_doc_id || null);
                                    // Otro doc de ingresos NON_FISCAL (distinto key en extra)
                                    } else if (
                                      src?.startsWith("trade_docs_non") ||
                                      src === "otros-docs-ingresos"
                                    ) {
                                      setTradeDocViewerId(extr.other_doc_id || extr.trade_doc_id || null);
                                    // Cobro / ajuste de cobro
                                    } else if (
                                      src === "cobros" ||
                                      src?.startsWith("cobros_")
                                    ) {
                                      setCobroViewerId(extr.cobro_id || null);
                                    // Manual, importado desde Excel u otro → modal de asiento
                                    } else {
                                      openEntryInModal(d.header.id, true);
                                    }
                                  }}
                                >
                                  <Eye className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>

                        {/* ── FILA EXPANDIDA ── */}
                        {isExpanded && (
                          <tr key={`${d.header.id}-exp`}>
                            <td
                              colSpan={11}
                              className="border-t border-b border-[#123b63]/10 bg-[#f0f6fd] px-0"
                            >
                              <div className="px-6 py-4 space-y-4">

                                {/* Tabla de líneas contables */}
                                {dl.length > 0 ? (
                                  <div>
                                    <div className="text-[10px] font-extrabold uppercase tracking-[0.06em] text-[#0b2b4f] mb-2">
                                      Líneas del asiento
                                    </div>
                                    <div className="overflow-x-auto rounded-xl border border-[#123b63]/15 shadow-sm">
                                      <table className="w-full text-xs border-collapse">
                                        <thead className="bg-gradient-to-b from-[#eaf2fb] to-[#d6e4f5] border-b border-[#123b63]/20">
                                          <tr>
                                            {[
                                              { label: "N°",              cls: "w-8  text-center" },
                                              { label: "Cuenta",          cls: "text-left min-w-[180px]" },
                                              { label: "RUT Contraparte", cls: "text-left min-w-[130px]" },
                                              { label: "Glosa",           cls: "text-left min-w-[120px]" },
                                              { label: "Debe",            cls: "text-right w-24" },
                                              { label: "Haber",           cls: "text-right w-24" },
                                            ].map(({ label, cls: c }) => (
                                              <th
                                                key={label}
                                                className={cls(
                                                  "px-2 py-2 font-extrabold text-[9px] uppercase tracking-[0.06em] text-[#0b2b4f]",
                                                  c
                                                )}
                                              >
                                                {label}
                                              </th>
                                            ))}
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {dl.map((x, li) => {
                                            const acc    = x.account_node_id  ? accById[x.account_node_id]   : null;
                                            const lineCp = x.counterparty_id
                                              ? cpById[x.counterparty_id]
                                              : (d.header.counterparty_id ? cpById[d.header.counterparty_id] : null);
                                            const lineCC = x.cost_center_id   ? ccById[x.cost_center_id]     : null;
                                            const lineCU = x.business_line_id ? cuById[x.business_line_id]   : null;
                                            const lineBR = x.branch_id        ? brById[x.branch_id]          : null;
                                            const pol    = acc?.id ? policiesByAccount[acc.id] : null;

                                            // ── Segmentación ──────────────────────────────────────────
                                            const segFilled: { label: string; value: string }[] = [];
                                            const segMissing: string[] = [];
                                            if (pol) {
                                              if (pol.require_cc)  { lineCC ? segFilled.push({ label: "CC",    value: lineCC.name }) : segMissing.push("Centro de costo"); }
                                              if (pol.require_cu)  { lineCU ? segFilled.push({ label: "UNeg",  value: lineCU.name }) : segMissing.push("Unidad de negocio"); }
                                              if (pol.require_suc) { lineBR ? segFilled.push({ label: "Suc",   value: lineBR.name }) : segMissing.push("Sucursal"); }
                                              if (pol.require_cp)  { lineCp ? segFilled.push({ label: "CP",    value: lineCp.name }) : segMissing.push("Contraparte"); }
                                            }

                                            const lineTd = "px-2 py-1.5 border-r last:border-r-0 border-slate-200/60 align-middle";
                                            return (
                                              <tr
                                                key={x.line_no}
                                                className={cls(
                                                  "border-t border-slate-100 last:border-b-0",
                                                  li % 2 === 0 ? "bg-white" : "bg-slate-50/60"
                                                )}
                                              >
                                                {/* N° */}
                                                <td className={cls(lineTd, "text-center text-slate-400 font-mono")}>{x.line_no}</td>

                                                {/* Cuenta + segmentación */}
                                                <td className={lineTd}>
                                                  {acc ? (
                                                    <div>
                                                      <span>
                                                        <b className="text-slate-800">{acc.code}</b>
                                                        <span className="ml-1 text-slate-500">— {acc.name}</span>
                                                      </span>
                                                      {/* Chips de segmentación completada */}
                                                      {segFilled.length > 0 && (
                                                        <div className="flex flex-wrap gap-1 mt-1">
                                                          {segFilled.map((s) => (
                                                            <span
                                                              key={s.label}
                                                              className="inline-flex items-center gap-0.5 rounded-full border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[8px] font-semibold text-sky-700"
                                                            >
                                                              {s.label}:<span className="font-normal ml-0.5 truncate max-w-[80px]">{s.value}</span>
                                                            </span>
                                                          ))}
                                                        </div>
                                                      )}
                                                      {/* Alertas de segmentación faltante */}
                                                      {segMissing.length > 0 && (
                                                        <div className="flex flex-wrap gap-1 mt-1">
                                                          {segMissing.map((s) => (
                                                            <span
                                                              key={s}
                                                              className="inline-flex items-center gap-0.5 rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[8px] font-semibold text-amber-700"
                                                              title={`Requerido: ${s}`}
                                                            >
                                                              ⚠ {s}
                                                            </span>
                                                          ))}
                                                        </div>
                                                      )}
                                                    </div>
                                                  ) : (
                                                    <span className="text-slate-400">—</span>
                                                  )}
                                                </td>

                                                {/* RUT Contraparte */}
                                                <td className={cls(lineTd, "text-xs")}>
                                                  {lineCp ? (
                                                    <div>
                                                      <span className="font-mono text-slate-700">{lineCp.identifier}</span>
                                                      <div className="text-[9px] text-slate-400 mt-0.5 truncate max-w-[120px]">{lineCp.name}</div>
                                                    </div>
                                                  ) : (
                                                    <span className="text-slate-300">—</span>
                                                  )}
                                                </td>

                                                {/* Glosa */}
                                                <td className={cls(lineTd, "text-slate-600")}>
                                                  {x.line_description || "—"}
                                                </td>

                                                {/* Debe */}
                                                <td className={cls(lineTd, "text-right font-mono font-semibold text-slate-800")}>
                                                  {Number(x.debit || 0) > 0 ? formatNumber(Number(x.debit), moneyDecimals) : ""}
                                                </td>

                                                {/* Haber */}
                                                <td className={cls(lineTd, "text-right font-mono font-semibold text-slate-800")}>
                                                  {Number(x.credit || 0) > 0 ? formatNumber(Number(x.credit), moneyDecimals) : ""}
                                                </td>
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="text-xs text-slate-500 italic">Sin líneas con monto.</div>
                                )}

                                {/* Documento de origen */}
                                {source && source !== "manual" && (
                                  <div>
                                    <div className="text-[10px] font-extrabold uppercase tracking-[0.06em] text-[#0b2b4f] mb-2">
                                      Documento de origen
                                    </div>
                                    {!Object.prototype.hasOwnProperty.call(sourceDocMap, d.header.id) ? (
                                      <div className="text-xs text-slate-500">Cargando información del origen…</div>
                                    ) : sourceDocMap[d.header.id] === null ? (
                                      <div className="text-xs text-slate-500 italic">No se encontró el documento de origen.</div>
                                    ) : (
                                      <SourceDocCard
                                        doc={sourceDocMap[d.header.id]}
                                        source={source}
                                        moneyDecimals={moneyDecimals}
                                      />
                                    )}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                  {/* ── Infinite scroll sentinel ── */}
                  <tr
                    ref={activeTab === "drafts" ? draftsSentinelRef : registeredSentinelRef}
                  >
                    <td colSpan={11} className="text-center py-3">
                      {(activeTab === "drafts" ? loadingMoreDrafts : loadingMoreRegistered) && (
                        <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                          <svg className="animate-spin h-3 w-3 text-slate-400" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                          </svg>
                          Cargando más…
                        </span>
                      )}
                    </td>
                  </tr>
                  </>
                  );
                })()}
              </tbody>
            </table>
          </div>
          </div>
          );
        })()
        }
        </div>
          </div>

          <div className="mt-6 text-center text-[12px] text-slate-500">
            ConciliaciónPro • Gestión Contable
          </div>
        </div>
      </div>

      {/* Modal crear tercero */}
      <CounterpartyCreateModal
        open={cpModal.open}
        companyId={companyId}
        initialIdentifier={cpModal.identifier}
        onClose={() => setCpModal({ open: false, identifier: "" })}
        onCreated={onCounterpartyCreated}
      />

      {/* ── Modal de filtros ── */}
      <AsientosFiltersModal
        open={filtersOpen}
        activeTab={activeTab}
        onClose={() => setFiltersOpen(false)}
        filters={filters}
        onChange={setFilters}
        onClear={() => setFilters(EMPTY_ASIENTOS_FILTERS)}
        resultCount={
          activeTab === "drafts" ? filteredDrafts.length : filteredRegistered.length
        }
      />

      {/* ── Modal de importación Excel ── */}
      <AsientosImportModal
        open={importOpen}
        canEdit={canEdit}
        importState={importState}
        issues={importModalIssues}
        previewRows={importPreviewRows}
        onClose={() => { setImportOpen(false); setImportState("idle"); }}
        onConfirm={confirmImportFromModal}
        onPickExcel={handlePickExcelForModal}
      />

      {/* ── Viewer: Doc Tributario / Otro Ingreso ── */}
      <TradeDocViewerModal
        open={!!tradeDocViewerId}
        onClose={() => setTradeDocViewerId(null)}
        tradeDocId={tradeDocViewerId}
        companyId={companyId || null}
      />

      {/* ── Viewer: Cobro / Ajuste ── */}
      <CobroViewerModal
        open={!!cobroViewerId}
        onClose={() => setCobroViewerId(null)}
        cobroId={cobroViewerId}
        companyId={companyId || null}
      />
    </div>
  );
}

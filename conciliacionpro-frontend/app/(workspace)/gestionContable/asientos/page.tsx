"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabaseClient";

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
  reference: string; // num_doc en Excel
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

  line_reference: string;

  // segmentación por código (teclado)
  cost_center_code: string;
  business_line_code: string;
  branch_code: string;

  // Item = SKU
  item_code: string;

  // impuestos por código/tasa (UI/validación). NO se insertan si tu tabla no los tiene.
  tax_code: string;
  tax_rate: string;

  details_open: boolean;

  // UI: marcar celdas con error sin ensuciar inputs
  cellErrors?: Partial<
    Record<
      | "account_code"
      | "line_description"
      | "debit"
      | "credit"
      | "counterparty_identifier"
      | "line_reference"
      | "cost_center_code"
      | "business_line_code"
      | "branch_code"
      | "item_code"
      | "tax_code"
      | "tax_rate",
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
  reference: string | null;
  currency_code: string;
  status: string;
  created_at?: string | null;
};

type DraftWithLines = {
  header: DraftHeaderRow;
  lines: Array<{
    line_no: number;
    account_node_id: string | null;
    line_description: string | null;
    line_reference: string | null;
    debit: number | null;
    credit: number | null;
    counterparty_id: string | null;
    cost_center_id: string | null;
    business_line_id?: string | null;
    branch_id?: string | null;
    item_id?: string | null;
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

    line_reference: "",

    cost_center_code: "",
    business_line_code: "",
    branch_code: "",
    item_code: "",

    tax_code: "",
    tax_rate: "",

    details_open: false,

    cellErrors: {},
  };
}

function makeLines(n: number): EntryLine[] {
  return Array.from({ length: n }, (_, i) => makeLine(i + 1));
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
    reference: "",
    currency_code: "—",
  });

  const [lines, setLines] = useState<EntryLine[]>(() => makeLines(20));
  const [issues, setIssues] = useState<ValidationIssue[]>([]);

  // Draft/post state
  const [entryId, setEntryId] = useState<string | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [posting, setPosting] = useState(false);

  // drafts list
  const [drafts, setDrafts] = useState<DraftWithLines[]>([]);
  const [loadingDrafts, setLoadingDrafts] = useState(false);

  // Excel
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Counterparty modal
  const [cpModalOpen, setCpModalOpen] = useState(false);
  const [cpForm, setCpForm] = useState<{
    identifier: string;
    name: string;
    type: Counterparty["type"];
    email: string;
    phone: string;
    address: string;
    notes: string;
    extraJson: string;
    is_active: boolean;
  }>({
    identifier: "",
    name: "",
    type: "OTRO",
    email: "",
    phone: "",
    address: "",
    notes: "",
    extraJson: "{}",
    is_active: true,
  });
  const [cpSaving, setCpSaving] = useState(false);

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
    | "counterparty_identifier"
    | "line_reference";

  const mainCols: MainCol[] = [
    "account_code",
    "line_description",
    "debit",
    "credit",
    "counterparty_identifier",
    "line_reference",
  ];

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
      const hasRef = !!String(l.line_reference || "").trim();
      return hasAmount || hasAcc || hasDesc || hasCp || hasRef;
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
    setLines(next.length ? renumber(next) : makeLines(20));
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
          const key = String(patch.counterparty_identifier || "").trim();
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
      | "line_reference"
      | "cost_center_code"
      | "business_line_code"
      | "branch_code"
      | "item_code"
      | "tax_code"
      | "tax_rate"
  ) {
    const raw = normalizeCode((lines[idx] as any)?.[field]);
    const val = field === "tax_rate" ? raw.replace(",", ".") : raw;
    updateLine(idx, { [field]: val } as any);
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
      const it = normalizeCode(l.item_code); // SKU

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

      if (reqIT) {
        if (!it)
          out.push({
            level: "error",
            code: "ITEM_REQUIRED",
            message: "Falta item_code (SKU).",
            lineNo: ln,
            field: "item_code",
          });
        else if (!itByCode[it])
          out.push({
            level: "error",
            code: "ITEM_NOT_FOUND",
            message: `Item no existe (SKU): "${it}"`,
            lineNo: ln,
            field: "item_code",
          });
      } else if (it && !itByCode[it]) {
        out.push({
          level: "warn",
          code: "ITEM_NOT_FOUND",
          message: `Item no existe (SKU): "${it}"`,
          lineNo: ln,
          field: "item_code",
        });
      }

      // impuestos (UI/validación)
      const txCode = normalizeCode(l.tax_code);
      const tx = txCode ? taxByCode[txCode] : null;
      const txRate = normalizeCode(l.tax_rate).replace(",", ".");
      if (txCode && !tx) {
        out.push({
          level: "error",
          code: "TAX_NOT_FOUND",
          message: `Impuesto no existe: "${txCode}"`,
          lineNo: ln,
          field: "tax_code",
        });
      }
      if (tx) {
        if (!txRate) {
          out.push({
            level: "error",
            code: "TAX_RATE_REQUIRED",
            message: "Falta tax_rate.",
            lineNo: ln,
            field: "tax_rate",
          });
        } else {
          const rates = taxRatesByTax[tx.id] || [];
          const match = rates.find((r) => Number(r.rate) === Number(txRate));
          if (!match) {
            out.push({
              level: "error",
              code: "TAX_RATE_NOT_FOUND",
              message: `Tasa no existe para ${txCode}: "${txRate}"`,
              lineNo: ln,
              field: "tax_rate",
            });
          }
        }
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
    setCpForm({
      identifier: identifier.trim(),
      name: "",
      type: "OTRO",
      email: "",
      phone: "",
      address: "",
      notes: "",
      extraJson: "{}",
      is_active: true,
    });
    setCpModalOpen(true);
  }

  async function saveCounterparty() {
    setCpSaving(true);
    try {
      if (!companyId) throw new Error("Falta companyId.");
      if (!cpForm.identifier.trim()) throw new Error("identifier requerido.");
      if (!cpForm.name.trim()) throw new Error("name requerido.");

      let extraObj: any = {};
      try {
        extraObj = cpForm.extraJson?.trim() ? JSON.parse(cpForm.extraJson) : {};
      } catch {
        throw new Error("extraJson no es JSON válido.");
      }

      const payload: any = {
        company_id: companyId,
        identifier: cpForm.identifier.trim(),
        name: cpForm.name.trim(),
        type: cpForm.type,
        is_active: !!cpForm.is_active,
        extra: extraObj,
      };

      if (cpForm.email.trim()) payload.email = cpForm.email.trim();
      if (cpForm.phone.trim()) payload.phone = cpForm.phone.trim();
      if (cpForm.address.trim()) payload.address = cpForm.address.trim();
      if (cpForm.notes.trim()) payload.notes = cpForm.notes.trim();

      const { data, error } = await supabase
        .from("counterparties")
        .insert(payload)
        .select(
          "id,company_id,identifier,name,type,is_active,email,phone,address,notes,extra"
        )
        .single();

      if (error) throw error;

      const created = data as any as Counterparty;
      setCounterpartyMap((m) => ({ ...m, [created.identifier]: created }));
      setCounterpartiesAvailable(true);

      setLines((prev) =>
        prev.map((l) => {
          if (normalizeCode(l.counterparty_identifier) !== created.identifier)
            return l;
          return { ...l, counterparty_name_resolved: created.name };
        })
      );

      setCpModalOpen(false);
      setIssues((prev) => [
        {
          level: "warn",
          code: "CP_CREATED",
          message: `Tercero creado: ${created.identifier} — ${created.name}`,
        },
        ...prev,
      ]);
    } catch (e: any) {
      setIssues([
        {
          level: "error",
          code: "CP_CREATE_FAILED",
          message: e?.message || "No se pudo crear el tercero.",
        },
      ]);
    } finally {
      setCpSaving(false);
    }
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

    // ✅ SKU (lo que escribe el usuario)
    const itemSku = normalizeCode(l.item_code);
    // ✅ convertir SKU -> UUID (items.id)
    const item = itemSku ? itByCode[itemSku] : null;

    return {
      counterparty_id: cp?.id ?? null,
      cost_center_id: cc?.id ?? null,
      business_line_id: cu?.id ?? null,
      branch_id: br?.id ?? null,

      // ✅ esto es lo correcto para DB (UUID)
      item_id: item?.id ?? null,
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
      reference: header.reference?.trim() || null,
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
        line_reference: l.line_reference?.trim() || null,
        debit: toNum(l.debit),
        credit: toNum(l.credit),

        counterparty_id: ids.counterparty_id,
        cost_center_id: ids.cost_center_id,
        business_line_id: ids.business_line_id,
        branch_id: ids.branch_id,
        item_id: ids.item_id,
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
      reference: "",
      currency_code: baseCurrency?.code || "CLP",
    });
    setLines(makeLines(20));
    setIssues([]);
  }

  /**
   * =======================
   * Drafts list (ver/editar/eliminar)
   * =======================
   */
  async function loadDrafts() {
    if (!companyId) return;
    setLoadingDrafts(true);
    try {
      const { data: hs, error: he } = await supabase
        .from("journal_entries")
        .select(
          "id,company_id,entry_date,description,reference,currency_code,status,created_at"
        )
        .eq("company_id", companyId)
        .eq("status", "DRAFT")
        .order("created_at", { ascending: false });

      if (he) throw he;

      const headers = ((hs as any) || []) as DraftHeaderRow[];

      // traer líneas de cada borrador
      const results: DraftWithLines[] = [];
      for (const h of headers.slice(0, 30)) {
        const { data: ls, error: le } = await supabase
          .from("journal_entry_lines")
          .select(
            "line_no,account_node_id,line_description,line_reference,debit,credit,counterparty_id,cost_center_id,business_line_id,branch_id,item_id,journal_entry_id"
          )
          .eq("journal_entry_id", h.id)
          .order("line_no", { ascending: true });

        if (le) throw le;

        results.push({
          header: h,
          lines: ((ls as any) || []) as any,
        });
      }

      setDrafts(results);
    } catch (e: any) {
      setIssues((prev) => [
        {
          level: "warn",
          code: "DRAFTS_LOAD_FAILED",
          message: e?.message || "No se pudieron cargar borradores.",
        },
        ...prev,
      ]);
    } finally {
      setLoadingDrafts(false);
    }
  }

  useEffect(() => {
    if (!companyId) return;
    loadDrafts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  async function openDraft(draftId: string) {
    if (!companyId) return;

    try {
      const { data: h, error: he } = await supabase
        .from("journal_entries")
        .select(
          "id,company_id,entry_date,description,reference,currency_code,status"
        )
        .eq("company_id", companyId)
        .eq("id", draftId)
        .single();

      if (he) throw he;

      const { data: ls, error: le } = await supabase
        .from("journal_entry_lines")
        .select(
          "line_no,account_node_id,line_description,line_reference,debit,credit,counterparty_id,cost_center_id,business_line_id,branch_id,item_id,journal_entry_id"
        )
        .eq("journal_entry_id", draftId)
        .order("line_no", { ascending: true });

      if (le) throw le;

      setEntryId(draftId);
      setHeader({
        entry_date: (h as any).entry_date,
        description: (h as any).description || "",
        reference: (h as any).reference || "",
        currency_code: (h as any).currency_code || (baseCurrency?.code || "CLP"),
      });

      const parsed: EntryLine[] = (((ls as any) || []) as any[]).map((r) => {
        const acc = r.account_node_id ? accById[r.account_node_id] : null;

        const cp = r.counterparty_id ? cpById[r.counterparty_id] : null;
        const cc = r.cost_center_id ? ccById[r.cost_center_id] : null;
        const cu = r.business_line_id ? cuById[r.business_line_id] : null;
        const br = r.branch_id ? brById[r.branch_id] : null;
        
        const item = r.item_id ? (itById[r.item_id] ?? null) : null;

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
          line_reference: r.line_reference ?? "",
          cost_center_code: cc?.code ?? "",
          business_line_code: cu?.code ?? "",
          branch_code: br?.code ?? "",
          item_code: item?.code ?? "",
          details_open: false,
          cellErrors: {},
        } as EntryLine;
      });

      const normalized = renumber(parsed);
      const filled =
        normalized.length >= 20
          ? normalized
          : [...normalized, ...makeLines(20 - normalized.length)].map((x, i) => ({
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
      const { error } = await supabase.rpc("post_journal_entry", {
        _entry_id: draftId,
      });
      if (error) throw error;
      await loadDrafts();

      setIssues((prev) => [
        {
          level: "warn",
          code: "POSTED",
          message: `Asiento contabilizado (${draftId}).`,
        },
        ...prev,
      ]);
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
          posted += 1;
        } catch (e: any) {
          failed.push(`${d.header.id.slice(0, 8)}…: ${e?.message || "error"}`);
        }
      }

      await loadDrafts();

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
    const ref = String(r.line_reference ?? "").trim();
    const headerish =
      normalizeCode(r.entry_date) ||
      normalizeCode(r.description) ||
      normalizeCode(r.num_doc);
    return !headerish && !acc && d <= 0 && c <= 0 && !desc && !cp && !ref;
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
      const hasRef = !!String(l.line_reference || "").trim();
      return hasAmount || hasAcc || hasDesc || hasCp || hasRef;
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
      const it = normalizeCode(l.item_code);

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

      if (reqIT) {
        if (!it)
          out.push({
            level: "error",
            code: "ITEM_REQUIRED",
            message: "Falta item_code (SKU).",
            lineNo: ln,
            field: "item_code",
          });
        else if (!itByCode[it])
          out.push({
            level: "error",
            code: "ITEM_NOT_FOUND",
            message: `Item no existe (SKU): "${it}"`,
            lineNo: ln,
            field: "item_code",
          });
      } else if (it && !itByCode[it]) {
        out.push({
          level: "warn",
          code: "ITEM_NOT_FOUND",
          message: `Item no existe (SKU): "${it}"`,
          lineNo: ln,
          field: "item_code",
        });
      }

      // impuestos (validación)
      const txCode = normalizeCode(l.tax_code);
      const tx = txCode ? taxByCode[txCode] : null;
      const txRate = normalizeCode(l.tax_rate).replace(",", ".");
      if (txCode && !tx) {
        out.push({
          level: "error",
          code: "TAX_NOT_FOUND",
          message: `Impuesto no existe: "${txCode}"`,
          lineNo: ln,
          field: "tax_code",
        });
      }
      if (tx) {
        if (!txRate) {
          out.push({
            level: "error",
            code: "TAX_RATE_REQUIRED",
            message: "Falta tax_rate.",
            lineNo: ln,
            field: "tax_rate",
          });
        } else {
          const rates = taxRatesByTax[tx.id] || [];
          const match = rates.find((r) => Number(r.rate) === Number(txRate));
          if (!match) {
            out.push({
              level: "error",
              code: "TAX_RATE_NOT_FOUND",
              message: `Tasa no existe para ${txCode}: "${txRate}"`,
              lineNo: ln,
              field: "tax_rate",
            });
          }
        }
      }
    });

    return out;
  }

  function parseExcelToEntries(wb: XLSX.WorkBook): ExcelEntryParsed[] {
    const sheetName = pickSheetPLANTILLA(wb);
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: "", range: 2 }) as any[];
    // range: 2 => arranca en la fila 3 (0-index), donde están los headers reales

    console.log("sheetName:", sheetName);
    console.log("rows length:", rows.length);
    console.log("first row keys:", rows[0] ? Object.keys(rows[0]) : "no rows");
    console.log("first row sample:", rows[0]);


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
      const reference = String(first.num_doc ?? "").trim();

      const hdr: EntryHeader = {
        entry_date,
        description,
        reference,
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
          line_reference: String(r.line_reference ?? "").trim(),
          cost_center_code: normalizeCode(r.cost_center_code),
          business_line_code: normalizeCode(r.business_line_code),
          branch_code: normalizeCode(r.branch_code),
          item_code: normalizeCode(r.item_code),
          tax_code: normalizeCode(r.tax_code),
          tax_rate: String(r.tax_rate ?? "").trim(),
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
      reference: e.header.reference?.trim() || null,
      currency_code: e.header.currency_code,
      status: "DRAFT",
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
      const hasRef = !!String(l.line_reference || "").trim();
      return hasAmount || hasAcc || hasDesc || hasCp || hasRef;
    });

    const linePayloads = used.map((l) => {
      const ids = resolveLineIdsForSave(l);
      return {
        company_id: companyId,
        journal_entry_id: entryIdNew,
        line_no: l.line_no,
        account_node_id: l.account_node_id,
        line_description: l.line_description?.trim() || null,
        line_reference: l.line_reference?.trim() || null,
        debit: toNum(l.debit),
        credit: toNum(l.credit),
        counterparty_id: ids.counterparty_id,
        cost_center_id: ids.cost_center_id,
        business_line_id: ids.business_line_id,
        branch_id: ids.branch_id,
        item_id: ids.item_id,
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
    <div className="p-6 space-y-4">
      {/* Sticky top bar */}
      <div className="top-3 z-20">
        <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h1 className="text-xl font-semibold text-slate-900">
                  Asientos Contables
                </h1>

                <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-700">
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5">
                    Moneda: <b className="ml-1">{header.currency_code}</b>
                  </span>

                  <span
                    className={cls(
                      "inline-flex items-center rounded-full px-2 py-0.5",
                      Math.abs(totals.diff) <= postingTolerance
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-rose-100 text-rose-800"
                    )}
                  >
                    Diff:{" "}
                    <b className="ml-1">
                      {formatNumber(totals.diff, moneyDecimals)}
                    </b>
                  </span>

                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5">
                    Tol:{" "}
                    <b className="ml-1">
                      {formatNumber(postingTolerance, moneyDecimals)}
                    </b>
                  </span>

                  <span
                    className={cls(
                      "inline-flex items-center rounded-full px-2 py-0.5",
                      errorCount
                        ? "bg-rose-100 text-rose-800"
                        : "bg-emerald-100 text-emerald-800"
                    )}
                  >
                    Errores: <b className="ml-1">{errorCount}</b>
                  </span>

                  {warnCount ? (
                    <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">
                      Avisos: <b className="ml-1">{warnCount}</b>
                    </span>
                  ) : null}

                  {entryId ? (
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5">
                      Draft ID: <b className="ml-1">{entryId.slice(0, 8)}…</b>
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  className="rounded-lg border px-3 py-2 text-sm hover:bg-slate-50"
                  onClick={downloadTemplate}
                >
                  Descargar Excel
                </button>
                
                <button
                  className={cls(
                    "rounded-lg border px-3 py-2 text-sm",
                    !canEdit ? "opacity-60 cursor-not-allowed" : "hover:bg-slate-50"
                  )}
                  disabled={!canEdit || savingDraft}
                  onClick={() => fileRef.current?.click()}
                  title="Importa uno o varios asientos (entry_key) directo a BORRADORES"
                >
                  {savingDraft
                    ? importState === "reading"
                      ? "Leyendo Excel..."
                      : importState === "parsing"
                      ? "Analizando Excel..."
                      : importState === "validating"
                      ? "Validando..."
                      : importState === "saving"
                      ? "Guardando..."
                      : "Procesando..."
                    : "Importar Excel"}
                </button>

                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={async (e) => {
                    const input = e.currentTarget;        // ✅ capturar el elemento
                    const f = input.files?.[0];           // ✅ leer desde el mismo input
                    if (!f) return;

                    try {
                      if (!canEdit) return;

                      setImportState("reading");          // ✅ nuevo (ver B)
                      setSavingDraft(true);

                      await importExcelToDrafts(f);       // tu función

                    } catch (err: any) {
                      setIssues([
                        {
                          level: "error",
                          code: "EXCEL_IMPORT_FAILED",
                          message: err?.message || "No se pudo importar el Excel.",
                        },
                      ]);
                    } finally {
                      setSavingDraft(false);
                      setImportState("idle");             // ✅ nuevo (ver B)
                      // ✅ reset seguro (sin usar e después del await)
                      input.value = "";
                    }
                  }}
                />


                <button
                  className="rounded-lg border px-3 py-2 text-sm hover:bg-slate-50"
                  onClick={() => runValidate(true)}
                >
                  Validar
                </button>

                <button
                  className={cls(
                    "rounded-lg border px-3 py-2 text-sm",
                    !canEdit ? "opacity-60 cursor-not-allowed" : "hover:bg-slate-50"
                  )}
                  disabled={!canEdit || savingDraft}
                  onClick={onSaveDraftClick}
                  title="Guarda como borrador (permite no cuadrar, pero no permite errores)"
                >
                  {savingDraft ? "Guardando..." : "Guardar borrador"}
                </button>

                <button
                  className={cls(
                    "rounded-lg px-3 py-2 text-sm text-white",
                    !canEdit || posting ? "bg-slate-400" : "bg-slate-900 hover:bg-slate-800"
                  )}
                  disabled={!canEdit || posting}
                  onClick={onPostClick}
                  title="Valida y contabiliza (requiere cuadrar)"
                >
                  {posting ? "Contabilizando..." : "Contabilizar"}
                </button>

                <button
                  className="rounded-lg border px-3 py-2 text-sm hover:bg-slate-50"
                  onClick={resetNew}
                >
                  Limpiar
                </button>
              </div>
            </div>

            {!counterpartiesAvailable && (
              <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900">
                ⚠️ Tabla de terceros no disponible. No se puede resolver nombre.
              </div>
            )}

            {!canEdit && (
              <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900">
                Modo solo lectura (role: {role || "—"}).
              </div>
            )}
          </div>

          {/* Mensajes arriba */}
          {issues.length > 0 ? (
            <div className="px-4 py-3 border-b bg-slate-50">
              <div className="space-y-1">
                {issues.slice(0, 10).map((x, i) => (
                  <div
                    key={i}
                    className={cls(
                      "rounded-md border px-2 py-1 text-sm",
                      x.level === "error"
                        ? "border-rose-200 bg-rose-50 text-rose-900"
                        : "border-amber-200 bg-amber-50 text-amber-900"
                    )}
                  >
                    <b>{x.level === "error" ? "Error" : "Aviso"}</b> • {x.code}
                    {x.lineNo ? (
                      <span className="ml-2 text-xs opacity-80">
                        line_no={x.lineNo}
                      </span>
                    ) : null}
                    <div className="text-sm">{x.message}</div>
                  </div>
                ))}
                {issues.length > 10 ? (
                  <div className="text-xs text-slate-600">
                    Mostrando 10 mensajes.
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* Cabecera */}
          <div className="px-4 py-3 grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-slate-600 font-medium">
                Fecha del asiento
              </label>
              <div className="text-[11px] text-slate-500">entry_date</div>
              <input
                type="date"
                className="mt-1 w-full rounded-lg border px-2 py-2 text-sm"
                value={header.entry_date}
                disabled={!canEdit}
                onChange={(e) =>
                  setHeader((h) => ({ ...h, entry_date: e.target.value }))
                }
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-xs text-slate-600 font-medium">
                Descripción general
              </label>
              <div className="text-[11px] text-slate-500">description</div>
              <input
                className="mt-1 w-full rounded-lg border px-2 py-2 text-sm"
                placeholder="Ej: Pago proveedor, Ajuste, Nómina..."
                value={header.description}
                disabled={!canEdit}
                onChange={(e) =>
                  setHeader((h) => ({ ...h, description: e.target.value }))
                }
              />
            </div>

            <div>
              <label className="text-xs text-slate-600 font-medium">
                Documento o referencia
              </label>
              <div className="text-[11px] text-slate-500">
                reference (num_doc)
              </div>
              <input
                className="mt-1 w-full rounded-lg border px-2 py-2 text-sm"
                placeholder="FAC-123 / OC-456"
                value={header.reference}
                disabled={!canEdit}
                onChange={(e) =>
                  setHeader((h) => ({ ...h, reference: e.target.value }))
                }
              />
            </div>
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-semibold text-slate-900">Líneas</h2>
              <div className="text-[11px] text-slate-500">
                Enter avanza • Shift+Enter retrocede • ↑/↓ cambia de fila •
                Ctrl+Enter abre/cierra detalles
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-sm text-slate-700">
                <b>debit:</b> {formatNumber(totals.debit, moneyDecimals)}{" "}
                <span className="mx-2 text-slate-300">|</span>{" "}
                <b>credit:</b> {formatNumber(totals.credit, moneyDecimals)}
              </div>

              <button
                className={cls(
                  "rounded-lg bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800",
                  !canEdit ? "opacity-60 cursor-not-allowed" : ""
                )}
                disabled={!canEdit}
                onClick={() => addMoreLines(10)}
                title="Agrega 10 filas"
              >
                + 10 líneas
              </button>
            </div>
          </div>
        </div>

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
        <datalist id="dl-it">
          {items.map((x) => (
            <option key={x.id} value={x.code}>
              {x.name}
            </option>
          ))}
        </datalist>
        <datalist id="dl-tax">
          {taxes.map((t) => (
            <option key={t.id} value={t.code}>
              {t.name}
            </option>
          ))}
        </datalist>

        {/* ✅ header fijo + body con scroll */}
        <div className="border-t border-slate-200">
          <div className="overflow-hidden pr-[12px]">
            <table className="w-full table-fixed border-collapse text-sm">
              <colgroup>
                <col className="w-[52px]" />
                <col className="w-[180px]" />
                <col className="w-[260px]" />
                <col className="w-[125px]" />
                <col className="w-[125px]" />
                <col className="w-[180px]" />
                <col className="w-[220px]" />
                <col className="w-[76px]" />
              </colgroup>

              <thead>
                <tr>
                  <th className={headerCell}>
                    line_no
                    <span className={headerSub}>N°</span>
                  </th>

                  <th className={headerCell}>
                    <b>Código cuenta contable</b>
                    <span className={headerSub}>account_code</span>
                  </th>

                  <th className={headerCell}>
                    <b>Glosa de la línea</b>
                    <span className={headerSub}>line_description</span>
                  </th>

                  <th className={headerCell}>
                    <b>Monto debe</b>
                    <span className={headerSub}>debit</span>
                  </th>

                  <th className={headerCell}>
                    <b>Monto haber</b>
                    <span className={headerSub}>credit</span>
                  </th>

                  <th className={headerCell}>
                    <b>ID tercero</b>
                    <span className={headerSub}>counterparty_identifier</span>
                  </th>

                  <th className={headerCell}>
                    <b>Referencia de la línea</b>
                    <span className={headerSub}>line_reference</span>
                  </th>

                  <th className={cls(headerCell, "text-right")}>
                    <span className={headerSub}> </span>
                  </th>
                </tr>
              </thead>
            </table>
          </div>

          <div className="max-h-[250px] overflow-auto">
            <table className="w-full table-fixed border-collapse text-sm">
              <colgroup>
                <col className="w-[52px]" />
                <col className="w-[180px]" />
                <col className="w-[260px]" />
                <col className="w-[125px]" />
                <col className="w-[125px]" />
                <col className="w-[180px]" />
                <col className="w-[220px]" />
                <col className="w-[76px]" />
              </colgroup>

              <tbody>
                {lines.map((l, idx) => {
                  const { acc, reqCC, reqCU, reqBR, reqIT, reqCP } =
                    getPolicyForLine(l);

                  const cpKey = normalizeCode(l.counterparty_identifier);
                  const cpFound = cpKey ? !!counterpartyMap[cpKey] : false;

                  const rowBg =
                    idx % 2 === 0 ? "bg-slate-50/80" : "bg-slate-100/50";

                  return (
                    <React.Fragment key={idx}>
                      <tr className={cls(rowBg, "hover:bg-sky-50/30")}>
                        <td className={cls(bodyCell, "text-slate-600 text-xs")}>
                          {l.line_no}
                        </td>

                        <td className={bodyCell}>
                          <input
                            ref={setCellRef(idx, "account_code") as any}
                            className={cellClass(l, "account_code")}
                            value={l.account_code}
                            disabled={!canEdit}
                            onChange={(e) =>
                              updateLine(idx, { account_code: e.target.value })
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
                              <span className="text-amber-700">no existe</span>
                            ) : (
                              "—"
                            )}
                          </div>
                        </td>

                        <td className={bodyCell}>
                          <input
                            ref={setCellRef(idx, "line_description") as any}
                            className={cellClass(l, "line_description")}
                            value={l.line_description}
                            disabled={!canEdit}
                            onChange={(e) =>
                              updateLine(idx, {
                                line_description: e.target.value,
                              })
                            }
                            onKeyDown={(e) =>
                              handleMainKeyDown(e, idx, "line_description")
                            }
                            placeholder="Ej: Pago proveedor"
                          />
                        </td>

                        <td className={bodyCell}>
                          <input
                            ref={setCellRef(idx, "debit") as any}
                            className={cls(cellClass(l, "debit"), "text-right")}
                            value={l.debit}
                            disabled={!canEdit}
                            onChange={(e) =>
                              updateLine(idx, { debit: e.target.value })
                            }
                            onKeyDown={(e) => handleMainKeyDown(e, idx, "debit")}
                            placeholder={
                              moneyDecimals
                                ? `0.${"0".repeat(Math.min(2, moneyDecimals))}`
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
                            disabled={!canEdit}
                            onChange={(e) =>
                              updateLine(idx, { credit: e.target.value })
                            }
                            onKeyDown={(e) =>
                              handleMainKeyDown(e, idx, "credit")
                            }
                            placeholder={
                              moneyDecimals
                                ? `0.${"0".repeat(Math.min(2, moneyDecimals))}`
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
                              disabled={!canEdit}
                              onChange={(e) =>
                                updateLine(idx, {
                                  counterparty_identifier: e.target.value,
                                })
                              }
                              onBlur={() =>
                                resolveTrimField(idx, "counterparty_identifier")
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
                            cpKey &&
                            !cpFound &&
                            counterpartiesAvailable ? (
                              <button
                                className="shrink-0 text-[11px] rounded border border-slate-200 px-1.5 py-0.5 hover:bg-white"
                                onClick={() => openCreateCounterparty(cpKey)}
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
                              <span className="text-amber-700">no existe</span>
                            ) : (
                              "—"
                            )}
                          </div>
                        </td>

                        <td className={bodyCell}>
                          <input
                            ref={setCellRef(idx, "line_reference") as any}
                            className={cellClass(l, "line_reference")}
                            value={l.line_reference}
                            disabled={!canEdit}
                            onChange={(e) =>
                              updateLine(idx, {
                                line_reference: e.target.value,
                              })
                            }
                            onBlur={() => resolveTrimField(idx, "line_reference")}
                            onKeyDown={(e) =>
                              handleMainKeyDown(e, idx, "line_reference")
                            }
                            placeholder="Ej: FAC-123-1"
                          />
                        </td>

                        <td className={cls(bodyCell, "text-right")}>
                          <div className="flex items-center justify-end gap-1 pr-1">
                            <button
                              className={cls(
                                "text-xs rounded border border-slate-200 px-2 py-1 hover:bg-white",
                                l.details_open ? "bg-slate-100" : ""
                              )}
                              onClick={() => toggleDetails(idx)}
                              tabIndex={-1}
                              title="Detalles"
                            >
                              {l.details_open ? "—" : "+"}
                            </button>

                            <button
                              className={cls(
                                "text-xs rounded border border-slate-200 px-2 py-1 hover:bg-white hover:text-rose-700",
                                !canEdit ? "opacity-60 cursor-not-allowed" : ""
                              )}
                              disabled={!canEdit}
                              onClick={() => removeLine(idx)}
                              tabIndex={-1}
                              title="Eliminar fila"
                            >
                              ✕
                            </button>
                          </div>

                          {reqCC || reqCU || reqBR || reqIT || reqCP ? (
                            <div className="mt-0.5 text-[10px] text-slate-500 text-right pr-1">
                              {reqCC ? "CC " : ""}
                              {reqCU ? "CU " : ""}
                              {reqBR ? "BR " : ""}
                              {reqIT ? "IT " : ""}
                              {reqCP ? "CP" : ""}
                            </div>
                          ) : null}
                        </td>
                      </tr>

                      {l.details_open ? (
                        <tr className="bg-slate-50">
                          <td className={bodyCell} colSpan={8}>
                            <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-2 p-2">
                              <div>
                                <div className="text-[11px] text-slate-600 font-medium">
                                  Centro de costo {reqCC ? "*" : ""}
                                </div>
                                <div className="text-[10px] text-slate-500">
                                  cost_center_code
                                </div>
                                <input
                                  className={cls(
                                    "w-full rounded border border-slate-200 bg-white px-2 py-1 text-sm",
                                    l.cellErrors?.cost_center_code
                                      ? "bg-rose-50/60"
                                      : "",
                                    reqCC ? "border-rose-300" : ""
                                  )}
                                  value={l.cost_center_code}
                                  disabled={!canEdit}
                                  onChange={(e) =>
                                    updateLine(idx, {
                                      cost_center_code: e.target.value,
                                    })
                                  }
                                  onBlur={() =>
                                    resolveTrimField(idx, "cost_center_code")
                                  }
                                  list="dl-cc"
                                />
                                <div className="text-[11px] text-slate-500 truncate">
                                  {resolvedLabelForDim(
                                    "cc",
                                    l.cost_center_code
                                  )}
                                </div>
                              </div>

                              <div>
                                <div className="text-[11px] text-slate-600 font-medium">
                                  Línea de negocio {reqCU ? "*" : ""}
                                </div>
                                <div className="text-[10px] text-slate-500">
                                  business_line_code
                                </div>
                                <input
                                  className={cls(
                                    "w-full rounded border border-slate-200 bg-white px-2 py-1 text-sm",
                                    l.cellErrors?.business_line_code
                                      ? "bg-rose-50/60"
                                      : "",
                                    reqCU ? "border-rose-300" : ""
                                  )}
                                  value={l.business_line_code}
                                  disabled={!canEdit}
                                  onChange={(e) =>
                                    updateLine(idx, {
                                      business_line_code: e.target.value,
                                    })
                                  }
                                  onBlur={() =>
                                    resolveTrimField(idx, "business_line_code")
                                  }
                                  list="dl-cu"
                                />
                                <div className="text-[11px] text-slate-500 truncate">
                                  {resolvedLabelForDim(
                                    "cu",
                                    l.business_line_code
                                  )}
                                </div>
                              </div>

                              <div>
                                <div className="text-[11px] text-slate-600 font-medium">
                                  Sucursal {reqBR ? "*" : ""}
                                </div>
                                <div className="text-[10px] text-slate-500">
                                  branch_code
                                </div>
                                <input
                                  className={cls(
                                    "w-full rounded border border-slate-200 bg-white px-2 py-1 text-sm",
                                    l.cellErrors?.branch_code
                                      ? "bg-rose-50/60"
                                      : "",
                                    reqBR ? "border-rose-300" : ""
                                  )}
                                  value={l.branch_code}
                                  disabled={!canEdit}
                                  onChange={(e) =>
                                    updateLine(idx, {
                                      branch_code: e.target.value,
                                    })
                                  }
                                  onBlur={() =>
                                    resolveTrimField(idx, "branch_code")
                                  }
                                  list="dl-br"
                                />
                                <div className="text-[11px] text-slate-500 truncate">
                                  {resolvedLabelForDim("br", l.branch_code)}
                                </div>
                              </div>

                              <div>
                                <div className="text-[11px] text-slate-600 font-medium">
                                  Ítem / Producto / Servicio {reqIT ? "*" : ""}
                                </div>
                                <div className="text-[10px] text-slate-500">
                                  item_code (SKU)
                                </div>
                                <input
                                  className={cls(
                                    "w-full rounded border border-slate-200 bg-white px-2 py-1 text-sm",
                                    l.cellErrors?.item_code
                                      ? "bg-rose-50/60"
                                      : "",
                                    reqIT ? "border-rose-300" : ""
                                  )}
                                  value={l.item_code}
                                  disabled={!canEdit}
                                  onChange={(e) =>
                                    updateLine(idx, { item_code: e.target.value })
                                  }
                                  onBlur={() => resolveTrimField(idx, "item_code")}
                                  list="dl-it"
                                  placeholder="Ej: V0547"
                                />
                                <div className="text-[11px] text-slate-500 truncate">
                                  {resolvedLabelForDim("it", l.item_code)}
                                </div>
                              </div>

                              <div>
                                <div className="text-[11px] text-slate-600 font-medium">
                                  Impuesto
                                </div>
                                <div className="text-[10px] text-slate-500">
                                  tax_code
                                </div>
                                <input
                                  className={cls(
                                    "w-full rounded border border-slate-200 bg-white px-2 py-1 text-sm",
                                    l.cellErrors?.tax_code ? "bg-rose-50/60" : ""
                                  )}
                                  value={l.tax_code}
                                  disabled={!canEdit}
                                  onChange={(e) =>
                                    updateLine(idx, { tax_code: e.target.value })
                                  }
                                  onBlur={() => resolveTrimField(idx, "tax_code")}
                                  list="dl-tax"
                                  placeholder="Ej: IVA"
                                />
                                <div className="text-[11px] text-slate-500 truncate">
                                  {l.tax_code.trim()
                                    ? taxByCode[normalizeCode(l.tax_code)]?.name ||
                                      "no existe"
                                    : ""}
                                </div>
                              </div>

                              <div>
                                <div className="text-[11px] text-slate-600 font-medium">
                                  Tasa (%)
                                </div>
                                <div className="text-[10px] text-slate-500">
                                  tax_rate
                                </div>
                                <input
                                  className={cls(
                                    "w-full rounded border border-slate-200 bg-white px-2 py-1 text-sm",
                                    l.cellErrors?.tax_rate ? "bg-rose-50/60" : ""
                                  )}
                                  value={l.tax_rate}
                                  disabled={!canEdit}
                                  onChange={(e) =>
                                    updateLine(idx, { tax_rate: e.target.value })
                                  }
                                  onBlur={() => resolveTrimField(idx, "tax_rate")}
                                  placeholder="Ej: 19"
                                  inputMode="decimal"
                                />
                                <div className="text-[11px] text-slate-500 truncate">
                                  {(() => {
                                    const tx = normalizeCode(l.tax_code)
                                      ? taxByCode[normalizeCode(l.tax_code)]
                                      : null;
                                    if (!tx) return "";
                                    const rates = taxRatesByTax[tx.id] || [];
                                    const match = rates.find(
                                      (r) =>
                                        Number(r.rate) ===
                                        Number(
                                          normalizeCode(l.tax_rate).replace(",", ".")
                                        )
                                    );
                                    return match
                                      ? "OK"
                                      : l.tax_rate.trim()
                                      ? "no existe"
                                      : "—";
                                  })()}
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
        </div>

        <div className="px-4 py-3 border-t bg-white flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm text-slate-700">
            <b>debit:</b> {formatNumber(totals.debit, moneyDecimals)}{" "}
            <span className="mx-2 text-slate-300">|</span>{" "}
            <b>credit:</b> {formatNumber(totals.credit, moneyDecimals)}
          </div>

          <div
            className={cls(
              "text-sm px-3 py-1 rounded-full",
              Math.abs(totals.diff) <= postingTolerance
                ? "bg-emerald-100 text-emerald-800"
                : "bg-rose-100 text-rose-800"
            )}
          >
            Diff: <b>{formatNumber(totals.diff, moneyDecimals)}</b>
          </div>
        </div>
      </div>

      {/* =======================
          BORRADORES (LISTA)
         ======================= */}
      <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-slate-900">Borradores</h2>
            <div className="text-[11px] text-slate-500">
              Ver, editar, eliminar o contabilizar borradores guardados.
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              className="rounded-lg border px-3 py-2 text-sm hover:bg-slate-50"
              onClick={loadDrafts}
            >
              {loadingDrafts ? "Cargando..." : "Refrescar"}
            </button>

            <button
              className={cls(
                "rounded-lg border px-3 py-2 text-sm",
                !canEdit || posting || loadingDrafts || drafts.length === 0
                  ? "opacity-60 cursor-not-allowed"
                  : "hover:bg-slate-50 hover:text-rose-700"
              )}
              disabled={!canEdit || posting || loadingDrafts || drafts.length === 0}
              onClick={deleteAllDrafts}
              title="Elimina todos los borradores"
            >
              Eliminar todos
            </button>

            <button
              className={cls(
                "rounded-lg px-3 py-2 text-sm text-white",
                !canEdit || posting
                  ? "bg-slate-400"
                  : "bg-slate-900 hover:bg-slate-800"
              )}
              disabled={!canEdit || posting || loadingDrafts || drafts.length === 0}
              onClick={postAllDrafts}
              title="Contabiliza todos los borradores que cuadren (los demás se omiten)"
            >
              {posting ? "Contabilizando..." : "Contabilizar todos"}
            </button>
          </div>
        </div>

        <div className="overflow-auto">
          {drafts.length === 0 ? (
            <div className="p-4 text-sm text-slate-600">No hay borradores.</div>
          ) : (
            <div className="divide-y">
              {drafts.map((d) => {
                const dl = d.lines.filter(
                  (x) => Number(x.debit || 0) > 0 || Number(x.credit || 0) > 0
                );
                const sumD = dl.reduce((s, x) => s + Number(x.debit || 0), 0);
                const sumC = dl.reduce((s, x) => s + Number(x.credit || 0), 0);
                const diff = sumD - sumC;

                return (
                  <div key={d.header.id} className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-sm text-slate-900 font-semibold">
                          {d.header.description || "—"}
                        </div>
                        <div className="text-xs text-slate-600 mt-0.5">
                          <b>Fecha:</b> {d.header.entry_date}{" "}
                          <span className="mx-2 text-slate-300">|</span>
                          <b>Ref:</b> {d.header.reference || "—"}{" "}
                          <span className="mx-2 text-slate-300">|</span>
                          <b>ID:</b> {d.header.id.slice(0, 8)}…
                        </div>
                        <div className="text-xs mt-1">
                          <span
                            className={cls(
                              "inline-flex items-center rounded-full px-2 py-0.5",
                              Math.abs(diff) <= postingTolerance
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-rose-100 text-rose-800"
                            )}
                          >
                            Diff:{" "}
                            <b className="ml-1">
                              {formatNumber(diff, moneyDecimals)}
                            </b>
                          </span>
                          <span className="ml-2 text-slate-500">
                            (debit {formatNumber(sumD, moneyDecimals)} / credit{" "}
                            {formatNumber(sumC, moneyDecimals)})
                          </span>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button
                          className="rounded-lg border px-3 py-2 text-sm hover:bg-slate-50"
                          onClick={() => openDraft(d.header.id)}
                        >
                          Editar
                        </button>

                        <button
                          className={cls(
                            "rounded-lg border px-3 py-2 text-sm",
                            !canEdit
                              ? "opacity-60 cursor-not-allowed"
                              : "hover:bg-slate-50 hover:text-rose-700"
                          )}
                          disabled={!canEdit}
                          onClick={() => deleteDraft(d.header.id)}
                        >
                          Eliminar
                        </button>

                        <button
                          className={cls(
                            "rounded-lg px-3 py-2 text-sm text-white",
                            !canEdit || posting
                              ? "bg-slate-400"
                              : "bg-slate-900 hover:bg-slate-800"
                          )}
                          disabled={!canEdit || posting}
                          onClick={() => postDraft(d.header.id)}
                          title="Contabiliza este borrador"
                        >
                          Contabilizar
                        </button>
                      </div>
                    </div>

                    {/* líneas usadas */}
                    {dl.length ? (
                      <div className="mt-3 overflow-x-auto">
                        <table className="w-full text-xs border-collapse">
                          <thead>
                            <tr className="bg-slate-50">
                              <th className="border px-2 py-1 text-left">N°</th>
                              <th className="border px-2 py-1 text-left">
                                Cuenta
                              </th>
                              <th className="border px-2 py-1 text-left">
                                Glosa
                              </th>
                              <th className="border px-2 py-1 text-right">
                                Debe
                              </th>
                              <th className="border px-2 py-1 text-right">
                                Haber
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {dl.slice(0, 8).map((x) => {
                              const acc = x.account_node_id
                                ? accById[x.account_node_id]
                                : null;
                              return (
                                <tr key={String(x.line_no)} className="bg-white">
                                  <td className="border px-2 py-1">
                                    {x.line_no}
                                  </td>
                                  <td className="border px-2 py-1">
                                    {acc ? (
                                      <span>
                                        <b>{acc.code}</b>{" "}
                                        <span className="text-slate-500">
                                          — {acc.name}
                                        </span>
                                      </span>
                                    ) : (
                                      <span className="text-slate-500">—</span>
                                    )}
                                  </td>
                                  <td className="border px-2 py-1">
                                    {x.line_description || "—"}
                                  </td>
                                  <td className="border px-2 py-1 text-right">
                                    {formatNumber(
                                      Number(x.debit || 0),
                                      moneyDecimals
                                    )}
                                  </td>
                                  <td className="border px-2 py-1 text-right">
                                    {formatNumber(
                                      Number(x.credit || 0),
                                      moneyDecimals
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        {dl.length > 8 ? (
                          <div className="text-[11px] text-slate-500 mt-1">
                            Mostrando 8 líneas (de {dl.length}).
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="mt-3 text-xs text-slate-500">
                        Sin líneas usadas.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Modal crear tercero */}
      <Modal
        open={cpModalOpen}
        title={`Crear tercero (${cpForm.identifier || "—"})`}
        onClose={() => setCpModalOpen(false)}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-slate-600">identifier</label>
              <div className="text-[11px] text-slate-500">RUT/NIT/Documento</div>
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                value={cpForm.identifier}
                onChange={(e) =>
                  setCpForm((p) => ({ ...p, identifier: e.target.value }))
                }
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-xs text-slate-600">name</label>
              <div className="text-[11px] text-slate-500">Razón social</div>
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                value={cpForm.name}
                onChange={(e) =>
                  setCpForm((p) => ({ ...p, name: e.target.value }))
                }
                placeholder="Ej: Comercial ABC SpA"
              />
            </div>

            <div>
              <label className="text-xs text-slate-600">type</label>
              <div className="text-[11px] text-slate-500">Tipo de tercero</div>
              <select
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                value={cpForm.type}
                onChange={(e) =>
                  setCpForm((p) => ({ ...p, type: e.target.value as any }))
                }
              >
                <option value="CLIENTE">CLIENTE</option>
                <option value="PROVEEDOR">PROVEEDOR</option>
                <option value="OTRO">OTRO</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-slate-600">email (opcional)</label>
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                value={cpForm.email}
                onChange={(e) =>
                  setCpForm((p) => ({ ...p, email: e.target.value }))
                }
                placeholder="contacto@empresa.com"
              />
            </div>

            <div>
              <label className="text-xs text-slate-600">phone (opcional)</label>
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                value={cpForm.phone}
                onChange={(e) =>
                  setCpForm((p) => ({ ...p, phone: e.target.value }))
                }
                placeholder="+56 9 ..."
              />
            </div>

            <div className="md:col-span-3">
              <label className="text-xs text-slate-600">address (opcional)</label>
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                value={cpForm.address}
                onChange={(e) =>
                  setCpForm((p) => ({ ...p, address: e.target.value }))
                }
                placeholder="Dirección"
              />
            </div>

            <div className="md:col-span-3">
              <label className="text-xs text-slate-600">notes (opcional)</label>
              <textarea
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm min-h-[80px]"
                value={cpForm.notes}
                onChange={(e) =>
                  setCpForm((p) => ({ ...p, notes: e.target.value }))
                }
                placeholder="Notas internas..."
              />
            </div>

            <div className="md:col-span-3">
              <label className="text-xs text-slate-600">extra (json)</label>
              <div className="text-[11px] text-slate-500">
                Se guarda en la columna extra (jsonb). Ej: {"{ \"tags\": [\"vip\"] }"}
              </div>
              <textarea
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-mono min-h-[90px]"
                value={cpForm.extraJson}
                onChange={(e) =>
                  setCpForm((p) => ({ ...p, extraJson: e.target.value }))
                }
              />
            </div>

            <div className="md:col-span-3 flex items-center gap-2">
              <input
                id="cp-active"
                type="checkbox"
                checked={cpForm.is_active}
                onChange={(e) =>
                  setCpForm((p) => ({ ...p, is_active: e.target.checked }))
                }
              />
              <label htmlFor="cp-active" className="text-sm text-slate-700">
                is_active
              </label>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              className="rounded-lg border px-3 py-2 text-sm hover:bg-slate-50"
              onClick={() => setCpModalOpen(false)}
            >
              Cancelar
            </button>
            <button
              className={cls(
                "rounded-lg px-3 py-2 text-sm text-white",
                cpSaving ? "bg-slate-400" : "bg-slate-900 hover:bg-slate-800"
              )}
              onClick={saveCounterparty}
              disabled={cpSaving}
            >
              {cpSaving ? "Guardando..." : "Crear"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

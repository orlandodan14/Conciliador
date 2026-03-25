"use client";

import React, { useEffect, useMemo, useState } from "react";

/** Helper local */
function cls(...a: Array<string | false | null | undefined>) {
  return a.filter(Boolean).join(" ");
}

function toNum(v: any) {
  const s = String(v ?? "").trim().replace(",", ".");
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

type DocType = "INVOICE" | "CREDIT_NOTE" | "DEBIT_NOTE";
type DocStatus = "BORRADOR" | "VIGENTE" | "CANCELADO";

export type DocHeader = {
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

  cancelled_at: string;
  cancel_reason: string;

  origin_doc_id: string | null;
  origin_label: string;

  origin_doc_type?: DocType | null;
  origin_fiscal_doc_code?: string | null;
  origin_issue_date?: string | null;
  origin_currency_code?: string | null;
  origin_net_taxable?: number | null;
  origin_net_exempt?: number | null;
  origin_tax_total?: number | null;
  origin_grand_total?: number | null;
  origin_balance?: number | null;
  origin_payment_status?: "PAGADO" | "PARCIAL" | "PENDIENTE" | null;
  origin_status?: DocStatus | "PAGADO" | "PARCIAL" | "PENDIENTE" | null;
};

export type FiscalDocTypeLite = {
  id: string;
  code: string;
  name: string;
  scope: "VENTA" | "COMPRA" | "AMBOS";
  is_active: boolean;
};

export type FiscalDocSettingsLite = {
  enabled: boolean;
  require_sales: boolean;
  default_sales_doc_type_id: string | null;

  default_sales_invoice_doc_type_id: string | null;
  default_sales_debit_note_doc_type_id: string | null;
  default_sales_credit_note_doc_type_id: string | null;
};

export type BranchLite = {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  is_default: boolean;
};

export type ItemLite = {
  id: string;
  sku: string;
  name: string;
  description?: string | null;
  price_sale: number;
  tax_exempt: boolean;
  is_active: boolean;
  business_line_id?: string | null;
};

export type DocLine = {
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

export type PaymentRow = {
  id: string;
  method: "EFECTIVO" | "TRANSFERENCIA" | "TARJETA" | "CHEQUE" | "OTRO";
  amount: string;

  card_kind: "" | "DEBITO" | "CREDITO";
  card_last4: string;
  auth_code: string;

  reference: string;
};

export type JournalLine = {
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

export type OriginDocLite = {
  id: string;
  doc_type?: DocType | null;
  fiscal_doc_code?: string | null;
  series?: string | null;
  number?: string | null;
  issue_date?: string | null;

  counterparty_identifier?: string | null;

  net_taxable?: number | null;
  net_exempt?: number | null;
  tax_total?: number | null;
  grand_total?: number | null;
  balance?: number | null;

  currency_code?: string | null;
  payment_status?: "PAGADO" | "PARCIAL" | "PENDIENTE" | null;
  status?: DocStatus | "PAGADO" | "PARCIAL" | "PENDIENTE" | null;
};

export type EditorTab = "CABECERA" | "LINEAS" | "PAGOS" | "ASIENTO";

export type Totals = {
  net_taxable: number;
  net_exempt: number;
  tax_total: number;
  grand_total: number;
  paid: number;
  balance: number;
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


/** Modal “shell” (solo para este componente) */
function EditorShellModal({
  open,
  title,
  subtitle,
  children,
  onClose,
  footer,
  widthClass = "w-[min(1200px,96vw)]",
  zIndexClass = "z-50",
  headerClassName,
  glowAClassName,
  glowBClassName,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
  footer?: React.ReactNode;
  widthClass?: string;
  zIndexClass?: string;
  headerClassName: string;
  glowAClassName: string;
  glowBClassName: string;
}) {
  if (!open) return null;
  

  return (
    <div className={cls("fixed inset-0", zIndexClass)}>
      <div className="absolute inset-0 bg-black/45" onClick={onClose} />
      <div className={cls("absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2", widthClass)}>
        <div className="flex h-[min(84vh,780px)] flex-col overflow-hidden rounded-[22px] bg-white shadow-xl ring-1 ring-black/5">
          <div className={cls("relative px-5 py-4", headerClassName)}>
            <div className={glowAClassName} />
            <div className={glowBClassName} />
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
                type="button"
              >
                ✕
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto overflow-x-hidden p-5">{children}</div>

          {footer ? <div className="shrink-0 border-t bg-white/95 backdrop-blur px-5 py-3">{footer}</div> : null}
        </div>
      </div>
    </div>
  );
}

export function TradeDocEditorModal(props: {
  // visibilidad
  open: boolean;
  onClose: () => void;
  mode?: "edit" | "view";

  // header visual (mantener tu theme)
  theme: {
    header: string;
    glowA: string;
    glowB: string;
    btnPrimary: string;
    btnSoft: string;
    card: string;
  };

  // formato
  title: string;
  subtitle?: string;
  widthClass?: string;
  zIndexClass?: string;

  // permisos / settings
  canEdit: boolean;
  showCancelButton: boolean;

  // data principal
  docId: string | null;
  header: DocHeader;
  setHeader: React.Dispatch<React.SetStateAction<DocHeader>>;
  headerBranchCode: string;
  setHeaderBranchCode: (code: string) => void;
  editorTab: EditorTab;
  setEditorTab: React.Dispatch<React.SetStateAction<EditorTab>>;

  fiscalCfg: FiscalDocSettingsLite;
  fiscalDocTypes: FiscalDocTypeLite[];
  baseCurrency: string;
  branches: BranchLite[];
  items: ItemLite[];

  businessLines: Array<{ id: string; code: string; name: string; is_active: boolean }>;

  counterpartiesAvailable: boolean;
  counterpartyMap: Record<string, any>; // CPCounterparty map (no tipamos aquí para evitar acoplar)
  openCreateCounterparty: (identifier: string) => void;
  resolveCounterpartyHeader: () => void;

  // origin
  needsOrigin: boolean;
  onOpenOriginSearch: () => void;
  clearOrigin: () => void;

  // líneas
  lines: DocLine[];
  setLines: React.Dispatch<React.SetStateAction<DocLine[]>>;
  addDocLine: () => void;
  removeDocLine: (idx: number) => void;
  updateDocLine: (idx: number, patch: Partial<DocLine>) => void;

  // pagos
  payments: PaymentRow[];
  addPaymentRow: () => void;
  removePaymentRow: (id: string) => void;
  updatePaymentRow: (id: string, patch: Partial<PaymentRow>) => void;

  // asiento
  journalLines: JournalLine[];
  addJournalLine: () => void;
  removeJournalLine: (idx: number) => void;
  updateJournalLine: (idx: number, patch: Partial<JournalLine>) => void;
  journalAutoMode: boolean;
  recalcJournalAuto: () => void;

  accounts: Array<{ id: string; code: string; name: string }>;
  accByCode: Record<string, { id: string; code: string; name: string }>;

  accountPolicyByCode: Record<
    string,
    {
      require_cu: boolean;
      require_suc: boolean;
    }
  >;

  // helpers visuales
  headerCell: string;
  headerSub: string;
  bodyCell: string;
  cellInputBase: string;
  cellInputRight: string;

  moneyDecimals: number;
  totals: Totals;

  badgeTypeClass: string;
  badgeStatusClass: string;

  // helpers de formato/cálculo
  formatNumber: (val: number, decimals: number) => string;
  calcLineAmounts: (l: DocLine) => { ex: number; af: number; iva: number; total: number; total_display: number };
  ellipsis: (s: string, max: number) => string;
  folioLabel: (series?: string | null, number?: string | null) => string;

      // mensajes
      messages: Array<{ level: "error" | "warn"; text: string }>;

      // acciones
      saveDraftMVP: () => Promise<void>;
      markAsVigenteMVP: () => Promise<void>;
      deleteDraftMVP: () => Promise<void>;
      cancelDocMVP: () => Promise<void>;
}) {
  const {
    open,
    onClose,
    mode = "edit",
    theme,
    title,
    subtitle = mode === "view" ? "Ventas • Consulta" : "Ventas • Editor",
    widthClass = "w-[min(1200px,96vw)]",
    zIndexClass = "z-50",
    canEdit,
    showCancelButton,
    docId,
    header,
    setHeader,
    headerBranchCode,
    setHeaderBranchCode,
    editorTab,
    setEditorTab,
    fiscalCfg,
    fiscalDocTypes,
    baseCurrency,
    branches,
    items,
    businessLines,
    counterpartiesAvailable,
    counterpartyMap,
    openCreateCounterparty,
    resolveCounterpartyHeader,
    needsOrigin,
    onOpenOriginSearch,
    clearOrigin,
    lines,
    addDocLine,
    removeDocLine,
    updateDocLine,
    payments,
    addPaymentRow,
    removePaymentRow,
    updatePaymentRow,
    journalLines,
    addJournalLine,
    removeJournalLine,
    updateJournalLine,
    journalAutoMode,
    recalcJournalAuto,
    accounts,
    accByCode,
    accountPolicyByCode,
    headerCell,
    headerSub,
    bodyCell,
    cellInputBase,
    cellInputRight,
    moneyDecimals,
    totals,
    badgeTypeClass,
    badgeStatusClass,
    formatNumber,
    calcLineAmounts,
    ellipsis,
    folioLabel,
    messages,
    saveDraftMVP,
    markAsVigenteMVP,
    deleteDraftMVP,
    cancelDocMVP,
  } = props;

  const tabs: Array<{ key: EditorTab; label: string; hint: string }> = useMemo(
    () => [
      { key: "CABECERA", label: "Cabecera", hint: "datos generales y estatus" },
      { key: "LINEAS", label: "Líneas", hint: "montos afecto/exento + IVA" },
      { key: "PAGOS", label: "Formas de pago", hint: "métodos y montos" },
      { key: "ASIENTO", label: "Asiento contable", hint: "cuentas y distribución" },
    ],
    []
  );

  const [headerBranchInput, setHeaderBranchInput] = useState(headerBranchCode || "");

  const fiscalDocTypeById = useMemo(() => {
    const map: Record<string, FiscalDocTypeLite> = {};
    for (const t of fiscalDocTypes) {
      map[t.id] = t;
    }
    return map;
  }, [fiscalDocTypes]);

  function getDefaultFiscalDocTypeIdByDocType(docType: DocType): string | null {
    if (docType === "INVOICE") {
      return (
        fiscalCfg.default_sales_invoice_doc_type_id ||
        fiscalCfg.default_sales_doc_type_id ||
        null
      );
    }

    if (docType === "DEBIT_NOTE") {
      return fiscalCfg.default_sales_debit_note_doc_type_id || null;
    }

    if (docType === "CREDIT_NOTE") {
      return fiscalCfg.default_sales_credit_note_doc_type_id || null;
    }

    return null;
  }

  function getDefaultFiscalDocCodeByDocType(docType: DocType): string {
    const defaultId = getDefaultFiscalDocTypeIdByDocType(docType);
    if (!defaultId) return "";

    const found = fiscalDocTypeById[defaultId];
    if (!found || !found.is_active) return "";

    return found.code || "";
  }

  useEffect(() => {
    setHeaderBranchInput(headerBranchCode || "");
  }, [headerBranchCode]);

  useEffect(() => {
    if (!open) return;
    if (!fiscalCfg.enabled) return;
    if (docId) return; // solo nuevo documento
    if (String(header.fiscal_doc_code || "").trim()) return;

    const defaultCode = getDefaultFiscalDocCodeByDocType(header.doc_type);
    if (!defaultCode) return;

    setHeader((h) => {
      if (String(h.fiscal_doc_code || "").trim()) return h;
      return {
        ...h,
        fiscal_doc_code: defaultCode,
      };
    });
  }, [
    open,
    docId,
    header.doc_type,
    header.fiscal_doc_code,
    fiscalCfg.enabled,
    fiscalCfg.default_sales_doc_type_id,
    fiscalCfg.default_sales_invoice_doc_type_id,
    fiscalCfg.default_sales_debit_note_doc_type_id,
    fiscalCfg.default_sales_credit_note_doc_type_id,
    fiscalDocTypeById,
    setHeader,
  ]);

  function setHeaderPatch(patch: Partial<DocHeader>) {
    setHeader((h) => ({ ...h, ...patch }));
  }

  const isViewMode = mode === "view";  

  function focusGridCell(grid: "lineas" | "asiento", row: number, col: number) {
    if (row < 0 || col < 0) return;

    const selector = [
      `[data-grid="${grid}"]`,
      `[data-row="${row}"]`,
      `[data-col="${col}"]`,
    ].join("");

    const el = document.querySelector(selector) as HTMLElement | null;
    if (!el) return;

    el.focus();

    if (el instanceof HTMLInputElement) {
      try {
        const len = el.value?.length ?? 0;
        el.setSelectionRange(len, len);
      } catch {}
    }
  }

  function handleGridKeyDown(
    e: React.KeyboardEvent<HTMLInputElement>,
    grid: "lineas" | "asiento",
    row: number,
    col: number
  ) {
    const key = e.key;

    if (key === "ArrowRight") {
      e.preventDefault();
      focusGridCell(grid, row, col + 1);
      return;
    }

    if (key === "ArrowLeft") {
      e.preventDefault();
      focusGridCell(grid, row, col - 1);
      return;
    }

    if (key === "ArrowDown") {
      e.preventDefault();
      focusGridCell(grid, row + 1, col);
      return;
    }

    if (key === "ArrowUp") {
      e.preventDefault();
      focusGridCell(grid, row - 1, col);
      return;
    }
  }
    const branchList = useMemo(
      () =>
        [...branches]
          .filter((b) => b.is_active)
          .sort((a, b) => {
            if (a.is_default && !b.is_default) return -1;
            if (!a.is_default && b.is_default) return 1;
            return `${a.code} ${a.name}`.localeCompare(`${b.code} ${b.name}`);
          }),
      [branches]
    );

    const itemList = useMemo(
      () =>
        [...items]
          .filter((i) => i.is_active)
          .sort((a, b) => `${a.sku} ${a.name}`.localeCompare(`${b.sku} ${b.name}`)),
      [items]
    );

    const itemBySku = useMemo(() => {
      const map: Record<string, ItemLite> = {};
      for (const it of itemList) {
        map[String(it.sku || "").trim().toUpperCase()] = it;
      }
      return map;
    }, [itemList]);
    
    const itemDatalistId = "dl-trade-doc-items";
    const journalAccountListId = "dl-journal-accounts";
    const branchDatalistId = "dl-trade-doc-branches";
    const businessLineDatalistId = "dl-trade-doc-business-lines";

    const journalSummary = useMemo(() => {
        const usedLines = journalLines.filter((l) => {
        return (
            String(l.account_code || "").trim() ||
            String(l.description || "").trim() ||
            String(l.debit || "").trim() ||
            String(l.credit || "").trim() ||
            String(l.business_line_code || "").trim() ||
            String(l.branch_code || "").trim()
        );
        });

        const debit = usedLines.reduce((s, l) => s + toNum(l.debit), 0);
        const credit = usedLines.reduce((s, l) => s + toNum(l.credit), 0);
        const diff = debit - credit;
        const absDiff = Math.abs(diff);
        const isBalanced = absDiff < 0.5;

        return {
        debit,
        credit,
        diff,
        absDiff,
        isBalanced,
        usedCount: usedLines.length,
        };
    }, [journalLines]);
    
    const usedJournalLines = useMemo(() => {
      return journalLines.filter((l) => {
        return (
          String(l.account_code || "").trim() ||
          String(l.description || "").trim() ||
          String(l.debit || "").trim() ||
          String(l.credit || "").trim() ||
          String(l.business_line_code || "").trim() ||
          String(l.branch_code || "").trim()
        );
      });
    }, [journalLines]);

    const seatHasData = usedJournalLines.length > 0;

    const documentLinesTotal = useMemo(() => {
      return lines.reduce((sum, l) => {
        const { total } = calcLineAmounts(l);
        return sum + Number(total || 0);
      }, 0);
    }, [lines, calcLineAmounts]);

    const seatValidation = useMemo(() => {
      if (!seatHasData) {
        return {
          hasData: false,
          hasErrors: false,
          debit: 0,
          credit: 0,
          diff: 0,
          absDiff: 0,
          documentTotal: documentLinesTotal,
          journalTotal: 0,
          journalVsDocDiff: 0,
          missingSucRows: [] as number[],
          missingCuRows: [] as number[],
          unbalanced: false,
          totalMismatch: false,
          messages: [] as string[],
        };
      }

      const debit = usedJournalLines.reduce((s, l) => s + toNum(l.debit), 0);
      const credit = usedJournalLines.reduce((s, l) => s + toNum(l.credit), 0);
      const diff = debit - credit;
      const absDiff = Math.abs(diff);

      const journalTotal = credit;
      const journalVsDocDiff = journalTotal - documentLinesTotal;
      const absJournalVsDocDiff = Math.abs(journalVsDocDiff);

      const missingSucRows: number[] = [];
      const missingCuRows: number[] = [];

      usedJournalLines.forEach((l, visibleIdx) => {
        const accountCode = String(l.account_code || "").trim();
        if (!accountCode) return;

        const policy = accountPolicyByCode[accountCode];
        if (!policy) return;

        if (policy.require_suc && !String(l.branch_code || "").trim()) {
          missingSucRows.push(visibleIdx);
        }

        if (policy.require_cu && !String(l.business_line_code || "").trim()) {
          missingCuRows.push(visibleIdx);
        }
      });

      const messages: string[] = [];

      if (absDiff >= 0.5) {
        messages.push(
          `Debe y Haber no cuadran. Diferencia: ${formatNumber(absDiff, moneyDecimals)}.`
        );
      }

      if (absJournalVsDocDiff >= 0.5) {
        messages.push(
          `El total del asiento no coincide con el total del documento. Diferencia: ${formatNumber(absJournalVsDocDiff, moneyDecimals)}.`
        );
      }

      if (missingSucRows.length > 0) {
        messages.push(
          `Hay ${missingSucRows.length} línea(s) con cuentas que exigen sucursal y no tienen SUC.`
        );
      }

      if (missingCuRows.length > 0) {
        messages.push(
          `Hay ${missingCuRows.length} línea(s) con cuentas que exigen centro de utilidad y no tienen CU.`
        );
      }

      return {
        hasData: true,
        hasErrors: messages.length > 0,
        debit,
        credit,
        diff,
        absDiff,
        documentTotal: documentLinesTotal,
        journalTotal,
        journalVsDocDiff,
        missingSucRows,
        missingCuRows,
        unbalanced: absDiff >= 0.5,
        totalMismatch: absJournalVsDocDiff >= 0.5,
        messages,
      };
    }, [
      seatHasData,
      usedJournalLines,
      documentLinesTotal,
      accountPolicyByCode,
      formatNumber,
      moneyDecimals,
    ]);

    async function handleRegisterDirect() {
      if (!canEdit || seatValidation.hasErrors) return;
      await markAsVigenteMVP();
    }

    const counterpartyIdentifierFilled = Boolean(
      String(header.counterparty_identifier || "").trim()
    );

    const canSearchOriginDoc =
      canEdit &&
      (
        header.doc_type === "INVOICE" ||
        counterpartyIdentifierFilled
      );


  return (
    <EditorShellModal
      open={open}
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      widthClass={widthClass}
      zIndexClass={zIndexClass}
      headerClassName={theme.header}
      glowAClassName={theme.glowA}
      glowBClassName={theme.glowB}
      footer={
        isViewMode ? (
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2 text-xs text-slate-700">
              <span className="inline-flex items-center rounded-full bg-sky-100 px-2 py-0.5 font-semibold text-sky-800">
                Solo visualización
              </span>

              <span className={cls("inline-flex items-center rounded-full px-2 py-0.5", badgeTypeClass)}>
                Tipo: <b className="ml-1">{header.doc_type}</b>
              </span>

              <span className={cls("inline-flex items-center rounded-full px-2 py-0.5", badgeStatusClass)}>
                Estatus: <b className="ml-1">{header.status}</b>
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button className={theme.btnSoft} onClick={onClose} type="button">
                Cerrar
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2 text-xs text-slate-700">
              <span className={cls("inline-flex items-center rounded-full px-2 py-0.5", badgeTypeClass)}>
                Tipo: <b className="ml-1">{header.doc_type}</b>
              </span>
              <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5">
                Cód: <b className="ml-1">{header.fiscal_doc_code || "—"}</b>
              </span>
              <span className={cls("inline-flex items-center rounded-full px-2 py-0.5", badgeStatusClass)}>
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
              <button className={theme.btnSoft} onClick={onClose} type="button">
                Cerrar
              </button>

              <button
                className={cls(
                  theme.btnSoft,
                  (!canEdit || seatValidation.hasErrors) && "opacity-60 cursor-not-allowed"
                )}
                disabled={!canEdit || seatValidation.hasErrors}
                onClick={saveDraftMVP}
                type="button"
                title={
                  seatValidation.hasErrors
                    ? "Corrige las validaciones del asiento antes de guardar."
                    : "Guardar borrador"
                }
              >
                Guardar borrador
              </button>

              <button
                className={cls(
                  theme.btnPrimary,
                  (!canEdit || seatValidation.hasErrors) && "opacity-60 cursor-not-allowed"
                )}
                disabled={!canEdit || seatValidation.hasErrors}
                onClick={handleRegisterDirect}
                type="button"
                title={
                  seatValidation.hasErrors
                    ? "Corrige las validaciones del asiento antes de registrar."
                    : "Registrar y contabilizar"
                }
              >
                Registrar
              </button>

              <button
                className={cls(
                  "rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-700",
                  (!canEdit || !docId) && "opacity-60 cursor-not-allowed"
                )}
                disabled={!canEdit || !docId}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void deleteDraftMVP();
                }}
                type="button"
                title={!docId ? "Este documento aún no existe en la base de datos." : "Eliminar borrador"}
              >
                Eliminar
              </button>

              {showCancelButton ? (
                <button className={theme.btnSoft} onClick={cancelDocMVP} type="button">
                  Cancelar
                </button>
              ) : null}
            </div>
          </div>
        )
      }
    >
            {messages.length ? (
              <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-3">
                <div className="space-y-2">
                  {messages.slice(0, 4).map((m, i) => (
                    <div
                      key={i}
                      className={cls(
                        "rounded-xl border px-3 py-2 text-sm",
                        m.level === "error"
                          ? "border-rose-200 bg-rose-50 text-rose-900"
                          : "border-amber-200 bg-amber-50 text-amber-900"
                      )}
                    >
                      {m.text}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}


            <datalist id={journalAccountListId}>
              {accounts.map((a) => (
                <option key={a.id} value={a.code}>
                  {a.name}
                </option>
              ))}
            </datalist>

            <datalist id={itemDatalistId}>
              {itemList.map((it) => (
                <option key={it.id} value={it.sku}>
                  {it.name}
                </option>
              ))}
            </datalist>

            <datalist id={branchDatalistId}>
              {branchList.map((b) => (
                <option key={b.id} value={b.code}>
                  {b.name}
                </option>
              ))}
            </datalist>

            <datalist id={businessLineDatalistId}>
              {businessLines
                .filter((x) => x.is_active)
                .sort((a, b) => `${a.code} ${a.name}`.localeCompare(`${b.code} ${b.name}`))
                .map((bu) => (
                  <option key={bu.id} value={bu.code}>
                    {bu.name}
                  </option>
                ))}
            </datalist>
            
      {/* Tabs */}
      <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-2">
        <div className="flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                setEditorTab(t.key);
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
              <div className="md:col-span-4">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
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
                          const defaultFiscalCode = fiscalCfg.enabled
                            ? getDefaultFiscalDocCodeByDocType(v)
                            : header.fiscal_doc_code;

                          if (v === "CREDIT_NOTE" || v === "DEBIT_NOTE") {
                            setHeaderPatch({
                              doc_type: v,
                              fiscal_doc_code: defaultFiscalCode,
                            });
                          } else {
                            setHeaderPatch({
                              doc_type: v,
                              fiscal_doc_code: defaultFiscalCode,
                              origin_doc_id: null,
                              origin_label: "",
                              origin_doc_type: null,
                              origin_fiscal_doc_code: null,
                              origin_issue_date: null,
                              origin_currency_code: null,
                              origin_net_taxable: null,
                              origin_net_exempt: null,
                              origin_tax_total: null,
                              origin_grand_total: null,
                              origin_balance: null,
                              origin_payment_status: null,
                              origin_status: null,
                            });
                          }
                        }}
                      >
                        <option value="INVOICE">DOCUMENTO (INGRESO)</option>
                        <option value="DEBIT_NOTE">NOTA DE DÉBITO (INGRESO)</option>
                        <option value="CREDIT_NOTE">NOTA DE CRÉDITO (REBAJA)</option>
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

              <div className="md:col-span-4">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                  <div className="md:col-span-3">
                    <label className="block">
                      <LabelInline label="Sucursal" field="branch_id" />
                    </label>
                    <input
                      className="mt-1 w-full rounded-lg border px-2 py-2 text-sm"
                      disabled={!canEdit}
                      value={headerBranchInput}
                      list={branchDatalistId}
                      onChange={(e) => setHeaderBranchInput(e.target.value)}
                      onBlur={(e) => {
                        const code = String(e.target.value || "").trim();
                        setHeaderBranchInput(code);
                        setHeaderBranchCode(code);
                      }}
                      placeholder="Código sucursal"
                    />
                    <div className="mt-1 text-[11px] text-slate-500 truncate">
                      {headerBranchInput.trim()
                        ? branchList.find((b) => b.code === headerBranchInput.trim())?.name || "—"
                        : "—"}
                    </div>
                  </div>

                  <div className="md:col-span-5">
                    <label className="block">
                      <LabelInline label="Folio" field="number" />
                    </label>
                    <input
                      className="mt-1 w-full rounded-lg border px-2 py-2 text-sm"
                      disabled={!canEdit}
                      value={header.number}
                      onChange={(e) => setHeaderPatch({ number: e.target.value })}
                      placeholder="000123 / UUID / Folio fiscal largo (MX)"
                    />
                  </div>

                  <div className="md:col-span-4">
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
                </div>
              </div>

              <div>
                <label className="block">
                  <LabelInline label="RUT/NIT/RFC" field="counterparty_identifier" />
                </label>

                {(() => {
                  const raw = header.counterparty_identifier || "";
                  const key = String(raw || "").trim().toUpperCase().replace(/[^0-9A-Z]+/g, "");
                  const found = key ? Boolean(counterpartyMap[key]) : false;

                  return (
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        className="w-full rounded-lg border px-2 py-2 text-sm"
                        disabled={!canEdit}
                        value={header.counterparty_identifier}
                        onChange={(e) => setHeaderPatch({ counterparty_identifier: e.target.value })}
                        onBlur={resolveCounterpartyHeader}
                        placeholder="Identificador"
                      />

                      {canEdit && key && !found && counterpartiesAvailable ? (
                        <button
                          type="button"
                          className="shrink-0 rounded-lg border px-3 py-2 text-sm hover:bg-slate-50"
                          onClick={() => openCreateCounterparty(raw)}
                          title="Crear tercero"
                        >
                          Crear
                        </button>
                      ) : null}
                    </div>
                  );
                })()}
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

            </div>

            {/* ORIGEN NC/ND */}
            {needsOrigin ? (
              <div className="px-4 pb-4">
                <div className="rounded-2xl border bg-slate-50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">
                        Documento origen (obligatorio para NC/ND)
                      </div>
                      <div className="text-[11px] text-slate-600">
                        La nota solo puede afectar documentos del mismo RUT/ID de la cabecera.
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        className={cls(
                          theme.btnSoft,
                          !canSearchOriginDoc ? "opacity-60 cursor-not-allowed" : "hover:bg-white"
                        )}
                        disabled={!canSearchOriginDoc}
                        type="button"
                        onClick={onOpenOriginSearch}
                        title={
                          !counterpartyIdentifierFilled && header.doc_type !== "INVOICE"
                            ? "Primero ingresa el RUT/NIT/RFC de la contraparte para buscar el documento origen."
                            : header.origin_doc_id
                            ? "Cambiar documento origen"
                            : "Buscar documento origen"
                        }
                      >
                        {header.origin_doc_id ? "Cambiar documento" : "Buscar documento"}
                      </button>

                      {!counterpartyIdentifierFilled && header.doc_type !== "INVOICE" ? (
                        <div className="mt-2 text-[11px] text-amber-700">
                          Primero debes ingresar el RUT/NIT/RFC de la contraparte para habilitar la búsqueda del documento origen.
                        </div>
                      ) : null}

                      {header.origin_doc_id ? (
                        <button
                          className={cls(
                            theme.btnSoft,
                            !canEdit ? "opacity-60 cursor-not-allowed" : "hover:bg-white hover:text-rose-700"
                          )}
                          disabled={!canEdit}
                          type="button"
                          onClick={clearOrigin}
                        >
                          Quitar
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {!header.origin_doc_id ? (
                    <div className="mt-3 rounded-xl border border-dashed bg-white px-4 py-4 text-sm text-slate-500">
                      Sin documento origen asignado.
                    </div>
                  ) : (
                    <div className="mt-3 rounded-xl border bg-white overflow-hidden">
                      <div className="border-t border-slate-200 overflow-x-hidden">
                        <div className="overflow-hidden">
                          <table className="w-full table-fixed border-collapse text-sm">
                            <colgroup>
                              <col style={{ width: "13%" }} />
                              <col style={{ width: "10%" }} />
                              <col style={{ width: "22%" }} />
                              <col style={{ width: "13%" }} />
                              <col style={{ width: "13%" }} />
                              <col style={{ width: "13%" }} />
                              <col style={{ width: "16%" }} />
                            </colgroup>
                            <thead>
                              <tr>
                                <th className={headerCell}>
                                  <b>Emisión</b>
                                  <span className={headerSub}>issue_date</span>
                                </th>
                                <th className={headerCell}>
                                  <b>Cód</b>
                                  <span className={headerSub}>fiscal</span>
                                </th>
                                <th className={headerCell}>
                                  <b>Folio</b>
                                  <span className={headerSub}>serie / número</span>
                                </th>
                                <th className={cls(headerCell, "text-right")}>
                                  <b>Afecto</b>
                                  <span className={headerSub}>net</span>
                                </th>
                                <th className={cls(headerCell, "text-right")}>
                                  <b>Exento</b>
                                  <span className={headerSub}>ex</span>
                                </th>
                                <th className={cls(headerCell, "text-right")}>
                                  <b>IVA</b>
                                  <span className={headerSub}>iva</span>
                                </th>
                                <th className={cls(headerCell, "text-right")}>
                                  <b>Total</b>
                                  <span className={headerSub}>grand_total</span>
                                </th>
                              </tr>
                            </thead>
                          </table>
                        </div>

                        <div className="overflow-x-hidden">
                          <table className="w-full table-fixed border-collapse text-sm">
                            <colgroup>
                              <col style={{ width: "13%" }} />
                              <col style={{ width: "10%" }} />
                              <col style={{ width: "22%" }} />
                              <col style={{ width: "13%" }} />
                              <col style={{ width: "13%" }} />
                              <col style={{ width: "13%" }} />
                              <col style={{ width: "16%" }} />
                            </colgroup>

                            <tbody>
                              <tr className="bg-slate-50/80 hover:bg-sky-50/30">
                                <td className={cls(bodyCell, "text-xs")}>
                                  {header.origin_issue_date || "—"}
                                </td>

                                <td className={cls(bodyCell, "font-semibold")}>
                                  {header.origin_fiscal_doc_code || "—"}
                                </td>

                                <td className={bodyCell}>
                                  <div
                                    className="truncate font-medium"
                                    title={header.origin_label || "Sin folio"}
                                  >
                                    {header.origin_label || "Sin folio"}
                                  </div>
                                </td>

                                <td className={cls(bodyCell, "text-right")}>
                                  {header.origin_net_taxable != null
                                    ? formatNumber(Number(header.origin_net_taxable || 0), moneyDecimals)
                                    : "—"}
                                </td>

                                <td className={cls(bodyCell, "text-right")}>
                                  {header.origin_net_exempt != null
                                    ? formatNumber(Number(header.origin_net_exempt || 0), moneyDecimals)
                                    : "—"}
                                </td>

                                <td className={cls(bodyCell, "text-right")}>
                                  {header.origin_tax_total != null
                                    ? formatNumber(Number(header.origin_tax_total || 0), moneyDecimals)
                                    : "—"}
                                </td>

                                <td className={cls(bodyCell, "text-right font-semibold")}>
                                  {header.origin_grand_total != null
                                    ? formatNumber(Number(header.origin_grand_total || 0), moneyDecimals)
                                    : "—"}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div className="border-t bg-slate-50 px-4 py-3">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
                          <div>
                            <div className="text-[11px] text-slate-500">Tipo documento</div>
                            <div className="font-medium text-slate-900">
                              {header.origin_doc_type || "—"}
                            </div>
                          </div>

                          <div>
                            <div className="text-[11px] text-slate-500">Estado documento</div>
                            <div className="font-medium text-slate-900">
                              {header.origin_status || "—"}
                            </div>
                          </div>

                          <div>
                            <div className="text-[11px] text-slate-500">Condición pago</div>
                            <div className="font-medium text-slate-900">
                              {header.origin_payment_status || "—"}
                            </div>
                          </div>

                          <div>
                            <div className="text-[11px] text-slate-500">Moneda</div>
                            <div className="font-medium text-slate-900">
                              {header.origin_currency_code || "—"}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="border-t bg-amber-50 px-4 py-2 text-[11px] text-amber-900">
                        Luego validaremos monto de la NC/ND contra el saldo disponible del documento origen.
                      </div>
                    </div>
                  )}
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
            </div>

            <div className="flex items-center gap-3">
              <div className="text-sm text-slate-700">
                <b>Afecto:</b> {formatNumber(totals.net_taxable, moneyDecimals)} <span className="mx-2 text-slate-300">|</span>
                <b>Exento:</b> {formatNumber(totals.net_exempt, moneyDecimals)} <span className="mx-2 text-slate-300">|</span>
                <b>IVA:</b> {formatNumber(totals.tax_total, moneyDecimals)} <span className="mx-2 text-slate-300">|</span>
                <b>Total:</b> {formatNumber(totals.grand_total, moneyDecimals)}
              </div>

              <button
                className={cls(theme.btnPrimary, !canEdit ? "opacity-60 cursor-not-allowed" : "")}
                disabled={!canEdit}
                onClick={addDocLine}
                type="button"
              >
                + Línea
              </button>
            </div>
          </div>

          <div className="border-t border-slate-200 overflow-x-hidden">
            <div className="overflow-hidden">
              <table className="w-full table-fixed border-collapse text-sm">
                <colgroup>
                  <col style={{ width: "4%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "17%" }} />
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
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "17%" }} />
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
                    const { ex, af, iva, total_display } = calcLineAmounts(l);
                    const rowBg = idx % 2 === 0 ? "bg-slate-50/80" : "bg-slate-100/50";

                    return (
                      <tr key={idx} className={cls(rowBg, "hover:bg-sky-50/30")}>
                        <td className={cls(bodyCell, "text-slate-600 text-xs text-center")}>{l.line_no}</td>

                        <td className={bodyCell}>
                          <input
                            className={cellInputBase}
                            value={l.sku}
                            disabled={!canEdit}
                            list={itemDatalistId}
                            data-grid="lineas"
                            data-row={idx}
                            data-col={0}
                            onKeyDown={(e) => handleGridKeyDown(e, "lineas", idx, 0)}
                            onChange={(e) => {
                              const rawSku = e.target.value;
                              const key = String(rawSku || "").trim().toUpperCase();
                              const found = itemBySku[key];

                              if (found) {
                                updateDocLine(idx, {
                                  item_id: found.id,
                                  sku: found.sku,
                                  description: found.description || found.name || "",
                                  unit_price: String(found.price_sale ?? ""),
                                  is_taxable: !found.tax_exempt,
                                  tax_rate: found.tax_exempt ? "0" : "19",
                                });
                              } else {
                                updateDocLine(idx, {
                                  item_id: null,
                                  sku: rawSku,
                                });
                              }
                            }}
                            onBlur={(e) => {
                              const key = String(e.target.value || "").trim().toUpperCase();
                              const found = itemBySku[key];
                              if (!found) return;

                              updateDocLine(idx, {
                                item_id: found.id,
                                sku: found.sku,
                                description: found.description || found.name || "",
                                unit_price: String(found.price_sale ?? ""),
                                is_taxable: !found.tax_exempt,
                                tax_rate: found.tax_exempt ? "0" : "19",
                              });
                            }}
                            placeholder="SKU"
                          />
                        </td>

                        <td className={bodyCell}>
                          <input
                            className={cellInputBase}
                            value={l.description}
                            disabled={!canEdit}
                            data-grid="lineas"
                            data-row={idx}
                            data-col={1}
                            onKeyDown={(e) => handleGridKeyDown(e, "lineas", idx, 1)}
                            onChange={(e) => updateDocLine(idx, { description: e.target.value })}
                            placeholder="Descripción"
                          />
                        </td>

                        <td className={bodyCell}>
                          <input
                            className={cls(cellInputBase, cellInputRight)}
                            value={l.qty}
                            disabled={!canEdit}
                            data-grid="lineas"
                            data-row={idx}
                            data-col={2}
                            onKeyDown={(e) => handleGridKeyDown(e, "lineas", idx, 2)}
                            onChange={(e) => updateDocLine(idx, { qty: e.target.value })}
                            inputMode="decimal"
                            placeholder="1"
                          />
                        </td>

                        <td className={bodyCell}>
                          <input
                            className={cls(cellInputBase, cellInputRight)}
                            value={l.unit_price}
                            disabled={!canEdit}
                            data-grid="lineas"
                            data-row={idx}
                            data-col={3}
                            onKeyDown={(e) => handleGridKeyDown(e, "lineas", idx, 3)}
                            onChange={(e) => updateDocLine(idx, { unit_price: e.target.value })}
                            inputMode="decimal"
                            placeholder="0"
                          />
                        </td>

                        <td className={cls(bodyCell, "text-center")}>
                          <input
                            type="checkbox"
                            checked={Boolean(l.is_taxable)}
                            disabled={!canEdit}
                            onChange={(e) => {
                              const v = e.target.checked;
                              updateDocLine(idx, {
                                is_taxable: v,
                                ex_override: v ? "" : l.ex_override,
                                af_override: v ? l.af_override : "",
                                iva_override: v ? l.iva_override : "",
                              });
                            }}
                          />
                        </td>

                        <td className={bodyCell}>
                          <input
                            className={cls(cellInputBase, cellInputRight)}
                            disabled={!canEdit || l.is_taxable}
                            value={l.ex_override}
                            data-grid="lineas"
                            data-row={idx}
                            data-col={4}
                            onKeyDown={(e) => handleGridKeyDown(e, "lineas", idx, 4)}
                            onChange={(e) => updateDocLine(idx, { ex_override: e.target.value })}
                            inputMode="decimal"
                            placeholder={formatNumber(ex, moneyDecimals)}
                          />
                        </td>

                        <td className={bodyCell}>
                          <input
                            className={cls(cellInputBase, cellInputRight)}
                            disabled={!canEdit || !l.is_taxable}
                            value={l.af_override}
                            data-grid="lineas"
                            data-row={idx}
                            data-col={5}
                            onKeyDown={(e) => handleGridKeyDown(e, "lineas", idx, 5)}
                            onChange={(e) => updateDocLine(idx, { af_override: e.target.value })}
                            inputMode="decimal"
                            placeholder={formatNumber(af, moneyDecimals)}
                          />
                        </td>

                        <td className={bodyCell}>
                          <input
                            className={cls(cellInputBase, cellInputRight)}
                            value={l.tax_rate}
                            disabled={!canEdit || !l.is_taxable}
                            data-grid="lineas"
                            data-row={idx}
                            data-col={6}
                            onKeyDown={(e) => handleGridKeyDown(e, "lineas", idx, 6)}
                            onChange={(e) => updateDocLine(idx, { tax_rate: e.target.value })}
                            inputMode="decimal"
                            placeholder="19"
                          />
                        </td>

                        <td className={bodyCell}>
                          <input
                            className={cls(cellInputBase, cellInputRight)}
                            disabled
                            value={formatNumber(iva, moneyDecimals)}
                            readOnly
                            />
                        </td>

                        <td className={bodyCell}>
                          <input
                            className={cls(cellInputBase, cellInputRight)}
                            disabled={!canEdit}
                            value={l.total_override}
                            data-grid="lineas"
                            data-row={idx}
                            data-col={7}
                            onKeyDown={(e) => handleGridKeyDown(e, "lineas", idx, 7)}
                            onChange={(e) => updateDocLine(idx, { total_override: e.target.value })}
                            inputMode="decimal"
                            placeholder={formatNumber(total_display, moneyDecimals)}
                          />
                        </td>

                        <td className={cls(bodyCell, "text-right")}>
                          <button
                            className={cls(
                              "text-xs rounded border border-slate-200 px-2 py-1 hover:bg-white hover:text-rose-700",
                              !canEdit ? "opacity-60 cursor-not-allowed" : ""
                            )}
                            disabled={!canEdit}
                            onClick={() => removeDocLine(idx)}
                            title="Eliminar línea"
                            type="button"
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
            </div>

            <div className="flex items-center gap-3">
              <div className="text-sm text-slate-700">
                <b>Pagado:</b> {formatNumber(totals.paid, moneyDecimals)} <span className="mx-2 text-slate-300">|</span>
                <b>Saldo:</b> {formatNumber(totals.balance, moneyDecimals)}
              </div>

              <button
                className={cls(theme.btnPrimary, !canEdit ? "opacity-60 cursor-not-allowed" : "")}
                disabled={!canEdit}
                onClick={addPaymentRow}
                type="button"
              >
                + Forma
              </button>
            </div>
          </div>

          
          <div className="px-4 py-3 border-t bg-amber-50 text-sm text-amber-900">
            <b>Importante:</b> Las formas de pago se guardan solo si el asiento tiene
            todas las cuentas contables y su distribución. Si falta una cuenta, el guardado puede fallar y los pagos no quedarán registrados.
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
                                    updatePaymentRow(p.id, { card_last4: e.target.value.replace(/\D/g, "").slice(0, 4) })
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
                              type="button"
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
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold text-slate-900">Distribución contable</h2>

              <span
                className={cls(
                  "inline-flex items-center rounded-full px-3 py-1 text-xs font-bold",
                  journalAutoMode
                    ? "bg-sky-100 text-sky-800"
                    : "bg-amber-100 text-amber-900"
                )}
              >
                {journalAutoMode ? "AUTO" : "MANUAL"}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {!journalAutoMode ? (
                <button
                  className={cls(theme.btnSoft, !canEdit && "opacity-60 cursor-not-allowed")}
                  disabled={!canEdit}
                  onClick={recalcJournalAuto}
                  type="button"
                >
                  Volver a automático
                </button>
              ) : null}

              <button
                className={cls(theme.btnPrimary, !canEdit ? "opacity-60 cursor-not-allowed" : "")}
                disabled={!canEdit}
                onClick={addJournalLine}
                type="button"
              >
                + Línea
              </button>
            </div>
          </div>
          
            <div className="px-4 py-3 border-t bg-white">
                <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-slate-800">
                    Debe: <b className="ml-1">{formatNumber(journalSummary.debit, moneyDecimals)}</b>
                </span>

                <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-slate-800">
                    Haber: <b className="ml-1">{formatNumber(journalSummary.credit, moneyDecimals)}</b>
                </span>

                <span
                    className={cls(
                    "inline-flex items-center rounded-full px-3 py-1",
                    journalSummary.isBalanced
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-rose-100 text-rose-800"
                    )}
                >
                    {journalSummary.isBalanced ? (
                    <>
                        Cuadrado: <b className="ml-1">Sí</b>
                    </>
                    ) : (
                    <>
                        Descuadre: <b className="ml-1">{formatNumber(journalSummary.absDiff, moneyDecimals)}</b>
                    </>
                    )}
                </span>

                {!journalSummary.isBalanced ? (
                    <span className="text-rose-700 font-medium">
                    {journalSummary.diff > 0
                        ? "El Debe es mayor que el Haber."
                        : "El Haber es mayor que el Debe."}
                    </span>
                ) : null}
                </div>
            </div>

          <div className="border-t border-slate-200 overflow-x-hidden">
            <div className="overflow-hidden">
              <table className="w-full table-fixed border-collapse text-sm">
                <colgroup>
                  <col style={{ width: "5%" }} />
                  <col style={{ width: "16%" }} />
                  <col style={{ width: "30%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "11%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "4%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th className={headerCell}>N°<span className={headerSub}>line_no</span></th>
                    <th className={headerCell}><b>Cuenta</b><span className={headerSub}>account_code</span></th>
                    <th className={headerCell}><b>Glosa</b><span className={headerSub}>description</span></th>
                    <th className={cls(headerCell, "text-right")}><b>Debe</b><span className={headerSub}>debit</span></th>
                    <th className={cls(headerCell, "text-right")}><b>Haber</b><span className={headerSub}>credit</span></th>
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
                  <col style={{ width: "16%" }} />
                  <col style={{ width: "30%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "12%" }} />
                  <col style={{ width: "11%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "4%" }} />
                </colgroup>

                <tbody>
                  {journalLines.map((l, idx) => {
                    const rowBg = idx % 2 === 0 ? "bg-slate-50/80" : "bg-slate-100/50";

                    const accountCode = String(l.account_code || "").trim();
                    const policy = accountPolicyByCode[accountCode];

                    const missingSuc = Boolean(
                      seatValidation.hasData &&
                        policy?.require_suc &&
                        !String(l.branch_code || "").trim()
                    );

                    const missingCu = Boolean(
                      seatValidation.hasData &&
                        policy?.require_cu &&
                        !String(l.business_line_code || "").trim()
                    );
                    return (
                      <tr key={idx} className={cls(rowBg, "hover:bg-sky-50/30")}>
                        <td className={cls(bodyCell, "text-slate-600 text-xs text-center")}>{l.line_no}</td>

                        <td className={bodyCell}>
                          <input
                            className={cellInputBase}
                            disabled={!canEdit}
                            value={l.account_code}
                            data-grid="asiento"
                            data-row={idx}
                            data-col={0}
                            onKeyDown={(e) => handleGridKeyDown(e, "asiento", idx, 0)}
                            onChange={(e) => updateJournalLine(idx, { account_code: e.target.value })}
                            onBlur={(e) =>
                              updateJournalLine(idx, {
                                account_code: String(e.target.value || "").trim(),
                              })
                            }
                            placeholder="1020101"
                            list={journalAccountListId}
                          />
                          <div className="text-[11px] text-slate-500 truncate">
                            {l.account_code.trim() ? (
                              accByCode[String(l.account_code).trim()]?.name ? (
                                accByCode[String(l.account_code).trim()].name
                              ) : (
                                <span className="text-amber-700">no existe</span>
                              )
                            ) : (
                              "—"
                            )}
                          </div>
                        </td>

                        <td className={bodyCell}>
                          <input
                            className={cellInputBase}
                            disabled={!canEdit}
                            value={l.description}
                            data-grid="asiento"
                            data-row={idx}
                            data-col={1}
                            onKeyDown={(e) => handleGridKeyDown(e, "asiento", idx, 1)}
                            onChange={(e) => updateJournalLine(idx, { description: e.target.value })}
                            placeholder="Glosa línea asiento"
                          />
                        </td>

                        <td className={bodyCell}>
                          <input
                            className={cls(
                              cellInputBase,
                              cellInputRight,
                              seatValidation.hasData &&
                                seatValidation.unbalanced &&
                                "border-rose-300 bg-rose-50 text-rose-900"
                            )}
                            disabled={!canEdit}
                            value={l.debit}
                            data-grid="asiento"
                            data-row={idx}
                            data-col={2}
                            onKeyDown={(e) => handleGridKeyDown(e, "asiento", idx, 2)}
                            onChange={(e) => updateJournalLine(idx, { debit: e.target.value })}
                            inputMode="decimal"
                            placeholder="0"
                          />
                        </td>

                        <td className={bodyCell}>
                          <input
                            className={cls(
                              cellInputBase,
                              cellInputRight,
                              seatValidation.hasData &&
                                seatValidation.unbalanced &&
                                "border-rose-300 bg-rose-50 text-rose-900"
                            )}
                            disabled={!canEdit}
                            value={l.credit}
                            data-grid="asiento"
                            data-row={idx}
                            data-col={3}
                            onKeyDown={(e) => handleGridKeyDown(e, "asiento", idx, 3)}
                            onChange={(e) => updateJournalLine(idx, { credit: e.target.value })}
                            inputMode="decimal"
                            placeholder="0"
                          />
                        </td>

                        <td className={bodyCell}>
                          <input
                            className={cls(
                              cellInputBase,
                              missingCu && "border-rose-300 bg-rose-50 text-rose-900"
                            )}
                            disabled={!canEdit}
                            value={l.business_line_code}
                            list={businessLineDatalistId}
                            data-grid="asiento"
                            data-row={idx}
                            data-col={4}
                            onKeyDown={(e) => handleGridKeyDown(e, "asiento", idx, 4)}
                            onChange={(e) => updateJournalLine(idx, { business_line_code: e.target.value })}
                            onBlur={(e) =>
                              updateJournalLine(idx, {
                                business_line_code: String(e.target.value || "").trim(),
                              })
                            }
                            placeholder="CU"
                          />
                        </td>

                        <td className={bodyCell}>
                          <input
                            className={cls(
                              cellInputBase,
                              missingSuc && "border-rose-300 bg-rose-50 text-rose-900"
                            )}
                            disabled={!canEdit}
                            value={l.branch_code}
                            list={branchDatalistId}
                            data-grid="asiento"
                            data-row={idx}
                            data-col={5}
                            onKeyDown={(e) => handleGridKeyDown(e, "asiento", idx, 5)}
                            onChange={(e) => updateJournalLine(idx, { branch_code: e.target.value })}
                            onBlur={(e) =>
                              updateJournalLine(idx, {
                                branch_code: String(e.target.value || "").trim(),
                              })
                            }
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
                            type="button"
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

            <div className="px-4 py-2 border-t bg-white">
              {!seatValidation.hasData ? (
                <div className="text-[11px] text-slate-500">
                  <b>Validación:</b> cuando el asiento tenga datos, se revisará descuadre, diferencia contra el documento y dimensiones obligatorias.
                </div>
              ) : seatValidation.hasErrors ? (
                <div className="space-y-1 text-[11px] text-rose-700">
                  <div className="font-semibold">Validaciones pendientes:</div>

                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {seatValidation.unbalanced ? (
                      <span>
                        • Debe/Haber descuadrado:{" "}
                        <b>{formatNumber(seatValidation.absDiff, moneyDecimals)}</b>
                      </span>
                    ) : null}

                    {seatValidation.totalMismatch ? (
                      <span>
                        • Documento vs asiento:{" "}
                        <b>{formatNumber(Math.abs(seatValidation.journalVsDocDiff), moneyDecimals)}</b>
                      </span>
                    ) : null}

                    {seatValidation.missingCuRows.length > 0 ? (
                      <span>
                        • Sin CU: <b>{seatValidation.missingCuRows.length}</b>
                      </span>
                    ) : null}

                    {seatValidation.missingSucRows.length > 0 ? (
                      <span>
                        • Sin SUC: <b>{seatValidation.missingSucRows.length}</b>
                      </span>
                    ) : null}
                  </div>

                  <div className="text-[10px] text-rose-600">
                    No se puede guardar borrador hasta corregir estas validaciones.
                  </div>
                </div>
              ) : (
                <div className="text-[11px] text-emerald-700">
                  <b>Validación:</b> asiento correcto. No hay errores visuales.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </EditorShellModal>
  );
}
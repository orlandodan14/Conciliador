"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import * as XLSX from "xlsx";
import { CounterpartyCreateModal, Counterparty as CPCounterparty } from "@/app/(workspace)/components/counterparties/CounterpartyCreateModal";
import { TradeDocEditorModal } from "@/app/(workspace)/gestionVentas/docs-tribut-ventas/components/tradeDocs/TradeDocEditorModal";
import { OriginDocSearchModal } from "@/app/(workspace)/gestionVentas/docs-tribut-ventas/components/tradeDocs/OriginDocSearchModal";
import TradeDocsTable from "@/app/(workspace)/gestionVentas/docs-tribut-ventas/components/tradeDocs/TradeDocsTable";
import type {
  AccountDefaultRow,
  AccountNodeLite,
  AccountPostingPolicyLite,
  BranchLite,
  BusinessLineLite,
  DocHeader,
  DocLine,
  DocType,
  DraftRow,
  EditorTab,
  FiscalDocSettingsLite,
  FiscalDocTypeLite,
  ItemLite,
  JournalLine,
  OriginDocLite,
  OriginSearchFilters,
  PaymentRow,
  TradeDocTimelineRow,
} from "@/app/(workspace)/gestionVentas/docs-tribut-ventas/components/tradeDocs/types";
import {
  cls,
  todayISO,
  toNum,
  formatNumber,
  uid,
  folioLabel,
  normalizeFolioPart,
  hasFiscalFolioData,
  isReverseNoteDocType,
  buildJournalEntryDescriptionFromHeader,
  buildJournalLineDescriptionFromHeader,
  ellipsis,
  normalizeIdentifier,
  calcLineAmounts,
  normalizePeriodStatus,
  makeDocLine,
  makeJournalLine,
  makePaymentRow,
  renumber,
  getDefaultFiscalDocCodeByDocType,
  getTradeDocSuggestion,
  getTradeDocPaymentState,
  applyTradeDocFilters,
  getDefaultFiscalDocTypeIdByDocType,
} from "@/app/(workspace)/gestionVentas/docs-tribut-ventas/components/tradeDocs/helpers";
import {
  findDuplicateFiscalFolio,
  assertUniqueFiscalFolio,
  isUnknownColumnError,
  safeUpsertSalesDoc,
  safeDeleteByCompanyAndEntry,
  upsertDraftJournalEntry,
  deleteDraftPaymentsByTradeDoc,
  getPaymentIdsByTradeDoc,
  deletePaymentsByIds,
  rollbackDraftArtifacts,
  getCurrentAccountingPeriodId,
  getAuthUserId,
  getMyRoleForCompany,
} from "@/app/(workspace)/gestionVentas/docs-tribut-ventas/components/tradeDocs/data";
import BaseModal from "@/app/(workspace)/gestionVentas/docs-tribut-ventas/components/tradeDocs/BaseModal";
import TradeDocsFiltersModal from "@/app/(workspace)/gestionVentas/docs-tribut-ventas/components/tradeDocs/TradeDocsFiltersModal";
import TradeDocsImportModal from "@/app/(workspace)/gestionVentas/docs-tribut-ventas/components/tradeDocs/TradeDocsImportModal";
import {
  tradeDocsTheme,
  tradeDocsHeaderCell,
  tradeDocsHeaderSub,
  tradeDocsBodyCell,
  tradeDocsCellInputBase,
  tradeDocsCellInputRight,
} from "@/app/(workspace)/gestionVentas/docs-tribut-ventas/components/tradeDocs/ui";
import {
  createEmptyTradeDocListFilters,
} from "@/app/(workspace)/gestionVentas/docs-tribut-ventas/components/tradeDocs/helpers";
import type { TradeDocListFilters } from "@/app/(workspace)/gestionVentas/docs-tribut-ventas/components/tradeDocs/types";
import TradeDocCancelModal from "@/app/(workspace)/gestionVentas/docs-tribut-ventas/components/tradeDocs/TradeDocCancelModal";

/**
 * =========================
 * Helpers
 * =========================
 */



/**
 * =========================
 * Theme
 * =========================
 */

const iconBtn =
  "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50";

const iconBtnPrimary =
  "inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white hover:bg-slate-800";

const iconBtnDanger =
  "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-rose-200 bg-white text-rose-700 hover:bg-rose-50";




/**
 * =========================
 * Defaults
 * =========================
 */




/**
 * =========================
 * Page
 * =========================
 */
export default function Page() {
  const [activeTab, setActiveTab] = useState<"drafts" | "registered">("drafts");
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
    default_sales_invoice_doc_type_id: null,
    default_sales_debit_note_doc_type_id: null,
    default_sales_credit_note_doc_type_id: null,
  });
  const [fiscalDocTypes, setFiscalDocTypes] = useState<FiscalDocTypeLite[]>([]);

  // ✅ NUEVO: permiso de cancelación (fallback true si columna no existe)
  const [allowCancelSales, setAllowCancelSales] = useState<boolean>(true);

  // editor modal
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorTab, setEditorTab] = useState<EditorTab>("CABECERA");
  

  const [docId, setDocId] = useState<string | null>(null);

    // viewer modal (solo lectura)
    const [viewerOpen, setViewerOpen] = useState(false);
    const [viewerDocId, setViewerDocId] = useState<string | null>(null);
    const [viewerEditorTab, setViewerEditorTab] = useState<EditorTab>("CABECERA");
    const [viewerShowCancelButton, setViewerShowCancelButton] = useState(false);
    const [viewerHeader, setViewerHeader] = useState<DocHeader>({
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
      cancelled_at: "",
      cancel_reason: "",
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

    const [viewerLines, setViewerLines] = useState<DocLine[]>(
      Array.from({ length: 4 }, (_, i) => makeDocLine(i + 1))
    );

    const [viewerPayments, setViewerPayments] = useState<PaymentRow[]>([]);

    const [viewerJournalLines, setViewerJournalLines] = useState<JournalLine[]>(
      Array.from({ length: 4 }, (_, i) => makeJournalLine(i + 1))
    );

    const [cancelModalOpen, setCancelModalOpen] = useState(false);
    const [cancelMode, setCancelMode] = useState<"editor" | "viewer">("editor");
    const [cancelTargetDocId, setCancelTargetDocId] = useState<string | null>(null);
    const [cancelDate, setCancelDate] = useState(todayISO());
    const [cancelReason, setCancelReason] = useState("");
    const [cancelPreviewLines, setCancelPreviewLines] = useState<JournalLine[]>([]);
    const [cancelLoadingPreview, setCancelLoadingPreview] = useState(false);
    const [cancelSubmitting, setCancelSubmitting] = useState(false);
    const [cancelSourceJournalEntryId, setCancelSourceJournalEntryId] = useState<string | null>(null);
    const [cancelDocInfo, setCancelDocInfo] = useState<{
    doc_type: string;
    fiscal_doc_code: string;
    series: string;
    number: string;
    issue_date: string;
    counterparty_identifier: string;
    counterparty_name: string;
    currency_code: string;
    grand_total: number;
    status: string;
  } | null>(null);

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
    cancelled_at: "",
    cancel_reason: "",
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

  const [lines, setLines] = useState<DocLine[]>(Array.from({ length: 4 }, (_, i) => makeDocLine(i + 1)));

  // ✅ Default: Crédito (sin pagos)
  const [payments, setPayments] = useState<PaymentRow[]>([]);

  const [journalLines, setJournalLines] = useState<JournalLine[]>(
    Array.from({ length: 4 }, (_, i) => makeJournalLine(i + 1))
  );

  const [journalAutoMode, setJournalAutoMode] = useState(true);

  type ActionReportRow = {
    scope: "IMPORT_VALIDATE" | "IMPORT_PROCESS" | "REGISTER" | "DELETE" | "SAVE";
    status: "OK" | "ERROR";
    doc_key?: string | null;
    trade_doc_id?: string | null;
    row_ref?: string | null;
    message: string;
  };

  const [messages, setMessages] = useState<Array<{ level: "error" | "warn"; text: string }>>([]);
  const [editorMessages, setEditorMessages] = useState<Array<{ level: "error" | "warn"; text: string }>>([]);
  const [actionReport, setActionReport] = useState<{ fileName: string; rows: ActionReportRow[] } | null>(null);
  const [importValidationRows, setImportValidationRows] = useState<ActionReportRow[]>([]);

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

  // Origin SEARCH MODAL
  const needsOrigin =
  header.doc_type === "CREDIT_NOTE" || header.doc_type === "DEBIT_NOTE";

  const disallowPayments =
    header.doc_type === "CREDIT_NOTE" || header.doc_type === "DEBIT_NOTE";

  const [originSearchOpen, setOriginSearchOpen] = useState(false);
  const [originLoading, setOriginLoading] = useState(false);
  const [originResults, setOriginResults] = useState<OriginDocLite[]>([]);
  const ORIGIN_PAGE_SIZE = 30;

  const [originHasMore, setOriginHasMore] = useState(false);
  const [originLoadingMore, setOriginLoadingMore] = useState(false);
  const [originOffset, setOriginOffset] = useState(0);

  const [originFilters, setOriginFilters] = useState<OriginSearchFilters>({
    fiscal_doc_code: "",
    folio: "",
    issue_date_from: "",
    issue_date_to: "",
    only_open_balance: true,
    only_vigente: false,
  });

  // Drafts list
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [loadingDrafts, setLoadingDrafts] = useState(false);
  const [registeredDocs, setRegisteredDocs] = useState<DraftRow[]>([]);
  const [loadingRegisteredDocs, setLoadingRegisteredDocs] = useState(false);
  const PAGE_SIZE = 100;

  const [draftsOffset, setDraftsOffset] = useState(0);
  const [draftsHasMore, setDraftsHasMore] = useState(true);
  const [loadingMoreDrafts, setLoadingMoreDrafts] = useState(false);

  const [registeredOffset, setRegisteredOffset] = useState(0);
  const [registeredHasMore, setRegisteredHasMore] = useState(true);
  const [loadingMoreRegistered, setLoadingMoreRegistered] = useState(false);
  
  
  const [timelineByDocId, setTimelineByDocId] = useState<Record<string, TradeDocTimelineRow[]>>({});
  const [timelineLoadingByDocId, setTimelineLoadingByDocId] = useState<Record<string, boolean>>({});

  function renderTimelineTable(row: DraftRow) {
    const loading = timelineLoadingByDocId[row.id];
    const rawItems = timelineByDocId[row.id] || [];

    const items = rawItems.filter((item) => {
      const isRootDocRow =
        item.event_type === "DOC" &&
        item.related_doc_id === row.id;

      return !isRootDocRow;
    });

    const rowSuggestion = getTradeDocSuggestion({
      status: row.status,
      balance: Number(row.balance ?? 0),
    });

    if (loading) {
      return <div className="text-[12px] text-slate-500">Cargando trazabilidad...</div>;
    }

    if (!items.length) {
      return <div className="text-[12px] text-slate-500">No hay movimientos relacionados.</div>;
    }

    return (
      <div className="overflow-hidden rounded-2xl ring-1 ring-slate-200/70">
        <div className="grid grid-cols-[100px_140px_140px_180px_1fr_250px] bg-gradient-to-b from-slate-100 to-slate-50 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#0b2b4f]">
          <div className="px-3 py-2 border-r border-slate-200">Fecha</div>
          <div className="px-3 py-2 border-r border-slate-200">Tipo</div>
          <div className="px-3 py-2 border-r border-slate-200">Documento</div>
          <div className="px-3 py-2 border-r border-slate-200 text-right">Monto</div>
          <div className="px-3 py-2 border-r border-slate-200">Cómo afecta</div>
          <div className="px-3 py-2">Sugerencia</div>
        </div>

        {items.map((item, idx) => {
          const negative = Number(item.impact_sign || 0) < 0;
          const amountText = `${negative ? "-" : "+"} ${formatNumber(Number(item.amount || 0), moneyDecimals)}`;

          const typeLabel =
            item.event_type === "PAYMENT"
              ? "Pago"
              : item.doc_type === "CREDIT_NOTE"
              ? "Nota crédito"
              : item.doc_type === "DEBIT_NOTE"
              ? "Nota débito"
              : "Documento";

          const docLabel =
            item.event_type === "PAYMENT"
              ? "Pago aplicado"
              : item.fiscal_doc_code
              ? `${item.fiscal_doc_code} · ${item.display_folio || item.number || "—"}`
              : item.display_folio || item.number || "—";

          const affectsLabel =
            item.affects_label || "—";

          const suggestionText = rowSuggestion.text;
          const suggestionClass = rowSuggestion.className;

          return (
            <div
              key={`${item.event_type}-${item.related_doc_id || ""}-${item.payment_id || ""}-${idx}`}
              className={cls(
                "grid grid-cols-[100px_140px_140px_180px_1fr_250px] text-[12px]",
                idx % 2 === 0 ? "bg-white" : "bg-slate-50/70"
              )}
            >
              <div className="px-3 py-2 border-t border-r border-slate-200/70 whitespace-nowrap">
                {item.event_date || "—"}
              </div>

              <div className="px-3 py-2 border-t border-r border-slate-200/70 whitespace-nowrap">
                <span className="font-semibold text-slate-800">{typeLabel}</span>
              </div>

              <div
                className="px-3 py-2 border-t border-r border-slate-200/70 truncate whitespace-nowrap font-medium text-slate-900"
                title={docLabel}
              >
                {docLabel}
              </div>
              
              <div
                className={cls(
                  "px-3 py-2 border-t border-slate-200/70 text-right font-extrabold whitespace-nowrap",
                  negative ? "text-rose-700" : "text-emerald-700"
                )}
              >
                {amountText}
              </div>

              <div
                className="px-3 py-2 border-t border-r border-slate-200/70 truncate whitespace-nowrap text-slate-700"
                title={affectsLabel}
              >
                {affectsLabel}
              </div>

              <div className="px-3 py-2 border-t border-r border-slate-200/70">
                <span
                  className={cls(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap",
                    suggestionClass
                  )}
                  title={suggestionText}
                >
                  {suggestionText}
                </span>
              </div>

            </div>
          );
        })}
      </div>
    );
  }

  function exportActionReport(rows: ActionReportRow[], fileName = "reporte_accion.xlsx") {
    const exportRows = rows.map((r) => ({
      ambito: r.scope,
      estado: r.status,
      doc_key: r.doc_key || "",
      trade_doc_id: r.trade_doc_id || "",
      referencia_fila: r.row_ref || "",
      mensaje: r.message,
    }));

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Reporte");
    XLSX.writeFile(wb, fileName);
  }

  const [listFilters, setListFilters] = useState<TradeDocListFilters>(
    createEmptyTradeDocListFilters()
  );

  function clearListFilters() {
    setListFilters(createEmptyTradeDocListFilters());
  }

  const filteredDrafts = useMemo(() => {
    return applyTradeDocFilters(drafts, listFilters);
  }, [drafts, listFilters]);

  const filteredRegisteredDocs = useMemo(() => {
    return applyTradeDocFilters(registeredDocs, listFilters);
  }, [registeredDocs, listFilters]);

  // ✅ Selección borradores
  const [selectedDrafts, setSelectedDrafts] = useState<Record<string, boolean>>({});
  const [selectedRegistered, setSelectedRegistered] = useState<Record<string, boolean>>({});

  const selectedDraftIds = useMemo(
    () => Object.keys(selectedDrafts).filter((id) => selectedDrafts[id]),
    [selectedDrafts]
  );

  const selectedRegisteredIds = useMemo(
    () => Object.keys(selectedRegistered).filter((id) => selectedRegistered[id]),
    [selectedRegistered]
  );

  const allDraftsSelected = useMemo(() => {
    if (filteredDrafts.length === 0) return false;
    return filteredDrafts.every((d) => selectedDrafts[d.id]);
  }, [filteredDrafts, selectedDrafts]);

  const allRegisteredSelected = useMemo(() => {
    if (filteredRegisteredDocs.length === 0) return false;
    return filteredRegisteredDocs.every((d) => selectedRegistered[d.id]);
  }, [filteredRegisteredDocs, selectedRegistered]);

  function toggleDraft(id: string, v?: boolean) {
    setSelectedDrafts((p) => ({ ...p, [id]: v ?? !p[id] }));
  }

  function toggleRegistered(id: string, v?: boolean) {
    setSelectedRegistered((p) => ({ ...p, [id]: v ?? !p[id] }));
  }

  function clearDraftSelection() {
    setSelectedDrafts({});
  }

  function clearRegisteredSelection() {
    setSelectedRegistered({});
  }

  function selectAllDrafts() {
    const next: Record<string, boolean> = { ...selectedDrafts };
    filteredDrafts.forEach((d) => {
      next[d.id] = true;
    });
    setSelectedDrafts(next);
  }

  function selectAllRegistered() {
    const next: Record<string, boolean> = { ...selectedRegistered };
    filteredRegisteredDocs.forEach((d) => {
      next[d.id] = true;
    });
    setSelectedRegistered(next);
  }

  function toggleSelectAllDrafts() {
    if (allDraftsSelected) clearDraftSelection();
    else selectAllDrafts();
  }

  function toggleSelectAllRegistered() {
    if (allRegisteredSelected) clearRegisteredSelection();
    else selectAllRegistered();
  }

  function finishBulkRegisterProgress() {
    setBulkRegisterProgress(100);
    setBulkRegisterProgressDone(true);

    window.setTimeout(() => {
      setBulkRegisterProgressVisible(false);
      setBulkRegisterProgressDone(false);
      setBulkRegisterProgress(0);
      setDraftSaving(false);
      setDraftDeleting(false);
      setProgressMode(null);
    }, 1200);
  }

  function resetBulkRegisterProgressNow() {
    setBulkRegisterProgressVisible(false);
    setBulkRegisterProgressDone(false);
    setBulkRegisterProgress(0);
    setDraftSaving(false);
    setDraftDeleting(false);
    setProgressMode(null);
  }

  // =========================
  // Carga masiva (Excel)
  // =========================
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [bulkRegistering, setBulkRegistering] = useState(false);
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [draftSaving, setDraftSaving] = useState(false);
  const [draftDeleting, setDraftDeleting] = useState(false);
  type ProgressMode =
    | "SAVE_DRAFT"
    | "REGISTER"
    | "DELETE_DRAFT"
    | "IMPORT_VALIDATE"
    | "IMPORT_UPLOAD"
    | "IMPORT_PROCESS";

  const [progressMode, setProgressMode] = useState<ProgressMode | null>(null);

  const [bulkRegisterProgress, setBulkRegisterProgress] = useState(0);
  const [bulkRegisterProgressVisible, setBulkRegisterProgressVisible] = useState(false);
  const [bulkRegisterProgressDone, setBulkRegisterProgressDone] = useState(false);

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
            .select(`
              enabled,
              require_sales,
              default_sales_doc_type_id,
              default_sales_invoice_doc_type_id,
              default_sales_debit_note_doc_type_id,
              default_sales_credit_note_doc_type_id,
              allow_sales_cancellation
            `)
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
              .select(`
                enabled,
                require_sales,
                default_sales_doc_type_id,
                default_sales_invoice_doc_type_id,
                default_sales_debit_note_doc_type_id,
                default_sales_credit_note_doc_type_id
              `)
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
          default_sales_invoice_doc_type_id:
            (cfg as any)?.default_sales_invoice_doc_type_id ?? null,
          default_sales_debit_note_doc_type_id:
            (cfg as any)?.default_sales_debit_note_doc_type_id ?? null,
          default_sales_credit_note_doc_type_id:
            (cfg as any)?.default_sales_credit_note_doc_type_id ?? null,
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
      } catch {
        setFiscalCfg({
          enabled: false,
          require_sales: false,
          default_sales_doc_type_id: null,
          default_sales_invoice_doc_type_id: null,
          default_sales_debit_note_doc_type_id: null,
          default_sales_credit_note_doc_type_id: null,
        });
        setFiscalDocTypes([]);
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
      setJournalLines(Array.from({ length: 4 }, (_, i) => makeJournalLine(i + 1)));
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
  
  function setHeaderBranchCode(rawCode: string) {
    const typedCode = String(rawCode || "").trim();
    const foundBranch = typedCode ? branchByCode[typedCode] : null;

    setHeader((h) => ({
      ...h,
      branch_id: foundBranch?.id || "",
    }));
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
    if (disallowPayments) return;
    setPayments((p) => [...p, makePaymentRow(header.issue_date || todayISO())]);
  }

  function removePaymentRow(id: string) {
    if (disallowPayments) return;
    setPayments((p) => p.filter((x) => x.id !== id));
  }

  function updatePaymentRow(id: string, patch: Partial<PaymentRow>) {
    if (disallowPayments) return;
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

        // En modo manual no forzamos dimensiones.
        // Solo normalizamos ids/códigos si el usuario escribió algo válido.

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
      return next;
    }

    // SUCURSAL solo si la política lo exige
    if (policy.require_suc) {
      if (!header.branch_id || !docBranch) {
        next.branch_id = null;
        next.branch_code = "";
      } else {
        next.branch_id = docBranch.id;
        next.branch_code = docBranch.code || "";
      }
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
    return next;
  }


  function buildJournalFromDoc(): { lines: JournalLine[]; error?: string } {
    const tol = 0.5;
    const docGlosa = buildJournalLineDescriptionFromHeader(header);
    const isReverse = isReverseNoteDocType(header.doc_type);

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
        debit: isReverse ? "" : String(amount),
        credit: isReverse ? String(amount) : "",

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
          debit: isReverse ? "" : String(diff),
          credit: isReverse ? String(diff) : "",

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
          debit: isReverse ? String(totals.tax_total) : "",
          credit: isReverse ? "" : String(totals.tax_total),

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
          debit: isReverse ? String(bucket.amount) : "",
          credit: isReverse ? "" : String(bucket.amount),

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
      throw new Error(
        `La fecha ${issueDate} no pertenece a un período contable ABIERTO o el período está bloqueado.`
      );
    }

    const { error: postError } = await supabase.rpc("post_journal_entry", {
      _entry_id: doc.journal_entry_id,
    });

    if (postError) throw postError;

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

  async function registerTradeDocsViaBulk(tradeDocIds: string[]): Promise<{
    okCount: number;
    errorCount: number;
    errors: Array<{ trade_doc_id?: string; message?: string }>;
  }> {
    if (!companyId) throw new Error("Falta companyId.");
    if (!canEdit) throw new Error("No tienes permisos para registrar.");

    const cleanIds = Array.from(new Set((tradeDocIds || []).filter(Boolean)));
    if (cleanIds.length === 0) {
      return { okCount: 0, errorCount: 0, errors: [] };
    }

    const { data, error } = await supabase.rpc("bulk_register_trade_docs", {
      _company_id: companyId,
      _trade_doc_ids: cleanIds,
    });

    if (error) throw error;

    return {
      okCount: Number((data as any)?.ok_count || 0),
      errorCount: Number((data as any)?.error_count || 0),
      errors: Array.isArray((data as any)?.errors) ? (data as any).errors : [],
    };
  }
  
  function clearForm() {
    setDocId(null);
    setJournalAutoMode(true);

    setHeader({
      doc_type: "INVOICE",
      fiscal_doc_code: fiscalCfg.enabled
        ? getDefaultFiscalDocCodeByDocType("INVOICE", fiscalCfg, fiscalDocTypes)
        : "",
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
      cancelled_at: "",
      cancel_reason: "",
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

    setLines(
      Array.from({ length: 4 }, (_, i) => ({
        ...makeDocLine(i + 1),
        tax_rate: defaultTaxRate || "19",
      }))
    );
    setPayments([]);
    setJournalLines(Array.from({ length: 4 }, (_, i) => makeJournalLine(i + 1)));

    clearScopedMessages("all");
    setOriginSearchOpen(false);
    setOriginResults([]);
    setOriginLoading(false);
    setOriginFilters({
      fiscal_doc_code: "",
      folio: "",
      issue_date_from: "",
      issue_date_to: "",
      only_open_balance: true,
      only_vigente: false,
    });
    setOriginHasMore(false);
    setOriginLoadingMore(false);
    setOriginOffset(0);
  }

  function openNewDoc() {
    clearForm();
    clearScopedMessages("editor");
    setEditorTab("CABECERA");
    setEditorOpen(true);
  }

  function closeEditor() {
    setEditorOpen(false);
    setOriginSearchOpen(false);
    clearScopedMessages("editor");
  }

  function setScopedMessages(
    msgs: Array<{ level: "error" | "warn"; text: string }>,
    scope: "page" | "editor" = "page",
    report?: { fileName: string; rows: ActionReportRow[] } | null
  ) {
    const summarized = Array.isArray(msgs) ? msgs.slice(0, 1) : [];
    if (scope === "editor") {
      setEditorMessages(summarized);
    } else {
      setMessages(summarized);
    }

    if (report !== undefined) {
      setActionReport(report);
    } else if (scope === "page") {
      setActionReport(null);
    }
  }

  function clearScopedMessages(scope: "page" | "editor" | "all" = "all") {
    if (scope === "editor" || scope === "all") setEditorMessages([]);
    if (scope === "page" || scope === "all") {
      setMessages([]);
      setActionReport(null);
    }
  }

  /**
   * Origin search
   */
  async function searchOriginDocs(reset = true) {
    if (!companyId) return;

    const counterpartyIdentifierRaw = String(header.counterparty_identifier || "").trim();
      if (!counterpartyIdentifierRaw) return;

      const resolvedCounterpartyId = await resolveCounterpartyIdByIdentifier(counterpartyIdentifierRaw);

    if (reset) {
      setOriginLoading(true);
      setOriginOffset(0);
    } else {
      if (originLoadingMore || !originHasMore) return;
      setOriginLoadingMore(true);
    }

    try {
      const from = reset ? 0 : originOffset;
      const to = from + ORIGIN_PAGE_SIZE - 1;

      let query = supabase
        .from("trade_docs")
        .select(`
          id,
          doc_type,
          fiscal_doc_code,
          series,
          number,
          issue_date,
          net_taxable,
          net_exempt,
          tax_total,
          grand_total,
          balance,
          currency_code,
          status,
          counterparty_id,
          counterparty_identifier_snapshot
        `)
        .eq("company_id", companyId)
        .in("doc_type", ["INVOICE", "CREDIT_NOTE", "DEBIT_NOTE"])
        .order("issue_date", { ascending: false })
        .order("created_at", { ascending: false })
        .range(from, to);

      if (resolvedCounterpartyId) {
        query = query.or(
          `counterparty_id.eq.${resolvedCounterpartyId},counterparty_identifier_snapshot.eq.${counterpartyIdentifierRaw}`
        ) as any;
      } else {
        query = query.eq("counterparty_identifier_snapshot", counterpartyIdentifierRaw);
      }

      if (originFilters.only_vigente) {
        query = query.eq("status", "VIGENTE");
      } else {
        query = query.neq("status", "CANCELADO");
      }

      if (originFilters.fiscal_doc_code.trim()) {
        query = query.ilike("fiscal_doc_code", `%${originFilters.fiscal_doc_code.trim()}%`);
      }

      if (originFilters.folio.trim()) {
        const q = originFilters.folio.trim();
        query = query.or(`number.ilike.%${q}%,series.ilike.%${q}%`) as any;
      }

      if (originFilters.issue_date_from) {
        query = query.gte("issue_date", originFilters.issue_date_from);
      }

      if (originFilters.issue_date_to) {
        query = query.lte("issue_date", originFilters.issue_date_to);
      }

      const { data, error } = await query;
      if (error) throw error;

      const mapped: OriginDocLite[] = ((data as any[]) || []).map((r) => {
        const total = Number(r.grand_total || 0);

        return {
          id: r.id,
          doc_type: r.doc_type,
          fiscal_doc_code: r.fiscal_doc_code,
          series: r.series,
          number: r.number,
          issue_date: r.issue_date,
          net_taxable: Number(r.net_taxable || 0),
          net_exempt: Number(r.net_exempt || 0),
          tax_total: Number(r.tax_total || 0),
          grand_total: total,
          balance: Number(r.balance ?? total),
          currency_code: r.currency_code,
          status: r.status,
        };
      });

      const filtered = originFilters.only_open_balance
        ? mapped.filter((x) => Number(x.balance || 0) > 0)
        : mapped;

      if (reset) {
        setOriginResults(filtered);
      } else {
        setOriginResults((prev) => [...prev, ...filtered]);
      }

      const fetchedCount = ((data as any[]) || []).length;
      setOriginHasMore(fetchedCount === ORIGIN_PAGE_SIZE);
      setOriginOffset(from + fetchedCount);
    } catch (e: any) {
      alert(`Error buscando documentos origen: ${e?.message ?? "Error"}`);
      if (reset) {
        setOriginResults([]);
        setOriginHasMore(false);
        setOriginOffset(0);
      }
    } finally {
      setOriginLoading(false);
      setOriginLoadingMore(false);
    }
  }

  async function loadMoreOriginDocs() {
    await searchOriginDocs(false);
  }

  function clearOrigin() {
    setHeader((h) => ({
      ...h,
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
    }));
  }

  async function pickOrigin(d: OriginDocLite) {
    try {
      setMessages([]);

      setHeaderPatch({
        origin_doc_id: d.id,
        origin_label: folioLabel(d.series, d.number),
        origin_doc_type: d.doc_type ?? null,
        origin_fiscal_doc_code: d.fiscal_doc_code ?? null,
        origin_issue_date: d.issue_date ?? null,
        origin_currency_code: d.currency_code ?? null,
        origin_net_taxable: d.net_taxable ?? null,
        origin_net_exempt: d.net_exempt ?? null,
        origin_tax_total: d.tax_total ?? null,
        origin_grand_total: d.grand_total ?? null,
        origin_balance: d.balance ?? null,
        origin_payment_status: null,
        origin_status: d.status ?? null,
      });

      // NC/ND: el origen solo se referencia en cabecera.
      // NO se copian líneas, pagos ni asiento.
      setPayments([]);
      setJournalAutoMode(true);
      setJournalLines(Array.from({ length: 4 }, (_, i) => makeJournalLine(i + 1)));

      setEditorTab("LINEAS");
      setOriginSearchOpen(false);
    } catch (e: any) {
      setMessages([
        {
          level: "error",
          text: e?.message || "No se pudo seleccionar el documento origen.",
        },
      ]);
    }
  }

  async function loadTimeline(docId: string) {
    if (!companyId) return;
    if (timelineByDocId[docId] || timelineLoadingByDocId[docId]) return;

    setTimelineLoadingByDocId((prev) => ({ ...prev, [docId]: true }));

    try {
      const { data, error } = await supabase.rpc("get_trade_doc_timeline", {
        p_company_id: companyId,
        p_trade_doc_id: docId,
      });

      if (error) throw error;

      setTimelineByDocId((prev) => ({
        ...prev,
        [docId]: ((data as any[]) || []) as TradeDocTimelineRow[],
      }));
    } catch (e) {
      console.error("Error cargando timeline", e);
      setTimelineByDocId((prev) => ({ ...prev, [docId]: [] }));
    } finally {
      setTimelineLoadingByDocId((prev) => ({ ...prev, [docId]: false }));
    }
  }

  /**
   * Drafts load (vista principal)
   */
  async function loadDrafts(reset = true) {
    if (!companyId) return;

    if (reset) {
      setLoadingDrafts(true);
    } else {
      if (loadingMoreDrafts || !draftsHasMore) return;
      setLoadingMoreDrafts(true);
    }

    try {
      const from = reset ? 0 : draftsOffset;
      const to = from + PAGE_SIZE - 1;

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
            "balance",
            "created_at",
          ].join(",")
        )
        .eq("company_id", companyId)
        .eq("status", "BORRADOR")
        .order("issue_date", { ascending: false })
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) throw error;

      const rows = ((data as any) || []) as DraftRow[];

      if (reset) {
        setDrafts(rows);
      } else {
        setDrafts((prev) => [...prev, ...rows]);
      }

      setDraftsOffset(from + rows.length);
      setDraftsHasMore(rows.length === PAGE_SIZE);
    } catch (e: any) {
      if (reset) setDrafts([]);
      setMessages((prev) => [
        { level: "error", text: e?.message || "No se pudieron cargar borradores." },
        ...prev,
      ]);
    } finally {
      setLoadingDrafts(false);
      setLoadingMoreDrafts(false);
    }
  }

  async function loadRegisteredDocs(reset = true) {
    if (!companyId) return;

    if (reset) {
      setLoadingRegisteredDocs(true);
    } else {
      if (loadingMoreRegistered || !registeredHasMore) return;
      setLoadingMoreRegistered(true);
    }

    try {
      const from = reset ? 0 : registeredOffset;
      const to = from + PAGE_SIZE - 1;

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
            "balance",
            "created_at",
          ].join(",")
        )
        .eq("company_id", companyId)
        .in("status", ["VIGENTE", "CANCELADO"])
        .order("issue_date", { ascending: false })
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) throw error;

      const rows = ((data as any) || []) as DraftRow[];

      if (reset) {
        setRegisteredDocs(rows);
      } else {
        setRegisteredDocs((prev) => [...prev, ...rows]);
      }

      setRegisteredOffset(from + rows.length);
      setRegisteredHasMore(rows.length === PAGE_SIZE);
    } catch (e: any) {
      if (reset) setRegisteredDocs([]);
      setMessages((prev) => [
        { level: "error", text: e?.message || "No se pudieron cargar registrados." },
        ...prev,
      ]);
    } finally {
      setLoadingRegisteredDocs(false);
      setLoadingMoreRegistered(false);
    }
  }

  useEffect(() => {
    if (!companyId) return;

    setDraftsOffset(0);
    setDraftsHasMore(true);
    setRegisteredOffset(0);
    setRegisteredHasMore(true);

    void loadDrafts(true);
    void loadRegisteredDocs(true);
  }, [companyId]);

  useEffect(() => {
    function onWindowScroll() {
      const usingPageScrollForDrafts =
        activeTab === "drafts" && drafts.length <= PAGE_SIZE;
      const usingPageScrollForRegistered =
        activeTab === "registered" && registeredDocs.length <= PAGE_SIZE;

      if (!usingPageScrollForDrafts && !usingPageScrollForRegistered) return;

      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const viewport = window.innerHeight;
      const fullHeight = document.documentElement.scrollHeight;

      const nearBottom = scrollTop + viewport >= fullHeight - 220;
      if (!nearBottom) return;

      if (
        usingPageScrollForDrafts &&
        draftsHasMore &&
        !loadingDrafts &&
        !loadingMoreDrafts
      ) {
        void loadDrafts(false);
      }

      if (
        usingPageScrollForRegistered &&
        registeredHasMore &&
        !loadingRegisteredDocs &&
        !loadingMoreRegistered
      ) {
        void loadRegisteredDocs(false);
      }
    }

    window.addEventListener("scroll", onWindowScroll);
    return () => window.removeEventListener("scroll", onWindowScroll);
  }, [
    activeTab,
    drafts.length,
    registeredDocs.length,
    draftsHasMore,
    registeredHasMore,
    loadingDrafts,
    loadingRegisteredDocs,
    loadingMoreDrafts,
    loadingMoreRegistered,
  ]);


  useEffect(() => {
    if (!bulkRegistering && !draftSaving && !draftDeleting && !importing) return;

    setBulkRegisterProgressVisible(true);
    setBulkRegisterProgressDone(false);
    setBulkRegisterProgress((prev) => (prev > 0 ? prev : 8));

    const timer = window.setInterval(() => {
      setBulkRegisterProgress((prev) => {
        if (prev >= 92) return prev;
        if (prev < 35) return prev + 8;
        if (prev < 60) return prev + 5;
        if (prev < 80) return prev + 3;
        return prev + 1;
      });
    }, 400);

    return () => window.clearInterval(timer);
  }, [bulkRegistering, draftSaving, draftDeleting, importing]);

  useEffect(() => {
    if (!disallowPayments) return;
    if (payments.length === 0) return;

    setPayments([]);
  }, [disallowPayments, payments.length]);

  /**
   * Save / status
   */
  async function saveDraftInternal(
    closeAfterSave = true,
    messageScope: "page" | "editor" = "page"
  ): Promise<string | null> {
    if (!companyId || !canEdit) return null;

    let savedIdForRollback: string | null = null;
    let journalEntryIdForRollback: string | null = null;
    let createdNewTradeDoc = false;
    let previousJournalLines: any[] = [];

    try {
      clearScopedMessages(messageScope);

      setProgressMode("SAVE_DRAFT");
      setDraftSaving(true);   

      if (hasFiscalFolioData(header)) {
        await assertUniqueFiscalFolio({
          companyId,
          header,
          excludeDocId: docId,
        });
      }

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
            trade_doc_id: "",
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

      const normalizedFiscalDocCode = normalizeFolioPart(header.fiscal_doc_code || "");

      const resolvedFiscalDocTypeId =
        fiscalDocTypes.find(
          (t) =>
            t.is_active &&
            normalizeFolioPart(t.code) === normalizedFiscalDocCode
        )?.id ||
        getDefaultFiscalDocTypeIdByDocType(header.doc_type, fiscalCfg) ||
        null;

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
        fiscal_doc_type_id: resolvedFiscalDocTypeId,
        fiscal_doc_code: header.fiscal_doc_code || null,
        counterparty_id: (() => {
          const key = normalizeIdentifier(header.counterparty_identifier || "");
          const cp = key ? counterpartyMap[key] : null;
          return (cp as any)?.id ?? null;
        })(),
        counterparty_identifier_snapshot: header.counterparty_identifier || null,
        counterparty_name_snapshot: header.counterparty_name || null,
        reference: header.reference || null,
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
        origin_doc_id: header.origin_doc_id,
        grand_total: totals.grand_total,
      };

      const result = journalAutoMode ? buildJournalFromDoc() : buildJournalFromManual();

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
        description: buildJournalEntryDescriptionFromHeader(header),
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
        const defaultJournalDescription = buildJournalLineDescriptionFromHeader(header);

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
          line_description: String(l.description || "").trim() || defaultJournalDescription,
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

      const oldPaymentIds = await getPaymentIdsByTradeDoc(companyId, savedId);

      const usedPayments = disallowPayments
        ? []
        : payments.filter((p) => {
            return toNum(p.amount) > 0 || String(p.reference || "").trim() !== "";
          });

      if (usedPayments.length > 0) {
        const paymentRows = usedPayments.map((p) => ({
          company_id: companyId,
          payment_date: p.payment_date || header.issue_date,
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

      setScopedMessages([{ level: "warn", text: "Borrador guardado." }], messageScope);
      await loadDrafts();

      finishBulkRegisterProgress();

      if (closeAfterSave) {
        closeEditor();
      }

      return savedId;
    } catch (e: any) {
      if (createdNewTradeDoc && savedIdForRollback) {
        try {
          await rollbackDraftArtifacts({
            companyId,
            tradeDocId: savedIdForRollback,
            journalEntryId: journalEntryIdForRollback,
          });
        } catch {}
      }

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

      resetBulkRegisterProgressNow();

      setScopedMessages(
        [
          {
            level: "error",
            text: e?.message || "No se pudo guardar el borrador.",
          },
        ],
        messageScope
      );

      return null;
    }
  }
  
  async function saveDraftMVP() {
    await saveDraftInternal(true, "editor");
  }

  async function markAsVigenteMVP() {
    if (!companyId || !canEdit) return;

    const ok = window.confirm(
      "¿Registrar este documento? Se contabilizará directamente y dejará de estar en borrador."
    );
    if (!ok) return;

    let closedEditorForRegister = false;

    try {
      clearScopedMessages("editor");
      setProgressMode("REGISTER");
      setBulkRegistering(true);

      let finalDocId = docId;

      if (!finalDocId) {
        finalDocId = await saveDraftInternal(false, "editor");
      }

      // si no se pudo guardar, no cierres el modal y limpia la barra inmediatamente
      if (!finalDocId) {
        resetBulkRegisterProgressNow();
        return;
      }

      if (hasFiscalFolioData(header)) {
        await assertUniqueFiscalFolio({
          companyId,
          header,
          excludeDocId: finalDocId,
        });
      }

      closeEditor();
      closedEditorForRegister = true;

      const result = await registerTradeDocsViaBulk([finalDocId]);

      await loadDrafts();
      clearDraftSelection();
      clearForm();

      finishBulkRegisterProgress();

      if (result.errorCount > 0) {
        const firstError =
          result.errors?.[0]?.message || "No se pudo registrar el documento.";
        setMessages([{ level: "error", text: firstError }]);
        return;
      }

      setMessages([
        {
          level: "warn",
          text: "Documento registrado (VIGENTE) y contabilizado correctamente.",
        },
      ]);
    } catch (e: any) {
      // si el modal sigue abierto, mostramos error ahí y ocultamos la barra altiro
      if (!closedEditorForRegister) {
        resetBulkRegisterProgressNow();
        setScopedMessages(
          [
            {
              level: "error",
              text: e?.message || "No se pudo registrar el documento.",
            },
          ],
          "editor"
        );
      } else {
        finishBulkRegisterProgress();
        setMessages([
          {
            level: "error",
            text: e?.message || "No se pudo registrar el documento.",
          },
        ]);
      }

      await loadDrafts();
    } finally {
      setBulkRegistering(false);
    }
  }

  async function deleteDraftMVP() {
    if (!docId) return;
    if (!companyId || !canEdit) return;

    const ok = window.confirm("¿Eliminar este borrador? No se puede deshacer.");
    if (!ok) return;

    await deleteDraftsWithProgress({
      ids: [docId],
      messageScope: "editor",
      closeEditorOnSuccess: true,
      clearSelectionOnSuccess: true,
      successText: "Borrador eliminado.",
    });
  }

  async function openCancelFlow(args: {
    mode: "editor" | "viewer";
    tradeDocId: string;
    status: string;
    cancelledAt?: string | null;
    cancelReason?: string | null;
  }) {
    if (!companyId) return;
    if (!canEdit) return;

    if (args.status !== "VIGENTE") {
      setMessages([{ level: "error", text: "Solo puedes cancelar documentos VIGENTES." }]);
      return;
    }
    setCancelDocInfo(null);
    setCancelMode(args.mode);
    setCancelTargetDocId(args.tradeDocId);
    setCancelDate(args.cancelledAt || todayISO());
    setCancelReason(args.cancelReason || "");
    setCancelPreviewLines([]);
    setCancelSourceJournalEntryId(null);
    setCancelLoadingPreview(true);
    setCancelModalOpen(true);

    try {
      const { data: docRow, error: docError } = await supabase
        .from("trade_docs")
        .select("id,journal_entry_id,doc_type,fiscal_doc_code,series,number,issue_date,reference,counterparty_identifier_snapshot,counterparty_name_snapshot,currency_code,grand_total,status")
        .eq("company_id", companyId)
        .eq("id", args.tradeDocId)
        .single();

      if (docError) throw docError;

      const sourceJournalEntryId = (docRow as any)?.journal_entry_id || null;
      if (!sourceJournalEntryId) {
        throw new Error("El documento no tiene asiento contable asociado para reversar.");
      }

      setCancelSourceJournalEntryId(sourceJournalEntryId);

      setCancelDocInfo({
        doc_type: String((docRow as any)?.doc_type || ""),
        fiscal_doc_code: String((docRow as any)?.fiscal_doc_code || ""),
        series: String((docRow as any)?.series || ""),
        number: String((docRow as any)?.number || ""),
        issue_date: String((docRow as any)?.issue_date || ""),
        counterparty_identifier: String((docRow as any)?.counterparty_identifier_snapshot || ""),
        counterparty_name: String((docRow as any)?.counterparty_name_snapshot || ""),
        currency_code: String((docRow as any)?.currency_code || ""),
        grand_total: Number((docRow as any)?.grand_total || 0),
        status: String((docRow as any)?.status || ""),
      });

      const { data: sourceLines, error: sourceLinesError } = await supabase
        .from("journal_entry_lines")
        .select(`
          line_no,
          line_description,
          debit,
          credit,
          account_code_snapshot,
          business_line_id,
          branch_id,
          business_lines ( id, code, name ),
          branches ( id, code, name )
        `)
        .eq("company_id", companyId)
        .eq("journal_entry_id", sourceJournalEntryId)
        .order("line_no", { ascending: true });

      if (sourceLinesError) throw sourceLinesError;

      const docLabel = [
        (docRow as any)?.fiscal_doc_code || "",
        folioLabel((docRow as any)?.series, (docRow as any)?.number),
      ]
        .filter(Boolean)
        .join(" ");

      const preview: JournalLine[] = (((sourceLines as any[]) || []).map((r: any, idx: number) => {
        const bu = Array.isArray(r.business_lines) ? r.business_lines[0] : r.business_lines;
        const br = Array.isArray(r.branches) ? r.branches[0] : r.branches;

        return {
          line_no: idx + 1,
          account_code: String(r.account_code_snapshot || ""),
          description: `Cancelación ${docLabel}`.trim(),
          debit: r.credit != null ? String(r.credit) : "",
          credit: r.debit != null ? String(r.debit) : "",
          cost_center_id: null,
          business_line_id: r.business_line_id || null,
          branch_id: r.branch_id || null,
          cost_center_code: "",
          business_line_code: String(bu?.code || ""),
          branch_code: String(br?.code || ""),
        };
      })) as JournalLine[];

      setCancelPreviewLines(preview);
    } catch (e: any) {
      setCancelModalOpen(false);
      setMessages([
        {
          level: "error",
          text: e?.message || "No se pudo preparar la cancelación del documento.",
        },
      ]);
    } finally {
      setCancelLoadingPreview(false);
    }
  }

  async function cancelDocMVP() {
    if (!allowCancelSales) {
      setMessages([{ level: "error", text: "La empresa tiene deshabilitada la cancelación de ventas." }]);
      return;
    }

    if (!docId) return;

    await openCancelFlow({
      mode: "editor",
      tradeDocId: docId,
      status: header.status,
      cancelledAt: header.cancelled_at || null,
      cancelReason: header.cancel_reason || null,
    });
  }

  async function cancelViewerDocMVP() {
    if (!allowCancelSales) {
      setMessages([{ level: "error", text: "La empresa tiene deshabilitada la cancelación de ventas." }]);
      return;
    }

    if (!viewerDocId) return;

    await openCancelFlow({
      mode: "viewer",
      tradeDocId: viewerDocId,
      status: viewerHeader.status,
      cancelledAt: viewerHeader.cancelled_at || null,
      cancelReason: viewerHeader.cancel_reason || null,
    });
  }

  async function confirmCancelTradeDoc() {
    if (!companyId || !canEdit) return;
    if (!cancelTargetDocId) return;
    const usedCancelLines = cancelPreviewLines.filter((l) => {
    return (
      String(l.account_code || "").trim() ||
      String(l.description || "").trim() ||
      String(l.debit || "").trim() ||
      String(l.credit || "").trim() ||
      String(l.business_line_code || "").trim() ||
      String(l.branch_code || "").trim()
    );
  });

  if (usedCancelLines.length === 0) {
    setMessages([{ level: "error", text: "El asiento de cancelación no tiene líneas." }]);
    return;
  }

  const cancelDebit = usedCancelLines.reduce((s, l) => s + toNum(l.debit), 0);
  const cancelCredit = usedCancelLines.reduce((s, l) => s + toNum(l.credit), 0);

  if (Math.abs(cancelDebit - cancelCredit) >= 0.5) {
    setMessages([{ level: "error", text: "El asiento de cancelación no cuadra." }]);
    return;
  }

    try {
      setCancelSubmitting(true);

      const userId = await getAuthUserId();

      const { data: docRow, error: docError } = await supabase
        .from("trade_docs")
        .select("id,issue_date,currency_code,reference,doc_type,fiscal_doc_code,series,number,status")
        .eq("company_id", companyId)
        .eq("id", cancelTargetDocId)
        .single();

      if (docError) throw docError;
      if ((docRow as any)?.status !== "VIGENTE") {
        throw new Error("Solo se pueden cancelar documentos en estado VIGENTE.");
      }

      const accountingPeriodId = await getCurrentAccountingPeriodId(companyId, cancelDate);
      if (!accountingPeriodId) {
        throw new Error(
          `La fecha ${cancelDate} no pertenece a un período contable ABIERTO o el período está bloqueado.`
        );
      }

      const docLabel = [
        (docRow as any)?.fiscal_doc_code || "",
        folioLabel((docRow as any)?.series, (docRow as any)?.number),
      ]
        .filter(Boolean)
        .join(" ");

      const cancelDescription = `Cancelación ${docLabel}`.trim();

      const { data: newJournalEntry, error: newJournalEntryError } = await supabase
        .from("journal_entries")
        .insert({
          company_id: companyId,
          entry_date: cancelDate,
          description: cancelDescription,
          reference: (docRow as any)?.reference || null,
          currency_code: (docRow as any)?.currency_code || baseCurrency,
          status: "DRAFT",
          accounting_period_id: accountingPeriodId,
          created_by: userId,
          extra: {
            source: "trade_doc_cancellation",
            source_trade_doc_id: cancelTargetDocId,
            source_journal_entry_id: cancelSourceJournalEntryId,
            cancel_reason: cancelReason || null,
          },
        })
        .select("id")
        .single();

      if (newJournalEntryError) throw newJournalEntryError;

      const reverseEntryId = (newJournalEntry as any)?.id;
      if (!reverseEntryId) throw new Error("No se pudo crear el asiento de cancelación.");

      const insertLines = usedCancelLines.map((l, idx) => {
        const acc = accByCode[String(l.account_code || "").trim()];
        if (!acc?.id) {
          throw new Error(`La cuenta contable ${l.account_code} no existe.`);
        }

        return {
          company_id: companyId,
          journal_entry_id: reverseEntryId,
          line_no: idx + 1,
          account_node_id: acc.id,
          line_description: String(l.description || cancelDescription),
          line_reference: (docRow as any)?.reference || null,
          debit: toNum(l.debit),
          credit: toNum(l.credit),
          counterparty_id: null,
          cost_center_id: null,
          business_line_id: l.business_line_id || null,
          branch_id: l.branch_id || null,
          item_id: null,
          tax_id: null,
          tax_rate_id: null,
          account_code_snapshot: acc.code,
          account_name_snapshot: acc.name,
          counterparty_identifier_snapshot: null,
          counterparty_name_snapshot: null,
          created_by: userId,
        };
      });

      const { error: insertLinesError } = await supabase
        .from("journal_entry_lines")
        .insert(insertLines as any);

      if (insertLinesError) throw insertLinesError;

      const { error: postError } = await supabase.rpc("post_journal_entry", {
        _entry_id: reverseEntryId,
      });

      if (postError) throw postError;

      const { error: cancelDocError } = await supabase
        .from("trade_docs")
        .update({
          status: "CANCELADO",
          cancelled_at: cancelDate,
          cancel_reason: cancelReason || null,
        })
        .eq("company_id", companyId)
        .eq("id", cancelTargetDocId)
        .eq("status", "VIGENTE");

      if (cancelDocError) throw cancelDocError;

      if (cancelMode === "editor") {
        setHeader((prev) => ({
          ...prev,
          status: "CANCELADO",
          cancelled_at: cancelDate,
          cancel_reason: cancelReason || "",
        }));
      } else {
        setViewerHeader((prev) => ({
          ...prev,
          status: "CANCELADO",
          cancelled_at: cancelDate,
          cancel_reason: cancelReason || "",
        }));
      }

      setCancelModalOpen(false);
      await loadDrafts(true);
      await loadRegisteredDocs(true);

      setMessages([
        {
          level: "warn",
          text: `Documento cancelado y reversado contablemente (${cancelDate}).`,
        },
      ]);
    } catch (e: any) {
      setMessages([
        {
          level: "error",
          text: e?.message || "No se pudo cancelar el documento.",
        },
      ]);
    } finally {
      setCancelSubmitting(false);
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
                  payment_date,
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
                payment_date: String(p?.payment_date || (h as any).issue_date || todayISO()),
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
                .select("id,payment_date,method,reference,card_kind,card_last4,auth_code,total_amount,extra")
                .eq("company_id", companyId);

              if (payFallbackError) throw payFallbackError;

              parsedPayments = (((payFallback as any[]) || [])
                .filter((p: any) => p?.extra?.trade_doc_id === draftId)
                .map((p: any) => ({
                  id: String(p.id || uid()),
                  payment_date: String(p.payment_date || (h as any).issue_date || todayISO()),
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
      let originRow: any = null;
      let originLabel = "";

      if (originId) {
        const { data: od } = await supabase
          .from("trade_docs")
          .select("id,doc_type,fiscal_doc_code,series,number,issue_date,net_taxable,net_exempt,tax_total,grand_total,currency_code,status")
          .eq("company_id", companyId)
          .eq("id", originId)
          .maybeSingle();

        originRow = od;
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
        cancelled_at: (h as any).cancelled_at || "",
        cancel_reason: (h as any).cancel_reason || "",
        origin_doc_id: originId,
        origin_label: originLabel,
        origin_doc_type: originRow?.doc_type ?? null,
        origin_fiscal_doc_code: originRow?.fiscal_doc_code ?? null,
        origin_issue_date: originRow?.issue_date ?? null,
        origin_currency_code: originRow?.currency_code ?? null,
        origin_net_taxable: originRow?.net_taxable ?? null,
        origin_net_exempt: originRow?.net_exempt ?? null,
        origin_tax_total: originRow?.tax_total ?? null,
        origin_grand_total: originRow?.grand_total ?? null,
        origin_balance: originRow?.grand_total ?? null,
        origin_payment_status: null,
        origin_status: originRow?.status ?? null,
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
              ...Array.from({ length: 4 - parsedLines.length }, (_, i) => makeDocLine(parsedLines.length + i + 1)),
            ])
      );

      setPayments(
        (h as any).doc_type === "CREDIT_NOTE" || (h as any).doc_type === "DEBIT_NOTE"
          ? []
          : parsedPayments
      );

      
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
                { length: Math.max(4 - draftJournalLines.length, 0) },
                (_, i) => makeJournalLine(draftJournalLines.length + i + 1)
              ),
            ])
      );

      setEditorTab("CABECERA");
      setOriginSearchOpen(false);
      setEditorOpen(true);
    } catch (e: any) {
      setMessages([{ level: "error", text: e?.message || "No se pudo abrir el borrador." }]);
    }
  }

  async function openRegisteredDocView(tradeDocId: string) {
    if (!companyId) return;

    const row =
      registeredDocs.find((x) => x.id === tradeDocId) ||
      drafts.find((x) => x.id === tradeDocId);

    if (!row) {
      setMessages([
        { level: "error", text: "No se encontró el documento para abrir en modo consulta." },
      ]);
      return;
    }

    await openViewDoc(row as any, { allowCancelInViewer: true });
  }

  async function deleteDraftInternal(draftId: string) {
    if (!companyId) throw new Error("Falta companyId.");
    if (!draftId) throw new Error("Falta draftId.");

    const { error } = await supabase.rpc("delete_trade_doc_draft", {
      _company_id: companyId,
      _trade_doc_id: draftId,
    });

    if (error) throw error;
  }

  async function deleteDraftsWithProgress(args: {
    ids: string[];
    messageScope?: "page" | "editor";
    closeEditorOnSuccess?: boolean;
    clearSelectionOnSuccess?: boolean;
    successText?: string;
  }) {
    const {
      ids,
      messageScope = "page",
      closeEditorOnSuccess = false,
      clearSelectionOnSuccess = false,
      successText = ids.length === 1 ? "Borrador eliminado." : "Borradores eliminados.",
    } = args;

    if (!companyId || !canEdit) return false;

    const cleanIds = Array.from(new Set((ids || []).filter(Boolean)));
    if (cleanIds.length === 0) return false;

    try {
      clearScopedMessages(messageScope);
      setProgressMode("DELETE_DRAFT");
      setDraftDeleting(true);

      if (cleanIds.length === 1) {
        await deleteDraftInternal(cleanIds[0]);
        if (docId === cleanIds[0]) clearForm();
      } else {
        const { data, error } = await supabase.rpc("bulk_delete_trade_doc_drafts", {
          _company_id: companyId,
          _trade_doc_ids: cleanIds,
        });

        if (error) throw error;

        const okCount = Number((data as any)?.ok_count || 0);
        const errorCount = Number((data as any)?.error_count || 0);
        const errors = Array.isArray((data as any)?.errors) ? (data as any).errors : [];

        if (docId && cleanIds.includes(docId)) {
          clearForm();
        }

        if (errorCount > 0) {
          finishBulkRegisterProgress();

          const reportRows: ActionReportRow[] = [];

          if (okCount > 0) {
            reportRows.push({
              scope: "DELETE",
              status: "OK",
              message: `${okCount} borrador(es) eliminados correctamente.`,
            });
          }

          errors.forEach((x: any) => {
            reportRows.push({
              scope: "DELETE",
              status: "ERROR",
              trade_doc_id: x.trade_doc_id || null,
              message: x.message || "Error al eliminar",
            });
          });

          setScopedMessages(
            [
              {
                level: "warn",
                text: `Se eliminaron ${okCount} borrador(es). ${errorCount} quedaron con error. Exporta el reporte para ver el detalle.`,
              },
            ],
            messageScope,
            {
              fileName: "reporte_eliminacion_borradores.xlsx",
              rows: reportRows,
            }
          );

          await loadDrafts();
          return false;
        }
      }

      if (closeEditorOnSuccess) {
        closeEditor();
      }

      if (clearSelectionOnSuccess) {
        clearDraftSelection();
      }

      await loadDrafts();
      finishBulkRegisterProgress();

      setScopedMessages(
        [{ level: "warn", text: successText }],
        messageScope,
        {
          fileName: "reporte_eliminacion_borradores.xlsx",
          rows: [
            {
              scope: "DELETE",
              status: "OK",
              message: successText,
            },
          ],
        }
      );
      return true;
    } catch (e: any) {
      resetBulkRegisterProgressNow();

      setScopedMessages(
        [{ level: "error", text: e?.message || "No se pudo eliminar el borrador." }],
        messageScope,
        {
          fileName: "reporte_eliminacion_borradores.xlsx",
          rows: [
            {
              scope: "DELETE",
              status: "ERROR",
              message: e?.message || "No se pudo eliminar el borrador.",
            },
          ],
        }
      );

      await loadDrafts();
      return false;
    } finally {
      setDraftDeleting(false);
    }
  }

  async function openViewDoc(
    doc: OriginDocLite,
    options?: { allowCancelInViewer?: boolean }
  ) {
    if (!companyId) return;

    try {
      setMessages([]);
      setViewerShowCancelButton(Boolean(options?.allowCancelInViewer));

      const tradeDocId = doc.id;

      const { data: row, error: rowError } = await supabase
        .from("trade_docs")
        .select(`
          id,
          doc_type,
          status,
          issue_date,
          due_date,
          series,
          number,
          currency_code,
          branch_id,
          counterparty_identifier_snapshot,
          counterparty_name_snapshot,
          reference,
          cancelled_at,
          cancel_reason,
          origin_doc_id,
          fiscal_doc_code,
          journal_entry_id
        `)
        .eq("company_id", companyId)
        .eq("id", tradeDocId)
        .maybeSingle();

      if (rowError) throw rowError;
      if (!row) throw new Error("No se encontró el documento.");

      const { data: lineRows, error: lineError } = await supabase
        .from("trade_doc_lines")
        .select("line_no,item_id,sku,description,qty,unit_price,tax_kind,exempt_amount,taxable_amount,tax_rate,tax_amount,line_total")
        .eq("company_id", companyId)
        .eq("trade_doc_id", tradeDocId)
        .order("line_no", { ascending: true });

      if (lineError) throw lineError;

      const { data: payAllocRows, error: payAllocError } = await supabase
        .from("payment_allocations")
        .select(`
          allocated_amount,
          payments (
            id,
            payment_date,
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
        .eq("trade_doc_id", tradeDocId);

      if (payAllocError) throw payAllocError;

      let parsedPayments: PaymentRow[] = (((payAllocRows as any[]) || []).map((r: any) => {
        const p = Array.isArray(r.payments) ? r.payments[0] : r.payments;

        return {
          id: String(p?.id || uid()),
          payment_date: String(p?.payment_date || header.issue_date || todayISO()),
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
          .select("id,payment_date,method,reference,card_kind,card_last4,auth_code,total_amount,extra")
          .eq("company_id", companyId);

        if (payFallbackError) throw payFallbackError;

        parsedPayments = (((payFallback as any[]) || [])
          .filter((p: any) => p?.extra?.trade_doc_id === tradeDocId)
          .map((p: any) => ({
            id: String(p.id || uid()),
            payment_date: String(p.payment_date || (row as any).issue_date || todayISO()),
            method: (p.method || "TRANSFERENCIA") as PaymentRow["method"],
            amount: String(p.total_amount ?? ""),
            card_kind: (p.card_kind || "") as PaymentRow["card_kind"],
            card_last4: String(p.card_last4 || ""),
            auth_code: String(p.auth_code || ""),
            reference: String(p.reference || ""),
          }))) as PaymentRow[];
      }

      let originRow: any = null;
      let originLabel = "";
      const originId = (row as any).origin_doc_id ?? null;

      if (originId) {
        const { data: od } = await supabase
          .from("trade_docs")
          .select("id,doc_type,fiscal_doc_code,series,number,issue_date,net_taxable,net_exempt,tax_total,grand_total,currency_code,status")
          .eq("company_id", companyId)
          .eq("id", originId)
          .maybeSingle();

        originRow = od;
        originLabel = folioLabel((od as any)?.series, (od as any)?.number);
      }

      const parsedLines: DocLine[] = (((lineRows as any[]) || []).map((r: any) => {
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
          ex_override: exemptAmount > 0 ? String(exemptAmount) : "",
          af_override: taxableAmount > 0 ? String(taxableAmount) : "",
          iva_override: taxAmount > 0 ? String(taxAmount) : "",
          total_override: lineTotal > 0 ? String(lineTotal) : "",
        };
      })) as DocLine[];

      let journalRows: JournalLine[] = [];
      const journalEntryId = (row as any).journal_entry_id ?? null;

      if (journalEntryId) {
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

        journalRows = ((jlData as any[]) || []).map((r: any) => {
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

      setViewerDocId(tradeDocId);

      setViewerHeader({
        doc_type: (row as any).doc_type,
        fiscal_doc_code: String((row as any).fiscal_doc_code ?? ""),
        status: (row as any).status,
        issue_date: (row as any).issue_date || todayISO(),
        due_date: (row as any).due_date || (row as any).issue_date || todayISO(),
        series: (row as any).series || "",
        number: (row as any).number || "",
        currency_code: (row as any).currency_code || baseCurrency,
        branch_id: (row as any).branch_id || "",
        counterparty_identifier: (row as any).counterparty_identifier_snapshot || "",
        counterparty_name: (row as any).counterparty_name_snapshot || "",
        reference: (row as any).reference || "",
        cancelled_at: (row as any).cancelled_at || "",
        cancel_reason: (row as any).cancel_reason || "",
        origin_doc_id: originId,
        origin_label: originLabel,
        origin_doc_type: originRow?.doc_type ?? null,
        origin_fiscal_doc_code: originRow?.fiscal_doc_code ?? null,
        origin_issue_date: originRow?.issue_date ?? null,
        origin_currency_code: originRow?.currency_code ?? null,
        origin_net_taxable: originRow?.net_taxable ?? null,
        origin_net_exempt: originRow?.net_exempt ?? null,
        origin_tax_total: originRow?.tax_total ?? null,
        origin_grand_total: originRow?.grand_total ?? null,
        origin_balance: originRow?.grand_total ?? null,
        origin_payment_status: null,
        origin_status: originRow?.status ?? null,
      });

      setViewerLines(
        parsedLines.length >= 4
          ? renumber(parsedLines)
          : renumber([
              ...parsedLines,
              ...Array.from({ length: Math.max(4 - parsedLines.length, 0) }, (_, i) =>
                makeDocLine(parsedLines.length + i + 1)
              ),
            ])
      );

      setViewerPayments(
        (row as any).doc_type === "CREDIT_NOTE" || (row as any).doc_type === "DEBIT_NOTE"
          ? []
          : parsedPayments
      );

      setViewerJournalLines(
        journalRows.length >= 4
          ? renumber(journalRows)
          : renumber([
              ...journalRows,
              ...Array.from({ length: Math.max(4 - journalRows.length, 0) }, (_, i) =>
                makeJournalLine(journalRows.length + i + 1)
              ),
            ])
      );

      setViewerEditorTab("CABECERA");
      setViewerOpen(true);
    } catch (e: any) {
      setMessages([
        {
          level: "error",
          text: e?.message || "No se pudo abrir el documento en modo consulta.",
        },
      ]);
    }
  }


  async function deleteDraft(draftId: string) {
    if (!companyId || !canEdit) return;

    const ok = confirm("¿Eliminar este borrador? No se puede deshacer.");
    if (!ok) return;

    await deleteDraftsWithProgress({
      ids: [draftId],
      messageScope: "page",
      closeEditorOnSuccess: false,
      clearSelectionOnSuccess: false,
      successText: "Borrador eliminado.",
    });
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

  const headerBranchCode = useMemo(() => {
    if (!header.branch_id) return "";
    return branchById[header.branch_id]?.code || "";
  }, [header.branch_id, branchById]);

  const viewerHeaderBranchCode = useMemo(() => {
    if (!viewerHeader.branch_id) return "";
    return branchById[viewerHeader.branch_id]?.code || "";
  }, [viewerHeader.branch_id, branchById]);

  function setViewerHeaderBranchCode(rawCode: string) {
    const typedCode = String(rawCode || "").trim();
    const foundBranch = typedCode ? branchByCode[typedCode] : null;

    setViewerHeader((h) => ({
      ...h,
      branch_id: foundBranch?.id || "",
    }));
  }
  
  const accountPolicyByCode = useMemo(() => {
    const map: Record<
      string,
      {
        require_cu: boolean;
        require_suc: boolean;
      }
    > = {};

    for (const [code, policy] of Object.entries(postingPolicyByAccountCode)) {
      map[String(code).trim()] = {
        require_cu: Boolean(policy?.require_cu),
        require_suc: Boolean(policy?.require_suc),
      };
    }

    return map;
  }, [postingPolicyByAccountCode]);

  // =========================
  // Excel import handlers
  // =========================
  function downloadImportTemplate() {
    window.open(
      "/templates/Plantilla_carga_masiva_documentos_tributarios.xlsx",
      "_blank"
    );
  }

  function openImport() {
    setImportErrors([]);
    setImportValidationRows([]);
    setImportPreview([]);
    setImportOpen(true);
    setActionReport(null);
  }

  function closeImport() {
    setImportOpen(false);
    setImportErrors([]);
    setImportValidationRows([]);
    setImportPreview([]);
    (window as any).__tradeDocImportParsed = null;
  }

  async function onPickExcel(file: File) {
    setImportErrors([]);
    setImportValidationRows([]);
    setImportPreview([]);
    setProgressMode("IMPORT_VALIDATE");
    setBulkRegisterProgressVisible(true);
    setBulkRegisterProgressDone(false);
    setBulkRegisterProgress(8);

    try {
      const ab = await file.arrayBuffer();
      const wb = XLSX.read(ab, { type: "array" });

      const wsDocs = wb.Sheets["DOCUMENTOS"];
      const wsLines = wb.Sheets["LINEAS"];
      const wsPayments = wb.Sheets["PAGOS"];

      if (!wsDocs) throw new Error("Falta la hoja DOCUMENTOS.");
      if (!wsLines) throw new Error("Falta la hoja LINEAS.");
      if (!wsPayments) throw new Error("Falta la hoja PAGOS.");

      const rawDocs = XLSX.utils.sheet_to_json(wsDocs, { defval: "" }) as any[];
      const rawLines = XLSX.utils.sheet_to_json(wsLines, { defval: "" }) as any[];
      const rawPayments = XLSX.utils.sheet_to_json(wsPayments, { defval: "" }) as any[];
      setBulkRegisterProgress(25);

      const normalizeDate = (v: any) => {
        if (!v) return "";
        if (typeof v === "number") {
          const d = XLSX.SSF.parse_date_code(v);
          if (!d) return "";
          const mm = String(d.m).padStart(2, "0");
          const dd = String(d.d).padStart(2, "0");
          return `${d.y}-${mm}-${dd}`;
        }
        return String(v).slice(0, 10);
      };

      const normalizeDocType = (v: any): DocType => {
        const x = String(v || "").trim().toUpperCase();
        if (["INVOICE", "FACTURA", "FACT", "33", "34", "39", "41"].includes(x)) return "INVOICE";
        if (["DEBIT_NOTE", "ND", "NOTA_DEBITO", "NOTA DE DEBITO", "56"].includes(x)) return "DEBIT_NOTE";
        if (["CREDIT_NOTE", "NC", "NOTA_CREDITO", "NOTA DE CREDITO", "61"].includes(x)) return "CREDIT_NOTE";
        return "INVOICE";
      };

      const docs = rawDocs.map((r, idx) => {
        const fiscalDocCode = String(
          r.fiscal_doc_code ?? r.codigo_fiscal ?? r.tipo_dte ?? ""
        ).trim();

        const number = String(
          r.number ?? r.numero ?? r.folio ?? ""
        ).trim();

        const docKey = `${fiscalDocCode}-${number}`;

        return {
          source_row_no: idx + 2,
          doc_key: docKey,
          doc_type: normalizeDocType(r.doc_type ?? r.tipo ?? r.doc_type_code),
          fiscal_doc_code: fiscalDocCode,
          issue_date: normalizeDate(r.issue_date ?? r.fecha_emision),
          due_date: normalizeDate(r.due_date ?? r.fecha_vencimiento ?? r.issue_date ?? r.fecha_emision),
          series: String(r.series ?? r.serie ?? "").trim(),
          number,
          currency_code: String(r.currency_code ?? r.moneda ?? baseCurrency ?? "CLP").trim().toUpperCase(),
          branch_code: String(r.branch_code ?? r.sucursal ?? r.branch ?? "").trim(),
          counterparty_identifier: String(
            r.counterparty_identifier ?? r.rut ?? r.rfc ?? r.nit ?? ""
          ).trim(),
          counterparty_name: String(
            r.counterparty_name ?? r.nombre ?? r.razon_social ?? ""
          ).trim(),
          reference: String(r.reference ?? r.referencia ?? "").trim(),
          origin_fiscal_doc_code: String(
            r.origin_fiscal_doc_code ?? r.codigo_fiscal_origen ?? ""
          ).trim(),
          origin_series: String(
            r.origin_series ?? r.serie_origen ?? ""
          ).trim(),
          origin_number: String(
            r.origin_number ?? r.numero_origen ?? r.folio_origen ?? ""
          ).trim(),
        };
      });

      const lines = rawLines.map((r, idx) => {
        const fiscalDocCode = String(
          r.fiscal_doc_code ?? r.codigo_fiscal ?? ""
        ).trim();

        const number = String(
          r.number ?? r.numero ?? r.folio ?? ""
        ).trim();

        const isTaxableRaw = String(
          r.is_taxable ?? r.afecto ?? r.grava_iva ?? "true"
        )
          .trim()
          .toLowerCase();

        const isTaxable =
          isTaxableRaw === "true" ||
          isTaxableRaw === "1" ||
          isTaxableRaw === "si" ||
          isTaxableRaw === "sí" ||
          isTaxableRaw === "afecto";

        const taxRate = Number(r.tax_rate ?? r.tasa_impuesto ?? 0);
        const ex = Number(r.monto_exento ?? r.exempt_amount ?? 0);
        const af = Number(r.monto_afecto ?? r.taxable_amount ?? 0);
        const total = Number(r.monto_total ?? r.line_total ?? r.total_linea ?? 0);

        const iva =
          r.tax_amount != null && r.tax_amount !== ""
            ? Number(r.tax_amount)
            : isTaxable && taxRate > 0
            ? Math.round(af * (taxRate / 100))
            : 0;

        return {
          doc_key: `${fiscalDocCode}-${number}`,
          line_no: Number(r.line_no ?? r.linea ?? idx + 1),
          sku: String(r.sku ?? "").trim(),
          description: String(r.description ?? r.descripcion ?? "").trim(),

          qty: String(r.qty ?? r.cantidad ?? 0),
          unit_price: String(r.unit_price ?? r.precio_unitario ?? 0),

          is_taxable: isTaxable,
          tax_rate: String(taxRate),

          ex_override: ex > 0 ? String(ex) : "",
          af_override: af > 0 ? String(af) : "",
          iva_override: iva > 0 ? String(iva) : "",
          total_override: total > 0 ? String(total) : "",
        };
      });

      const payments = rawPayments
        .map((r, idx) => {
          const fiscalDocCode = String(
            r.fiscal_doc_code ?? r.codigo_fiscal ?? ""
          ).trim();

          const number = String(
            r.number ?? r.numero ?? r.folio ?? ""
          ).trim();

          if (!fiscalDocCode || !number) return null;

          return {
            doc_key: `${fiscalDocCode}-${number}`,
            payment_no: Number(r.payment_no ?? r.nro_pago ?? idx + 1),
            payment_date: normalizeDate(r.payment_date ?? r.fecha_pago),
            method: String(r.method ?? r.metodo ?? "").trim().toUpperCase(),
            reference: String(r.reference ?? r.referencia ?? "").trim(),
            card_kind: String(r.card_kind ?? r.tipo_tarjeta ?? "").trim().toUpperCase(),
            card_last4: String(r.card_last4 ?? r.ultimos4 ?? "").trim(),
            auth_code: String(r.auth_code ?? r.codigo_autorizacion ?? "").trim(),
            amount: Number(r.amount ?? r.monto ?? 0),
          };
        })
        .filter(Boolean) as any[];
      
      setBulkRegisterProgress(60);

      const validationRows: ActionReportRow[] = [];

      docs.forEach((d, i) => {
        if (!d.fiscal_doc_code) validationRows.push({ scope: "IMPORT_VALIDATE", status: "ERROR", row_ref: `DOCUMENTOS fila ${i + 2}`, doc_key: d.doc_key || null, message: "fiscal_doc_code vacío." });
        if (!d.number) validationRows.push({ scope: "IMPORT_VALIDATE", status: "ERROR", row_ref: `DOCUMENTOS fila ${i + 2}`, doc_key: d.doc_key || null, message: "number vacío." });
        if (!d.issue_date) validationRows.push({ scope: "IMPORT_VALIDATE", status: "ERROR", row_ref: `DOCUMENTOS fila ${i + 2}`, doc_key: d.doc_key || null, message: "issue_date vacío." });
        if (!d.due_date) validationRows.push({ scope: "IMPORT_VALIDATE", status: "ERROR", row_ref: `DOCUMENTOS fila ${i + 2}`, doc_key: d.doc_key || null, message: "due_date vacío." });
        if (!d.currency_code) validationRows.push({ scope: "IMPORT_VALIDATE", status: "ERROR", row_ref: `DOCUMENTOS fila ${i + 2}`, doc_key: d.doc_key || null, message: "currency_code vacío." });
        if (!d.branch_code) validationRows.push({ scope: "IMPORT_VALIDATE", status: "ERROR", row_ref: `DOCUMENTOS fila ${i + 2}`, doc_key: d.doc_key || null, message: "branch_code vacío." });
        if (!d.counterparty_identifier) validationRows.push({ scope: "IMPORT_VALIDATE", status: "ERROR", row_ref: `DOCUMENTOS fila ${i + 2}`, doc_key: d.doc_key || null, message: "counterparty_identifier vacío." });
        if (!d.counterparty_name) validationRows.push({ scope: "IMPORT_VALIDATE", status: "ERROR", row_ref: `DOCUMENTOS fila ${i + 2}`, doc_key: d.doc_key || null, message: "counterparty_name vacío." });
      });

      lines.forEach((l, i) => {
        if (!l.doc_key) validationRows.push({ scope: "IMPORT_VALIDATE", status: "ERROR", row_ref: `LINEAS fila ${i + 2}`, doc_key: l.doc_key || null, message: "doc_key inválido." });
        if (!l.description) validationRows.push({ scope: "IMPORT_VALIDATE", status: "ERROR", row_ref: `LINEAS fila ${i + 2}`, doc_key: l.doc_key || null, message: "description vacía." });
        if (Number(l.qty || 0) <= 0) validationRows.push({ scope: "IMPORT_VALIDATE", status: "ERROR", row_ref: `LINEAS fila ${i + 2}`, doc_key: l.doc_key || null, message: "qty debe ser mayor a 0." });
        if (Number(l.unit_price || 0) < 0) validationRows.push({ scope: "IMPORT_VALIDATE", status: "ERROR", row_ref: `LINEAS fila ${i + 2}`, doc_key: l.doc_key || null, message: "unit_price no puede ser negativo." });

        const ex = Number(l.ex_override || 0);
        const af = Number(l.af_override || 0);
        const iva = Number(l.iva_override || 0);
        const total = Number(l.total_override || 0);

        if (Math.abs((ex + af + iva) - total) > 1) {
          validationRows.push({ scope: "IMPORT_VALIDATE", status: "ERROR", row_ref: `LINEAS fila ${i + 2}`, doc_key: l.doc_key || null, message: "los montos no cuadran." });
        }
      });

      setImportValidationRows(validationRows);
      setImportErrors(
        validationRows.length > 0
          ? [`Se detectaron ${validationRows.length} error(es). Exporta el reporte para ver el detalle.`]
          : []
      );
      setActionReport(
        validationRows.length > 0
          ? {
              fileName: "reporte_validacion_importacion.xlsx",
              rows: validationRows,
            }
          : {
              fileName: "reporte_validacion_importacion.xlsx",
              rows: [
                {
                  scope: "IMPORT_VALIDATE",
                  status: "OK",
                  message: `Validación correcta. Documentos: ${docs.length}.`,
                },
              ],
            }
      );
      setBulkRegisterProgress(85);

      setImportPreview(
        docs.slice(0, 200).map((d) => ({
          ...d,
          lines_count: lines.filter((x) => x.doc_key === d.doc_key).length,
          payments_count: payments.filter((x) => x.doc_key === d.doc_key).length,
        }))
      );

      (window as any).__tradeDocImportParsed = {
        fileName: file.name,
        docs,
        lines,
        payments,
      };
    finishBulkRegisterProgress();
    } catch (e: any) {
      resetBulkRegisterProgressNow();
      setImportValidationRows([
        {
          scope: "IMPORT_VALIDATE",
          status: "ERROR",
          message: e?.message || "No se pudo leer el archivo.",
        },
      ]);
      setImportErrors([e?.message || "No se pudo leer el archivo."]);
      setActionReport({
        fileName: "reporte_validacion_importacion.xlsx",
        rows: [
          {
            scope: "IMPORT_VALIDATE",
            status: "ERROR",
            message: e?.message || "No se pudo leer el archivo.",
          },
        ],
      });
      setImportPreview([]);
      (window as any).__tradeDocImportParsed = null;
    }
  }

  async function confirmImportToDrafts() {
    if (!companyId || !canEdit) return;

    const parsed = (window as any).__tradeDocImportParsed;
    if (!parsed) {
      setMessages([{ level: "error", text: "Primero debes cargar un archivo válido." }]);
      setActionReport(null);
      return;
    }

    if (importValidationRows.length > 0) {
      setMessages([{ level: "error", text: "Corrige los errores del archivo antes de importar." }]);
      setActionReport({
        fileName: "reporte_validacion_importacion.xlsx",
        rows: importValidationRows,
      });
      return;
    }

    setImporting(true);
    setProgressMode("IMPORT_UPLOAD");
    setBulkRegisterProgressVisible(true);
    setBulkRegisterProgressDone(false);
    setBulkRegisterProgress(10);

    try {
      const { data: jobId, error: jobError } = await supabase.rpc("create_trade_doc_import_job", {
        _company_id: companyId,
        _source: "EXCEL",
        _file_name: parsed.fileName || null,
      });

      if (jobError) throw jobError;
      if (!jobId) throw new Error("No se pudo crear el job de importación.");
      setBulkRegisterProgress(18);

      const chunkSize = 300;
      const totalDocs = parsed.docs.length;
      let uploadedDocs = 0;

      for (let i = 0; i < parsed.docs.length; i += chunkSize) {
        const docsChunk = parsed.docs.slice(i, i + chunkSize);

        const docKeys = new Set(docsChunk.map((d: any) => d.doc_key));

        const linesChunk = parsed.lines
          .filter((l: any) => docKeys.has(l.doc_key))
          .map((l: any) => {
            const taxRate = Number(l.tax_rate || 0);
            const exemptAmount = Number(l.ex_override || 0);
            const taxableAmount = Number(l.af_override || 0);
            const taxAmount = Number(l.iva_override || 0);
            const lineTotal = Number(l.total_override || 0);

            return {
              doc_key: l.doc_key,
              line_no: Number(l.line_no || 0),
              sku: String(l.sku || "").trim(),
              description: String(l.description || "").trim(),
              qty: Number(l.qty || 0),
              unit_price: Number(l.unit_price || 0),
              tax_kind: l.is_taxable ? "AFECTO" : "EXENTO",
              tax_rate: taxRate,
              exempt_amount: exemptAmount,
              taxable_amount: taxableAmount,
              tax_amount: taxAmount,
              line_total: lineTotal,
            };
          });

        const paymentsChunk = parsed.payments.filter((p: any) => docKeys.has(p.doc_key));

        const { error: appendError } = await supabase.rpc("append_trade_doc_import_batch", {
          _job_id: jobId,
          _company_id: companyId,
          _docs: docsChunk,
          _lines: linesChunk,
          _payments: paymentsChunk,
        });

        if (appendError) throw appendError;

        uploadedDocs += docsChunk.length;
        const uploadProgress = Math.round((uploadedDocs / totalDocs) * 52);
        setBulkRegisterProgress(Math.min(70, 18 + uploadProgress));
      }

      setProgressMode("IMPORT_PROCESS");
      setBulkRegisterProgress(78);

      const { data: processResult, error: processError } = await supabase.rpc("process_trade_doc_import_job", {
        _job_id: jobId,
        _company_id: companyId,
      });

      if (processError) throw processError;
      setBulkRegisterProgress(92);

      const { data: detailResult, error: detailError } = await supabase.rpc("get_trade_doc_import_job_result", {
        _job_id: jobId,
        _company_id: companyId,
      });

      if (detailError) throw detailError;

      const job = (detailResult as any)?.job || {};
      const results = Array.isArray((detailResult as any)?.results) ? (detailResult as any).results : [];

      const okDocs = Number(job.ok_docs || 0);
      const errorDocs = Number(job.error_docs || 0);

      const reportRows: ActionReportRow[] = results.map((r: any) => ({
        scope: "IMPORT_PROCESS",
        status: r.status === "ERROR" ? "ERROR" : "OK",
        doc_key: r.doc_key || null,
        trade_doc_id: r.trade_doc_id || null,
        message:
          r.message || (r.status === "ERROR" ? "Error de importación" : "Importado correctamente"),
      }));

      setMessages([
        {
          level: errorDocs > 0 ? "warn" : "warn",
          text:
            errorDocs > 0
              ? `Carga masiva finalizada. OK: ${okDocs}. Con error: ${errorDocs}. Exporta el reporte para ver el detalle.`
              : `Carga masiva finalizada. OK: ${okDocs}.`,
        },
      ]);
      setActionReport({
        fileName: "reporte_importacion_documentos.xlsx",
        rows:
          reportRows.length > 0
            ? reportRows
            : [
                {
                  scope: "IMPORT_PROCESS",
                  status: errorDocs > 0 ? "ERROR" : "OK",
                  message: `Carga masiva finalizada. OK: ${okDocs}. Con error: ${errorDocs}.`,
                },
              ],
      });

      closeImport();
      await loadDrafts(true);
      await loadRegisteredDocs(true);

      (window as any).__tradeDocImportParsed = null;
      finishBulkRegisterProgress();
    } catch (e: any) {
      resetBulkRegisterProgressNow();
      setMessages([
        { level: "error", text: e?.message || "No se pudo completar la importación masiva." },
      ]);
      setActionReport({
        fileName: "reporte_importacion_documentos.xlsx",
        rows: [
          {
            scope: "IMPORT_PROCESS",
            status: "ERROR",
            message: e?.message || "No se pudo completar la importación masiva.",
          },
        ],
      });
    } finally {
      setImporting(false);
    }
  }

  async function bulkRegisterSelected() {
    if (!canEdit || !companyId) return;
    if (selectedDraftIds.length === 0) return;

    const ok = confirm(
      `¿Registrar ${selectedDraftIds.length} borrador(es) como VIGENTE y contabilizarlos masivamente?`
    );
    if (!ok) return;

    try {
      setProgressMode("REGISTER");
      setBulkRegistering(true);
      setMessages([]);

      const { data, error } = await supabase.rpc("bulk_register_trade_docs", {
        _company_id: companyId,
        _trade_doc_ids: selectedDraftIds,
      });

      if (error) throw error;

      const okCount = Number((data as any)?.ok_count || 0);
      const errorCount = Number((data as any)?.error_count || 0);
      const errors = Array.isArray((data as any)?.errors) ? (data as any).errors : [];

      clearDraftSelection();
      await loadDrafts();
      await loadRegisteredDocs();
      finishBulkRegisterProgress();

      const reportRows: ActionReportRow[] = [];

      if (okCount > 0) {
        reportRows.push({
          scope: "REGISTER",
          status: "OK",
          message: `${okCount} documento(s) registrados correctamente.`,
        });
      }

      errors.forEach((x: any) => {
        reportRows.push({
          scope: "REGISTER",
          status: "ERROR",
          trade_doc_id: x.trade_doc_id || null,
          message: x.message || "Error al registrar",
        });
      });

      setMessages([
        {
          level: errorCount > 0 ? "warn" : "warn",
          text:
            errorCount > 0
              ? `Se registraron ${okCount} documento(s). ${errorCount} quedaron con error. Exporta el reporte para ver el detalle.`
              : `Se registraron ${okCount} documento(s) correctamente.`,
        },
      ]);
      setActionReport({
        fileName: "reporte_registro_masivo.xlsx",
        rows: reportRows,
      });
    } catch (e: any) {
      setMessages([
        {
          level: "error",
          text: e?.message || "No se pudo completar el registro masivo.",
        },
      ]);
      setActionReport({
        fileName: "reporte_registro_masivo.xlsx",
        rows: [
          {
            scope: "REGISTER",
            status: "ERROR",
            message: e?.message || "No se pudo completar el registro masivo.",
          },
        ],
      });
      finishBulkRegisterProgress();
      await loadDrafts();
      await loadRegisteredDocs();
    } finally {
      setBulkRegistering(false);
    }
  }

  async function bulkDeleteSelected() {
    if (!canEdit || !companyId) return;
    if (selectedDraftIds.length === 0) return;

    const ok = confirm(`¿Eliminar ${selectedDraftIds.length} borrador(es)? No se puede deshacer.`);
    if (!ok) return;

    await deleteDraftsWithProgress({
      ids: selectedDraftIds,
      messageScope: "page",
      closeEditorOnSuccess: false,
      clearSelectionOnSuccess: true,
      successText:
        selectedDraftIds.length === 1
          ? "Borrador eliminado."
          : `Se eliminaron ${selectedDraftIds.length} borrador(es).`,
    });
  }

  // ✅ regla visual: botón cancelar solo si es VIGENTE (contabilizado) + permitido por settings
  const showCancelButton = allowCancelSales && canEdit && Boolean(docId) && header.status === "VIGENTE";

  function getProgressTitle(mode: ProgressMode | null, done: boolean) {
    if (done) {
      switch (mode) {
        case "SAVE_DRAFT":
          return "Guardado completado";
        case "DELETE_DRAFT":
          return "Eliminación completada";
        case "REGISTER":
          return "Registro completado";
        case "IMPORT_VALIDATE":
        case "IMPORT_UPLOAD":
        case "IMPORT_PROCESS":
          return "Importación completada";
        default:
          return "Proceso completado";
      }
    }

    switch (mode) {
      case "SAVE_DRAFT":
        return "Guardando borrador";
      case "DELETE_DRAFT":
        return "Eliminando borradores";
      case "REGISTER":
        return "Registrando borradores";
      case "IMPORT_VALIDATE":
        return "Validando archivo";
      case "IMPORT_UPLOAD":
        return "Subiendo archivo";
      case "IMPORT_PROCESS":
        return "Procesando importación";
      default:
        return "Procesando";
    }
  }

  function getProgressDescription(mode: ProgressMode | null, done: boolean) {
    if (done) return "El proceso terminó correctamente.";

    switch (mode) {
      case "SAVE_DRAFT":
        return "El sistema está guardando el borrador.";
      case "DELETE_DRAFT":
        return "El sistema está eliminando los borradores seleccionados.";
      case "REGISTER":
        return "El sistema está contabilizando los documentos seleccionados.";
      case "IMPORT_VALIDATE":
        return "El sistema está validando la estructura del archivo.";
      case "IMPORT_UPLOAD":
        return "El sistema está cargando la información al servidor.";
      case "IMPORT_PROCESS":
        return "El sistema está procesando la importación.";
      default:
        return "El sistema está trabajando.";
    }
  }

  function getProgressFooter(mode: ProgressMode | null, done: boolean) {
    if (done) return "Finalizado";

    switch (mode) {
      case "SAVE_DRAFT":
        return "Guardando en servidor";
      case "DELETE_DRAFT":
        return "Eliminando en servidor";
      case "REGISTER":
        return "Procesando en servidor";
      case "IMPORT_VALIDATE":
        return "Validando";
      case "IMPORT_UPLOAD":
        return "Subiendo lotes";
      case "IMPORT_PROCESS":
        return "Procesando job";
      default:
        return "Procesando";
    }
  }

  return (
    <div className="p-6">
      {bulkRegisterProgressVisible ? (
        <div className="fixed right-5 top-5 z-[120] w-[min(380px,calc(100vw-2rem))]">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.18)]">
            <div className="px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-900">
                    {getProgressTitle(progressMode, bulkRegisterProgressDone)}
                  </div>

                  <div className="text-xs text-slate-500">
                    {getProgressDescription(progressMode, bulkRegisterProgressDone)}
                  </div>
                </div>

                <div className="shrink-0 text-sm font-extrabold text-slate-700">
                  {Math.min(100, Math.max(0, Math.round(bulkRegisterProgress)))}%
                </div>
              </div>

              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={cls(
                    "h-full rounded-full transition-all duration-300",
                    bulkRegisterProgressDone ? "bg-emerald-500" : "bg-slate-900"
                  )}
                  style={{ width: `${Math.min(100, Math.max(0, bulkRegisterProgress))}%` }}
                />
              </div>

              <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                <span>{getProgressFooter(progressMode, bulkRegisterProgressDone)}</span>
                <span>
                  {bulkRegistering || draftSaving || draftDeleting
                    ? "En curso..."
                    : bulkRegisterProgressDone
                      ? "Listo"
                      : ""}
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      <div className={tradeDocsTheme.shell}>
        <div className={cls(tradeDocsTheme.header, "px-7 py-7")}>
          <div className={tradeDocsTheme.glowA} />
          <div className={tradeDocsTheme.glowB} />

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
              <button
                type="button"
                className={tradeDocsTheme.btnGlass}
                onClick={() => {
                  if (activeTab === "drafts") {
                    setDraftsOffset(0);
                    setDraftsHasMore(true);
                    void loadDrafts(true);
                  } else {
                    setRegisteredOffset(0);
                    setRegisteredHasMore(true);
                    void loadRegisteredDocs(true);
                  }
                }}
              >
                {loadingDrafts ? "Cargando..." : "Refrescar"}
              </button>

              <button
                type="button"
                className={cls(tradeDocsTheme.btnGlass, !canEdit && "opacity-60 cursor-not-allowed")}
                disabled={!canEdit}
                onClick={openImport}
                title="Importar documentos desde Excel"
              >
                ⬆️ Cargar Excel
              </button>

              <button
                type="button"
                className={tradeDocsTheme.btnGlass}
                onClick={downloadImportTemplate}
                title="Descargar plantilla de carga masiva"
              >
                ⬇️ Descargar formato
              </button>

              <button
                type="button"
                className={cls(tradeDocsTheme.btnGlass, !canEdit && "opacity-60 cursor-not-allowed")}
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
              {messages.slice(0, 1).map((m, i) => (
                <div
                  key={i}
                  className={cls(
                    "rounded-xl border px-3 py-3 text-sm",
                    m.level === "error" ? "border-rose-200 bg-rose-50 text-rose-900" : "border-amber-200 bg-amber-50 text-amber-900"
                  )}
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>{m.text}</div>

                    {actionReport?.rows?.length ? (
                      <button
                        type="button"
                        className={tradeDocsTheme.btnSoft}
                        onClick={() => exportActionReport(actionReport.rows, actionReport.fileName)}
                      >
                        Exportar reporte
                      </button>
                    ) : null}
                  </div>
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
          <div className={tradeDocsTheme.card}>
            <div className="border-b px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveTab("drafts")}
                      className={cls(
                        "rounded-xl px-3 py-2 text-sm font-bold transition",
                        activeTab === "drafts"
                          ? "bg-[#123b63] text-white shadow"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      )}
                    >
                      Borradores
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveTab("registered")}
                      className={cls(
                        "rounded-xl px-3 py-2 text-sm font-bold transition",
                        activeTab === "registered"
                          ? "bg-[#123b63] text-white shadow"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      )}
                    >
                      Registrados
                    </button>
                  </div>

                  <div className="mt-2 text-[11px] text-slate-500">
                    {activeTab === "drafts"
                      ? "Documentos en borrador pendientes de registrar."
                      : "Documentos ya registrados o cancelados."}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">

                  <button
                    type="button"
                    className={tradeDocsTheme.btnFilter}
                    onClick={() => setFiltersOpen(true)}
                    title="Abrir filtros"
                  >
                    Filtros
                  </button>

                  <button
                    type="button"
                    className={tradeDocsTheme.btnSoft}
                    onClick={clearListFilters}
                    title="Limpiar filtros"
                  >
                    Limpiar filtros
                  </button>

                  {activeTab === "drafts" && drafts.length ? (
                    <>
                      <button
                        type="button"
                        className={tradeDocsTheme.btnSoft}
                        onClick={toggleSelectAllDrafts}
                        disabled={!canEdit}
                      >
                        {allDraftsSelected ? "Quitar selección" : "Seleccionar todo"}
                      </button>

                      <button
                        type="button"
                        className={tradeDocsTheme.btnSoft}
                        onClick={clearDraftSelection}
                      >
                        Limpiar
                      </button>

                      <button
                        type="button"
                        className={cls(
                          tradeDocsTheme.btnPrimary,
                          (!canEdit || selectedDraftIds.length === 0 || bulkRegistering) &&
                            "opacity-60 cursor-not-allowed"
                        )}
                        disabled={!canEdit || selectedDraftIds.length === 0 || bulkRegistering}
                        onClick={bulkRegisterSelected}
                      >
                        {bulkRegistering ? "Registrando..." : `Registrar (${selectedDraftIds.length})`}
                      </button>

                      <button
                        type="button"
                        className={cls(
                          tradeDocsTheme.btnSoft,
                          (!canEdit || selectedDraftIds.length === 0) && "opacity-60 cursor-not-allowed"
                        )}
                        disabled={!canEdit || selectedDraftIds.length === 0}
                        onClick={bulkDeleteSelected}
                      >
                        Eliminar ({selectedDraftIds.length})
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            </div>


            <div className="p-4">
              {activeTab === "drafts" ? (
                <TradeDocsTable
                  rows={filteredDrafts}
                  loading={loadingDrafts}
                  moneyDecimals={moneyDecimals}
                  canEdit={canEdit}
                  baseCurrency={baseCurrency}
                  companyId={companyId}
                  tabKey="drafts"
                  selectedMap={selectedDrafts}
                  allSelected={allDraftsSelected}
                  onToggleSelectAll={toggleSelectAllDrafts}
                  onToggleRow={toggleDraft}
                  onOpenRow={(id) => {
                    void openDraft(id);
                  }}
                  onExpandRow={(row) => {
                    void loadTimeline(row.id);
                  }}
                  useInternalScroll={drafts.length > PAGE_SIZE}
                  hasMore={draftsHasMore}
                  loadingMore={loadingMoreDrafts}
                  onReachEnd={() => {
                    if (drafts.length > PAGE_SIZE) {
                      void loadDrafts(false);
                    }
                  }}
                  onDeleteRow={(id) => {
                    void deleteDraft(id);
                  }}
                  onRegisterRow={async (row) => {
                    try {
                      setMessages([]);
                      setProgressMode("REGISTER");
                      setBulkRegistering(true);

                      const result = await registerTradeDocsViaBulk([row.id]);

                      clearDraftSelection();
                      await loadDrafts();
                      await loadRegisteredDocs();
                      finishBulkRegisterProgress();

                      if (result.errorCount > 0) {
                        const firstError =
                          result.errors?.[0]?.message || "No se pudo registrar.";
                        setMessages([{ level: "error", text: firstError }]);
                        setActionReport({
                          fileName: "reporte_registro_masivo.xlsx",
                          rows: result.errors.map((x: any) => ({
                            scope: "REGISTER",
                            status: "ERROR",
                            trade_doc_id: x.trade_doc_id || null,
                            message: x.message || "Error al registrar",
                          })),
                        });
                        return;
                      }

                      setMessages([
                        {
                          level: "warn",
                          text: "Documento registrado (VIGENTE) y contabilizado correctamente.",
                        },
                      ]);
                      setActionReport({
                        fileName: "reporte_registro_masivo.xlsx",
                        rows: [
                          {
                            scope: "REGISTER",
                            status: "OK",
                            trade_doc_id: row.id,
                            message: "Documento registrado correctamente.",
                          },
                        ],
                      });
                    } catch (e: any) {
                      resetBulkRegisterProgressNow();
                      setMessages([{ level: "error", text: e?.message || "No se pudo registrar." }]);
                      await loadDrafts();
                      await loadRegisteredDocs();
                    } finally {
                      setBulkRegistering(false);
                    }
                  }}
                  assertUniqueFiscalFolio={assertUniqueFiscalFolio}
                  renderExpandedContent={(row) => renderTimelineTable(row)}
                />
              ) : (
                <TradeDocsTable
                  rows={filteredRegisteredDocs}
                  loading={loadingRegisteredDocs}
                  moneyDecimals={moneyDecimals}
                  canEdit={canEdit}
                  baseCurrency={baseCurrency}
                  companyId={companyId}
                  tabKey="registered"
                  selectedMap={selectedRegistered}
                  allSelected={allRegisteredSelected}
                  onToggleSelectAll={toggleSelectAllRegistered}
                  onToggleRow={toggleRegistered}
                  onOpenRow={(id) => {
                    void openRegisteredDocView(id);
                  }}
                  onExpandRow={(row) => {
                    void loadTimeline(row.id);
                  }}
                  onCancelRow={(row) => {
                    void openCancelFlow({
                      mode: "viewer",
                      tradeDocId: row.id,
                      status: row.status,
                      cancelledAt: null,
                      cancelReason: null,
                    });
                  }}
                  useInternalScroll={registeredDocs.length > PAGE_SIZE}
                  hasMore={registeredHasMore}
                  loadingMore={loadingMoreRegistered}
                  onReachEnd={() => {
                    if (registeredDocs.length > PAGE_SIZE) {
                      void loadRegisteredDocs(false);
                    }
                  }}
                  assertUniqueFiscalFolio={assertUniqueFiscalFolio}
                  renderExpandedContent={(row) => renderTimelineTable(row)}
                />
              )}
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
        zIndexClass="z-50"
        theme={{
          header: tradeDocsTheme.header,
          glowA: tradeDocsTheme.glowA,
          glowB: tradeDocsTheme.glowB,
          btnPrimary: tradeDocsTheme.btnPrimary,
          btnSoft: tradeDocsTheme.btnSoft,
          card: tradeDocsTheme.card,
        }}
        title={docId ? `Editar documento (${docId.slice(0, 8)}…)` : "Nuevo documento"}
        subtitle="Ventas • Editor"
        widthClass="w-[min(1200px,96vw)]"
        canEdit={canEdit}
        showCancelButton={showCancelButton}
        docId={docId}
        header={header}
        setHeader={setHeader}
        headerBranchCode={headerBranchCode}
        setHeaderBranchCode={setHeaderBranchCode}
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
        disallowPayments={disallowPayments}
        onOpenOriginSearch={() => {
          setOriginSearchOpen(true);
          setOriginResults([]);
          setOriginOffset(0);
          setOriginHasMore(false);
          void searchOriginDocs(true);
        }}
        clearOrigin={clearOrigin}
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
        accountPolicyByCode={accountPolicyByCode}
        headerCell={tradeDocsHeaderCell}
        headerSub={tradeDocsHeaderSub}
        bodyCell={tradeDocsBodyCell}
        cellInputBase={tradeDocsCellInputBase}
        cellInputRight={tradeDocsCellInputRight}
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
        messages={editorMessages}
        saveDraftMVP={saveDraftMVP}
        markAsVigenteMVP={markAsVigenteMVP}
        deleteDraftMVP={deleteDraftMVP}
        cancelDocMVP={cancelDocMVP}
      />

      <TradeDocEditorModal
        open={viewerOpen}
        onClose={() => setViewerOpen(false)}
        zIndexClass="z-[90]"
        mode="view"
        theme={{
          header: tradeDocsTheme.header,
          glowA: tradeDocsTheme.glowA,
          glowB: tradeDocsTheme.glowB,
          btnPrimary: tradeDocsTheme.btnPrimary,
          btnSoft: tradeDocsTheme.btnSoft,
          card: tradeDocsTheme.card,
        }}
        title={viewerDocId ? `Ver documento (${viewerDocId.slice(0, 8)}…)` : "Ver documento"}
        subtitle="Ventas • Consulta"
        widthClass="w-[min(1200px,96vw)]"
        canEdit={false}
        showCancelButton={viewerShowCancelButton && allowCancelSales && viewerHeader.status === "VIGENTE"}
        docId={viewerDocId}
        header={viewerHeader}
        setHeader={setViewerHeader}
        headerBranchCode={viewerHeaderBranchCode}
        setHeaderBranchCode={setViewerHeaderBranchCode}
        editorTab={viewerEditorTab}
        setEditorTab={setViewerEditorTab}
        fiscalCfg={fiscalCfg}
        fiscalDocTypes={fiscalDocTypes}
        baseCurrency={baseCurrency}
        branches={branches}
        items={items}
        businessLines={businessLines}
        counterpartiesAvailable={false}
        counterpartyMap={{}}
        openCreateCounterparty={() => {}}
        resolveCounterpartyHeader={() => {}}
        needsOrigin={viewerHeader.doc_type === "CREDIT_NOTE" || viewerHeader.doc_type === "DEBIT_NOTE"}
        disallowPayments={
          viewerHeader.doc_type === "CREDIT_NOTE" || viewerHeader.doc_type === "DEBIT_NOTE"
        }
        onOpenOriginSearch={() => {}}
        clearOrigin={() => {}}
        lines={viewerLines}
        setLines={setViewerLines}
        addDocLine={() => {}}
        removeDocLine={() => {}}
        updateDocLine={() => {}}
        payments={viewerPayments}
        addPaymentRow={() => {}}
        removePaymentRow={() => {}}
        updatePaymentRow={() => {}}
        journalLines={viewerJournalLines}
        addJournalLine={() => {}}
        removeJournalLine={() => {}}
        updateJournalLine={() => {}}
        journalAutoMode={false}
        recalcJournalAuto={() => {}}
        accounts={accounts}
        accByCode={accByCode}
        accountPolicyByCode={accountPolicyByCode}
        headerCell={tradeDocsHeaderCell}
        headerSub={tradeDocsHeaderSub}
        bodyCell={tradeDocsBodyCell}
        cellInputBase={tradeDocsCellInputBase}
        cellInputRight={tradeDocsCellInputRight}
        moneyDecimals={moneyDecimals}
        totals={{
          net_taxable: viewerLines.reduce((s, l) => s + calcLineAmounts(l).af, 0),
          net_exempt: viewerLines.reduce((s, l) => s + calcLineAmounts(l).ex, 0),
          tax_total: viewerLines.reduce((s, l) => s + calcLineAmounts(l).iva, 0),
          grand_total: viewerLines.reduce((s, l) => s + calcLineAmounts(l).total, 0),
          paid: viewerPayments.reduce((s, p) => s + toNum(p.amount), 0),
          balance:
            viewerLines.reduce((s, l) => s + calcLineAmounts(l).total, 0) -
            viewerPayments.reduce((s, p) => s + toNum(p.amount), 0),
        }}
        badgeTypeClass={
          viewerHeader.doc_type === "INVOICE"
            ? "bg-sky-100 text-sky-800"
            : viewerHeader.doc_type === "DEBIT_NOTE"
            ? "bg-fuchsia-100 text-fuchsia-800"
            : "bg-amber-100 text-amber-900"
        }
        badgeStatusClass={
          viewerHeader.status === "VIGENTE"
            ? "bg-emerald-100 text-emerald-800"
            : viewerHeader.status === "CANCELADO"
            ? "bg-rose-100 text-rose-800"
            : "bg-slate-100 text-slate-800"
        }
        formatNumber={formatNumber}
        calcLineAmounts={(l) => {
          const { ex, af, iva, total, total_display } = calcLineAmounts(l);
          return { ex, af, iva, total, total_display };
        }}
        ellipsis={ellipsis}
        folioLabel={folioLabel}
        messages={[]}
        saveDraftMVP={async () => {}}
        markAsVigenteMVP={async () => {}}
        deleteDraftMVP={async () => {}}
        cancelDocMVP={cancelViewerDocMVP}
      />

      <OriginDocSearchModal
        open={originSearchOpen}
        onClose={() => setOriginSearchOpen(false)}
        canEdit={canEdit}
        theme={{
          header: tradeDocsTheme.header,
          glowA: tradeDocsTheme.glowA,
          glowB: tradeDocsTheme.glowB,
          btnPrimary: tradeDocsTheme.btnPrimary,
          btnSoft: tradeDocsTheme.btnSoft,
          card: tradeDocsTheme.card,
        }}
        moneyDecimals={moneyDecimals}
        formatNumber={formatNumber}
        folioLabel={folioLabel}
        filters={originFilters}
        setFilters={setOriginFilters}
        loading={originLoading}
        loadingMore={originLoadingMore}
        hasMore={originHasMore}
        results={originResults}
        onSearch={() => searchOriginDocs(true)}
        onLoadMore={loadMoreOriginDocs}
        onClearFilters={() => {
          setOriginFilters({
            fiscal_doc_code: "",
            folio: "",
            issue_date_from: "",
            issue_date_to: "",
            only_open_balance: true,
            only_vigente: false,
          });
          setOriginResults([]);
          setOriginOffset(0);
          setOriginHasMore(false);
        }}
        onPick={pickOrigin}
        onViewDoc={(doc) => {
          void openViewDoc(doc);
        }}
        headerCell={tradeDocsHeaderCell}
        headerSub={tradeDocsHeaderSub}
        bodyCell={tradeDocsBodyCell}
      />

      {/* =======================
          IMPORT MODAL
         ======================= */}
      <TradeDocsImportModal
        open={importOpen}
        canEdit={canEdit}
        importing={importing}
        importErrors={importErrors}
        importPreview={importPreview}
        onClose={closeImport}
        onConfirm={confirmImportToDrafts}
        onPickExcel={onPickExcel}
      />

      <TradeDocsFiltersModal
        open={filtersOpen}
        activeTab={activeTab}
        filters={listFilters}
        setFilters={setListFilters}
        onClose={() => setFiltersOpen(false)}
        onClear={clearListFilters}
        resultCount={
          activeTab === "drafts"
            ? filteredDrafts.length
            : filteredRegisteredDocs.length
        }
      />

      <TradeDocCancelModal
        open={cancelModalOpen}
        onClose={() => setCancelModalOpen(false)}
        onConfirm={confirmCancelTradeDoc}
        loading={cancelSubmitting}
        loadingPreview={cancelLoadingPreview}
        cancelDate={cancelDate}
        setCancelDate={setCancelDate}
        cancelReason={cancelReason}
        setCancelReason={setCancelReason}
        previewLines={cancelPreviewLines}
        updatePreviewLine={(idx, patch) => {
          setCancelPreviewLines((prev) =>
            prev.map((line, i) => (i === idx ? { ...line, ...patch } : line))
          );
        }}
        addPreviewLine={() => {
          setCancelPreviewLines((prev) => [
            ...prev,
            {
              line_no: prev.length + 1,
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
            },
          ]);
        }}
        removePreviewLine={(idx) => {
          setCancelPreviewLines((prev) =>
            prev
              .filter((_, i) => i !== idx)
              .map((line, i) => ({ ...line, line_no: i + 1 }))
          );
        }}
        moneyDecimals={moneyDecimals}
        formatNumber={formatNumber}
        headerCell={tradeDocsHeaderCell}
        headerSub={tradeDocsHeaderSub}
        bodyCell={tradeDocsBodyCell}
        cellInputBase={tradeDocsCellInputBase}
        cellInputRight={tradeDocsCellInputRight}
        canEdit={canEdit}
        accByCode={accByCode}
        branches={branches}
        businessLines={businessLines}
        docInfo={cancelDocInfo}
        widthClass="w-[min(1200px,96vw)]"
        zIndexClass="z-[120]"
        theme={{
          header: tradeDocsTheme.header,
          glowA: tradeDocsTheme.glowA,
          glowB: tradeDocsTheme.glowB,
          btnPrimary: tradeDocsTheme.btnPrimary,
          btnSoft: tradeDocsTheme.btnSoft,
          card: tradeDocsTheme.card,
        }}
      />

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
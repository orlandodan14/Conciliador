"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type {
  OtherDocRow,
  OtherDocHeader,
  OtherDocType,
  OtherDocStatus,
  EditorTab,
  JournalLine,
  BranchLite,
  BusinessLineLite,
  OtherDocListFilters,
  CounterpartyLite,
  PaymentRow,
} from "./components/otherDocs/types";
import type {
  OriginDocLite,
  OriginSearchFilters,
} from "@/app/(workspace)/gestionVentas/docs-tribut-ventas/components/tradeDocs/types";
import {
  cls,
  todayISO,
  uid,
  formatNumber,
  makeJournalLine,
  renumber,
  EMPTY_OTHER_DOC_FILTERS,
  applyOtherDocFilters,
  otherDocTypeLabel,
  normalizeIdentifier,
} from "./components/otherDocs/helpers";
import {
  getAuthUserId,
  getMyRoleForCompany,
  loadOtherDocs,
  loadOtherDocById,
  upsertOtherDoc,
  deleteOtherDoc,
  saveJournalEntry,
  saveJournalLines,
  loadJournalLinesForDoc,
  cancelOtherDoc,
  registerOtherDoc,
  loadCounterpartiesMap,
  savePaymentsForDoc,
  loadPaymentsForDoc,
} from "./components/otherDocs/data";
import OtherDocsTable from "./components/otherDocs/OtherDocsTable";
import OtherDocEditorModal from "./components/otherDocs/OtherDocEditorModal";
import OtherDocsFiltersModal from "./components/otherDocs/OtherDocsFiltersModal";
import TradeDocCancelModal from "@/app/(workspace)/gestionVentas/docs-tribut-ventas/components/tradeDocs/TradeDocCancelModal";
import {
  tradeDocsTheme,
  tradeDocsHeaderCell,
  tradeDocsHeaderSub,
  tradeDocsBodyCell,
  tradeDocsCellInputBase,
  tradeDocsCellInputRight,
} from "@/app/(workspace)/gestionVentas/docs-tribut-ventas/components/tradeDocs/ui";

type Role = "OWNER" | "EDITOR" | "LECTOR" | null;

const PAGE_SIZE = 50;
const ORIGIN_PAGE_SIZE = 30;

function makeEmptyHeader(baseCurrency: string, defaultBranchId = ""): OtherDocHeader {
  return {
    doc_type: "OTRO_INGRESO",
    status: "BORRADOR",
    non_fiscal_doc_code: "",
    issue_date: todayISO(),
    due_date: todayISO(),
    series: "",
    number: "",
    reference: "",
    currency_code: baseCurrency,
    branch_id: defaultBranchId,
    counterparty_id: null,
    counterparty_identifier: "",
    counterparty_name: "",
    grand_total: "",
    origin_doc_id: null,
    origin_label: "",
    cancelled_at: "",
    cancel_reason: "",
  };
}

function makeEmptyJournalLines(): JournalLine[] {
  return [makeJournalLine(1), makeJournalLine(2), makeJournalLine(3), makeJournalLine(4)];
}

function makeEmptyPayment(issueDate: string): PaymentRow {
  return {
    id: uid(),
    payment_date: issueDate,
    method: "EFECTIVO",
    amount: "",
    reference: "",
    card_kind: "",
    card_last4: "",
    auth_code: "",
  };
}

function buildJournalDescription(header: OtherDocHeader): string {
  const type = otherDocTypeLabel(header.doc_type);
  const parts: string[] = [type];
  if (header.number) parts.push(`Nro ${header.number}`);
  if (header.counterparty_name) parts.push(header.counterparty_name);
  return parts.join(" \u00b7 ");
}

export default function Page() {
  const [companyId, setCompanyId] = useState("");
  const [role, setRole] = useState<Role>(null);
  const canEdit = role === "OWNER" || role === "EDITOR";

  const [moneyDecimals, setMoneyDecimals] = useState(0);
  const [baseCurrency, setBaseCurrency] = useState("CLP");
  const [branches, setBranches] = useState<BranchLite[]>([]);
  const [businessLines, setBusinessLines] = useState<BusinessLineLite[]>([]);
  const [accByCode, setAccByCode] = useState<Record<string, { id: string; code: string; name: string }>>({});
  const [accountDefaults, setAccountDefaults] = useState<Array<{ process_key: string; account_node_id: string }>>([]);
  const [defaultAccountCodeByProcess, setDefaultAccountCodeByProcess] = useState<Record<string, string>>({});
  const [postingPolicyByAccountCode, setPostingPolicyByAccountCode] = useState<Record<string, { require_suc: boolean; require_cu: boolean }>>({});
  const [counterpartyMap, setCounterpartyMap] = useState<Record<string, CounterpartyLite>>({});

  const defaultBranchId = useMemo(
    () => branches.find((b) => b.is_default)?.id ?? branches[0]?.id ?? "",
    [branches]
  );

  const [activeTab, setActiveTab] = useState<"drafts" | "registered">("drafts");

  const [drafts, setDrafts] = useState<OtherDocRow[]>([]);
  const [loadingDrafts, setLoadingDrafts] = useState(false);
  const [draftOffset, setDraftOffset] = useState(0);
  const [draftHasMore, setDraftHasMore] = useState(false);
  const [loadingMoreDrafts, setLoadingMoreDrafts] = useState(false);

  const [registered, setRegistered] = useState<OtherDocRow[]>([]);
  const [loadingRegistered, setLoadingRegistered] = useState(false);
  const [registeredOffset, setRegisteredOffset] = useState(0);
  const [registeredHasMore, setRegisteredHasMore] = useState(false);
  const [loadingMoreRegistered, setLoadingMoreRegistered] = useState(false);

  const [selectedDrafts, setSelectedDrafts] = useState<Record<string, boolean>>({});
  const [selectedRegistered, setSelectedRegistered] = useState<Record<string, boolean>>({});

  const [filters, setFilters] = useState<OtherDocListFilters>(EMPTY_OTHER_DOC_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [pageMsg, setPageMsg] = useState<{ level: "error" | "warn"; text: string } | null>(null);
  // Mensaje dentro del modal editor (errores / éxito en guardar)
  const [modalMsg, setModalMsg] = useState<{ level: "error" | "success"; text: string } | null>(null);

  // Editor
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorDocId, setEditorDocId] = useState<string | null>(null);
  const [editorJeId, setEditorJeId] = useState<string | null>(null);
  const [editorReadOnly, setEditorReadOnly] = useState(false);
  const [editorTab, setEditorTab] = useState<EditorTab>("CABECERA");
  const [editorHeader, setEditorHeader] = useState<OtherDocHeader>(makeEmptyHeader("CLP"));
  const [editorJournalLines, setEditorJournalLines] = useState<JournalLine[]>(makeEmptyJournalLines());
  const [editorPayments, setEditorPayments] = useState<PaymentRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [journalAutoMode, setJournalAutoMode] = useState(true);
  const [bulkRegistering, setBulkRegistering] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // ─── Timeline de docs relacionados (expanded row) ──────────────────────────
  type RelatedDocEvent = {
    event_date: string | null;
    event_type: "DOC" | "PAYMENT";
    doc_type: string | null;
    non_fiscal_doc_code: string | null;
    number: string | null;
    label: string;
    amount: number;
    impact_sign: number;
    affects_label: string;
    /** Marca el evento como contexto de origen: se muestra como banda informativa, no como evento financiero */
    is_origin_context?: boolean;
  };
  const [relatedByDocId, setRelatedByDocId] = useState<Record<string, RelatedDocEvent[]>>({});
  const [relatedLoadingByDocId, setRelatedLoadingByDocId] = useState<Record<string, boolean>>({});

  // Origin search
  const [originSearchResults, setOriginSearchResults] = useState<OriginDocLite[]>([]);
  const [originSearchLoading, setOriginSearchLoading] = useState(false);
  const [originSearchLoadingMore, setOriginSearchLoadingMore] = useState(false);
  const [originSearchHasMore, setOriginSearchHasMore] = useState(false);
  const [originSearchOffset, setOriginSearchOffset] = useState(0);
  const lastOriginFilters = useRef<OriginSearchFilters>({
    fiscal_doc_code: "", folio: "", issue_date_from: "", issue_date_to: "",
    only_open_balance: false, only_vigente: true,
  });
  // Initial origin doc for DEVOLUCION (loaded when opening an existing doc)
  const [editorInitialOriginDoc, setEditorInitialOriginDoc] = useState<OriginDocLite | null>(null);

  // Cancel modal
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelDocRow, setCancelDocRow] = useState<OtherDocRow | null>(null);
  const [cancelDate, setCancelDate] = useState(todayISO());
  const [cancelReason, setCancelReason] = useState("");
  const [cancelJournalLines, setCancelJournalLines] = useState<JournalLine[]>([]);
  const [canceling, setCanceling] = useState(false);
  const [cancelLoadingPreview, setCancelLoadingPreview] = useState(false);

  // ─── Derived ─────────────────────────────────────────────────────────────────

  const filteredDrafts = useMemo(() => applyOtherDocFilters(drafts, filters), [drafts, filters]);
  const filteredRegistered = useMemo(() => applyOtherDocFilters(registered, filters), [registered, filters]);

  const selectedDraftIds = useMemo(
    () => Object.keys(selectedDrafts).filter((id) => selectedDrafts[id]),
    [selectedDrafts]
  );

  const allDraftsSelected = useMemo(
    () => filteredDrafts.length > 0 && filteredDrafts.every((r) => selectedDrafts[r.id]),
    [filteredDrafts, selectedDrafts]
  );
  const allRegisteredSelected = useMemo(
    () => filteredRegistered.length > 0 && filteredRegistered.every((r) => selectedRegistered[r.id]),
    [filteredRegistered, selectedRegistered]
  );

  const draftSummary = useMemo(() => ({
    count: drafts.length,
    total: drafts.reduce((s, r) => s + Math.abs(Number(r.grand_total || 0)), 0),
  }), [drafts]);

  const registeredSummary = useMemo(() => ({
    count: registered.length,
    total: registered.reduce((s, r) => s + Math.abs(Number(r.grand_total || 0)), 0),
  }), [registered]);

  // ─── Journal auto-mode ────────────────────────────────────────────────────────

  // Reconstruir mapa proceso→código cuando cambien las cuentas cargadas
  useEffect(() => {
    const accByIdLocal = Object.fromEntries(Object.values(accByCode).map((a) => [a.id, a]));
    const byProcess: Record<string, string> = {};
    accountDefaults.forEach((d) => {
      const acc = accByIdLocal[d.account_node_id];
      if (acc?.code) byProcess[d.process_key] = acc.code;
    });
    setDefaultAccountCodeByProcess(byProcess);
  }, [accountDefaults, accByCode]);

  function getPaymentProcessKey(p: PaymentRow): string {
    if (p.method === "EFECTIVO")      return "SALE_PAYMENT_CASH";
    if (p.method === "TRANSFERENCIA") return "SALE_PAYMENT_TRANSFER";
    if (p.method === "CHEQUE")        return "SALE_PAYMENT_CHECK";
    if (p.method === "TARJETA") {
      if (p.card_kind === "DEBITO")  return "SALE_PAYMENT_CARD_DEBIT";
      if (p.card_kind === "CREDITO") return "SALE_PAYMENT_CARD_CREDIT";
      return "SALE_PAYMENT_CARD_CREDIT";
    }
    return "SALE_PAYMENT_OTHER";
  }

  function buildJournalFromOtherDoc(
    docType: OtherDocType,
    grandTotalStr: string,
    payments: PaymentRow[],
    defAccByProcess: Record<string, string>,
    docNumber: string,
    originDoc: OriginDocLite | null,
    policyByCode: Record<string, { require_suc: boolean; require_cu: boolean }>,
    headerBranchCode: string
  ): JournalLine[] {
    const docTotal = Number(grandTotalStr) || 0;
    if (docTotal <= 0) return makeEmptyJournalLines();

    const isReturn = docType === "DEVOLUCION";
    const usedPays = payments.filter((p) => Number(p.amount || 0) > 0);

    // Glosa unificada para todas las líneas
    const glosa = isReturn
      ? [
          "Devolución",
          docNumber || null,
          originDoc
            ? `Afecta NC - ${[originDoc.fiscal_doc_code, originDoc.number].filter(Boolean).join(" - ")}`
            : null,
        ].filter(Boolean).join(" - ")
      : ["Otro Ingreso", docNumber || null].filter(Boolean).join(" - ");

    const empty = {
      cost_center_id: null as null,
      business_line_id: null as null,
      branch_id: null as null,
      cost_center_code: "",
      business_line_code: "",
      branch_code: "",
    };

    // Resuelve branch_code desde la cabecera si la política lo exige
    function branchForCode(accCode: string): string {
      if (!accCode) return "";
      const pol = policyByCode[accCode.toUpperCase()];
      return pol?.require_suc && headerBranchCode ? headerBranchCode : "";
    }

    const newLines: JournalLine[] = [];
    let lineNo = 1;

    if (!isReturn) {
      // OTRO_INGRESO: formas de pago y saldo → DEBE; ingreso total → HABER (libre)
      for (const p of usedPays) {
        const amt     = Number(p.amount || 0);
        const accCode = String(defAccByProcess[getPaymentProcessKey(p)] || "").trim();
        newLines.push({ line_no: lineNo++, account_code: accCode, description: glosa, debit: String(amt), credit: "0", ...empty, branch_code: branchForCode(accCode) });
      }

      const paidTotal = usedPays.reduce((s, p) => s + Number(p.amount || 0), 0);
      const remaining = docTotal - paidTotal;
      if (remaining > 0.5) {
        const cxcCode = String(defAccByProcess["SALE_PAYMENT_CREDIT"] || "").trim();
        newLines.push({ line_no: lineNo++, account_code: cxcCode, description: glosa, debit: String(remaining), credit: "0", ...empty, branch_code: branchForCode(cxcCode) });
      }

      // Cuenta del ingreso → libre para el usuario
      newLines.push({ line_no: lineNo++, account_code: "", description: glosa, debit: "0", credit: String(docTotal), ...empty });
    } else {
      // DEVOLUCION:
      // DEBE: siempre SALE_PAYMENT_CREDIT (Clientes por cobrar) — anula la rebaja que hizo la NC
      const cxcCode = String(defAccByProcess["SALE_PAYMENT_CREDIT"] || "").trim();
      newLines.push({ line_no: lineNo++, account_code: cxcCode, description: glosa, debit: String(docTotal), credit: "0", ...empty, branch_code: branchForCode(cxcCode) });

      // HABER: formas de pago con cuenta predeterminada; si no hay pagos, cuenta vacía
      if (usedPays.length > 0) {
        for (const p of usedPays) {
          const amt     = Number(p.amount || 0);
          const accCode = String(defAccByProcess[getPaymentProcessKey(p)] || "").trim();
          newLines.push({ line_no: lineNo++, account_code: accCode, description: glosa, debit: "0", credit: String(amt), ...empty, branch_code: branchForCode(accCode) });
        }
        // Saldo restante sin cuenta (libre para el usuario)
        const paidTotal = usedPays.reduce((s, p) => s + Number(p.amount || 0), 0);
        const remaining = docTotal - paidTotal;
        if (remaining > 0.5) {
          newLines.push({ line_no: lineNo++, account_code: "", description: glosa, debit: "0", credit: String(remaining), ...empty });
        }
      } else {
        // Sin forma de pago → HABER libre
        newLines.push({ line_no: lineNo++, account_code: "", description: glosa, debit: "0", credit: String(docTotal), ...empty });
      }
    }

    while (newLines.length < 4) {
      newLines.push({ line_no: lineNo++, account_code: "", description: "", debit: "0", credit: "0", ...empty });
    }

    return renumber(newLines);
  }

  function recalcJournalAuto() {
    const headerBranch = branches.find((b) => b.id === editorHeader.branch_id);
    const headerBranchCode = headerBranch?.code ?? "";
    setJournalAutoMode(true);
    setEditorJournalLines(
      buildJournalFromOtherDoc(
        editorHeader.doc_type, editorHeader.grand_total, editorPayments,
        defaultAccountCodeByProcess, editorHeader.number, editorInitialOriginDoc,
        postingPolicyByAccountCode, headerBranchCode
      )
    );
  }

  function handleSwitchToManual() {
    setJournalAutoMode(false);
  }

  // Auto-recalculate when in AUTO mode and key inputs change
  useEffect(() => {
    if (!journalAutoMode) return;
    const headerBranch = branches.find((b) => b.id === editorHeader.branch_id);
    const headerBranchCode = headerBranch?.code ?? "";
    setEditorJournalLines(
      buildJournalFromOtherDoc(
        editorHeader.doc_type, editorHeader.grand_total, editorPayments,
        defaultAccountCodeByProcess, editorHeader.number, editorInitialOriginDoc,
        postingPolicyByAccountCode, headerBranchCode
      )
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journalAutoMode, editorPayments, editorHeader.grand_total, editorHeader.doc_type,
      editorHeader.number, editorInitialOriginDoc, defaultAccountCodeByProcess,
      postingPolicyByAccountCode, editorHeader.branch_id, branches]);

  // ─── Init ─────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const id = localStorage.getItem("active_company_id") ?? "";
    setCompanyId(id);
    const onCompanyChange = () => setCompanyId(localStorage.getItem("active_company_id") ?? "");
    window.addEventListener("company:changed", onCompanyChange);
    return () => window.removeEventListener("company:changed", onCompanyChange);
  }, []);

  useEffect(() => {
    if (!companyId) return;
    void (async () => {
      const r = await getMyRoleForCompany(companyId);
      setRole(r);

      const { data: settings } = await supabase
        .from("accounting_settings")
        .select("money_decimals")
        .eq("company_id", companyId)
        .maybeSingle();
      if (settings?.money_decimals != null) setMoneyDecimals(Number(settings.money_decimals));

      const { data: cur } = await supabase
        .from("company_currencies")
        .select("code")
        .eq("company_id", companyId)
        .eq("is_base", true)
        .eq("is_active", true)
        .maybeSingle();
      const currency = String((cur as any)?.code || "CLP");
      setBaseCurrency(currency);

      const { data: branchData } = await supabase
        .from("branches")
        .select("id,code,name,is_active,is_default")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("is_default", { ascending: false })
        .order("code");
      setBranches(((branchData as any[]) || []).map((b) => ({
        id: String(b.id),
        code: String(b.code || ""),
        name: String(b.name || ""),
        is_active: Boolean(b.is_active),
        is_default: Boolean(b.is_default),
      })));

      const { data: buData } = await supabase
        .from("business_lines")
        .select("id,code,name,is_active")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("code");
      setBusinessLines(((buData as any[]) || []).map((b) => ({
        id: String(b.id),
        code: String(b.code || ""),
        name: String(b.name || ""),
        is_active: Boolean(b.is_active),
      })));

      const { data: accData } = await supabase
        .from("account_nodes")
        .select("id,code,name")
        .eq("company_id", companyId)
        .order("code");
      const nextAccByCode: Record<string, { id: string; code: string; name: string }> = {};
      const accByIdLocal: Record<string, { id: string; code: string; name: string }> = {};
      ((accData as any[]) || []).forEach((a) => {
        const acc = { id: String(a.id), code: String(a.code || "").trim(), name: String(a.name || "") };
        nextAccByCode[acc.code] = acc;
        accByIdLocal[acc.id] = acc;
      });
      setAccByCode(nextAccByCode);

      // Load account_defaults — mismas process keys que el módulo tributario
      try {
        const { data: defs } = await supabase
          .from("account_defaults")
          .select("process_key,account_node_id,is_active")
          .eq("company_id", companyId)
          .eq("is_active", true);

        const defRows = ((defs as any[]) || []).map((d) => ({
          process_key: String(d.process_key || ""),
          account_node_id: String(d.account_node_id || ""),
        }));
        setAccountDefaults(defRows);

        const byProcess: Record<string, string> = {};
        defRows.forEach((d) => {
          const acc = accByIdLocal[d.account_node_id];
          if (acc?.code) byProcess[d.process_key] = acc.code;
        });
        setDefaultAccountCodeByProcess(byProcess);
      } catch {
        setAccountDefaults([]);
        setDefaultAccountCodeByProcess({});
      }

      // Load account_imputation_policies (segmentación: sucursal / centro de utilidad)
      try {
        const today = new Date().toISOString().slice(0, 10);
        const { data: pols } = await supabase
          .from("account_imputation_policies")
          .select("account_node_id,require_suc,require_cu,is_active,effective_from,effective_to")
          .eq("company_id", companyId)
          .eq("is_active", true)
          .lte("effective_from", today)
          .or(`effective_to.is.null,effective_to.gte.${today}`);

        const polByCode: Record<string, { require_suc: boolean; require_cu: boolean }> = {};
        ((pols as any[]) || []).forEach((p) => {
          const acc = accByIdLocal[String(p.account_node_id || "")];
          const code = String(acc?.code || "").trim().toUpperCase();
          if (code) polByCode[code] = { require_suc: Boolean(p.require_suc), require_cu: Boolean(p.require_cu) };
        });
        setPostingPolicyByAccountCode(polByCode);
      } catch {
        setPostingPolicyByAccountCode({});
      }

      // Load counterparties map keyed by identifier_normalized.toUpperCase()
      try {
        const cpMap = await loadCounterpartiesMap(companyId);
        setCounterpartyMap(cpMap);
      } catch {
        setCounterpartyMap({});
      }
    })();
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    void loadDraftsList(true);
    void loadRegisteredList(true);
  }, [companyId]);

  // ─── Load functions ───────────────────────────────────────────────────────────

  function showMsg(level: "error" | "warn", text: string) {
    setPageMsg({ level, text });
    window.setTimeout(() => setPageMsg(null), 6000);
  }

  function showModalMsg(level: "error" | "success", text: string) {
    setModalMsg({ level, text });
  }

  async function loadDraftsList(reset = false) {
    if (!companyId) return;
    if (reset) { setLoadingDrafts(true); setDraftOffset(0); }
    try {
      const offset = reset ? 0 : draftOffset;
      const data = await loadOtherDocs(companyId, "BORRADOR", offset, PAGE_SIZE);
      if (reset) setDrafts(data);
      else setDrafts((prev) => [...prev, ...data]);
      setDraftHasMore(data.length === PAGE_SIZE);
      setDraftOffset(offset + data.length);
    } catch (e: any) {
      showMsg("error", e?.message || "No se pudieron cargar borradores.");
    } finally {
      setLoadingDrafts(false);
      setLoadingMoreDrafts(false);
    }
  }

  async function loadRegisteredList(reset = false) {
    if (!companyId) return;
    if (reset) { setLoadingRegistered(true); setRegisteredOffset(0); }
    try {
      const offset = reset ? 0 : registeredOffset;
      const data = await loadOtherDocs(companyId, "VIGENTE_OR_CANCELADO", offset, PAGE_SIZE);
      if (reset) setRegistered(data);
      else setRegistered((prev) => [...prev, ...data]);
      setRegisteredHasMore(data.length === PAGE_SIZE);
      setRegisteredOffset(offset + data.length);
    } catch (e: any) {
      showMsg("error", e?.message || "No se pudieron cargar documentos registrados.");
    } finally {
      setLoadingRegistered(false);
      setLoadingMoreRegistered(false);
    }
  }

  // ─── Editor ───────────────────────────────────────────────────────────────────

  function openNewEditor() {
    setEditorDocId(null);
    setEditorJeId(null);
    setEditorHeader(makeEmptyHeader(baseCurrency, defaultBranchId));
    setEditorJournalLines(makeEmptyJournalLines());
    setEditorPayments([]);
    setEditorTab("CABECERA");
    setEditorReadOnly(false);
    setOriginSearchResults([]);
    setEditorInitialOriginDoc(null);
    setJournalAutoMode(true);
    setModalMsg(null);
    setEditorOpen(true);
  }

  async function openEditor(id: string, readOnly = false) {
    try {
      const doc = await loadOtherDocById(companyId, id);
      if (!doc) return;

      const nextHeader: OtherDocHeader = {
        doc_type: (doc.doc_type || "OTRO_INGRESO") as OtherDocType,
        status: (doc.status || "BORRADOR") as OtherDocStatus,
        non_fiscal_doc_code: String(doc.non_fiscal_doc_code || ""),
        issue_date: String(doc.issue_date || todayISO()),
        due_date: String(doc.due_date || doc.issue_date || todayISO()),
        series: String(doc.series || ""),
        number: String(doc.number || ""),
        reference: String(doc.reference || ""),
        currency_code: String(doc.currency_code || baseCurrency),
        branch_id: String(doc.branch_id || ""),
        counterparty_id: doc.counterparty_id || null,
        counterparty_identifier: String(doc.counterparty_identifier_snapshot || ""),
        counterparty_name: String(doc.counterparty_name_snapshot || ""),
        grand_total: String(doc.grand_total ?? ""),
        origin_doc_id: doc.origin_doc_id || null,
        origin_label: String(doc.origin_label || ""),
        cancelled_at: String(doc.cancelled_at || ""),
        cancel_reason: String(doc.cancel_reason || ""),
      };

      let nextLines = makeEmptyJournalLines();
      if (doc.journal_entry_id) {
        try {
          const lines = await loadJournalLinesForDoc(companyId, doc.journal_entry_id, accByCode);
          if (lines.length) {
            const padded = [...lines, ...Array.from(
              { length: Math.max(4 - lines.length, 0) },
              (_, i) => makeJournalLine(lines.length + i + 1)
            )];
            nextLines = renumber(padded);
          }
        } catch {}
      }

      // Cargar pagos existentes
      let nextPayments: PaymentRow[] = [];
      try {
        nextPayments = await loadPaymentsForDoc(companyId, id);
      } catch {}

      // Para DEVOLUCION con doc origen, cargar el doc origen para mostrar en el modal
      let nextInitialOriginDoc: OriginDocLite | null = null;
      if (doc.doc_type === "DEVOLUCION" && doc.origin_doc_id) {
        try {
          const originDoc = await loadOtherDocById(companyId, doc.origin_doc_id);
          if (originDoc) {
            nextInitialOriginDoc = {
              id: originDoc.id,
              doc_type: originDoc.doc_type ?? null,
              fiscal_doc_code: originDoc.fiscal_doc_code ?? null,
              series: originDoc.series ?? null,
              number: originDoc.number ?? null,
              issue_date: originDoc.issue_date ?? null,
              counterparty_identifier: originDoc.counterparty_identifier_snapshot ?? null,
              net_taxable: originDoc.net_taxable ?? null,
              net_exempt: originDoc.net_exempt ?? null,
              tax_total: originDoc.tax_total ?? null,
              grand_total: originDoc.grand_total ?? null,
              balance: originDoc.balance ?? null,
              currency_code: originDoc.currency_code ?? null,
              payment_status: null,
              status: originDoc.status ?? null,
            };
          }
        } catch {}
      }

      // Si las líneas cargadas tienen cuentas asignadas → modo MANUAL; si no → AUTO
      const hasAccountCodes = nextLines.some((l) => String(l.account_code || "").trim() !== "");

      setEditorDocId(id);
      setEditorJeId(doc.journal_entry_id || null);
      setEditorHeader(nextHeader);
      setEditorJournalLines(nextLines);
      setEditorPayments(nextPayments);
      setEditorTab("CABECERA");
      setEditorReadOnly(readOnly);
      setOriginSearchResults([]);
      setEditorInitialOriginDoc(nextInitialOriginDoc);
      setJournalAutoMode(!hasAccountCodes);
      setModalMsg(null);
      setEditorOpen(true);
    } catch (e: any) {
      showMsg("error", e?.message || "No se pudo abrir el documento.");
    }
  }

  function buildDocPayload(
    userId: string | null,
    totalPaid = 0
  ): Record<string, unknown> {
    const grandTotal = Number(editorHeader.grand_total) || 0;
    const balance = Math.max(grandTotal - totalPaid, 0);

    return {
      company_id: companyId,
      doc_type: editorHeader.doc_type,
      status: "BORRADOR",
      non_fiscal_doc_code: editorHeader.non_fiscal_doc_code || null,
      issue_date: editorHeader.issue_date,
      due_date: editorHeader.due_date || editorHeader.issue_date,
      series: editorHeader.series || null,
      number: editorHeader.number || null,
      reference: editorHeader.reference || null,
      currency_code: editorHeader.currency_code || baseCurrency,
      branch_id: editorHeader.branch_id || null,
      counterparty_id: editorHeader.counterparty_id,
      counterparty_identifier_snapshot: editorHeader.counterparty_identifier || null,
      counterparty_name_snapshot: editorHeader.counterparty_name || null,
      grand_total: grandTotal,
      balance,
      origin_doc_id: editorHeader.origin_doc_id || null,
      created_by: userId,
    };
  }

  function validateHeader(): string | null {
    const amount = Number(editorHeader.grand_total);
    if (!editorHeader.issue_date) return "Ingresa la fecha de emision.";
    if (!editorHeader.counterparty_identifier.trim()) return "Ingresa el RUT / ID de la contraparte.";
    if (!editorHeader.counterparty_id) return "La contraparte no esta registrada en el sistema. Agrega la contraparte primero.";
    if (!editorHeader.counterparty_name.trim()) return "Ingresa el nombre de la contraparte.";
    if (amount <= 0) return "El total del documento debe ser mayor a 0.";
    return null;
  }

  function validateJournal(): string | null {
    const used = editorJournalLines.filter(
      (l) => String(l.account_code || "").trim() || Number(l.debit) || Number(l.credit)
    );
    if (!used.length) return null;
    const debit = used.reduce((s, l) => s + Number(l.debit || 0), 0);
    const credit = used.reduce((s, l) => s + Number(l.credit || 0), 0);
    if (Math.abs(debit - credit) > 0.5) return `El asiento no cuadra: Debe ${debit} \u2260 Haber ${credit}.`;
    return null;
  }

  async function persistDoc(): Promise<{ docId: string; jeId: string } | null> {
    const headerErr = validateHeader();
    if (headerErr) { showModalMsg("error", headerErr); return null; }
    const journalErr = validateJournal();
    if (journalErr) { showModalMsg("error", journalErr); return null; }

    // Validar que los pagos no superen el total
    const grandTotal = Number(editorHeader.grand_total) || 0;
    const totalPaid = editorPayments.reduce((s, p) => s + Number(p.amount || 0), 0);
    if (totalPaid > grandTotal + 0.5) {
      showModalMsg("error", `La suma de pagos (${totalPaid}) supera el total del documento (${grandTotal}).`);
      return null;
    }

    setSaving(true);
    try {
      const userId = await getAuthUserId();

      // 1. Para docs nuevos: crear primero con balance 0 para obtener el ID
      let savedDocId = editorDocId ?? "";
      if (!editorDocId) {
        const tmpPayload = buildDocPayload(userId, 0);
        const saved = await upsertOtherDoc({ companyId, docId: null, payload: tmpPayload });
        savedDocId = saved.id;
        setEditorDocId(savedDocId);
      }

      // 2. Guardar pagos y obtener el total pagado real
      const savedTotalPaid = await savePaymentsForDoc({
        companyId,
        docId: savedDocId,
        issueDate: editorHeader.issue_date,
        currencyCode: editorHeader.currency_code || baseCurrency,
        payments: editorPayments,
        userId,
      });

      // 3. Actualizar doc con balance correcto (siempre BORRADOR aquí)
      const payload = buildDocPayload(userId, savedTotalPaid);
      await upsertOtherDoc({ companyId, docId: savedDocId, payload });

      // 4. Asiento contable en DRAFT
      const jeId = await saveJournalEntry({
        companyId,
        docId: savedDocId,
        entryDate: editorHeader.issue_date,
        description: buildJournalDescription(editorHeader),
        currencyCode: editorHeader.currency_code || baseCurrency,
        userId,
        existingJournalEntryId: editorJeId,
      });

      // Solo guardar líneas que tengan cuenta asignada (las vacías son plantilla AUTO)
      const linesToSave = editorJournalLines.filter(
        (l) => String(l.account_code || "").trim() !== ""
      );

      await saveJournalLines(companyId, jeId, linesToSave, accByCode, branches, businessLines);

      // 5. Enlazar journal_entry_id al doc si es nuevo
      if (editorJeId !== jeId) {
        await upsertOtherDoc({
          companyId,
          docId: savedDocId,
          payload: { company_id: companyId, journal_entry_id: jeId },
        });
        setEditorJeId(jeId);
      }

      return { docId: savedDocId, jeId };
    } catch (e: any) {
      showModalMsg("error", e?.message || "No se pudo guardar el documento.");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveDraft() {
    setModalMsg(null);
    const result = await persistDoc();
    if (result) {
      await loadDraftsList(true);
      setEditorOpen(false);
      showMsg("warn", "Borrador guardado.");
    }
  }

  async function handleRegister() {
    setModalMsg(null);
    // Antes de registrar: todas las líneas con monto deben tener cuenta asignada
    const linesWithAmount = editorJournalLines.filter(
      (l) => Number(l.debit || 0) > 0 || Number(l.credit || 0) > 0
    );
    const missingAccount = linesWithAmount.some(
      (l) => !String(l.account_code || "").trim()
    );
    if (missingAccount) {
      showModalMsg("error", "Para registrar, todas las líneas del asiento con monto deben tener cuenta contable. Completa las cuentas vacías en la pestaña Asiento contable.");
      return;
    }

    // Validar segmentación: cuentas que exigen SUC o CU deben tenerlos
    const segErrors: string[] = [];
    linesWithAmount.forEach((l) => {
      const code = String(l.account_code || "").trim().toUpperCase();
      if (!code) return;
      const pol = postingPolicyByAccountCode[code];
      if (!pol) return;
      if (pol.require_suc && !String(l.branch_code || "").trim()) segErrors.push(code);
      if (pol.require_cu  && !String(l.business_line_code || "").trim()) segErrors.push(code);
    });
    if (segErrors.length > 0) {
      showModalMsg(
        "error",
        `Segmentación incompleta: hay líneas con cuentas que exigen SUC o CU sin asignar (${[...new Set(segErrors)].join(", ")}). Completa la segmentación en la pestaña Asiento contable antes de registrar.`
      );
      return;
    }

    const result = await persistDoc();
    if (!result) return;
    setSaving(true);
    try {
      await registerOtherDoc({
        companyId,
        docId: result.docId,
        journalEntryId: result.jeId,
      });
      setEditorOpen(false);
      await loadDraftsList(true);
      await loadRegisteredList(true);
      showMsg("warn", "Documento registrado correctamente.");
    } catch (e: any) {
      showModalMsg("error", e?.message || "No se pudo registrar el documento.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteRow(id: string) {
    if (!canEdit || !companyId) return;
    if (!window.confirm("Eliminar este borrador?")) return;
    try {
      // deleteOtherDoc ya maneja la cascada de pagos internamente
      await deleteOtherDoc(companyId, id);
      setDrafts((prev) => prev.filter((r) => r.id !== id));
      setSelectedDrafts((prev) => { const n = { ...prev }; delete n[id]; return n; });
      showMsg("warn", "Borrador eliminado.");
    } catch (e: any) {
      showMsg("error", e?.message || "No se pudo eliminar.");
    }
  }

  async function handleRegisterRow(row: OtherDocRow): Promise<void> {
    await openEditor(row.id, false);
  }

  // ─── Acciones masivas ─────────────────────────────────────────────────────────

  async function bulkRegisterSelected() {
    if (!canEdit || !companyId || selectedDraftIds.length === 0) return;
    if (!window.confirm(
      `¿Registrar ${selectedDraftIds.length} borrador(es) como VIGENTE y contabilizarlos?`
    )) return;

    setBulkRegistering(true);
    try {
      const { data, error } = await supabase.rpc("bulk_register_trade_docs", {
        _company_id: companyId,
        _trade_doc_ids: selectedDraftIds,
      });
      if (error) throw error;

      const okCount = Number((data as any)?.ok_count || 0);
      const errorCount = Number((data as any)?.error_count || 0);
      const errors: Array<{ trade_doc_id?: string; message?: string }> =
        Array.isArray((data as any)?.errors) ? (data as any).errors : [];

      setSelectedDrafts({});
      await loadDraftsList(true);
      await loadRegisteredList(true);

      if (errorCount > 0) {
        const detail = errors.map((e) => e.message || "Error desconocido").join(" · ");
        showMsg(
          "error",
          `${okCount} registrado(s), ${errorCount} con error: ${detail}`
        );
      } else {
        showMsg("warn", `${okCount} documento(s) registrado(s) correctamente.`);
      }
    } catch (e: any) {
      showMsg("error", e?.message || "Error en registro masivo.");
    } finally {
      setBulkRegistering(false);
    }
  }

  async function bulkDeleteSelected() {
    if (!canEdit || !companyId || selectedDraftIds.length === 0) return;
    if (!window.confirm(
      `¿Eliminar ${selectedDraftIds.length} borrador(es)? Esta acción no se puede deshacer.`
    )) return;

    setBulkDeleting(true);
    const ids = [...selectedDraftIds];
    let okCount = 0, errorCount = 0;
    try {
      for (const id of ids) {
        try {
          await deleteOtherDoc(companyId, id);
          okCount++;
        } catch {
          errorCount++;
        }
      }
      setSelectedDrafts({});
      await loadDraftsList(true);
      if (errorCount > 0) {
        showMsg("error", `${okCount} eliminado(s), ${errorCount} no se pudieron eliminar.`);
      } else {
        showMsg("warn", `${okCount} borrador(es) eliminado(s).`);
      }
    } finally {
      setBulkDeleting(false);
    }
  }

  // ─── Cancel ───────────────────────────────────────────────────────────────────

  async function openCancel(row: OtherDocRow) {
    setCancelDocRow(row);
    setCancelDate(todayISO());
    setCancelReason("");
    setCancelJournalLines([]);
    setCancelOpen(true);
    setCancelLoadingPreview(true);

    try {
      const doc = await loadOtherDocById(companyId, row.id);
      if (doc?.journal_entry_id) {
        const lines = await loadJournalLinesForDoc(companyId, doc.journal_entry_id, accByCode);
        const reversed = lines.map((l) => ({ ...l, debit: l.credit, credit: l.debit }));
        setCancelJournalLines(reversed.length ? reversed : makeEmptyJournalLines());
      } else {
        setCancelJournalLines(makeEmptyJournalLines());
      }
    } catch {
      setCancelJournalLines(makeEmptyJournalLines());
    } finally {
      setCancelLoadingPreview(false);
    }
  }

  async function handleConfirmCancel() {
    if (!cancelDocRow || !companyId || !canEdit) return;
    setCanceling(true);
    try {
      const userId = await getAuthUserId();
      const doc = await loadOtherDocById(companyId, cancelDocRow.id);
      await cancelOtherDoc({
        companyId,
        docId: cancelDocRow.id,
        cancelDate,
        cancelReason: cancelReason || "Cancelacion manual",
        journalLines: cancelJournalLines,
        accByCode,
        branches,
        businessLines,
        userId,
        currencyCode: String(doc?.currency_code || baseCurrency),
      });
      setCancelOpen(false);
      setCancelDocRow(null);
      await loadRegisteredList(true);
      showMsg("warn", "Documento cancelado correctamente.");
    } catch (e: any) {
      showMsg("error", e?.message || "No se pudo cancelar el documento.");
    } finally {
      setCanceling(false);
    }
  }

  // ─── Origin search ────────────────────────────────────────────────────────────

  async function resolveOriginCounterpartyId(identifierRaw: string): Promise<string | null> {
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

  async function handleSearchOrigin(filters: OriginSearchFilters, reset = true) {
    if (!companyId) return;
    const identifierRaw = String(editorHeader.counterparty_identifier || "").trim();
    if (!identifierRaw) return;
    lastOriginFilters.current = filters;

    if (reset) {
      setOriginSearchLoading(true);
      setOriginSearchOffset(0);
    } else {
      if (originSearchLoadingMore || !originSearchHasMore) return;
      setOriginSearchLoadingMore(true);
    }

    try {
      const resolvedId = await resolveOriginCounterpartyId(identifierRaw);
      const from = reset ? 0 : originSearchOffset;
      const to = from + ORIGIN_PAGE_SIZE - 1;

      let query = supabase
        .from("trade_docs")
        .select(
          "id,doc_type,fiscal_doc_code,series,number,issue_date," +
          "net_taxable,net_exempt,tax_total,grand_total,balance," +
          "currency_code,status,counterparty_id,counterparty_identifier_snapshot"
        )
        .eq("company_id", companyId)
        .in("doc_type", ["INVOICE", "CREDIT_NOTE", "DEBIT_NOTE"])
        .order("issue_date", { ascending: false })
        .order("created_at", { ascending: false })
        .range(from, to);

      if (resolvedId) {
        query = query.or(
          `counterparty_id.eq.${resolvedId},counterparty_identifier_snapshot.eq.${identifierRaw}`
        ) as any;
      } else {
        query = query.eq("counterparty_identifier_snapshot", identifierRaw);
      }

      if (filters.only_vigente) {
        query = query.eq("status", "VIGENTE");
      } else {
        query = query.neq("status", "CANCELADO");
      }
      if (filters.fiscal_doc_code.trim()) {
        query = query.ilike("fiscal_doc_code", `%${filters.fiscal_doc_code.trim()}%`);
      }
      if (filters.folio.trim()) {
        const q = filters.folio.trim();
        query = query.or(`number.ilike.%${q}%,series.ilike.%${q}%`) as any;
      }
      if (filters.issue_date_from) {
        query = query.gte("issue_date", filters.issue_date_from);
      }
      if (filters.issue_date_to) {
        query = query.lte("issue_date", filters.issue_date_to);
      }

      const { data, error } = await query;
      if (error) throw error;

      const mapped: OriginDocLite[] = ((data as any[]) || []).map((r) => ({
        id: String(r.id),
        doc_type: r.doc_type ?? null,
        fiscal_doc_code: r.fiscal_doc_code ?? null,
        series: r.series ?? null,
        number: r.number ?? null,
        issue_date: r.issue_date ?? null,
        counterparty_identifier: r.counterparty_identifier_snapshot ?? null,
        net_taxable: Number(r.net_taxable || 0),
        net_exempt: Number(r.net_exempt || 0),
        tax_total: Number(r.tax_total || 0),
        grand_total: Number(r.grand_total || 0),
        balance: Number(r.balance ?? r.grand_total ?? 0),
        currency_code: r.currency_code ?? null,
        payment_status: null,
        status: r.status ?? null,
      }));

      const filtered = filters.only_open_balance
        ? mapped.filter((x) => Number(x.balance || 0) > 0)
        : mapped;

      if (reset) {
        setOriginSearchResults(filtered);
      } else {
        setOriginSearchResults((prev) => [...prev, ...filtered]);
      }

      const fetchedCount = ((data as any[]) || []).length;
      setOriginSearchHasMore(fetchedCount === ORIGIN_PAGE_SIZE);
      setOriginSearchOffset(from + fetchedCount);
    } catch (e: any) {
      if (reset) {
        setOriginSearchResults([]);
        setOriginSearchHasMore(false);
        setOriginSearchOffset(0);
      }
    } finally {
      setOriginSearchLoading(false);
      setOriginSearchLoadingMore(false);
    }
  }

  async function handleLoadMoreOrigin() {
    await handleSearchOrigin(lastOriginFilters.current, false);
  }

  function handlePickOrigin(doc: OriginDocLite) {
    const folio = [doc.series, doc.number].filter(Boolean).join("-");
    const label = [doc.fiscal_doc_code, folio, doc.counterparty_identifier, doc.issue_date]
      .filter(Boolean)
      .join(" \u00b7 ");
    setEditorHeader((h) => ({ ...h, origin_doc_id: doc.id, origin_label: label }));
    setEditorInitialOriginDoc(doc);
    setOriginSearchResults([]);
  }

  function handleClearOrigin() {
    setEditorHeader((h) => ({ ...h, origin_doc_id: null, origin_label: "" }));
    setEditorInitialOriginDoc(null);
  }

  // ─── Payment handlers ─────────────────────────────────────────────────────────

  function handleAddPayment() {
    setEditorPayments((prev) => [...prev, makeEmptyPayment(editorHeader.issue_date || todayISO())]);
  }

  function handleRemovePayment(id: string) {
    setEditorPayments((prev) => prev.filter((p) => p.id !== id));
  }

  function handleUpdatePayment(id: string, patch: Partial<PaymentRow>) {
    setEditorPayments((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  // ─── Cancel doc info for modal ────────────────────────────────────────────────

  const cancelDocInfo = cancelDocRow
    ? {
        doc_type: otherDocTypeLabel(cancelDocRow.doc_type),
        fiscal_doc_code: cancelDocRow.non_fiscal_doc_code || "",
        series: cancelDocRow.series || "",
        number: cancelDocRow.number || "",
        issue_date: cancelDocRow.issue_date || "",
        counterparty_identifier: cancelDocRow.counterparty_identifier_snapshot || "",
        counterparty_name: cancelDocRow.counterparty_name_snapshot || "",
        currency_code: baseCurrency,
        grand_total: Math.abs(Number(cancelDocRow.grand_total || 0)),
        status: cancelDocRow.status,
      }
    : null;

  // ─── Related docs loader para expanded row ───────────────────────────────────

  async function loadRelatedDocs(row: OtherDocRow) {
    if (!companyId) return;
    if (relatedByDocId[row.id] !== undefined || relatedLoadingByDocId[row.id]) return;

    setRelatedLoadingByDocId((prev) => ({ ...prev, [row.id]: true }));
    try {
      const events: RelatedDocEvent[] = [];

      // 1. Documento origen (si tiene origin_doc_id)
      if (row.origin_doc_id) {
        const { data: originDoc } = await supabase
          .from("trade_docs")
          .select("id,doc_type,fiscal_doc_code,number,series,issue_date,grand_total,doc_class,non_fiscal_doc_code")
          .eq("id", row.origin_doc_id)
          .single();
        if (originDoc) {
          const isNonFiscal = (originDoc as any).doc_class === "NON_FISCAL";
          const nfCode = (originDoc as any).non_fiscal_doc_code;
          const fiscalCode = (originDoc as any).fiscal_doc_code;
          const num = (originDoc as any).number;
          const label = isNonFiscal
            ? `${nfCode || ""} · ${num || "—"}`
            : `${fiscalCode || ""} · ${num || "—"}`;
          events.push({
            event_date: (originDoc as any).issue_date,
            event_type: "DOC",
            doc_type: (originDoc as any).doc_type,
            non_fiscal_doc_code: (originDoc as any).non_fiscal_doc_code,
            number: num,
            label,
            amount: Math.abs(Number((originDoc as any).grand_total || 0)),
            impact_sign: -1,
            affects_label: "Documento origen",
            is_origin_context: true,
          });
        }
      }

      // 2. Pagos aplicados (payment_allocations → payments)
      const { data: allocs } = await supabase
        .from("payment_allocations")
        .select("id,payment_id,allocated_amount,payments(payment_date,method,reference)")
        .eq("company_id", companyId)
        .eq("trade_doc_id", row.id);
      ((allocs as any[]) || []).forEach((a) => {
        const p = (a as any).payments;
        events.push({
          event_date: p?.payment_date || null,
          event_type: "PAYMENT",
          doc_type: null,
          non_fiscal_doc_code: null,
          number: p?.reference || null,
          label: "Pago aplicado",
          amount: Math.abs(Number(a.allocated_amount || 0)),
          impact_sign: -1,
          affects_label: "Pago aplicado al documento",
        });
      });

      setRelatedByDocId((prev) => ({ ...prev, [row.id]: events }));
    } catch (e) {
      console.error("Error cargando docs relacionados", e);
      setRelatedByDocId((prev) => ({ ...prev, [row.id]: [] }));
    } finally {
      setRelatedLoadingByDocId((prev) => ({ ...prev, [row.id]: false }));
    }
  }

  // ─── Expanded row content ─────────────────────────────────────────────────────

  function renderDocExpandedContent(row: OtherDocRow) {
    const loading = relatedLoadingByDocId[row.id];
    const items = relatedByDocId[row.id];

    if (loading) {
      return <div className="text-[12px] text-slate-500">Cargando información relacionada...</div>;
    }

    if (!items) {
      return <div className="text-[12px] text-slate-400">Sin información relacionada cargada.</div>;
    }

    const originItem = items.find((i) => i.is_origin_context);
    const paymentItems = items.filter((i) => !i.is_origin_context && i.event_type === "PAYMENT");

    const balance = Number(row.balance ?? row.grand_total ?? 0);
    const isReturn = row.doc_type === "DEVOLUCION";

    const suggestionText =
      row.status === "BORRADOR"
        ? "Borrador — registrar para activar"
        : row.status === "CANCELADO"
        ? "Cancelado"
        : balance === 0
        ? "Saldado"
        : isReturn
        ? "Devolución pendiente de pago"
        : "Pendiente de cobro";
    const suggestionClass =
      row.status === "BORRADOR"
        ? "bg-amber-100 text-amber-800"
        : row.status === "CANCELADO"
        ? "bg-slate-100 text-slate-700"
        : balance === 0
        ? "bg-emerald-100 text-emerald-800"
        : "bg-rose-100 text-rose-800";

    // Etiqueta de tipo para el doc origen
    function originTypeLabel(docType: string | null) {
      if (docType === "CREDIT_NOTE")  return "Nota de crédito";
      if (docType === "DEBIT_NOTE")   return "Nota de débito";
      if (docType === "INVOICE")      return "Factura";
      if (docType === "DEVOLUCION")   return "Devolución";
      if (docType === "OTRO_INGRESO") return "Otro ingreso";
      return "Documento";
    }

    return (
      <div className="flex flex-col gap-3">

        {/* ── Banda de contexto: documento origen ─────────────────────────── */}
        {originItem && (
          <div className="rounded-xl border border-sky-200/70 bg-sky-50/60 px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-[12px]">
            <span className="font-extrabold uppercase tracking-wide text-[10px] text-sky-700">
              Documento origen
            </span>
            <span className="font-semibold text-slate-800">
              {originTypeLabel(originItem.doc_type)}
            </span>
            <span className="text-slate-700">{originItem.label || "—"}</span>
            {originItem.event_date && (
              <span className="text-slate-500">Fecha: {originItem.event_date}</span>
            )}
            <span className="text-slate-500">
              Monto: <span className="font-semibold text-slate-800">{formatNumber(originItem.amount, moneyDecimals)}</span>
            </span>
          </div>
        )}

        {/* ── Tabla de pagos ───────────────────────────────────────────────── */}
        <div className="overflow-hidden rounded-xl ring-1 ring-slate-200/70">
          {/* Header tabla */}
          <div className="grid grid-cols-[110px_130px_1fr_160px_220px] bg-gradient-to-b from-slate-100 to-slate-50 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#0b2b4f]">
            <div className="px-3 py-2 border-r border-slate-200">Fecha</div>
            <div className="px-3 py-2 border-r border-slate-200">Tipo</div>
            <div className="px-3 py-2 border-r border-slate-200">Referencia</div>
            <div className="px-3 py-2 border-r border-slate-200 text-right">Monto pagado</div>
            <div className="px-3 py-2">Estado</div>
          </div>

          {/* Sin pagos */}
          {paymentItems.length === 0 ? (
            <div className="px-4 py-4 text-[12px] text-slate-500 bg-white border-t border-slate-200/70">
              Sin pagos registrados aún.
            </div>
          ) : (
            paymentItems.map((item, idx) => (
              <div
                key={idx}
                className={cls(
                  "grid grid-cols-[110px_130px_1fr_160px_220px] text-[12px]",
                  idx % 2 === 0 ? "bg-white" : "bg-slate-50/70"
                )}
              >
                <div className="px-3 py-2 border-t border-r border-slate-200/70 whitespace-nowrap">
                  {item.event_date || "—"}
                </div>
                <div className="px-3 py-2 border-t border-r border-slate-200/70 font-semibold text-slate-700">
                  Pago
                </div>
                <div className="px-3 py-2 border-t border-r border-slate-200/70 truncate text-slate-600" title={item.number || ""}>
                  {item.number || "—"}
                </div>
                <div className="px-3 py-2 border-t border-r border-slate-200/70 text-right font-extrabold text-emerald-700 whitespace-nowrap">
                  − {formatNumber(item.amount, moneyDecimals)}
                </div>
                <div className="px-3 py-2 border-t border-slate-200/70">
                  {idx === paymentItems.length - 1 && (
                    <span className={cls(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap",
                      suggestionClass
                    )}>
                      {suggestionText}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}

          {/* Si hay pagos, muestra la sugerencia en la última fila (ya incluida arriba) */}
          {/* Si NO hay pagos pero el doc está registrado, mostrar sugerencia aparte */}
          {paymentItems.length === 0 && row.status !== "BORRADOR" && (
            <div className="px-4 py-2 bg-white border-t border-slate-200/70 flex justify-end">
              <span className={cls(
                "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap",
                suggestionClass
              )}>
                {suggestionText}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="p-6">
      <div className={tradeDocsTheme.shell}>
        {/* Header */}
        <div className={cls(tradeDocsTheme.header, "px-7 py-7")}>
          <div className={tradeDocsTheme.glowA} />
          <div className={tradeDocsTheme.glowB} />
          <div className="relative flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[12px] font-extrabold uppercase text-white/80">Ventas</div>
              <h1 className="mt-1 text-3xl font-black leading-tight text-white">
                Otros documentos de ingresos
              </h1>
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/90">
                {activeTab === "drafts" ? (
                  <>
                    <span className="inline-flex items-center rounded-full bg-white/10 px-2 py-0.5 ring-1 ring-white/15">
                      Borradores: <b className="ml-1">{draftSummary.count}</b>
                    </span>
                    <span className="inline-flex items-center rounded-full bg-white/10 px-2 py-0.5 ring-1 ring-white/15">
                      Total borradores:{" "}
                      <b className="ml-1">{formatNumber(draftSummary.total, moneyDecimals)}</b>
                    </span>
                  </>
                ) : (
                  <>
                    <span className="inline-flex items-center rounded-full bg-white/10 px-2 py-0.5 ring-1 ring-white/15">
                      Registrados: <b className="ml-1">{registeredSummary.count}</b>
                    </span>
                    <span className="inline-flex items-center rounded-full bg-white/10 px-2 py-0.5 ring-1 ring-white/15">
                      Total registrados:{" "}
                      <b className="ml-1">{formatNumber(registeredSummary.total, moneyDecimals)}</b>
                    </span>
                  </>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={tradeDocsTheme.btnGlass}
                onClick={() => { void loadDraftsList(true); void loadRegisteredList(true); }}
              >
                Refrescar
              </button>
              {canEdit && (
                <button
                  type="button"
                  className={tradeDocsTheme.btnGlass}
                  onClick={openNewEditor}
                >
                  + Nuevo documento
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Messages */}
        {pageMsg && (
          <div className="border-t bg-white px-7 py-3">
            <div
              className={cls(
                "rounded-xl border px-3 py-2 text-sm",
                pageMsg.level === "error"
                  ? "border-rose-200 bg-rose-50 text-rose-900"
                  : "border-amber-200 bg-amber-50 text-amber-900"
              )}
            >
              {pageMsg.text}
            </div>
          </div>
        )}

        {/* Content */}
        <div className="p-7">
          <div className={tradeDocsTheme.card}>
            {/* Tab bar */}
            <div className="border-b px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
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
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className={tradeDocsTheme.btnFilter}
                    onClick={() => setFiltersOpen(true)}
                  >
                    Filtros
                  </button>
                  <button
                    type="button"
                    className={tradeDocsTheme.btnSoft}
                    onClick={() => setFilters(EMPTY_OTHER_DOC_FILTERS)}
                  >
                    Limpiar filtros
                  </button>

                  {/* ── Botones de acción masiva (solo pestaña Borradores) ── */}
                  {activeTab === "drafts" && filteredDrafts.length > 0 && canEdit && (
                    <>
                      <button
                        type="button"
                        className={tradeDocsTheme.btnSoft}
                        onClick={() => {
                          if (allDraftsSelected) {
                            setSelectedDrafts({});
                          } else {
                            const next: Record<string, boolean> = {};
                            filteredDrafts.forEach((r) => (next[r.id] = true));
                            setSelectedDrafts(next);
                          }
                        }}
                      >
                        {allDraftsSelected ? "Quitar selección" : "Seleccionar todo"}
                      </button>

                      {selectedDraftIds.length > 0 && (
                        <>
                          <button
                            type="button"
                            className={tradeDocsTheme.btnSoft}
                            onClick={() => setSelectedDrafts({})}
                          >
                            Limpiar
                          </button>

                          <button
                            type="button"
                            className={cls(
                              tradeDocsTheme.btnPrimary,
                              (bulkRegistering || bulkDeleting) && "cursor-not-allowed opacity-60"
                            )}
                            disabled={bulkRegistering || bulkDeleting}
                            onClick={bulkRegisterSelected}
                          >
                            {bulkRegistering
                              ? "Registrando..."
                              : `Registrar (${selectedDraftIds.length})`}
                          </button>

                          <button
                            type="button"
                            className={cls(
                              tradeDocsTheme.btnSoft,
                              "text-rose-700 hover:bg-rose-50",
                              (bulkRegistering || bulkDeleting) && "cursor-not-allowed opacity-60"
                            )}
                            disabled={bulkRegistering || bulkDeleting}
                            onClick={bulkDeleteSelected}
                          >
                            {bulkDeleting
                              ? "Eliminando..."
                              : `Eliminar (${selectedDraftIds.length})`}
                          </button>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="p-4">
              {activeTab === "drafts" ? (
                <OtherDocsTable
                  rows={filteredDrafts}
                  loading={loadingDrafts}
                  moneyDecimals={moneyDecimals}
                  canEdit={canEdit}
                  tabKey="drafts"
                  selectedMap={selectedDrafts}
                  allSelected={allDraftsSelected}
                  onToggleSelectAll={() => {
                    if (allDraftsSelected) setSelectedDrafts({});
                    else {
                      const next: Record<string, boolean> = {};
                      filteredDrafts.forEach((r) => (next[r.id] = true));
                      setSelectedDrafts(next);
                    }
                  }}
                  onToggleRow={(id, checked) =>
                    setSelectedDrafts((prev) => ({ ...prev, [id]: checked ?? !prev[id] }))
                  }
                  onOpenRow={(id) => void openEditor(id, false)}
                  onDeleteRow={handleDeleteRow}
                  onRegisterRow={handleRegisterRow}
                  onExpandRow={(row) => void loadRelatedDocs(row)}
                  renderExpandedContent={renderDocExpandedContent}
                  useInternalScroll
                  hasMore={draftHasMore}
                  loadingMore={loadingMoreDrafts}
                  onReachEnd={() => {
                    if (!loadingMoreDrafts && draftHasMore) {
                      setLoadingMoreDrafts(true);
                      void loadDraftsList(false);
                    }
                  }}
                />
              ) : (
                <OtherDocsTable
                  rows={filteredRegistered}
                  loading={loadingRegistered}
                  moneyDecimals={moneyDecimals}
                  canEdit={canEdit}
                  tabKey="registered"
                  selectedMap={selectedRegistered}
                  allSelected={allRegisteredSelected}
                  onToggleSelectAll={() => {
                    if (allRegisteredSelected) setSelectedRegistered({});
                    else {
                      const next: Record<string, boolean> = {};
                      filteredRegistered.forEach((r) => (next[r.id] = true));
                      setSelectedRegistered(next);
                    }
                  }}
                  onToggleRow={(id, checked) =>
                    setSelectedRegistered((prev) => ({ ...prev, [id]: checked ?? !prev[id] }))
                  }
                  onOpenRow={(id) => void openEditor(id, true)}
                  onCancelRow={(row) => void openCancel(row)}
                  onExpandRow={(row) => void loadRelatedDocs(row)}
                  renderExpandedContent={renderDocExpandedContent}
                  useInternalScroll
                  hasMore={registeredHasMore}
                  loadingMore={loadingMoreRegistered}
                  onReachEnd={() => {
                    if (!loadingMoreRegistered && registeredHasMore) {
                      setLoadingMoreRegistered(true);
                      void loadRegisteredList(false);
                    }
                  }}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Editor Modal */}
      <OtherDocEditorModal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        onSaveDraft={handleSaveDraft}
        onRegister={handleRegister}
        saving={saving}
        canEdit={canEdit}
        isNew={editorDocId === null}
        readOnly={editorReadOnly}
        header={editorHeader}
        setHeader={setEditorHeader}
        journalLines={editorJournalLines}
        setJournalLines={setEditorJournalLines}
        payments={editorPayments}
        onAddPayment={handleAddPayment}
        onRemovePayment={handleRemovePayment}
        onUpdatePayment={handleUpdatePayment}
        activeTab={editorTab}
        setActiveTab={setEditorTab}
        moneyDecimals={moneyDecimals}
        baseCurrency={baseCurrency}
        branches={branches}
        businessLines={businessLines}
        accByCode={accByCode}
        counterpartyMap={counterpartyMap}
        originSearchResults={originSearchResults}
        originSearchLoading={originSearchLoading}
        originSearchLoadingMore={originSearchLoadingMore}
        originSearchHasMore={originSearchHasMore}
        onSearchOrigin={handleSearchOrigin}
        onLoadMoreOrigin={handleLoadMoreOrigin}
        onPickOrigin={handlePickOrigin}
        onClearOrigin={handleClearOrigin}
        initialPickedOriginDoc={editorInitialOriginDoc}
        journalAutoMode={journalAutoMode}
        recalcJournalAuto={recalcJournalAuto}
        onSwitchToManual={handleSwitchToManual}
        accountPolicyByCode={postingPolicyByAccountCode}
        modalMsg={modalMsg}
      />

      {/* Cancel Modal */}
      <TradeDocCancelModal
        open={cancelOpen}
        onClose={() => { setCancelOpen(false); setCancelDocRow(null); }}
        onConfirm={handleConfirmCancel}
        loading={canceling}
        loadingPreview={cancelLoadingPreview}
        cancelDate={cancelDate}
        setCancelDate={setCancelDate}
        cancelReason={cancelReason}
        setCancelReason={setCancelReason}
        previewLines={cancelJournalLines as any}
        updatePreviewLine={(idx, patch) =>
          setCancelJournalLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)))
        }
        addPreviewLine={() =>
          setCancelJournalLines((prev) => renumber([...prev, makeJournalLine(prev.length + 1)]))
        }
        removePreviewLine={(idx) =>
          setCancelJournalLines((prev) => {
            const next = prev.filter((_, i) => i !== idx);
            return next.length ? renumber(next) : [makeJournalLine(1)];
          })
        }
        moneyDecimals={moneyDecimals}
        formatNumber={formatNumber}
        theme={tradeDocsTheme}
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
      />

      {/* Filters Modal */}
      <OtherDocsFiltersModal
        open={filtersOpen}
        activeTab={activeTab}
        filters={filters}
        setFilters={setFilters}
        onClose={() => setFiltersOpen(false)}
        onClear={() => setFilters(EMPTY_OTHER_DOC_FILTERS)}
        resultCount={activeTab === "drafts" ? filteredDrafts.length : filteredRegistered.length}
      />
    </div>
  );
}

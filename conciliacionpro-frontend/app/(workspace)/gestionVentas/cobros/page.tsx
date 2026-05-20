"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import * as XLSX from "xlsx";
import type {
  CobrosRow,
  CobrosHeader,
  CobrosAllocationRow,
  CobrosAllocationDraft,
  EditorTab,
  JournalLine,
  BranchLite,
  BusinessLineLite,
  CobrosListFilters,
  CounterpartyLite,
  DocSearchFilters,
  DocSearchResult,
  CobrosType,
  CobrosStatus,
} from "./components/cobros/types";
import {
  cls,
  todayISO,
  uid,
  toNum,
  formatNumber,
  makeJournalLine,
  renumber,
  EMPTY_COBROS_FILTERS,
  applyCobrosFilters,
  getCobroPaymentProcessKey,
  buildCobrosJournalDescription,
  normalizeIdentifier,
} from "./components/cobros/helpers";
import { tradeDocsTheme } from "@/app/(workspace)/gestionVentas/docs-tribut-ventas/components/tradeDocs/ui";
import {
  getAuthUserId,
  getMyRoleForCompany,
  loadCobros,
  loadCobroById,
  loadAllocationsForCobro,
  upsertCobro,
  patchCobroExtra,
  saveAllocations,
  saveJournalEntry,
  saveJournalLines,
  loadJournalLinesForCobro,
  registerCobro,
  deleteCobro,
  cancelCobro,
  loadCounterpartiesMap,
  searchDocsForAllocation,
} from "./components/cobros/data";
import CobrosTable from "./components/cobros/CobrosTable";
import CobrosEditorModal from "./components/cobros/CobrosEditorModal";
import CobrosFiltersModal from "./components/cobros/CobrosFiltersModal";
import { CounterpartyCreateModal, Counterparty as CPCounterparty }
  from "@/app/(workspace)/components/counterparties/CounterpartyCreateModal";
import CobrosCancelModal, { type CancelCobroInfo }
  from "./components/cobros/CobrosCancelModal";
import CobrosImportModal from "./components/cobros/CobrosImportModal";
import { RecordViewModal } from "@/app/(workspace)/gestionVentas/components/RecordViewModal";
import FilterActionButtons from "@/app/(workspace)/components/FilterActionButtons";

// ─── Tipos locales ────────────────────────────────────────────────────────────

type Role = "OWNER" | "EDITOR" | "LECTOR" | null;

type ImportValidationRow = {
  status: "OK" | "ERROR";
  row_no?: number | null;
  number?: string | null;
  message: string;
};
type MainTab = "drafts" | "registered";

const PAGE_SIZE = 50;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEmptyHeader(baseCurrency: string, defaultBranchId = ""): CobrosHeader {
  return {
    cobro_type: "COBRO",
    payment_method: "EFECTIVO",
    card_kind: "",
    card_last4: "",
    auth_code: "",
    status: "BORRADOR",
    issue_date: todayISO(),
    reference: "",
    description: "",
    amount: "",
    currency_code: baseCurrency,
    branch_id: defaultBranchId,
    counterparty_id: null,
    counterparty_identifier: "",
    counterparty_name: "",
    bank_movement_id: null,
  };
}

function makeEmptyJournalLines(): JournalLine[] {
  return [makeJournalLine(1), makeJournalLine(2), makeJournalLine(3), makeJournalLine(4)];
}

// ─── Componente principal ──────────────────────────────────────────────────────

export default function Page() {
  // ─── Empresa y rol ─────────────────────────────────────────────────────────
  const [companyId, setCompanyId] = useState("");
  const [role, setRole] = useState<Role>(null);
  const canEdit = role === "OWNER" || role === "EDITOR";

  // ─── Config contable ───────────────────────────────────────────────────────
  const [moneyDecimals, setMoneyDecimals] = useState(0);
  const [baseCurrency, setBaseCurrency] = useState("CLP");
  const [branches, setBranches] = useState<BranchLite[]>([]);
  const [businessLines, setBusinessLines] = useState<BusinessLineLite[]>([]);
  const [accByCode, setAccByCode] = useState<Record<string, { id: string; code: string; name: string }>>({});
  const [accountDefaults, setAccountDefaults] = useState<Array<{ process_key: string; account_node_id: string }>>([]);
  const [defaultAccountCodeByProcess, setDefaultAccountCodeByProcess] = useState<Record<string, string>>({});
  const [postingPolicyByAccountCode, setPostingPolicyByAccountCode] = useState<Record<string, { require_suc: boolean; require_cu: boolean }>>({});
  const [counterpartyMap, setCounterpartyMap] = useState<Record<string, CounterpartyLite>>({});
  const [cpModal, setCpModal] = useState<{ open: boolean; identifier: string }>({ open: false, identifier: "" });

  const defaultBranchId = useMemo(
    () => branches.find((b) => b.is_default)?.id ?? branches[0]?.id ?? "",
    [branches]
  );

  // ─── Tabs y listas ─────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<MainTab>("drafts");

  const [drafts, setDrafts] = useState<CobrosRow[]>([]);
  const [loadingDrafts, setLoadingDrafts] = useState(false);
  const [draftOffset, setDraftOffset] = useState(0);
  const [draftHasMore, setDraftHasMore] = useState(false);
  const [loadingMoreDrafts, setLoadingMoreDrafts] = useState(false);

  const [registered, setRegistered] = useState<CobrosRow[]>([]);
  const [loadingRegistered, setLoadingRegistered] = useState(false);
  const [registeredOffset, setRegisteredOffset] = useState(0);
  const [registeredHasMore, setRegisteredHasMore] = useState(false);
  const [loadingMoreRegistered, setLoadingMoreRegistered] = useState(false);

  const [selectedDrafts, setSelectedDrafts] = useState<Record<string, boolean>>({});
  const [selectedRegistered, setSelectedRegistered] = useState<Record<string, boolean>>({});
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkRegistering, setBulkRegistering] = useState(false);

  // ─── Filtros ───────────────────────────────────────────────────────────────
  const [filters, setFilters] = useState<CobrosListFilters>(EMPTY_COBROS_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // ─── Mensajes ──────────────────────────────────────────────────────────────
  const [pageMsg, setPageMsg] = useState<{ level: "error" | "warn"; text: string } | null>(null);
  const [modalMsg, setModalMsg] = useState<{ level: "error" | "success"; text: string } | null>(null);

  // ─── Editor ────────────────────────────────────────────────────────────────
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorCobroId, setEditorCobroId] = useState<string | null>(null);
  const [editorJeId, setEditorJeId] = useState<string | null>(null);
  const [editorReadOnly, setEditorReadOnly] = useState(false);
  const [editorTab, setEditorTab] = useState<EditorTab>("CABECERA");
  const [editorHeader, setEditorHeader] = useState<CobrosHeader>(makeEmptyHeader("CLP"));
  const [editorAllocations, setEditorAllocations] = useState<CobrosAllocationDraft[]>([]);
  const [editorJournalLines, setEditorJournalLines] = useState<JournalLine[]>(makeEmptyJournalLines());
  const [saving, setSaving] = useState(false);
  const [journalAutoMode, setJournalAutoMode] = useState(true);

  // ─── Expanded rows (allocations) ──────────────────────────────────────────
  const [allocationsMap, setAllocationsMap] = useState<Record<string, CobrosAllocationRow[]>>({});
  const [allocationsLoadingMap, setAllocationsLoadingMap] = useState<Record<string, boolean>>({});

  // ─── Doc search (sub-modal) ────────────────────────────────────────────────
  const [docSearchResults, setDocSearchResults] = useState<DocSearchResult[]>([]);
  const [docSearching, setDocSearching] = useState(false);

  // ─── Cancel modal ──────────────────────────────────────────────────────────
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelCobroRow, setCancelCobroRow] = useState<CobrosRow | null>(null);
  const [cancelDate, setCancelDate] = useState(todayISO());
  const [cancelReason, setCancelReason] = useState("");
  const [cancelJournalLines, setCancelJournalLines] = useState<JournalLine[]>([]);
  const [canceling, setCanceling] = useState(false);

  // ─── Vista cruzada de documentos (desde fila expandida) ───────────────────
  const [crossViewOpen, setCrossViewOpen] = useState(false);
  const [crossViewId, setCrossViewId] = useState<string | null>(null);
  const [crossViewType, setCrossViewType] = useState<"FISCAL" | "NON_FISCAL" | null>(null);

  // ─── Importación masiva (Excel) ────────────────────────────────────────────
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importValidationRows, setImportValidationRows] = useState<ImportValidationRow[]>([]);
  const [importActionReport, setImportActionReport] = useState<{
    fileName: string; rows: any[];
  } | null>(null);

  // ─── Barra de progreso ─────────────────────────────────────────────────────
  const [progress, setProgress] = useState(0);
  const [progressVisible, setProgressVisible] = useState(false);
  const [progressDone, setProgressDone] = useState(false);

  // ─── Derived ───────────────────────────────────────────────────────────────
  const filteredDrafts = useMemo(() => applyCobrosFilters(drafts, filters), [drafts, filters]);
  const filteredRegistered = useMemo(() => applyCobrosFilters(registered, filters), [registered, filters]);

  const allDraftsSelected = useMemo(
    () => filteredDrafts.length > 0 && filteredDrafts.every((r) => selectedDrafts[r.id]),
    [filteredDrafts, selectedDrafts]
  );
  const selectedDraftIds = useMemo(
    () => Object.keys(selectedDrafts).filter((id) => selectedDrafts[id]),
    [selectedDrafts]
  );
  const allRegisteredSelected = useMemo(
    () => filteredRegistered.length > 0 && filteredRegistered.every((r) => selectedRegistered[r.id]),
    [filteredRegistered, selectedRegistered]
  );

  const draftSummary = useMemo(() => ({
    count: drafts.length,
    total: drafts.reduce((s, r) => s + Math.abs(Number(r.total_amount || 0)), 0),
  }), [drafts]);

  const registeredSummary = useMemo(() => ({
    count: registered.length,
    total: registered.reduce((s, r) => s + Math.abs(Number(r.total_amount || 0)), 0),
  }), [registered]);

  // ─── Account defaults → códigos ───────────────────────────────────────────
  useEffect(() => {
    const accByIdLocal = Object.fromEntries(Object.values(accByCode).map((a) => [a.id, a]));
    const byProcess: Record<string, string> = {};
    accountDefaults.forEach((d) => {
      const acc = accByIdLocal[d.account_node_id];
      if (acc?.code) byProcess[d.process_key] = acc.code;
    });
    setDefaultAccountCodeByProcess(byProcess);
  }, [accountDefaults, accByCode]);

  // ─── Construcción automática del asiento ──────────────────────────────────

  function buildJournalFromCobro(
    header: CobrosHeader,
    allocations: CobrosAllocationDraft[],
    defAccByProcess: Record<string, string>,
    policyByCode: Record<string, { require_suc: boolean; require_cu: boolean }>
  ): JournalLine[] {
    const amount = Number(header.amount) || 0;
    if (amount === 0) return makeEmptyJournalLines();

    const glosa = buildCobrosJournalDescription({
      cobro_type: header.cobro_type,
      number: header.reference,
      counterparty_name: header.counterparty_name,
      payment_method: header.payment_method as any,
      allocations,
    });

    const headerBranch = branches.find((b) => b.id === header.branch_id);
    const headerBranchCode = headerBranch?.code ?? "";

    function branchForCode(accCode: string): string {
      if (!accCode) return "";
      const pol = policyByCode[accCode.toUpperCase()];
      return pol?.require_suc && headerBranchCode ? headerBranchCode : "";
    }

    const empty = {
      cost_center_id: null as null,
      business_line_id: null as null,
      branch_id: null as null,
      cost_center_code: "",
      business_line_code: "",
      branch_code: "",
    };

    const newLines: JournalLine[] = [];
    let lineNo = 1;
    const cxcCode = String(defAccByProcess["SALE_PAYMENT_CREDIT"] || "").trim();

    // ── ANTICIPO: Dr Banco → Cr Anticipos de clientes (pasivo) ───────────────
    if (header.cobro_type === "ANTICIPO") {
      const payKey     = getCobroPaymentProcessKey(header.payment_method as any, header.card_kind);
      const payAccCode = String(defAccByProcess[payKey] || "").trim();
      const advCode    = String(defAccByProcess["CUSTOMER_ADVANCE_LIABILITY"] || "").trim();
      const absAmt     = Math.abs(amount);
      newLines.push({
        line_no: lineNo++, account_code: payAccCode, description: glosa,
        debit: String(absAmt), credit: "0",
        ...empty, branch_code: branchForCode(payAccCode),
      });
      newLines.push({
        line_no: lineNo++, account_code: advCode, description: glosa,
        debit: "0", credit: String(absAmt),
        ...empty,
      });

    // ── COBRO normal ──────────────────────────────────────────────────────────
    } else if (header.cobro_type === "COBRO") {
      // Dr: cuenta según forma de pago
      const payKey = getCobroPaymentProcessKey(header.payment_method as any, header.card_kind);
      const payAccCode = String(defAccByProcess[payKey] || "").trim();
      newLines.push({
        line_no: lineNo++,
        account_code: payAccCode,
        description: glosa,
        debit: String(Math.abs(amount)),
        credit: "0",
        ...empty,
        branch_code: branchForCode(payAccCode),
      });

      // Cr: por cada documento asociado (Clientes por Cobrar)
      const usedAllocs = allocations.filter((a) => Number(a.allocated_amount) > 0);
      if (usedAllocs.length > 0) {
        for (const a of usedAllocs) {
          // Solo añadir el folio del doc si hay múltiples asignaciones;
          // con una sola, la glosa ya lo incluye y evitamos repetirlo.
          const docLabel = usedAllocs.length > 1
            ? [a.fiscal_doc_code || a.non_fiscal_doc_code, a.number].filter(Boolean).join("-")
            : "";
          newLines.push({
            line_no: lineNo++,
            account_code: cxcCode,
            description: [glosa, docLabel].filter(Boolean).join(" / "),
            debit: "0",
            credit: String(Number(a.allocated_amount)),
            ...empty,
            branch_code: branchForCode(cxcCode),
          });
        }
      } else {
        // Sin allocations todavía — línea genérica
        newLines.push({
          line_no: lineNo++,
          account_code: cxcCode,
          description: glosa,
          debit: "0",
          credit: String(Math.abs(amount)),
          ...empty,
          branch_code: branchForCode(cxcCode),
        });
      }
    } else {
      // AJUSTE
      const absAmount = Math.abs(amount);
      const isPositive = amount > 0; // positivo = reduce saldo del cliente (Dr CxC, Cr ingreso/ajuste)

      if (isPositive) {
        // Dr: CxC (reduce deuda — positivo para la empresa)
        newLines.push({
          line_no: lineNo++,
          account_code: cxcCode,
          description: glosa,
          debit: "0",
          credit: String(absAmount),
          ...empty,
          branch_code: branchForCode(cxcCode),
        });
        // Cr: cuenta de ajuste positivo (libre)
        const adjCode = String(defAccByProcess["COBRO_ADJ_INCOME"] || "").trim();
        newLines.push({
          line_no: lineNo++,
          account_code: adjCode,
          description: glosa,
          debit: String(absAmount),
          credit: "0",
          ...empty,
          branch_code: branchForCode(adjCode),
        });
      } else {
        // Ajuste negativo: aumenta deuda del cliente
        // Dr: cuenta de ajuste negativo (libre)
        const adjCode = String(defAccByProcess["COBRO_ADJ_EXPENSE"] || "").trim();
        newLines.push({
          line_no: lineNo++,
          account_code: adjCode,
          description: glosa,
          debit: String(absAmount),
          credit: "0",
          ...empty,
          branch_code: branchForCode(adjCode),
        });
        // Cr: CxC
        newLines.push({
          line_no: lineNo++,
          account_code: cxcCode,
          description: glosa,
          debit: "0",
          credit: String(absAmount),
          ...empty,
          branch_code: branchForCode(cxcCode),
        });
      }
    }

    while (newLines.length < 4) {
      newLines.push({ line_no: lineNo++, account_code: "", description: "", debit: "0", credit: "0", ...empty });
    }

    return renumber(newLines);
  }

  function recalcJournalAuto() {
    setJournalAutoMode(true);
    setEditorJournalLines(
      buildJournalFromCobro(editorHeader, editorAllocations, defaultAccountCodeByProcess, postingPolicyByAccountCode)
    );
  }

  // Auto-recalc cuando cambian inputs relevantes
  useEffect(() => {
    if (!journalAutoMode) return;
    setEditorJournalLines(
      buildJournalFromCobro(editorHeader, editorAllocations, defaultAccountCodeByProcess, postingPolicyByAccountCode)
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    journalAutoMode, editorHeader.cobro_type, editorHeader.payment_method, editorHeader.card_kind,
    editorHeader.amount, editorHeader.reference, editorHeader.counterparty_name, editorHeader.branch_id,
    editorAllocations, defaultAccountCodeByProcess, postingPolicyByAccountCode, branches,
  ]);

  // ─── Init: empresa ─────────────────────────────────────────────────────────
  useEffect(() => {
    const id = localStorage.getItem("active_company_id") ?? "";
    setCompanyId(id);
    const onCompanyChange = () => setCompanyId(localStorage.getItem("active_company_id") ?? "");
    window.addEventListener("company:changed", onCompanyChange);
    return () => window.removeEventListener("company:changed", onCompanyChange);
  }, []);

  // ─── Init: datos maestros ──────────────────────────────────────────────────
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
        id: String(b.id), code: String(b.code || ""), name: String(b.name || ""),
        is_active: Boolean(b.is_active), is_default: Boolean(b.is_default),
      })));

      const { data: buData } = await supabase
        .from("business_lines")
        .select("id,code,name,is_active")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("code");
      setBusinessLines(((buData as any[]) || []).map((b) => ({
        id: String(b.id), code: String(b.code || ""), name: String(b.name || ""), is_active: Boolean(b.is_active),
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
      } catch { setAccountDefaults([]); setDefaultAccountCodeByProcess({}); }

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
      } catch { setPostingPolicyByAccountCode({}); }

      try {
        const cpMap = await loadCounterpartiesMap(companyId);
        setCounterpartyMap(cpMap);
      } catch { setCounterpartyMap({}); }
    })();
  }, [companyId]);

  // ─── Init: carga de listas ─────────────────────────────────────────────────
  useEffect(() => {
    if (!companyId) return;
    void loadDraftsList(true);
    void loadRegisteredList(true);
  }, [companyId]);

  // ─── Progress bar ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!saving && !bulkRegistering && !bulkDeleting && !importing) return;
    setProgressVisible(true);
    setProgressDone(false);
    setProgress((prev) => (prev > 0 ? prev : 8));
    const timer = window.setInterval(() => {
      setProgress((prev) => {
        if (prev >= 92) return prev;
        if (prev < 35) return prev + 8;
        if (prev < 60) return prev + 5;
        if (prev < 80) return prev + 3;
        return prev + 1;
      });
    }, 400);
    return () => window.clearInterval(timer);
  }, [saving, bulkRegistering, bulkDeleting, importing]);

  function finishProgress() {
    setProgress(100);
    setProgressDone(true);
    window.setTimeout(() => {
      setProgressVisible(false);
      setProgressDone(false);
      setProgress(0);
    }, 1200);
  }

  // ─── Utilidades ───────────────────────────────────────────────────────────

  function showMsg(level: "error" | "warn", text: string) {
    setPageMsg({ level, text });
    if (level !== "error") window.setTimeout(() => setPageMsg(null), 8000);
  }

  function showModalMsg(level: "error" | "success", text: string) {
    setModalMsg({ level, text });
  }

  // ─── Carga de listas ───────────────────────────────────────────────────────

  async function loadDraftsList(reset = false) {
    if (!companyId) return;
    if (reset) { setLoadingDrafts(true); setDraftOffset(0); }
    try {
      const offset = reset ? 0 : draftOffset;
      const data = await loadCobros(companyId, "BORRADOR", offset, PAGE_SIZE);
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
      const data = await loadCobros(companyId, "VIGENTE_OR_CANCELADO", offset, PAGE_SIZE);
      if (reset) setRegistered(data);
      else setRegistered((prev) => [...prev, ...data]);
      setRegisteredHasMore(data.length === PAGE_SIZE);
      setRegisteredOffset(offset + data.length);
    } catch (e: any) {
      showMsg("error", e?.message || "No se pudieron cargar cobros registrados.");
    } finally {
      setLoadingRegistered(false);
      setLoadingMoreRegistered(false);
    }
  }

  // ─── Expanded row: cargar allocations ─────────────────────────────────────

  async function handleExpandRow(row: CobrosRow) {
    if (allocationsMap[row.id]) return; // ya cargado
    setAllocationsLoadingMap((m) => ({ ...m, [row.id]: true }));
    try {
      const allocs = await loadAllocationsForCobro(companyId, row.id);
      setAllocationsMap((m) => ({ ...m, [row.id]: allocs }));
    } catch {
      setAllocationsMap((m) => ({ ...m, [row.id]: [] }));
    } finally {
      setAllocationsLoadingMap((m) => ({ ...m, [row.id]: false }));
    }
  }

  // ─── Abrir editor ──────────────────────────────────────────────────────────

  function openNewEditor(type: CobrosType = "COBRO") {
    setEditorCobroId(null);
    setEditorJeId(null);
    setEditorReadOnly(false);
    setEditorTab("CABECERA");
    const emptyHeader = makeEmptyHeader(baseCurrency, defaultBranchId);
    emptyHeader.cobro_type = type;
    setEditorHeader(emptyHeader);
    setEditorAllocations([]);
    setEditorJournalLines(makeEmptyJournalLines());
    setJournalAutoMode(true);
    setModalMsg(null);
    setEditorOpen(true);
  }

  async function openExistingEditor(cobroId: string) {
    if (!companyId) return;
    try {
      const raw = await loadCobroById(companyId, cobroId);
      if (!raw) { showMsg("error", "No se pudo cargar el cobro."); return; }

      // Leer desde columnas reales; extra como fallback por backward compat
      const ex = (raw.extra as Record<string, any>) || {};
      const paymentType: string = raw.payment_type ?? ex.cobro_type ?? "COBRO";
      const isAjuste    = paymentType === "AJUSTE_COBRO" || paymentType === "AJUSTE";
      const isAnticipo  = paymentType === "ANTICIPO";
      const rawStatus: string = raw.status ?? ex.status ?? "BORRADOR";
      const header: CobrosHeader = {
        cobro_type: (isAjuste ? "AJUSTE" : isAnticipo ? "ANTICIPO" : "COBRO") as CobrosType,
        payment_method: isAjuste ? "EFECTIVO" : (raw.method ?? "EFECTIVO"),
        card_kind: raw.card_kind ?? "",
        card_last4: raw.card_last4 ?? "",
        auth_code: raw.auth_code ?? "",
        status: rawStatus as CobrosStatus,
        issue_date: raw.payment_date ?? todayISO(),
        reference: raw.reference ?? "",
        description: raw.notes ?? "",
        amount: String(raw.total_amount ?? 0),
        currency_code: raw.currency_code ?? baseCurrency,
        branch_id: ex.branch_id ?? defaultBranchId,
        counterparty_id: raw.counterparty_id ?? ex.counterparty_id ?? null,
        counterparty_identifier: (raw.counterparties as any)?.identifier ?? ex.counterparty_identifier_snapshot ?? "",
        counterparty_name: (raw.counterparties as any)?.name ?? ex.counterparty_name_snapshot ?? "",
        bank_movement_id: raw.bank_movement_id ?? ex.bank_movement_id ?? null,
      };

      // Cargar allocations
      const allocs = await loadAllocationsForCobro(companyId, cobroId);
      const draftAllocs: CobrosAllocationDraft[] = allocs.map((a) => ({
        id: uid(),
        trade_doc_id: a.trade_doc_id,
        doc_type: a.doc_type ?? null,
        doc_class: a.doc_class ?? null,
        fiscal_doc_code: a.fiscal_doc_code ?? null,
        non_fiscal_doc_code: a.non_fiscal_doc_code ?? null,
        series: a.series ?? null,
        number: a.number ?? null,
        issue_date: a.issue_date ?? null,
        counterparty_name: a.counterparty_name_snapshot ?? null,
        grand_total: a.grand_total ?? null,
        balance: a.balance ?? null,
        currency_code: a.currency_code ?? null,
        allocated_amount: String(a.allocated_amount ?? 0),
      }));

      // Cargar líneas de asiento
      let jeLines = makeEmptyJournalLines();
      let autoMode = true;
      const loadedJeId = ex.journal_entry_id ?? null;
      if (loadedJeId) {
        try {
          const loaded = await loadJournalLinesForCobro(companyId, loadedJeId, accByCode);
          if (loaded.length > 0) { jeLines = loaded; autoMode = false; }
        } catch { /* no-op */ }
      }

      setEditorCobroId(cobroId);
      setEditorJeId(loadedJeId);
      setEditorReadOnly(rawStatus !== "BORRADOR");
      setEditorTab("CABECERA");
      setEditorHeader(header);
      setEditorAllocations(draftAllocs);
      setEditorJournalLines(jeLines);
      setJournalAutoMode(autoMode);
      setModalMsg(null);
      setEditorOpen(true);
    } catch (e: any) {
      showMsg("error", e?.message || "No se pudo abrir el cobro.");
    }
  }

  // ─── Selección ─────────────────────────────────────────────────────────────

  function toggleSelectDraft(id: string, checked?: boolean) {
    setSelectedDrafts((m) => ({ ...m, [id]: checked ?? !m[id] }));
  }
  function toggleSelectAllDrafts() {
    if (allDraftsSelected) setSelectedDrafts({});
    else setSelectedDrafts(Object.fromEntries(filteredDrafts.map((r) => [r.id, true])));
  }
  function toggleSelectRegistered(id: string, checked?: boolean) {
    setSelectedRegistered((m) => ({ ...m, [id]: checked ?? !m[id] }));
  }
  function toggleSelectAllRegistered() {
    if (allRegisteredSelected) setSelectedRegistered({});
    else setSelectedRegistered(Object.fromEntries(filteredRegistered.map((r) => [r.id, true])));
  }

  // ─── Guardar borrador ──────────────────────────────────────────────────────

  async function handleSaveDraft() {
    if (!companyId) return;
    setSaving(true);
    setModalMsg(null);
    try {
      const userId = await getAuthUserId();
      const h = editorHeader;

      const counterpartyKey = normalizeIdentifier(h.counterparty_identifier).toUpperCase();
      const cp = counterpartyMap[counterpartyKey];

      const cpId = cp?.id ?? h.counterparty_id ?? null;
      const payload: Record<string, unknown> = {
        // ── Columnas reales de payments ───────────────────────────────────────
        payment_type: h.cobro_type === "COBRO"
          ? "COBRO"
          : h.cobro_type === "ANTICIPO"
          ? "ANTICIPO"
          : "AJUSTE_COBRO",
        status: "BORRADOR",
        // method aplica a cobros y anticipos (ambos tienen forma de pago); no a ajustes
        method: (h.cobro_type === "COBRO" || h.cobro_type === "ANTICIPO") ? (h.payment_method || "EFECTIVO") : null,
        card_kind: (h.cobro_type === "COBRO" || h.cobro_type === "ANTICIPO") && h.payment_method === "TARJETA" ? (h.card_kind || null) : null,
        card_last4: (h.cobro_type === "COBRO" || h.cobro_type === "ANTICIPO") && h.payment_method === "TARJETA" ? (h.card_last4 || null) : null,
        auth_code: (h.cobro_type === "COBRO" || h.cobro_type === "ANTICIPO") && h.payment_method === "TARJETA" ? (h.auth_code || null) : null,
        payment_date: h.issue_date || null,
        reference: h.reference || null,
        notes: h.description || null,
        total_amount: Number(h.amount) || 0,
        currency_code: h.currency_code || baseCurrency,
        counterparty_id: cpId,
        journal_entry_id: editorJeId,
        bank_movement_id: h.bank_movement_id ?? null,
        // extra solo conserva campos sin columna real propia
        extra: {
          journal_entry_id: editorJeId,  // redundante pero permite backward compat
        },
        created_by: userId,
      };

      // 1. Upsert del cobro
      const { id: cobroId } = await upsertCobro({ companyId, cobroId: editorCobroId, payload });

      // 2. Guardar asiento DRAFT
      const jeDescription = buildCobrosJournalDescription({
        cobro_type: h.cobro_type,
        number: h.reference,
        counterparty_name: h.counterparty_name,
        payment_method: h.payment_method as any,
        allocations: editorAllocations,
      });
      const jeId = await saveJournalEntry({
        companyId, cobroId, counterpartyId: cpId ?? null,
        entryDate: h.issue_date || todayISO(),
        description: jeDescription, currencyCode: h.currency_code || baseCurrency,
        userId, existingJournalEntryId: editorJeId,
      });

      // 3. Guardar líneas del asiento
      await saveJournalLines(companyId, jeId, editorJournalLines, accByCode, branches, businessLines);

      // 4. Actualizar journal_entry_id en columna real (y extra por backward compat)
      await patchCobroExtra(companyId, cobroId, { journal_entry_id: jeId });
      await supabase.from("payments")
        .update({ journal_entry_id: jeId })
        .eq("company_id", companyId)
        .eq("id", cobroId);

      // 5. Guardar allocations
      const allocs = editorAllocations
        .filter((a) => a.trade_doc_id && Number(a.allocated_amount) >= 0)
        .map((a) => ({ trade_doc_id: a.trade_doc_id, allocated_amount: Number(a.allocated_amount) }));
      await saveAllocations({ companyId, cobroId, allocations: allocs, userId });

      // 6. Actualizar estado local
      setEditorCobroId(cobroId);
      setEditorJeId(jeId);
      setEditorHeader((h) => ({ ...h, status: "BORRADOR" }));

      // Refrescar lista
      await loadDraftsList(true);

      showModalMsg("success", editorCobroId ? "Borrador actualizado." : "Borrador guardado.");
      finishProgress();
    } catch (e: any) {
      showModalMsg("error", e?.message || "Error al guardar el borrador.");
    } finally {
      setSaving(false);
    }
  }

  // ─── Registrar cobro ───────────────────────────────────────────────────────

  async function handleRegister() {
    if (!companyId) return;

    // Guardar primero para asegurarnos de que todo esté persistido
    await handleSaveDraft();

    if (!editorCobroId || !editorJeId) {
      showModalMsg("error", "Primero guarda el cobro como borrador.");
      return;
    }

    setSaving(true);
    setModalMsg(null);
    try {
      const allocs = editorAllocations
        .filter((a) => a.trade_doc_id && Number(a.allocated_amount) > 0)
        .map((a) => ({ trade_doc_id: a.trade_doc_id, allocated_amount: Number(a.allocated_amount) }));

      await registerCobro({
        companyId,
        cobroId: editorCobroId,
        journalEntryId: editorJeId,
        allocations: allocs,
      });

      // Invalidar cache de allocations del expanded row
      setAllocationsMap((m) => {
        const next = { ...m };
        delete next[editorCobroId!];
        return next;
      });

      await Promise.all([loadDraftsList(true), loadRegisteredList(true)]);
      setEditorOpen(false);
      showMsg("warn", "Cobro registrado correctamente.");
      finishProgress();
    } catch (e: any) {
      showModalMsg("error", e?.message || "Error al registrar el cobro.");
    } finally {
      setSaving(false);
    }
  }

  // ─── Registrar desde fila ──────────────────────────────────────────────────

  async function handleRegisterRow(row: CobrosRow) {
    if (!companyId || !row.journal_entry_id) {
      showMsg("error", "El cobro no tiene asiento contable. Ábrelo y guárdalo primero.");
      return;
    }
    setSaving(true);
    try {
      const allocs = await loadAllocationsForCobro(companyId, row.id);
      const allocsForRegister = allocs.map((a) => ({
        trade_doc_id: a.trade_doc_id,
        allocated_amount: Number(a.allocated_amount),
      }));
      await registerCobro({
        companyId, cobroId: row.id,
        journalEntryId: row.journal_entry_id,
        allocations: allocsForRegister,
      });
      setAllocationsMap((m) => { const n = { ...m }; delete n[row.id]; return n; });
      await Promise.all([loadDraftsList(true), loadRegisteredList(true)]);
      showMsg("warn", "Cobro registrado.");
    } catch (e: any) {
      showMsg("error", e?.message || "Error al registrar.");
    } finally {
      setSaving(false);
    }
  }

  // ─── Eliminar borrador ─────────────────────────────────────────────────────

  async function handleDeleteRow(cobroId: string) {
    if (!companyId) return;
    if (!window.confirm("¿Eliminar este borrador? La operación no se puede deshacer.")) return;
    try {
      await deleteCobro(companyId, cobroId);
      await loadDraftsList(true);
    } catch (e: any) {
      showMsg("error", e?.message || "Error al eliminar el borrador.");
    }
  }

  // ─── Cancelar cobro ────────────────────────────────────────────────────────

  function openCancelModal(row: CobrosRow) {
    setCancelCobroRow(row);
    setCancelDate(todayISO());
    setCancelReason("");

    // Pre-cargar las líneas del asiento original para invertirlas
    if (row.journal_entry_id && Object.keys(accByCode).length > 0) {
      loadJournalLinesForCobro(companyId, row.journal_entry_id, accByCode)
        .then((lines) => {
          // Invertir debe y haber para la reversa
          const reversed = lines.map((l) => ({ ...l, debit: l.credit, credit: l.debit }));
          setCancelJournalLines(renumber(reversed));
        })
        .catch(() => setCancelJournalLines(makeEmptyJournalLines()));
    } else {
      setCancelJournalLines(makeEmptyJournalLines());
    }
    setCancelOpen(true);
  }

  async function handleCancelConfirm() {
    if (!companyId || !cancelCobroRow) return;
    setCanceling(true);
    try {
      const userId = await getAuthUserId();
      await cancelCobro({
        companyId,
        cobroId: cancelCobroRow.id,
        cancelDate,
        cancelReason,
        reversalLines: cancelJournalLines,
        accByCode,
        branches,
        businessLines,
        userId,
        currencyCode: cancelCobroRow.currency_code ?? baseCurrency,
      });
      setAllocationsMap((m) => { const n = { ...m }; delete n[cancelCobroRow.id]; return n; });
      await loadRegisteredList(true);
      setCancelOpen(false);
      showMsg("warn", "Cobro cancelado con reversa contable.");
    } catch (e: any) {
      showMsg("error", e?.message || "Error al cancelar el cobro.");
    } finally {
      setCanceling(false);
    }
  }

  // ─── Doc search ────────────────────────────────────────────────────────────

  async function handleSearchDocs(filters: DocSearchFilters) {
    if (!companyId) return;
    setDocSearching(true);
    try {
      const excludeIds = editorAllocations.map((a) => a.trade_doc_id);
      // Forzar filtro por el RUT/ID de la cabecera del cobro actual
      const mergedFilters: DocSearchFilters = {
        ...filters,
        counterparty_identifier: editorHeader.counterparty_identifier.trim() || filters.counterparty_identifier,
      };
      const results = await searchDocsForAllocation({
        companyId, filters: mergedFilters, excludeDocIds: excludeIds,
      });
      setDocSearchResults(results);
    } catch (e: any) {
      setDocSearchResults([]);
    } finally {
      setDocSearching(false);
    }
  }

  function handleAddDocToAllocation(draft: CobrosAllocationDraft) {
    setEditorAllocations((prev) => {
      // Evitar duplicados
      if (prev.some((a) => a.trade_doc_id === draft.trade_doc_id)) return prev;
      return [...prev, draft];
    });
    setJournalAutoMode(true); // trigger recalc
  }

  // ─── Contraparte crear ─────────────────────────────────────────────────────

  async function handleCounterpartyCreated(cp: CPCounterparty) {
    const normKey = (cp.identifier_normalized ?? cp.identifier ?? "").toUpperCase();
    setCounterpartyMap((m) => ({
      ...m,
      [normKey]: {
        id: cp.id,
        identifier: cp.identifier,
        identifier_normalized: normKey,
        name: cp.name,
      },
    }));
    setEditorHeader((h) => ({
      ...h,
      counterparty_id: cp.id,
      counterparty_identifier: cp.identifier,
      counterparty_name: cp.name,
    }));
    setCpModal({ open: false, identifier: "" });
  }

  // ─── Eliminación masiva de borradores ─────────────────────────────────────

  async function bulkDeleteDrafts() {
    if (!canEdit || !companyId || selectedDraftIds.length === 0) return;
    if (!window.confirm(
      `¿Eliminar ${selectedDraftIds.length} borrador(es)? Esta acción no se puede deshacer.`
    )) return;

    setBulkDeleting(true);
    const ids = [...selectedDraftIds];
    try {
      const { data, error } = await supabase.rpc("bulk_delete_cobros", {
        _company_id:  companyId,
        _payment_ids: ids,
      });
      if (error) throw error;

      const deletedCount = Number((data as any)?.deleted_count ?? 0);
      const skippedCount = Number((data as any)?.skipped_count ?? 0);

      setSelectedDrafts({});
      await loadDraftsList(true);
      finishProgress();

      if (skippedCount > 0) {
        showMsg("warn", `${deletedCount} borrador(es) eliminado(s). ${skippedCount} omitido(s) (ya no estaban en BORRADOR).`);
      } else {
        showMsg("warn", `${deletedCount} borrador(es) eliminado(s).`);
      }
    } catch (e: any) {
      showMsg("error", e?.message || "Error al eliminar borradores.");
    } finally {
      setBulkDeleting(false);
    }
  }

  // ─── Registro masivo de borradores ───────────────────────────────────────

  async function bulkRegisterDrafts() {
    if (!canEdit || !companyId || selectedDraftIds.length === 0) return;
    if (!window.confirm(
      `¿Registrar ${selectedDraftIds.length} borrador(es) como VIGENTE y contabilizarlos?`
    )) return;

    setBulkRegistering(true);
    const ids = [...selectedDraftIds];
    const rowMap = Object.fromEntries(filteredDrafts.map((r) => [r.id, r]));
    let okCount = 0;
    let errorCount = 0;
    const errorMsgs: string[] = [];

    try {
      for (const id of ids) {
        const row = rowMap[id];
        if (!row) { errorCount++; errorMsgs.push(`ID ${id}: no encontrado`); continue; }
        if (!row.journal_entry_id) {
          errorCount++;
          errorMsgs.push(`${row.number || id}: sin asiento contable. Ábrelo y guárdalo primero.`);
          continue;
        }
        try {
          const allocs = await loadAllocationsForCobro(companyId, id);
          await registerCobro({
            companyId,
            cobroId: id,
            journalEntryId: row.journal_entry_id,
            allocations: allocs.map((a) => ({
              trade_doc_id: a.trade_doc_id,
              allocated_amount: Number(a.allocated_amount),
            })),
          });
          okCount++;
        } catch (e: any) {
          errorCount++;
          errorMsgs.push(`${row.number || id}: ${e?.message || "Error al registrar"}`);
        }
      }

      setSelectedDrafts({});
      await Promise.all([loadDraftsList(true), loadRegisteredList(true)]);
      finishProgress();

      if (errorCount > 0) {
        showMsg("error",
          `Registro masivo: ${okCount} OK / ${errorCount} error(es). ${errorMsgs[0] ?? ""}`
        );
      } else {
        showMsg("warn", `${okCount} cobro(s) registrado(s) correctamente.`);
      }
    } catch (e: any) {
      showMsg("error", e?.message || "Error en registro masivo.");
    } finally {
      setBulkRegistering(false);
    }
  }

  // ─── Carga masiva Excel ────────────────────────────────────────────────────

  function downloadImportTemplate() {
    window.open("/templates/Plantilla_carga_masiva_cobros.xlsx", "_blank");
  }

  function openImport() {
    setImportErrors([]);
    setImportValidationRows([]);
    setImportPreview([]);
    setImportActionReport(null);
    setImportOpen(true);
  }

  function closeImport() {
    setImportOpen(false);
    setImportErrors([]);
    setImportValidationRows([]);
    setImportPreview([]);
    (window as any).__cobrosImportParsed = null;
  }

  function exportImportReport() {
    if (!importActionReport) return;
    const rows = importActionReport.rows.map((r: any) => ({
      fila:       r.row_no    ?? "",
      estado:     r.status    ?? "",
      referencia: r.number    ?? "",
      mensaje:    r.message   ?? "",
      cobro_id:   r.payment_id ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Reporte");
    XLSX.writeFile(wb, importActionReport.fileName);
  }

  async function onPickCobroExcel(file: File) {
    setImportErrors([]);
    setImportValidationRows([]);
    setImportPreview([]);
    (window as any).__cobrosImportParsed = null;

    try {
      const ab = await file.arrayBuffer();
      const wb = XLSX.read(ab, { type: "array" });

      const wsCobros = wb.Sheets["COBROS"];
      if (!wsCobros) throw new Error("Falta la hoja COBROS en el archivo.");

      // Fila 1 = claves técnicas (encabezado), datos desde fila 2.
      const rawRows = XLSX.utils.sheet_to_json(wsCobros, {
        defval: "",
      }) as Record<string, any>[];

      if (rawRows.length === 0)
        throw new Error("La hoja COBROS está vacía (los datos van desde la fila 2).");

      const normalizeDate = (v: any): string => {
        if (!v && v !== 0) return "";
        if (typeof v === "number") {
          const d = XLSX.SSF.parse_date_code(v);
          if (!d) return "";
          return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
        }
        const s = String(v).trim();
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
          const [dd, mm, yyyy] = s.split("/");
          return `${yyyy}-${mm}-${dd}`;
        }
        return s.slice(0, 10);
      };

      const normStr = (v: any) => String(v ?? "").trim();
      const normNum = (v: any) => {
        const n = Number(String(v ?? "").replace(/[^0-9.-]/g, ""));
        return isNaN(n) ? 0 : n;
      };
      const normUpper = (v: any) => normStr(v).toUpperCase() || null;

      const cobros = rawRows.map((r, idx) => {
        const cobroType  = normUpper(r.cobro_type) ?? "COBRO";
        const reference  = normStr(r.reference);
        const allocNum   = normStr(r.alloc_doc_number);
        const allocClass = normUpper(r.alloc_doc_class);
        const card4      = normStr(r.card_last4).replace(/\D/g, "").slice(0, 4) || null;
        const bankId     = normStr(r.bank_id) || null;

        return {
          source_row_no: idx + 2, // fila 1=keys, datos desde fila 2
          cobro_type:              cobroType,
          payment_date:            normalizeDate(r.payment_date),
          reference,
          counterparty_identifier: normStr(r.counterparty_identifier),
          currency_code:           normUpper(r.currency_code) ?? baseCurrency ?? "CLP",
          total_amount:            normNum(r.total_amount),
          description:             normStr(r.description) || null,
          // forma de pago
          payment_method:          normUpper(r.payment_method),
          card_kind:               normUpper(r.card_kind),
          card_last4:              card4,
          auth_code:               normStr(r.auth_code) || null,
          // banco (futuro FK)
          bank_id:                 bankId,
          // doc a asociar
          alloc_doc_class:         allocClass || null,
          alloc_doc_number:        allocNum   || null,
          alloc_doc_type:          normStr(r.alloc_doc_type) || null,
          alloc_amount:            normNum(r.alloc_amount) || null,
          // asiento
          account_debe:            normStr(r.account_debe)             || null,
          account_haber:           normStr(r.account_haber)            || null,
          branch_code_debe:        normStr(r.branch_code_debe)         || null,
          branch_code_haber:       normStr(r.branch_code_haber)        || null,
          business_line_code_debe: normStr(r.business_line_code_debe)  || null,
          business_line_code_haber:normStr(r.business_line_code_haber) || null,
          // flags para preview
          has_allocation: !!allocNum,
          has_external:   !!(card4 || bankId),
        };
      });

      // ── Validación local ────────────────────────────────────────────────────
      const validationRows: ImportValidationRow[] = [];
      cobros.forEach((c) => {
        const fila = `fila ${c.source_row_no}`;
        const ref  = c.reference || undefined;
        if (!c.payment_date)
          validationRows.push({ status: "ERROR", row_no: c.source_row_no, number: ref,
            message: `payment_date vacío (${fila}).` });
        if (!c.counterparty_identifier)
          validationRows.push({ status: "ERROR", row_no: c.source_row_no, number: ref,
            message: `counterparty_identifier vacío (${fila}).` });
        if (!c.total_amount || c.total_amount === 0)
          validationRows.push({ status: "ERROR", row_no: c.source_row_no, number: ref,
            message: `total_amount debe ser distinto de 0 (${fila}).` });
        if (c.cobro_type === "COBRO" && !c.payment_method)
          validationRows.push({ status: "ERROR", row_no: c.source_row_no, number: ref,
            message: `payment_method es obligatorio para tipo COBRO (${fila}).` });
        if (!c.account_debe)
          validationRows.push({ status: "ERROR", row_no: c.source_row_no, number: ref,
            message: `account_debe vacío (${fila}).` });
        if (!c.account_haber)
          validationRows.push({ status: "ERROR", row_no: c.source_row_no, number: ref,
            message: `account_haber vacío (${fila}).` });
      });

      setImportValidationRows(validationRows);
      setImportErrors(
        validationRows.length > 0
          ? [`${validationRows.length} error(es) de validación detectados.`]
          : []
      );
      setImportActionReport({
        fileName: "reporte_validacion_cobros.xlsx",
        rows: validationRows.length > 0
          ? validationRows
          : [{ status: "OK", message: `Validación OK. Cobros: ${cobros.length}.` }],
      });
      setImportPreview(cobros.slice(0, 500));
      (window as any).__cobrosImportParsed = { fileName: file.name, cobros };
    } catch (e: any) {
      const msg = e?.message || "No se pudo leer el archivo.";
      setImportValidationRows([{ status: "ERROR", message: msg }]);
      setImportErrors([msg]);
      setImportActionReport({
        fileName: "reporte_validacion_cobros.xlsx",
        rows: [{ status: "ERROR", message: msg }],
      });
      setImportPreview([]);
      (window as any).__cobrosImportParsed = null;
    }
  }

  async function confirmCobroImport() {
    if (!companyId || !canEdit) return;
    const parsed = (window as any).__cobrosImportParsed;
    if (!parsed || !parsed.cobros?.length) return;
    if (importValidationRows.some((r) => r.status === "ERROR")) return;

    setImporting(true);
    try {
      const BATCH   = 100;
      const cobros: any[] = parsed.cobros;
      let okTotal    = 0;
      let errorTotal = 0;
      const allResults: any[] = [];

      for (let i = 0; i < cobros.length; i += BATCH) {
        const chunk = cobros.slice(i, i + BATCH);
        // Quitar campos de preview antes de enviar al RPC
        const payload = chunk.map(({
          source_row_no: _r, has_allocation: _a, has_external: _e, ...rest
        }) => rest);

        const { data, error } = await supabase.rpc("process_cobro_import_batch", {
          p_company_id: companyId,
          p_docs:       payload,
        });
        if (error) throw error;

        okTotal    += Number((data as any)?.ok_count    ?? 0);
        errorTotal += Number((data as any)?.error_count ?? 0);
        const results = Array.isArray((data as any)?.results) ? (data as any).results : [];
        allResults.push(...results);
      }

      const reportRows = allResults.map((r: any) => ({
        status:     r.status     ?? "OK",
        row_no:     r.row_no     ?? null,
        number:     r.number     ?? null,
        message:    r.message    ?? "",
        payment_id: r.payment_id ?? null,
      }));

      setImportActionReport({
        fileName: "reporte_importacion_cobros.xlsx",
        rows: reportRows.length > 0
          ? reportRows
          : [{ status: errorTotal > 0 ? "ERROR" : "OK",
               message: `OK: ${okTotal}. Errores: ${errorTotal}.` }],
      });

      closeImport();
      await Promise.all([loadDraftsList(true), loadRegisteredList(true)]);
      finishProgress();

      const msg = errorTotal > 0
        ? `Importación finalizada. OK: ${okTotal} / Errores: ${errorTotal}. Exporta el reporte para ver el detalle.`
        : `Importación exitosa: ${okTotal} cobro(s) creado(s) como borradores.`;
      showMsg(errorTotal > 0 ? "error" : "warn", msg);
    } catch (e: any) {
      showMsg("error", e?.message || "Error durante la importación masiva.");
    } finally {
      setImporting(false);
    }
  }

  // ─── Cambio de tab (limpia filtros y selección) ───────────────────────────

  function switchTab(tab: MainTab) {
    setActiveTab(tab);
    setFilters(EMPTY_COBROS_FILTERS);
    setSelectedDrafts({});
    setSelectedRegistered({});
  }

  // ─── Descargar reporte Excel del tab activo ────────────────────────────────

  function downloadReport() {
    const rows = activeTab === "drafts" ? filteredDrafts : filteredRegistered;
    const tabLabel = activeTab === "drafts" ? "borradores" : "registrados";
    const data = rows.map((r) => ({
      "Fecha":           r.payment_date ?? "",
      "Tipo":            r.cobro_type === "AJUSTE" ? "Ajuste" : "Cobro",
      "Número":          r.number ?? "",
      "Referencia":      r.reference ?? "",
      "Forma de pago":   r.method
                           ? { EFECTIVO: "Efectivo", TRANSFERENCIA: "Transferencia",
                               CHEQUE: "Cheque", TARJETA: "Tarjeta" }[r.method] ?? r.method
                           : "",
      "RUT / ID":        r.counterparty_identifier_snapshot ?? "",
      "Nombre cliente":  r.counterparty_name_snapshot ?? "",
      "Monto":           Number(r.total_amount ?? 0),
      "Moneda":          r.currency_code ?? "",
      "Estado":          r.status ?? "",
      "Fecha registro":  r.created_at ? String(r.created_at).slice(0, 10) : "",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Cobros");
    XLSX.writeFile(wb, `cobros_${tabLabel}_${todayISO()}.xlsx`);
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  const hasActiveFilters = !!(
    filters.issue_date_from || filters.issue_date_to ||
    filters.cobro_type || filters.payment_method ||
    filters.number || filters.counterparty_identifier || filters.counterparty_name ||
    (filters.amount_filter.op && filters.amount_filter.value1)
  );

  return (
    <div className="p-6">
      {/* Barra de progreso */}
      {progressVisible && (
        <div className="fixed top-0 left-0 right-0 z-[100] h-1 bg-slate-200">
          <div
            className={cls("h-full transition-all", progressDone ? "bg-emerald-500" : "bg-[#2f8cff]")}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      <div className={tradeDocsTheme.shell}>

        {/* ══ BANNER ══════════════════════════════════════════════════════════ */}
        <div className={cls(tradeDocsTheme.header, "px-7 py-7")}>
          <div className={tradeDocsTheme.glowA} />
          <div className={tradeDocsTheme.glowB} />

          <div className="relative flex flex-wrap items-end justify-between gap-4">
            {/* Título + badges */}
            <div className="min-w-0">
              <div className="text-[12px] font-extrabold uppercase text-white/80">Ventas</div>
              <h1 className="mt-1 text-3xl font-black leading-tight">Cobros</h1>
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/90">
                {activeTab === "drafts" ? (
                  <>
                    <span className="inline-flex items-center rounded-full bg-white/10 px-2 py-0.5 ring-1 ring-white/15">
                      Borradores: <b className="ml-1">{draftSummary.count}</b>
                    </span>
                    <span className="inline-flex items-center rounded-full bg-white/10 px-2 py-0.5 ring-1 ring-white/15">
                      Total borradores: <b className="ml-1">{formatNumber(draftSummary.total, moneyDecimals)}</b>
                    </span>
                  </>
                ) : (
                  <>
                    <span className="inline-flex items-center rounded-full bg-white/10 px-2 py-0.5 ring-1 ring-white/15">
                      Registrados: <b className="ml-1">{registeredSummary.count}</b>
                    </span>
                    <span className="inline-flex items-center rounded-full bg-white/10 px-2 py-0.5 ring-1 ring-white/15">
                      Total registrados: <b className="ml-1">{formatNumber(registeredSummary.total, moneyDecimals)}</b>
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Botones del banner */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => { void loadDraftsList(true); void loadRegisteredList(true); }}
                className={tradeDocsTheme.btnGlass}
              >
                Refrescar
              </button>
              <button
                type="button"
                onClick={openImport}
                disabled={!canEdit}
                className={cls(tradeDocsTheme.btnGlass, !canEdit && "opacity-60 cursor-not-allowed")}
              >
                ⬆️ Cargar Excel
              </button>
              <button
                type="button"
                onClick={downloadImportTemplate}
                className={tradeDocsTheme.btnGlass}
              >
                ⬇️ Descargar formato
              </button>
              <button
                type="button"
                onClick={() => openNewEditor("COBRO")}
                disabled={!canEdit}
                className={cls(tradeDocsTheme.btnGlass, !canEdit && "opacity-60 cursor-not-allowed")}
              >
                + Nuevo cobro
              </button>
            </div>
          </div>
        </div>

        {/* ══ MENSAJES ════════════════════════════════════════════════════════ */}
        {pageMsg && (
          <div className="border-t bg-white px-7 py-4">
            <div className={cls(
              "rounded-xl border px-3 py-3 text-sm flex items-center justify-between gap-3",
              pageMsg.level === "error"
                ? "border-rose-200 bg-rose-50 text-rose-900"
                : "border-amber-200 bg-amber-50 text-amber-900"
            )}>
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between flex-1 min-w-0">
                <span>{pageMsg.text}</span>
                {importActionReport?.rows?.length ? (
                  <button
                    type="button"
                    className="inline-flex shrink-0 items-center rounded-xl bg-white/80 border border-current/20 px-3 py-1.5 text-xs font-semibold shadow-sm hover:bg-white transition whitespace-nowrap"
                    onClick={exportImportReport}
                  >
                    Exportar reporte ↓
                  </button>
                ) : null}
              </div>
              <button type="button" onClick={() => setPageMsg(null)} className="shrink-0 text-slate-400 hover:text-slate-600">✕</button>
            </div>
          </div>
        )}

        {/* ══ CARD DE CONTENIDO ═══════════════════════════════════════════════ */}
        <div className="p-7">
          <div className={tradeDocsTheme.card}>

            {/* Barra de tabs + filtros */}
            <div className="border-b px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">

                {/* Tabs (pill style) */}
                <div>
                  <div className="flex items-center gap-2">
                    {([
                      { key: "drafts",     label: "Borradores" },
                      { key: "registered", label: "Registrados" },
                    ] as { key: MainTab; label: string }[]).map(({ key, label }) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => switchTab(key)}
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
                      ? "Cobros en borrador pendientes de registrar."
                      : "Cobros ya registrados o cancelados."}
                  </div>
                </div>

                {/* Filtros + descarga */}
                <div className="flex flex-wrap items-center gap-2">
                    <FilterActionButtons
                      hasActiveFilters={hasActiveFilters}
                      onOpenFilters={() => setFiltersOpen(true)}
                      onClearFilters={() => setFilters(EMPTY_COBROS_FILTERS)}
                      onReport={downloadReport}
                      reportTitle={`Descargar Excel — ${activeTab === "drafts" ? "Borradores" : "Registrados"} (con filtros aplicados)`}
                    />

                    {/* Acciones masivas — solo en tab borradores */}
                    {activeTab === "drafts" && (
                      <>
                        <button
                          type="button"
                          className={tradeDocsTheme.btnSoft}
                          onClick={toggleSelectAllDrafts}
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
                              onClick={() => void bulkRegisterDrafts()}
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
                              onClick={() => void bulkDeleteDrafts()}
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

            {/* Contenido del tab */}
            <div className="p-4">
              {activeTab === "drafts" && (
                <CobrosTable
                  rows={filteredDrafts}
                  loading={loadingDrafts}
                  moneyDecimals={moneyDecimals}
                  canEdit={canEdit}
                  tabKey="drafts"
                  selectedMap={selectedDrafts}
                  allSelected={allDraftsSelected}
                  onToggleSelectAll={toggleSelectAllDrafts}
                  onToggleRow={toggleSelectDraft}
                  onOpenRow={openExistingEditor}
                  onDeleteRow={handleDeleteRow}
                  onRegisterRow={handleRegisterRow}
                  onExpandRow={handleExpandRow}
                  allocationsMap={allocationsMap}
                  allocationsLoadingMap={allocationsLoadingMap}
                  onReachEnd={() => { setLoadingMoreDrafts(true); void loadDraftsList(false); }}
                  loadingMore={loadingMoreDrafts}
                  hasMore={draftHasMore}
                  onViewDoc={(id, type) => { setCrossViewId(id); setCrossViewType(type); setCrossViewOpen(true); }}
                />
              )}

              {activeTab === "registered" && (
                <CobrosTable
                  rows={filteredRegistered}
                  loading={loadingRegistered}
                  moneyDecimals={moneyDecimals}
                  canEdit={canEdit}
                  tabKey="registered"
                  selectedMap={selectedRegistered}
                  allSelected={allRegisteredSelected}
                  onToggleSelectAll={toggleSelectAllRegistered}
                  onToggleRow={toggleSelectRegistered}
                  onOpenRow={openExistingEditor}
                  onCancelRow={openCancelModal}
                  onExpandRow={handleExpandRow}
                  allocationsMap={allocationsMap}
                  allocationsLoadingMap={allocationsLoadingMap}
                  onReachEnd={() => { setLoadingMoreRegistered(true); void loadRegisteredList(false); }}
                  loadingMore={loadingMoreRegistered}
                  hasMore={registeredHasMore}
                  onViewDoc={(id, type) => { setCrossViewId(id); setCrossViewType(type); setCrossViewOpen(true); }}
                />
              )}

            </div>
          </div>
          <div className="mt-6 text-center text-[12px] text-slate-500">ConciliaciónPro • Ventas</div>
        </div>
      </div>

      {/* ══ MODALS ══════════════════════════════════════════════════════════ */}

      {/* Vista cruzada — FISCAL o NON_FISCAL desde fila expandida */}
      <RecordViewModal
        companyId={companyId}
        open={crossViewOpen}
        onClose={() => { setCrossViewOpen(false); setCrossViewId(null); setCrossViewType(null); }}
        recordId={crossViewId}
        recordType={crossViewType}
        zIndexClass="z-[110]"
      />

      <CobrosEditorModal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        onSaveDraft={handleSaveDraft}
        onRegister={handleRegister}
        onCancelDoc={
          cancelCobroRow || !editorCobroId || editorHeader.status !== "VIGENTE"
            ? undefined
            : () => {
                // Construimos el row desde el estado del editor (no depende de listas filtradas)
                const syntheticRow: CobrosRow = {
                  id: editorCobroId,
                  company_id: companyId ?? "",
                  cobro_type: editorHeader.cobro_type,
                  method: (editorHeader.payment_method || null) as CobrosRow["method"],
                  card_kind: (editorHeader.card_kind || null) as CobrosRow["card_kind"],
                  card_last4: editorHeader.card_last4 || null,
                  auth_code: editorHeader.auth_code || null,
                  status: editorHeader.status,
                  payment_date: editorHeader.issue_date || null,
                  number: null,
                  reference: editorHeader.reference || null,
                  description: editorHeader.description || null,
                  total_amount: toNum(editorHeader.amount),
                  currency_code: editorHeader.currency_code || null,
                  branch_id: editorHeader.branch_id || null,
                  counterparty_id: editorHeader.counterparty_id,
                  counterparty_identifier_snapshot: editorHeader.counterparty_identifier || null,
                  counterparty_name_snapshot: editorHeader.counterparty_name || null,
                  journal_entry_id: editorJeId,
                  bank_movement_id: editorHeader.bank_movement_id,
                  cancelled_at: null,
                  cancel_reason: null,
                  created_at: null,
                };
                setEditorOpen(false);
                openCancelModal(syntheticRow);
              }
        }
        saving={saving}
        canEdit={canEdit}
        isNew={!editorCobroId}
        readOnly={editorReadOnly}
        header={editorHeader}
        setHeader={setEditorHeader}
        allocations={editorAllocations}
        onAddAllocation={handleAddDocToAllocation}
        onRemoveAllocation={(id) => {
          setEditorAllocations((prev) => prev.filter((a) => a.id !== id));
          setJournalAutoMode(true);
        }}
        onUpdateAllocationAmount={(id, amount) => {
          setEditorAllocations((prev) =>
            prev.map((a) => (a.id === id ? { ...a, allocated_amount: amount } : a))
          );
          setJournalAutoMode(true);
        }}
        journalLines={editorJournalLines}
        setJournalLines={setEditorJournalLines}
        activeTab={editorTab}
        setActiveTab={setEditorTab}
        moneyDecimals={moneyDecimals}
        baseCurrency={baseCurrency}
        branches={branches}
        businessLines={businessLines}
        accByCode={accByCode}
        counterpartyMap={counterpartyMap}
        onCreateCounterparty={(identifier) => setCpModal({ open: true, identifier })}
        docSearchResults={docSearchResults}
        docSearching={docSearching}
        onSearchDocs={handleSearchDocs}
        onAddDocToAllocation={handleAddDocToAllocation}
        journalAutoMode={journalAutoMode}
        recalcJournalAuto={recalcJournalAuto}
        onSwitchToManual={() => setJournalAutoMode(false)}
        accountPolicyByCode={postingPolicyByAccountCode}
        modalMsg={modalMsg}
      />

      {cancelOpen && cancelCobroRow && (
        <CobrosCancelModal
          open={cancelOpen}
          onClose={() => setCancelOpen(false)}
          onConfirm={handleCancelConfirm}
          saving={canceling}
          cancelDate={cancelDate}
          setCancelDate={setCancelDate}
          cancelReason={cancelReason}
          setCancelReason={setCancelReason}
          journalLines={cancelJournalLines}
          setJournalLines={setCancelJournalLines}
          accByCode={accByCode}
          branches={branches}
          businessLines={businessLines}
          moneyDecimals={moneyDecimals}
          canEdit={canEdit}
          docInfo={{
            cobro_type: cancelCobroRow.cobro_type,
            payment_method: cancelCobroRow.method,
            issue_date: cancelCobroRow.payment_date,
            number: cancelCobroRow.number,
            counterparty_name: cancelCobroRow.counterparty_name_snapshot,
            counterparty_identifier: cancelCobroRow.counterparty_identifier_snapshot,
            currency_code: cancelCobroRow.currency_code ?? baseCurrency,
            total_amount: cancelCobroRow.total_amount,
            status: cancelCobroRow.status,
          } satisfies CancelCobroInfo}
        />
      )}

      <CobrosImportModal
        open={importOpen}
        canEdit={canEdit}
        importing={importing}
        importErrors={importErrors}
        importValidationRows={importValidationRows}
        importPreview={importPreview}
        onClose={closeImport}
        onConfirm={() => void confirmCobroImport()}
        onPickExcel={(f) => void onPickCobroExcel(f)}
        onExportValidationReport={importActionReport ? exportImportReport : undefined}
      />

      <CobrosFiltersModal
        open={filtersOpen}
        activeTab={activeTab}
        onClose={() => setFiltersOpen(false)}
        filters={filters}
        onChange={setFilters}
        onClear={() => setFilters(EMPTY_COBROS_FILTERS)}
        resultCount={activeTab === "drafts" ? filteredDrafts.length : filteredRegistered.length}
      />

      <CounterpartyCreateModal
        open={cpModal.open}
        initialIdentifier={cpModal.identifier}
        companyId={companyId}
        onClose={() => setCpModal({ open: false, identifier: "" })}
        onCreated={handleCounterpartyCreated}
      />
    </div>
  );
}

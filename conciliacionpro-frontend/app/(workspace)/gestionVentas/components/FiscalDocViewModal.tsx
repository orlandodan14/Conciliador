"use client";

/**
 * FiscalDocViewModal
 * ──────────────────
 * Wrapper self-loading que reutiliza el TradeDocEditorModal existente en modo
 * mode="view" / canEdit=false.
 *
 * Carga:  trade_docs → trade_doc_lines → payment_allocations + payments
 *         → journal_entry_lines → branches → business_lines → account_nodes
 *         → fiscal_doc_types → fiscal_doc_settings → origin doc (si NC/ND)
 * Renderiza: <TradeDocEditorModal mode="view" canEdit={false} ... />
 */

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { TradeDocEditorModal } from "@/app/(workspace)/gestionVentas/docs-tribut-ventas/components/tradeDocs/TradeDocEditorModal";
import {
  calcLineAmounts,
  ellipsis,
  folioLabel,
  formatNumber,
  makeDocLine,
  makeJournalLine,
  renumber,
  todayISO,
  toNum,
  uid,
} from "@/app/(workspace)/gestionVentas/docs-tribut-ventas/components/tradeDocs/helpers";
import {
  tradeDocsTheme,
  tradeDocsHeaderCell,
  tradeDocsHeaderSub,
  tradeDocsBodyCell,
  tradeDocsCellInputBase,
  tradeDocsCellInputRight,
} from "@/app/(workspace)/gestionVentas/docs-tribut-ventas/components/tradeDocs/ui";
import type {
  BranchLite,
  BusinessLineLite,
  DocHeader,
  DocLine,
  DocType,
  DocStatus,
  EditorTab,
  FiscalDocSettingsLite,
  FiscalDocTypeLite,
  JournalLine,
  PaymentRow,
} from "@/app/(workspace)/gestionVentas/docs-tribut-ventas/components/tradeDocs/types";

// ─── Defaults ─────────────────────────────────────────────────────────────────

const EMPTY_FISCAL_CFG: FiscalDocSettingsLite = {
  enabled: false,
  require_sales: false,
  default_sales_doc_type_id: null,
  default_sales_invoice_doc_type_id: null,
  default_sales_debit_note_doc_type_id: null,
  default_sales_credit_note_doc_type_id: null,
};

function defaultHeader(): DocHeader {
  return {
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
  };
}

// ─── Props ────────────────────────────────────────────────────────────────────

export type FiscalDocViewModalProps = {
  companyId: string | null | undefined;
  open: boolean;
  onClose: () => void;
  recordId: string | null | undefined;
};

// ─── Componente ───────────────────────────────────────────────────────────────

export function FiscalDocViewModal({
  companyId,
  open,
  onClose,
  recordId,
}: FiscalDocViewModalProps) {
  const [loading, setLoading]             = useState(false);
  const [header, setHeader]               = useState<DocHeader>(defaultHeader);
  const [lines, setLines]                 = useState<DocLine[]>(() => Array.from({ length: 4 }, (_, i) => makeDocLine(i + 1)));
  const [payments, setPayments]           = useState<PaymentRow[]>([]);
  const [journalLines, setJournalLines]   = useState<JournalLine[]>(() => Array.from({ length: 4 }, (_, i) => makeJournalLine(i + 1)));
  const [activeTab, setActiveTab]         = useState<EditorTab>("CABECERA");
  const [baseCurrency, setBaseCurrency]   = useState("CLP");

  const [branches, setBranches]           = useState<BranchLite[]>([]);
  const [businessLines, setBusinessLines] = useState<BusinessLineLite[]>([]);
  const [accByCode, setAccByCode]         = useState<Record<string, { id: string; code: string; name: string }>>({});
  const [fiscalDocTypes, setFiscalDocTypes] = useState<FiscalDocTypeLite[]>([]);
  const [fiscalCfg, setFiscalCfg]         = useState<FiscalDocSettingsLite>(EMPTY_FISCAL_CFG);

  useEffect(() => {
    if (!open || !recordId || !companyId) {
      setHeader(defaultHeader());
      setLines(Array.from({ length: 4 }, (_, i) => makeDocLine(i + 1)));
      setPayments([]);
      setJournalLines(Array.from({ length: 4 }, (_, i) => makeJournalLine(i + 1)));
      setActiveTab("CABECERA");
      return;
    }

    let cancelled = false;
    setLoading(true);

    async function load() {
      try {
        // 1. Cabecera del documento
        const { data: row, error: rowErr } = await supabase
          .from("trade_docs")
          .select(`
            id, doc_type, status, issue_date, due_date, series, number,
            currency_code, branch_id, counterparty_identifier_snapshot,
            counterparty_name_snapshot, reference, cancelled_at, cancel_reason,
            origin_doc_id, fiscal_doc_code, journal_entry_id
          `)
          .eq("company_id", companyId!)
          .eq("id", recordId!)
          .maybeSingle();
        if (rowErr) throw rowErr;
        if (!row || cancelled) return;

        const r = row as any;
        const currency = String(r.currency_code || "CLP");

        // 2. Cargar catálogos en paralelo
        const [lineRes, branchRes, buRes, accRes, ftRes, fsRes] = await Promise.all([
          supabase
            .from("trade_doc_lines")
            .select("line_no,item_id,sku,description,qty,unit_price,tax_kind,exempt_amount,taxable_amount,tax_rate,tax_amount,line_total")
            .eq("company_id", companyId!)
            .eq("trade_doc_id", recordId!)
            .order("line_no", { ascending: true }),
          supabase
            .from("branches")
            .select("id,code,name,is_active,is_default")
            .eq("company_id", companyId!),
          supabase
            .from("business_lines")
            .select("id,code,name,is_active")
            .eq("company_id", companyId!),
          supabase
            .from("account_nodes")
            .select("id,code,name")
            .eq("company_id", companyId!),
          supabase
            .from("fiscal_doc_types")
            .select("id,code,name,scope,is_active")
            .eq("company_id", companyId!)
            .eq("is_active", true),
          supabase
            .from("fiscal_doc_settings")
            .select("enabled,require_sales,default_sales_doc_type_id,default_sales_invoice_doc_type_id,default_sales_debit_note_doc_type_id,default_sales_credit_note_doc_type_id")
            .eq("company_id", companyId!)
            .maybeSingle(),
        ]);

        if (cancelled) return;

        // 3. Pagos (via payment_allocations → payments)
        const { data: payAllocRows } = await supabase
          .from("payment_allocations")
          .select(`
            allocated_amount,
            payments (
              id, payment_date, method, reference,
              card_kind, card_last4, auth_code, total_amount, extra
            )
          `)
          .eq("company_id", companyId!)
          .eq("trade_doc_id", recordId!);

        if (cancelled) return;

        // 4. Asiento contable
        let journalRows: JournalLine[] = [];
        const journalEntryId = r.journal_entry_id ?? null;
        if (journalEntryId) {
          const { data: jlData } = await supabase
            .from("journal_entry_lines")
            .select(`
              line_no, line_description, debit, credit, account_code_snapshot,
              business_line_id, branch_id,
              business_lines ( id, code, name ),
              branches ( id, code, name )
            `)
            .eq("company_id", companyId!)
            .eq("journal_entry_id", journalEntryId)
            .order("line_no", { ascending: true });

          journalRows = ((jlData as any[]) || []).map((jr: any) => {
            const bu = Array.isArray(jr.business_lines) ? jr.business_lines[0] : jr.business_lines;
            const br = Array.isArray(jr.branches) ? jr.branches[0] : jr.branches;
            return {
              line_no: Number(jr.line_no) || 1,
              account_code: String(jr.account_code_snapshot || ""),
              description: String(jr.line_description || ""),
              debit: jr.debit != null ? String(jr.debit) : "",
              credit: jr.credit != null ? String(jr.credit) : "",
              cost_center_id: null,
              business_line_id: jr.business_line_id || null,
              branch_id: jr.branch_id || null,
              cost_center_code: "",
              business_line_code: String(bu?.code || ""),
              branch_code: String(br?.code || ""),
            };
          });
        }

        if (cancelled) return;

        // 5. Doc origen (para NC/ND)
        let originRow: any = null;
        let originLabel = "";
        const originId = r.origin_doc_id ?? null;
        if (originId) {
          const { data: od } = await supabase
            .from("trade_docs")
            .select("id,doc_type,fiscal_doc_code,series,number,issue_date,net_taxable,net_exempt,tax_total,grand_total,currency_code,status,balance")
            .eq("company_id", companyId!)
            .eq("id", originId)
            .maybeSingle();
          originRow = od;
          originLabel = folioLabel((od as any)?.series, (od as any)?.number);
        }

        if (cancelled) return;

        // ── Mapear líneas ────────────────────────────────────────────────────
        const defaultTaxRate = "19";
        const parsedLines: DocLine[] = ((lineRes.data as any[]) || []).map((lr: any) => {
          const taxKind = String(lr.tax_kind || "").toUpperCase();
          const isTaxable = taxKind === "EXENTO" ? false : true;
          return {
            line_no: Number(lr.line_no) || 1,
            item_id: lr.item_id || null,
            sku: lr.sku || "",
            description: lr.description || "",
            qty: lr.qty != null ? String(lr.qty) : "1",
            unit_price: lr.unit_price != null ? String(lr.unit_price) : "",
            is_taxable: isTaxable,
            tax_rate: lr.tax_rate != null ? String(lr.tax_rate) : defaultTaxRate,
            ex_override: Number(lr.exempt_amount || 0) > 0 ? String(lr.exempt_amount) : "",
            af_override: Number(lr.taxable_amount || 0) > 0 ? String(lr.taxable_amount) : "",
            iva_override: Number(lr.tax_amount || 0) > 0 ? String(lr.tax_amount) : "",
            total_override: Number(lr.line_total || 0) > 0 ? String(lr.line_total) : "",
          };
        });

        // ── Mapear pagos ─────────────────────────────────────────────────────
        let parsedPayments: PaymentRow[] = ((payAllocRows as any[]) || []).map((pa: any) => {
          const p = Array.isArray(pa.payments) ? pa.payments[0] : pa.payments;
          return {
            id: String(p?.id || uid()),
            payment_date: String(p?.payment_date || r.issue_date || todayISO()),
            method: (p?.method || "TRANSFERENCIA") as PaymentRow["method"],
            amount: pa.allocated_amount != null ? String(pa.allocated_amount) : String(p?.total_amount ?? ""),
            card_kind: (p?.card_kind || "") as PaymentRow["card_kind"],
            card_last4: String(p?.card_last4 || ""),
            auth_code: String(p?.auth_code || ""),
            reference: String(p?.reference || ""),
          };
        });

        // ── Construir catálogos ──────────────────────────────────────────────
        const nextBranches: BranchLite[] = ((branchRes.data as any[]) ?? []).map((b: any) => ({
          id: String(b.id), code: String(b.code || ""), name: String(b.name || ""),
          is_active: Boolean(b.is_active), is_default: Boolean(b.is_default),
        }));

        const nextBusinessLines: BusinessLineLite[] = ((buRes.data as any[]) ?? []).map((b: any) => ({
          id: String(b.id), code: String(b.code || ""), name: String(b.name || ""),
          is_active: Boolean(b.is_active),
        }));

        const nextAccByCode: Record<string, { id: string; code: string; name: string }> = {};
        ((accRes.data as any[]) ?? []).forEach((a: any) => {
          nextAccByCode[String(a.code)] = { id: a.id, code: a.code, name: a.name };
        });

        const nextFiscalDocTypes: FiscalDocTypeLite[] = ((ftRes.data as any[]) ?? []).map((x: any) => ({
          id: String(x.id), code: String(x.code || ""), name: String(x.name || ""),
          scope: x.scope, is_active: Boolean(x.is_active),
        }));

        const fs = (fsRes.data as any) ?? {};
        const nextFiscalCfg: FiscalDocSettingsLite = {
          enabled: Boolean(fs.enabled ?? false),
          require_sales: Boolean(fs.require_sales ?? false),
          default_sales_doc_type_id: fs.default_sales_doc_type_id ?? null,
          default_sales_invoice_doc_type_id: fs.default_sales_invoice_doc_type_id ?? null,
          default_sales_debit_note_doc_type_id: fs.default_sales_debit_note_doc_type_id ?? null,
          default_sales_credit_note_doc_type_id: fs.default_sales_credit_note_doc_type_id ?? null,
        };

        // ── Construir header ─────────────────────────────────────────────────
        const nextHeader: DocHeader = {
          doc_type: r.doc_type as DocType,
          fiscal_doc_code: String(r.fiscal_doc_code ?? ""),
          status: r.status as DocStatus,
          issue_date: r.issue_date || todayISO(),
          due_date: r.due_date || r.issue_date || todayISO(),
          series: r.series || "",
          number: r.number || "",
          currency_code: currency,
          branch_id: r.branch_id || "",
          counterparty_identifier: r.counterparty_identifier_snapshot || "",
          counterparty_name: r.counterparty_name_snapshot || "",
          reference: r.reference || "",
          cancelled_at: r.cancelled_at || "",
          cancel_reason: r.cancel_reason || "",
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
          origin_balance: originRow?.balance ?? null,
          origin_payment_status: null,
          origin_status: originRow?.status ?? null,
        };

        // ── Rellenar hasta mínimo 4 líneas ───────────────────────────────────
        const paddedLines = parsedLines.length >= 4
          ? renumber(parsedLines)
          : renumber([
              ...parsedLines,
              ...Array.from({ length: Math.max(4 - parsedLines.length, 0) }, (_, i) =>
                makeDocLine(parsedLines.length + i + 1)
              ),
            ]);

        const docType = r.doc_type as DocType;
        const disallowPay = docType === "CREDIT_NOTE" || docType === "DEBIT_NOTE";

        const paddedJournal = journalRows.length >= 4
          ? renumber(journalRows)
          : renumber([
              ...journalRows,
              ...Array.from({ length: Math.max(4 - journalRows.length, 0) }, (_, i) =>
                makeJournalLine(journalRows.length + i + 1)
              ),
            ]);

        setHeader(nextHeader);
        setBranches(nextBranches);
        setBusinessLines(nextBusinessLines);
        setAccByCode(nextAccByCode);
        setFiscalDocTypes(nextFiscalDocTypes);
        setFiscalCfg(nextFiscalCfg);
        setLines(paddedLines);
        setPayments(disallowPay ? [] : parsedPayments);
        setJournalLines(paddedJournal);
        setBaseCurrency(currency);
        setActiveTab("CABECERA");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [open, recordId, companyId]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const accounts = useMemo(() => Object.values(accByCode), [accByCode]);

  const headerBranchCode = useMemo(() => {
    if (!header.branch_id) return "";
    return branches.find((b) => b.id === header.branch_id)?.code || "";
  }, [header.branch_id, branches]);

  const totals = useMemo(() => {
    const paid = payments.reduce((s, p) => s + toNum(p.amount), 0);
    return {
      net_taxable: lines.reduce((s, l) => s + calcLineAmounts(l).af,    0),
      net_exempt:  lines.reduce((s, l) => s + calcLineAmounts(l).ex,    0),
      tax_total:   lines.reduce((s, l) => s + calcLineAmounts(l).iva,   0),
      grand_total: lines.reduce((s, l) => s + calcLineAmounts(l).total, 0),
      paid,
      balance: lines.reduce((s, l) => s + calcLineAmounts(l).total, 0) - paid,
    };
  }, [lines, payments]);

  const badgeTypeClass =
    header.doc_type === "INVOICE"
      ? "bg-sky-100 text-sky-800"
      : header.doc_type === "DEBIT_NOTE"
      ? "bg-fuchsia-100 text-fuchsia-800"
      : "bg-amber-100 text-amber-900";

  const badgeStatusClass =
    header.status === "VIGENTE"
      ? "bg-emerald-100 text-emerald-800"
      : header.status === "CANCELADO"
      ? "bg-rose-100 text-rose-800"
      : "bg-slate-100 text-slate-800";

  // ── Loading overlay ────────────────────────────────────────────────────────
  if (!open) return null;

  if (loading) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45">
        <div className="rounded-2xl bg-white px-8 py-6 text-[13px] text-slate-500 animate-pulse shadow-xl">
          Cargando…
        </div>
      </div>
    );
  }

  const docNeedsOrigin = header.doc_type === "CREDIT_NOTE" || header.doc_type === "DEBIT_NOTE";
  const disallowPayments = docNeedsOrigin;

  // ── Delegamos al modal real con mode="view" ────────────────────────────────
  return (
    <TradeDocEditorModal
      open={open}
      onClose={onClose}
      mode="view"
      zIndexClass="z-[100]"
      theme={{
        header:     tradeDocsTheme.header,
        glowA:      tradeDocsTheme.glowA,
        glowB:      tradeDocsTheme.glowB,
        btnPrimary: tradeDocsTheme.btnPrimary,
        btnSoft:    tradeDocsTheme.btnSoft,
        card:       tradeDocsTheme.card,
      }}
      title={recordId ? `Ver documento (${recordId.slice(0, 8)}…)` : "Ver documento"}
      subtitle="Ventas • Consulta"
      widthClass="w-[min(1200px,96vw)]"

      canEdit={false}
      showCancelButton={false}

      docId={recordId ?? null}
      header={header}
      setHeader={setHeader}
      headerBranchCode={headerBranchCode}
      setHeaderBranchCode={() => {}}

      editorTab={activeTab}
      setEditorTab={setActiveTab}

      fiscalCfg={fiscalCfg}
      fiscalDocTypes={fiscalDocTypes}
      baseCurrency={baseCurrency}
      branches={branches}
      items={[]}
      businessLines={businessLines}

      counterpartiesAvailable={false}
      counterpartyMap={{}}
      openCreateCounterparty={() => {}}
      resolveCounterpartyHeader={() => {}}

      needsOrigin={docNeedsOrigin}
      disallowPayments={disallowPayments}
      onOpenOriginSearch={() => {}}
      clearOrigin={() => {}}

      lines={lines}
      setLines={setLines}
      addDocLine={() => {}}
      removeDocLine={() => {}}
      updateDocLine={() => {}}

      payments={payments}
      addPaymentRow={() => {}}
      removePaymentRow={() => {}}
      updatePaymentRow={() => {}}

      journalLines={journalLines}
      addJournalLine={() => {}}
      removeJournalLine={() => {}}
      updateJournalLine={() => {}}
      journalAutoMode={false}
      recalcJournalAuto={() => {}}

      accounts={accounts}
      accByCode={accByCode}
      accountPolicyByCode={{}}

      headerCell={tradeDocsHeaderCell}
      headerSub={tradeDocsHeaderSub}
      bodyCell={tradeDocsBodyCell}
      cellInputBase={tradeDocsCellInputBase}
      cellInputRight={tradeDocsCellInputRight}

      moneyDecimals={0}
      totals={totals}

      badgeTypeClass={badgeTypeClass}
      badgeStatusClass={badgeStatusClass}

      formatNumber={formatNumber}
      calcLineAmounts={(l) => calcLineAmounts(l)}
      ellipsis={ellipsis}
      folioLabel={folioLabel}

      messages={[]}
      saveDraftMVP={async () => {}}
      markAsVigenteMVP={async () => {}}
      deleteDraftMVP={async () => {}}
      cancelDocMVP={async () => {}}
    />
  );
}

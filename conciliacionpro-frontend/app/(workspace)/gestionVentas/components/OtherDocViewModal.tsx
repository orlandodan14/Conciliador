"use client";

/**
 * OtherDocViewModal
 * ─────────────────
 * Wrapper self-loading que reutiliza el OtherDocEditorModal existente en modo
 * readOnly=true / canEdit=false.
 *
 * Carga:  loadOtherDocById → account_nodes → loadJournalLinesForDoc
 *         → loadPaymentsForDoc → (si DEVOLUCION) loadOtherDocById para origin doc
 * Renderiza: <OtherDocEditorModal readOnly canEdit={false} ... />
 */

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import OtherDocEditorModal from "@/app/(workspace)/gestionVentas/otros-docs-ingresos/components/otherDocs/OtherDocEditorModal";
import {
  loadOtherDocById,
  loadJournalLinesForDoc,
  loadPaymentsForDoc,
} from "@/app/(workspace)/gestionVentas/otros-docs-ingresos/components/otherDocs/data";
import type {
  OtherDocHeader,
  OtherDocType,
  OtherDocStatus,
  JournalLine,
  EditorTab,
  BranchLite,
  BusinessLineLite,
  PaymentRow,
} from "@/app/(workspace)/gestionVentas/otros-docs-ingresos/components/otherDocs/types";
import type {
  OriginDocLite,
} from "@/app/(workspace)/gestionVentas/docs-tribut-ventas/components/tradeDocs/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayISO() {
  return new Date().toISOString().split("T")[0];
}

function defaultHeader(): OtherDocHeader {
  return {
    doc_type: "OTRO_INGRESO",
    status: "BORRADOR",
    non_fiscal_doc_code: "",
    issue_date: todayISO(),
    due_date: todayISO(),
    series: "",
    number: "",
    reference: "",
    currency_code: "CLP",
    branch_id: "",
    counterparty_id: null,
    counterparty_identifier: "",
    counterparty_name: "",
    grand_total: "0",
    origin_doc_id: null,
    origin_label: "",
    cancelled_at: "",
    cancel_reason: "",
  };
}

// ─── Props ────────────────────────────────────────────────────────────────────

export type OtherDocViewModalProps = {
  companyId: string | null | undefined;
  open: boolean;
  onClose: () => void;
  recordId: string | null | undefined;
};

// ─── Componente ───────────────────────────────────────────────────────────────

export function OtherDocViewModal({
  companyId,
  open,
  onClose,
  recordId,
}: OtherDocViewModalProps) {
  const [loading, setLoading]               = useState(false);
  const [header, setHeader]                 = useState<OtherDocHeader>(defaultHeader);
  const [journalLines, setJournalLines]     = useState<JournalLine[]>([]);
  const [payments, setPayments]             = useState<PaymentRow[]>([]);
  const [activeTab, setActiveTab]           = useState<EditorTab>("CABECERA");
  const [baseCurrency, setBaseCurrency]     = useState("CLP");
  const [branches, setBranches]             = useState<BranchLite[]>([]);
  const [businessLines, setBusinessLines]   = useState<BusinessLineLite[]>([]);
  const [accByCode, setAccByCode]           = useState<Record<string, { id: string; code: string; name: string }>>({});
  const [initialOriginDoc, setInitialOriginDoc] = useState<OriginDocLite | null>(null);

  useEffect(() => {
    if (!open || !recordId || !companyId) {
      setHeader(defaultHeader());
      setJournalLines([]);
      setPayments([]);
      setInitialOriginDoc(null);
      setActiveTab("CABECERA");
      return;
    }

    let cancelled = false;
    setLoading(true);

    async function load() {
      try {
        // 1. Cabecera del documento
        const doc = await loadOtherDocById(companyId!, recordId!);
        if (!doc || cancelled) return;

        const h: OtherDocHeader = {
          doc_type:               (doc.doc_type || "OTRO_INGRESO") as OtherDocType,
          status:                 (doc.status || "BORRADOR") as OtherDocStatus,
          non_fiscal_doc_code:    String(doc.non_fiscal_doc_code || ""),
          issue_date:             String(doc.issue_date || todayISO()),
          due_date:               String(doc.due_date || doc.issue_date || todayISO()),
          series:                 String(doc.series || ""),
          number:                 String(doc.number || ""),
          reference:              String(doc.reference || ""),
          currency_code:          String(doc.currency_code || "CLP"),
          branch_id:              String(doc.branch_id || ""),
          counterparty_id:        doc.counterparty_id || null,
          counterparty_identifier: String(doc.counterparty_identifier_snapshot || ""),
          counterparty_name:      String(doc.counterparty_name_snapshot || ""),
          grand_total:            String(doc.grand_total ?? "0"),
          origin_doc_id:          doc.origin_doc_id || null,
          origin_label:           String(doc.origin_label || ""),
          cancelled_at:           String(doc.cancelled_at || ""),
          cancel_reason:          String(doc.cancel_reason || ""),
        };

        // 2. Cuentas contables (para resolver account_node_id → code en el asiento)
        const [accData, branchData, buData] = await Promise.all([
          supabase.from("account_nodes").select("id,code,name").eq("company_id", companyId!),
          supabase.from("branches").select("id,code,name,is_active,is_default").eq("company_id", companyId!),
          supabase.from("business_lines").select("id,code,name,is_active").eq("company_id", companyId!),
        ]);

        const nextAccByCode: Record<string, { id: string; code: string; name: string }> = {};
        ((accData.data as any[]) ?? []).forEach((a: any) => {
          nextAccByCode[String(a.code)] = { id: a.id, code: a.code, name: a.name };
        });

        const nextBranches: BranchLite[] = ((branchData.data as any[]) ?? []).map((b: any) => ({
          id: String(b.id),
          code: String(b.code || ""),
          name: String(b.name || ""),
          is_active: Boolean(b.is_active),
          is_default: Boolean(b.is_default),
        }));

        const nextBusinessLines: BusinessLineLite[] = ((buData.data as any[]) ?? []).map((b: any) => ({
          id: String(b.id),
          code: String(b.code || ""),
          name: String(b.name || ""),
          is_active: Boolean(b.is_active),
        }));

        // 3. Líneas de asiento
        let jeLines: JournalLine[] = [];
        if (doc.journal_entry_id) {
          try {
            jeLines = await loadJournalLinesForDoc(companyId!, doc.journal_entry_id, nextAccByCode);
          } catch { /* no-op */ }
        }

        // 4. Formas de pago
        let nextPayments: PaymentRow[] = [];
        try {
          nextPayments = await loadPaymentsForDoc(companyId!, recordId!);
        } catch { /* no-op */ }

        // 5. Doc origen (solo para DEVOLUCION)
        let originDoc: OriginDocLite | null = null;
        if (doc.doc_type === "DEVOLUCION" && doc.origin_doc_id) {
          try {
            const raw = await loadOtherDocById(companyId!, doc.origin_doc_id);
            if (raw) {
              originDoc = {
                id:                      String(raw.id),
                doc_type:                raw.doc_type ?? null,
                fiscal_doc_code:         raw.fiscal_doc_code ?? null,
                series:                  raw.series ?? null,
                number:                  raw.number ?? null,
                issue_date:              raw.issue_date ?? null,
                counterparty_identifier: raw.counterparty_identifier_snapshot ?? null,
                net_taxable:             raw.net_taxable ?? null,
                net_exempt:              raw.net_exempt ?? null,
                tax_total:               raw.tax_total ?? null,
                grand_total:             raw.grand_total ?? null,
                balance:                 raw.balance ?? null,
                currency_code:           raw.currency_code ?? null,
                payment_status:          null,
                status:                  raw.status ?? null,
              };
            }
          } catch { /* no-op */ }
        }

        if (cancelled) return;

        setHeader(h);
        setAccByCode(nextAccByCode);
        setBranches(nextBranches);
        setBusinessLines(nextBusinessLines);
        setJournalLines(jeLines);
        setPayments(nextPayments);
        setInitialOriginDoc(originDoc);
        setBaseCurrency(String(doc.currency_code || "CLP"));
        setActiveTab("CABECERA");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [open, recordId, companyId]);

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

  // ── Delegamos al modal real con readOnly=true ──────────────────────────────
  return (
    <OtherDocEditorModal
      open={open}
      onClose={onClose}
      onSaveDraft={async () => {}}
      onRegister={async () => {}}
      saving={false}
      canEdit={false}
      isNew={false}
      readOnly={true}

      header={header}
      setHeader={() => {}}

      journalLines={journalLines}
      setJournalLines={() => {}}

      payments={payments}
      onAddPayment={() => {}}
      onRemovePayment={() => {}}
      onUpdatePayment={() => {}}

      activeTab={activeTab}
      setActiveTab={setActiveTab}

      moneyDecimals={0}
      baseCurrency={baseCurrency}
      branches={branches}
      businessLines={businessLines}
      accByCode={accByCode}
      counterpartyMap={{}}

      originSearchResults={[]}
      originSearchLoading={false}
      originSearchLoadingMore={false}
      originSearchHasMore={false}
      onSearchOrigin={() => {}}
      onLoadMoreOrigin={async () => {}}
      onPickOrigin={() => {}}
      onClearOrigin={() => {}}
      initialPickedOriginDoc={initialOriginDoc}

      journalAutoMode={false}
      recalcJournalAuto={() => {}}
      onSwitchToManual={() => {}}
      accountPolicyByCode={{}}
    />
  );
}

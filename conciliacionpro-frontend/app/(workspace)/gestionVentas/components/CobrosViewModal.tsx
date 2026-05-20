"use client";

/**
 * CobrosViewModal
 * ───────────────
 * Wrapper self-loading que reutiliza el CobrosEditorModal existente en modo
 * readOnly=true / canEdit=false.
 *
 * Carga:  loadCobroById → loadAllocationsForCobro → account_nodes → loadJournalLinesForCobro
 * Renderiza: <CobrosEditorModal readOnly canEdit={false} ... />
 */

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import CobrosEditorModal from "@/app/(workspace)/gestionVentas/cobros/components/cobros/CobrosEditorModal";
import {
  loadCobroById,
  loadAllocationsForCobro,
  loadJournalLinesForCobro,
} from "@/app/(workspace)/gestionVentas/cobros/components/cobros/data";
import type {
  CobrosHeader,
  CobrosAllocationDraft,
  JournalLine,
  EditorTab,
} from "@/app/(workspace)/gestionVentas/cobros/components/cobros/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2);
}

function todayISO() {
  return new Date().toISOString().split("T")[0];
}

function defaultHeader(): CobrosHeader {
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
    amount: "0",
    currency_code: "CLP",
    branch_id: "",
    counterparty_id: null,
    counterparty_identifier: "",
    counterparty_name: "",
    bank_movement_id: null,
  };
}

// ─── Props ────────────────────────────────────────────────────────────────────

export type CobrosViewModalProps = {
  companyId: string | null | undefined;
  open: boolean;
  onClose: () => void;
  recordId: string | null | undefined;
};

// ─── Componente ───────────────────────────────────────────────────────────────

export function CobrosViewModal({
  companyId,
  open,
  onClose,
  recordId,
}: CobrosViewModalProps) {
  const [loading, setLoading]           = useState(false);
  const [header, setHeader]             = useState<CobrosHeader>(defaultHeader);
  const [allocations, setAllocations]   = useState<CobrosAllocationDraft[]>([]);
  const [journalLines, setJournalLines] = useState<JournalLine[]>([]);
  const [activeTab, setActiveTab]       = useState<EditorTab>("CABECERA");
  const [baseCurrency, setBaseCurrency] = useState("CLP");

  useEffect(() => {
    if (!open || !recordId || !companyId) {
      setHeader(defaultHeader());
      setAllocations([]);
      setJournalLines([]);
      setActiveTab("CABECERA");
      return;
    }

    let cancelled = false;
    setLoading(true);

    async function load() {
      try {
        // 1. Cabecera del cobro
        const raw = await loadCobroById(companyId!, recordId!);
        if (!raw || cancelled) return;

        const ex             = (raw.extra as Record<string, any>) || {};
        const paymentType    = raw.payment_type ?? ex.cobro_type ?? "COBRO";
        const isAjuste       = paymentType === "AJUSTE_COBRO" || paymentType === "AJUSTE";
        const rawStatus      = raw.status ?? ex.status ?? "BORRADOR";
        const currency       = raw.currency_code ?? ex.currency_code ?? "CLP";

        const h: CobrosHeader = {
          cobro_type:             isAjuste ? "AJUSTE" : "COBRO",
          payment_method:         isAjuste ? "EFECTIVO" : (raw.method ?? "EFECTIVO"),
          card_kind:              raw.card_kind   ?? "",
          card_last4:             raw.card_last4  ?? "",
          auth_code:              raw.auth_code   ?? "",
          status:                 rawStatus as any,
          issue_date:             raw.payment_date ?? todayISO(),
          reference:              raw.reference   ?? "",
          description:            raw.notes       ?? "",
          amount:                 String(raw.total_amount ?? 0),
          currency_code:          currency,
          branch_id:              ex.branch_id    ?? "",
          counterparty_id:        raw.counterparty_id ?? ex.counterparty_id ?? null,
          counterparty_identifier:
            (raw.counterparties as any)?.identifier ??
            ex.counterparty_identifier_snapshot ?? "",
          counterparty_name:
            (raw.counterparties as any)?.name ??
            ex.counterparty_name_snapshot ?? "",
          bank_movement_id:       raw.bank_movement_id ?? ex.bank_movement_id ?? null,
        };

        // 2. Allocations
        const allocs = await loadAllocationsForCobro(companyId!, recordId!);
        const draftAllocs: CobrosAllocationDraft[] = allocs.map((a) => ({
          id:                uid(),
          trade_doc_id:      a.trade_doc_id,
          doc_type:          a.doc_type          ?? null,
          doc_class:         a.doc_class         ?? null,
          fiscal_doc_code:   a.fiscal_doc_code   ?? null,
          non_fiscal_doc_code: a.non_fiscal_doc_code ?? null,
          series:            a.series            ?? null,
          number:            a.number            ?? null,
          issue_date:        a.issue_date        ?? null,
          counterparty_name: a.counterparty_name_snapshot ?? null,
          grand_total:       a.grand_total       ?? null,
          balance:           a.balance           ?? null,
          currency_code:     a.currency_code     ?? null,
          allocated_amount:  String(a.allocated_amount ?? 0),
        }));

        // 3. Cuentas contables (para resolver account_node_id → code en el asiento)
        const { data: accData } = await supabase
          .from("account_nodes")
          .select("id,code,name")
          .eq("company_id", companyId!);

        const accByCode: Record<string, { id: string; code: string; name: string }> = {};
        ((accData as any[]) ?? []).forEach((a: any) => {
          accByCode[String(a.code).toUpperCase()] = { id: a.id, code: a.code, name: a.name };
        });

        // 4. Líneas de asiento
        let jeLines: JournalLine[] = [];
        const jeId =
          raw.journal_entry_id ?? ex.journal_entry_id ?? null;
        if (jeId) {
          try {
            jeLines = await loadJournalLinesForCobro(companyId!, jeId, accByCode);
          } catch { /* no-op */ }
        }

        if (cancelled) return;

        setHeader(h);
        setAllocations(draftAllocs);
        setJournalLines(jeLines);
        setBaseCurrency(currency);
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
    <CobrosEditorModal
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
      allocations={allocations}
      onAddAllocation={() => {}}
      onRemoveAllocation={() => {}}
      onUpdateAllocationAmount={() => {}}
      journalLines={journalLines}
      setJournalLines={() => {}}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      moneyDecimals={0}
      baseCurrency={baseCurrency}
      branches={[]}
      businessLines={[]}
      accByCode={{}}
      counterpartyMap={{}}
      docSearchResults={[]}
      docSearching={false}
      onSearchDocs={() => {}}
      onAddDocToAllocation={() => {}}
      journalAutoMode={false}
      recalcJournalAuto={() => {}}
      onSwitchToManual={() => {}}
      accountPolicyByCode={{}}
    />
  );
}

import { supabase } from "@/lib/supabaseClient";
import type { DocHeader, DocType } from "@/app/(workspace)/gestionVentas/docs-tribut-ventas/components/tradeDocs/types";
import {
  normalizeFolioPart,
  hasFiscalFolioData,
  folioLabel,
  normalizePeriodStatus,
} from "@/app/(workspace)/gestionVentas/docs-tribut-ventas/components/tradeDocs/helpers";

export async function findDuplicateFiscalFolio(args: {
  companyId: string;
  fiscalDocCode: string;
  series: string;
  number: string;
  excludeDocId?: string | null;
}) {
  const fiscalDocCode = normalizeFolioPart(args.fiscalDocCode);
  const series = normalizeFolioPart(args.series);
  const number = normalizeFolioPart(args.number);

  if (!fiscalDocCode || !number) return null;

  let query = supabase
    .from("trade_docs")
    .select("id,status,doc_type,fiscal_doc_code,series,number")
    .eq("company_id", args.companyId)
    .eq("fiscal_doc_code", fiscalDocCode)
    .eq("number", number)
    .neq("status", "CANCELADO")
    .limit(1);

  if (series) {
    query = query.eq("series", series);
  } else {
    query = query.is("series", null);
  }

  if (args.excludeDocId) {
    query = query.neq("id", args.excludeDocId);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function assertUniqueFiscalFolio(args: {
  companyId: string;
  header: DocHeader;
  excludeDocId?: string | null;
}) {
  if (!hasFiscalFolioData(args.header)) return;

  const duplicate = await findDuplicateFiscalFolio({
    companyId: args.companyId,
    fiscalDocCode: args.header.fiscal_doc_code,
    series: args.header.series,
    number: args.header.number,
    excludeDocId: args.excludeDocId ?? null,
  });

  if (duplicate) {
    const dupFolio = folioLabel(
      (duplicate as any).series ?? null,
      (duplicate as any).number ?? null
    );

    throw new Error(
      `No se puede guardar ni registrar este documento porque el folio fiscal ${String((duplicate as any).fiscal_doc_code || "").trim()} ${dupFolio} ya fue usado en otro documento.`
    );
  }
}

export function isUnknownColumnError(err: any) {
  const msg = String(err?.message ?? "");
  return /column .* does not exist/i.test(msg) || /does not exist in the rowset/i.test(msg);
}

export async function safeUpsertSalesDoc(args: {
  companyId: string;
  docId: string | null;
  payloadFull: any;
  payloadFallback: any;
}) {
  const { companyId, docId, payloadFull, payloadFallback } = args;

  if (!docId) {
    const tryInsert = async (payload: any) => {
      const { data, error } = await supabase
        .from("trade_docs")
        .insert(payload)
        .select("id,status")
        .single();
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

export async function safeDeleteByCompanyAndEntry(
  table: string,
  companyId: string,
  journalEntryId: string
) {
  const { error } = await supabase
    .from(table as any)
    .delete()
    .eq("company_id", companyId)
    .eq("journal_entry_id", journalEntryId);

  if (error) throw error;
}

export async function getCurrentAccountingPeriodId(
  companyId: string,
  issueDate: string
): Promise<string | null> {
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
  if (!data) return null;

  const status = normalizePeriodStatus((data as any).status);

  const isOpen = status === "ABIERTO" || status === "OPEN";
  const isBlocked = status === "BLOQUEADO" || status === "BLOCKED";

  if (isBlocked) return null;
  if (!isOpen) return null;

  return (data as any).id ?? null;
}

export async function getAuthUserId(): Promise<string | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data?.user?.id ?? null;
}

export async function getMyRoleForCompany(
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
  if (data.status && data.status !== "active" && data.status !== "ACTIVE") return null;
  return data.role as any;
}

export async function upsertDraftJournalEntry(args: {
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
    throw new Error(
      `La fecha ${entryDate} no pertenece a un período contable ABIERTO o el período está bloqueado.`
    );
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

export async function deleteDraftPaymentsByTradeDoc(companyId: string, tradeDocId: string) {
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

export async function getPaymentIdsByTradeDoc(
  companyId: string,
  tradeDocId: string
): Promise<string[]> {
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

export async function deletePaymentsByIds(
  companyId: string,
  tradeDocId: string,
  paymentIds: string[]
) {
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

export async function rollbackDraftArtifacts(args: {
  companyId: string;
  tradeDocId: string | null;
  journalEntryId: string | null;
}) {
  const { companyId, tradeDocId, journalEntryId } = args;

  if (tradeDocId) {
    try {
      await deleteDraftPaymentsByTradeDoc(companyId, tradeDocId);
    } catch {}
  }

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

  if (tradeDocId) {
    try {
      await supabase
        .from("trade_doc_lines")
        .delete()
        .eq("company_id", companyId)
        .eq("trade_doc_id", tradeDocId);
    } catch {}
  }

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
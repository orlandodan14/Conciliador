import { supabase } from "@/lib/supabaseClient";
import { normalizeIdentifier } from "./helpers";
import type {
  CobrosRow,
  CobrosAllocationRow,
  CobrosType,
  CobrosStatus,
  PaymentMethod,
  CardKind,
  JournalLine,
  BranchLite,
  BusinessLineLite,
  CounterpartyLite,
  DocSearchResult,
  DocSearchFilters,
} from "./types";

const TABLE = "payments" as const;

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function getAuthUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id ?? null;
}

export async function getMyRoleForCompany(
  companyId: string
): Promise<"OWNER" | "EDITOR" | "LECTOR" | null> {
  const uid = await getAuthUserId();
  if (!uid) return null;
  const { data } = await supabase
    .from("company_members")
    .select("role,status")
    .eq("company_id", companyId)
    .eq("user_id", uid)
    .maybeSingle();
  if (!data) return null;
  if (String(data.status || "").toUpperCase() !== "ACTIVE") return null;
  return data.role as "OWNER" | "EDITOR" | "LECTOR";
}

// ─── Contrapartes ─────────────────────────────────────────────────────────────

export async function loadCounterpartiesMap(
  companyId: string
): Promise<Record<string, CounterpartyLite>> {
  const { data } = await supabase
    .from("counterparties")
    .select("id,identifier,identifier_normalized,name")
    .eq("company_id", companyId)
    .eq("is_active", true);

  const map: Record<string, CounterpartyLite> = {};
  ((data as any[]) || []).forEach((c) => {
    const key = String(c.identifier_normalized || "").toUpperCase();
    if (key) {
      map[key] = {
        id: String(c.id),
        identifier: String(c.identifier || ""),
        identifier_normalized: key,
        name: String(c.name || ""),
      };
    }
  });
  return map;
}

// ─── Carga de cobros ──────────────────────────────────────────────────────────

export async function loadCobros(
  companyId: string,
  statusFilter: "BORRADOR" | "VIGENTE_OR_CANCELADO",
  offset = 0,
  limit = 50
): Promise<CobrosRow[]> {
  let q = supabase
    .from(TABLE)
    .select(
      "id,company_id,payment_type,status,reconciliation_status," +
      "method,card_kind,card_last4,auth_code," +
      "payment_date,reference,notes,total_amount,currency_code," +
      "counterparty_id,counterparties(identifier,name)," +
      "journal_entry_id,bank_movement_id,cancelled_at,cancel_reason," +
      "created_at,extra"
    )
    .eq("company_id", companyId)
    // COBRO, ANTICIPO y AJUSTE_COBRO — excluye PAGO/AJUSTE_PAGO (proveedores)
    .in("payment_type", ["COBRO", "ANTICIPO", "AJUSTE_COBRO"])
    .order("payment_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (statusFilter === "BORRADOR") {
    // Filtrar por columna real status
    q = q.eq("status", "BORRADOR");
  } else {
    // VIGENTE + CANCELADO (registrados y cancelados)
    q = q.in("status", ["VIGENTE", "CANCELADO"]);
  }

  const { data, error } = await q;
  if (error) throw error;

  return ((data ?? []) as any[]).map((r): CobrosRow => {
    // Fallback a extra para datos que puedan no haberse migrado aún
    const ex = (r.extra as Record<string, any>) || {};
    const paymentType: string = r.payment_type ?? ex.cobro_type ?? "COBRO";
    const isAjuste   = paymentType === "AJUSTE_COBRO" || paymentType === "AJUSTE";
    const isAnticipo = paymentType === "ANTICIPO";
    return {
      id: String(r.id),
      company_id: String(r.company_id),
      cobro_type: (isAjuste ? "AJUSTE" : isAnticipo ? "ANTICIPO" : "COBRO") as CobrosType,
      method: r.method as PaymentMethod ?? null,
      card_kind: (r.card_kind as CardKind) ?? null,
      card_last4: r.card_last4 ?? null,
      auth_code: r.auth_code ?? null,
      status: (r.status ?? ex.status ?? "VIGENTE") as CobrosStatus,
      payment_date: r.payment_date ?? null,
      number: r.reference ?? ex.number ?? null,
      reference: r.reference ?? null,
      description: r.notes ?? null,
      total_amount: Number(r.total_amount ?? 0),
      currency_code: r.currency_code ?? null,
      branch_id: ex.branch_id ?? null,
      counterparty_id: r.counterparty_id ?? ex.counterparty_id ?? null,
      counterparty_identifier_snapshot:
        (r.counterparties as any)?.identifier ??
        ex.counterparty_identifier_snapshot ?? null,
      counterparty_name_snapshot:
        (r.counterparties as any)?.name ??
        ex.counterparty_name_snapshot ?? null,
      journal_entry_id: r.journal_entry_id ?? ex.journal_entry_id ?? null,
      bank_movement_id: r.bank_movement_id ?? ex.bank_movement_id ?? null,
      cancelled_at: r.cancelled_at ?? ex.cancelled_at ?? null,
      cancel_reason: r.cancel_reason ?? ex.cancel_reason ?? null,
      created_at: r.created_at ?? null,
    };
  });
}

export async function loadCobroById(
  companyId: string,
  cobroId: string
): Promise<any | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select(
      "id,company_id,payment_type,status,payment_date,method,card_kind,card_last4,auth_code," +
      "reference,notes,total_amount,currency_code," +
      "counterparty_id,counterparties(identifier,name)," +
      "journal_entry_id,bank_movement_id,cancelled_at,cancel_reason," +
      "created_at,extra"
    )
    .eq("company_id", companyId)
    .eq("id", cobroId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

// ─── Allocations ──────────────────────────────────────────────────────────────

/**
 * Carga las allocations de un cobro con datos JOIN de trade_docs.
 */
export async function loadAllocationsForCobro(
  companyId: string,
  cobroId: string
): Promise<CobrosAllocationRow[]> {
  const { data, error } = await supabase
    .from("payment_allocations")
    .select(
      "id,payment_id,trade_doc_id,allocated_amount," +
      "trade_docs(doc_type,doc_class,fiscal_doc_code,non_fiscal_doc_code," +
      "series,number,issue_date,counterparty_identifier_snapshot," +
      "counterparty_name_snapshot,grand_total,balance,currency_code,status)"
    )
    .eq("company_id", companyId)
    .eq("payment_id", cobroId)
    .order("created_at", { ascending: true });

  if (error) throw error;

  return ((data as any[]) ?? []).map((r): CobrosAllocationRow => {
    const doc = (r.trade_docs || {}) as Record<string, any>;
    return {
      id: String(r.id),
      payment_id: String(r.payment_id),
      trade_doc_id: String(r.trade_doc_id),
      allocated_amount: Number(r.allocated_amount ?? 0),
      doc_type: doc.doc_type ?? null,
      doc_class: doc.doc_class ?? null,
      fiscal_doc_code: doc.fiscal_doc_code ?? null,
      non_fiscal_doc_code: doc.non_fiscal_doc_code ?? null,
      series: doc.series ?? null,
      number: doc.number ?? null,
      issue_date: doc.issue_date ?? null,
      counterparty_identifier_snapshot: doc.counterparty_identifier_snapshot ?? null,
      counterparty_name_snapshot: doc.counterparty_name_snapshot ?? null,
      grand_total: doc.grand_total ?? null,
      balance: doc.balance ?? null,
      currency_code: doc.currency_code ?? null,
      doc_status: doc.status ?? null,
    };
  });
}

/**
 * Reemplaza todas las allocations de un cobro (borrar + insertar).
 */
export async function saveAllocations(args: {
  companyId: string;
  cobroId: string;
  allocations: Array<{ trade_doc_id: string; allocated_amount: number }>;
  userId: string | null;
}): Promise<void> {
  const { companyId, cobroId, allocations, userId } = args;

  // Borrar allocations previas
  await supabase
    .from("payment_allocations")
    .delete()
    .eq("company_id", companyId)
    .eq("payment_id", cobroId);

  if (!allocations.length) return;

  const rows = allocations.map((a) => ({
    company_id: companyId,
    payment_id: cobroId,
    trade_doc_id: a.trade_doc_id,
    allocated_amount: a.allocated_amount,
    created_by: userId,
  }));

  const { error } = await supabase
    .from("payment_allocations")
    .insert(rows as any);
  if (error) throw error;
}

// ─── Período contable ─────────────────────────────────────────────────────────

export async function getCurrentAccountingPeriodId(
  companyId: string,
  date: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("accounting_periods")
    .select("id,status")
    .eq("company_id", companyId)
    .lte("start_date", date)
    .gte("end_date", date)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const s = String((data as any).status || "").toUpperCase();
  if (["BLOQUEADO", "BLOCKED", "CERRADO", "CLOSED"].includes(s)) return null;
  return (data as any).id ?? null;
}

// ─── Asiento contable ─────────────────────────────────────────────────────────

export async function saveJournalEntry(args: {
  companyId: string;
  cobroId: string;
  counterpartyId: string | null;
  entryDate: string;
  description: string;
  currencyCode: string;
  userId: string | null;
  existingJournalEntryId: string | null;
}): Promise<string> {
  const { companyId, cobroId, counterpartyId, entryDate, description, currencyCode, userId, existingJournalEntryId } = args;

  const periodId = await getCurrentAccountingPeriodId(companyId, entryDate);
  if (!periodId) {
    throw new Error(`La fecha ${entryDate} no pertenece a un período contable abierto.`);
  }

  const payload = {
    company_id: companyId,
    accounting_period_id: periodId,
    entry_date: entryDate,
    description,
    currency_code: currencyCode,
    status: "DRAFT",
    created_by: userId,
    posted_at: null,
    posted_by: null,
    counterparty_id: counterpartyId ?? null,
    extra: { source: "cobros", cobro_id: cobroId },
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
    .eq("id", existingJournalEntryId)
    .eq("status", "DRAFT");
  if (error) throw error;
  return existingJournalEntryId;
}

export async function saveJournalLines(
  companyId: string,
  journalEntryId: string,
  lines: JournalLine[],
  accByCode: Record<string, { id: string; code: string; name: string }>,
  branches: BranchLite[],
  businessLines: BusinessLineLite[]
): Promise<void> {
  await supabase
    .from("journal_entry_lines")
    .delete()
    .eq("company_id", companyId)
    .eq("journal_entry_id", journalEntryId);

  const usedLines = lines.filter(
    (l) =>
      String(l.account_code || "").trim() ||
      Number(l.debit) ||
      Number(l.credit)
  );
  if (!usedLines.length) return;

  const branchByCode = Object.fromEntries(branches.map((b) => [b.code.toUpperCase(), b]));
  const buByCode = Object.fromEntries(businessLines.map((b) => [b.code.toUpperCase(), b]));

  const rows = usedLines.map((l, i) => {
    const code = String(l.account_code || "").trim();
    const acc = accByCode[code];
    if (!acc) throw new Error(`Cuenta contable "${code}" no encontrada. Verifica el código.`);
    const branch = branchByCode[String(l.branch_code || "").toUpperCase()];
    const bu = buByCode[String(l.business_line_code || "").toUpperCase()];
    return {
      company_id: companyId,
      journal_entry_id: journalEntryId,
      line_no: i + 1,
      account_node_id: acc.id,
      account_code_snapshot: acc.code,
      account_name_snapshot: acc.name,
      line_description: String(l.description || "").trim() || null,
      debit: Number(l.debit) || 0,
      credit: Number(l.credit) || 0,
      branch_id: branch?.id ?? null,
      business_line_id: bu?.id ?? null,
    };
  });

  const { error } = await supabase.from("journal_entry_lines").insert(rows as any);
  if (error) throw error;
}

export async function postJournalEntry(journalEntryId: string): Promise<void> {
  const { error } = await supabase.rpc("post_journal_entry", { _entry_id: journalEntryId });
  if (error) throw error;
}

export async function loadJournalLinesForCobro(
  companyId: string,
  journalEntryId: string,
  accByCode: Record<string, { id: string; code: string; name: string }>
): Promise<JournalLine[]> {
  const { data, error } = await supabase
    .from("journal_entry_lines")
    .select("line_no,account_node_id,line_description,debit,credit,branch_id,business_line_id")
    .eq("company_id", companyId)
    .eq("journal_entry_id", journalEntryId)
    .order("line_no", { ascending: true });
  if (error) throw error;

  const accById = Object.fromEntries(Object.values(accByCode).map((a) => [a.id, a]));

  return ((data as any[]) ?? []).map((r, i): JournalLine => ({
    line_no: r.line_no ?? i + 1,
    account_code: accById[r.account_node_id]?.code ?? "",
    description: r.line_description ?? "",
    debit: String(r.debit ?? 0),
    credit: String(r.credit ?? 0),
    cost_center_id: null,
    business_line_id: r.business_line_id ?? null,
    branch_id: r.branch_id ?? null,
    cost_center_code: "",
    business_line_code: "",
    branch_code: "",
  }));
}

// ─── Guardar / actualizar cobro ───────────────────────────────────────────────

export async function upsertCobro(args: {
  companyId: string;
  cobroId: string | null;
  payload: Record<string, unknown>;
}): Promise<{ id: string; status: string }> {
  const { companyId, cobroId, payload } = args;

  if (!cobroId) {
    const { data, error } = await supabase
      .from(TABLE)
      .insert({ company_id: companyId, ...payload })
      .select("id")
      .single();
    if (error) throw error;
    return { id: (data as any).id as string, status: "BORRADOR" };
  }

  const { error } = await supabase
    .from(TABLE)
    .update(payload)
    .eq("company_id", companyId)
    .eq("id", cobroId);
  if (error) throw error;
  return { id: cobroId, status: "BORRADOR" };
}

// ─── Patch parcial del campo extra ───────────────────────────────────────────

/**
 * Hace merge de `fields` sobre el JSONB `extra` del cobro sin sobreescribir
 * campos ya existentes (ej. para actualizar journal_entry_id tras crear el asiento).
 */
export async function patchCobroExtra(
  companyId: string,
  cobroId: string,
  fields: Record<string, unknown>
): Promise<void> {
  const { data } = await supabase
    .from(TABLE)
    .select("extra")
    .eq("company_id", companyId)
    .eq("id", cobroId)
    .single();
  const merged = { ...((data as any)?.extra || {}), ...fields };
  const { error } = await supabase
    .from(TABLE)
    .update({ extra: merged })
    .eq("company_id", companyId)
    .eq("id", cobroId);
  if (error) throw error;
}

// ─── Registrar cobro (BORRADOR → VIGENTE) ────────────────────────────────────

export async function registerCobro(args: {
  companyId: string;
  cobroId: string;
  journalEntryId: string;
  allocations: Array<{ trade_doc_id: string; allocated_amount: number }>;
}): Promise<void> {
  const { companyId, cobroId, journalEntryId, allocations } = args;

  // 1. Verificar si el asiento ya fue posteado
  const { data: jeRow } = await supabase
    .from("journal_entries")
    .select("status")
    .eq("id", journalEntryId)
    .single();

  if ((jeRow as any)?.status !== "POSTED") {
    await postJournalEntry(journalEntryId);
  }

  // 2. Aplicar allocations al balance de cada trade_doc
  for (const alloc of allocations) {
    if (alloc.allocated_amount > 0) {
      await supabase.rpc("apply_cobro_to_trade_doc_balance", {
        p_trade_doc_id: alloc.trade_doc_id,
        p_amount: alloc.allocated_amount,
        p_sign: 1,
      });
    }
  }

  // 3. Cambiar el cobro a VIGENTE (columna real status)
  const { error } = await supabase
    .from(TABLE)
    .update({ status: "VIGENTE" })
    .eq("company_id", companyId)
    .eq("id", cobroId);
  if (error) throw error;
}

// ─── Eliminar cobro (solo BORRADOR) ──────────────────────────────────────────

export async function deleteCobro(
  companyId: string,
  cobroId: string
): Promise<void> {
  // 1. Obtener journal_entry_id (columna real, extra como fallback)
  const { data: cobro } = await supabase
    .from(TABLE)
    .select("journal_entry_id,extra")
    .eq("company_id", companyId)
    .eq("id", cobroId)
    .maybeSingle();

  // 2. Borrar allocations
  await supabase
    .from("payment_allocations")
    .delete()
    .eq("company_id", companyId)
    .eq("payment_id", cobroId);

  const cobroJeId =
    (cobro as any)?.journal_entry_id ??
    (cobro as any)?.extra?.journal_entry_id ?? null;

  // 3. Borrar líneas del asiento
  if (cobroJeId) {
    await supabase
      .from("journal_entry_lines")
      .delete()
      .eq("company_id", companyId)
      .eq("journal_entry_id", cobroJeId);
  }

  // 4. Borrar el cobro (solo si es BORRADOR — columna real)
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq("company_id", companyId)
    .eq("id", cobroId)
    .eq("status", "BORRADOR");
  if (error) throw error;

  // 5. Borrar asiento DRAFT si existe
  if (cobroJeId) {
    await supabase
      .from("journal_entries")
      .delete()
      .eq("company_id", companyId)
      .eq("id", cobroJeId)
      .eq("status", "DRAFT");
  }
}

// ─── Cancelar cobro (VIGENTE → CANCELADO + asiento reversa) ──────────────────

export async function cancelCobro(args: {
  companyId: string;
  cobroId: string;
  cancelDate: string;
  cancelReason: string;
  reversalLines: JournalLine[];
  accByCode: Record<string, { id: string; code: string; name: string }>;
  branches: BranchLite[];
  businessLines: BusinessLineLite[];
  userId: string | null;
  currencyCode: string;
}): Promise<void> {
  const {
    companyId, cobroId, cancelDate, cancelReason, reversalLines,
    accByCode, branches, businessLines, userId, currencyCode,
  } = args;

  const periodId = await getCurrentAccountingPeriodId(companyId, cancelDate);
  if (!periodId) {
    throw new Error(`La fecha ${cancelDate} no pertenece a un período contable abierto.`);
  }

  // 1. Crear asiento de reversa
  const { data: jeData, error: jeErr } = await supabase
    .from("journal_entries")
    .insert({
      company_id: companyId,
      accounting_period_id: periodId,
      entry_date: cancelDate,
      description: `Reversa cobro: ${cancelReason}`,
      currency_code: currencyCode,
      status: "DRAFT",
      created_by: userId,
      posted_at: null,
      posted_by: null,
      extra: { source: "cobros_cancel", cobro_id: cobroId },
    } as any)
    .select("id")
    .single();
  if (jeErr) throw jeErr;

  // 2. Insertar líneas de reversa
  await saveJournalLines(companyId, jeData.id, reversalLines, accByCode, branches, businessLines);

  // 3. Postear asiento de reversa
  await postJournalEntry(jeData.id);

  // 4. Revertir balance en trade_docs
  const { data: allocs } = await supabase
    .from("payment_allocations")
    .select("trade_doc_id,allocated_amount")
    .eq("company_id", companyId)
    .eq("payment_id", cobroId);

  for (const alloc of ((allocs as any[]) ?? [])) {
    if (Number(alloc.allocated_amount) > 0) {
      await supabase.rpc("apply_cobro_to_trade_doc_balance", {
        p_trade_doc_id: alloc.trade_doc_id,
        p_amount: Number(alloc.allocated_amount),
        p_sign: -1,
      });
    }
  }

  // 5. Cambiar cobro a CANCELADO (columnas reales)
  const { error } = await supabase
    .from(TABLE)
    .update({
      status: "CANCELADO",
      cancelled_at: cancelDate,
      cancel_reason: cancelReason,
    })
    .eq("company_id", companyId)
    .eq("id", cobroId);
  if (error) throw error;
}

// ─── Búsqueda de documentos para asociar ─────────────────────────────────────

export async function searchDocsForAllocation(args: {
  companyId: string;
  filters: DocSearchFilters;
  excludeDocIds?: string[];
  limit?: number;
}): Promise<DocSearchResult[]> {
  const { companyId, filters, excludeDocIds = [], limit = 200 } = args;

  let q = supabase
    .from("trade_docs")
    .select(
      "id,doc_type,doc_class,fiscal_doc_code,non_fiscal_doc_code," +
      "series,number,issue_date,counterparty_identifier_snapshot," +
      "counterparty_name_snapshot,grand_total,balance,currency_code,status"
    )
    .eq("company_id", companyId)
    .eq("status", "VIGENTE")
    .order("issue_date", { ascending: false })
    .limit(limit);

  // Filtro por clase de documento
  if (filters.doc_class === "FISCAL") {
    q = q.eq("doc_class", "FISCAL");
  } else if (filters.doc_class === "NON_FISCAL") {
    q = q.eq("doc_class", "NON_FISCAL");
  } else {
    // ALL: FISCAL + NON_FISCAL
    q = q.in("doc_class", ["FISCAL", "NON_FISCAL"]);
  }

  if (filters.only_open_balance) {
    q = q.gt("balance", 0);
  }

  if (filters.number?.trim()) {
    q = q.ilike("number", `%${filters.number.trim()}%`);
  }

  if (filters.issue_date_from) {
    q = q.gte("issue_date", filters.issue_date_from);
  }
  if (filters.issue_date_to) {
    q = q.lte("issue_date", filters.issue_date_to);
  }

  // Nota: el filtro por counterparty_identifier se hace client-side para manejar
  // variantes de formato (con/sin guión, mayúsculas, etc.) usando normalizeIdentifier.
  if (filters.counterparty_name?.trim()) {
    q = q.ilike("counterparty_name_snapshot", `%${filters.counterparty_name.trim()}%`);
  }

  const { data, error } = await q;
  if (error) throw error;

  // ── Filtros client-side ────────────────────────────────────────────────────
  const identifierNorm = normalizeIdentifier(filters.counterparty_identifier ?? "");

  const excludeSet = new Set(excludeDocIds);
  return ((data as any[]) ?? [])
    .filter((r) => !excludeSet.has(String(r.id)))
    // Filtro por identificador normalizado (maneja "12345678-9" ↔ "123456789")
    .filter((r) => {
      if (!identifierNorm) return true;
      return normalizeIdentifier(r.counterparty_identifier_snapshot ?? "").includes(identifierNorm);
    })
    .map((r): DocSearchResult => ({
      id: String(r.id),
      doc_type: r.doc_type ?? null,
      doc_class: r.doc_class ?? null,
      fiscal_doc_code: r.fiscal_doc_code ?? null,
      non_fiscal_doc_code: r.non_fiscal_doc_code ?? null,
      series: r.series ?? null,
      number: r.number ?? null,
      issue_date: r.issue_date ?? null,
      counterparty_identifier_snapshot: r.counterparty_identifier_snapshot ?? null,
      counterparty_name_snapshot: r.counterparty_name_snapshot ?? null,
      grand_total: r.grand_total ?? null,
      balance: r.balance ?? null,
      currency_code: r.currency_code ?? null,
      status: r.status ?? null,
    }));
}

import { supabase } from "@/lib/supabaseClient";
import type {
  OtherDocRow,
  JournalLine,
  BranchLite,
  BusinessLineLite,
  CounterpartyLite,
  PaymentRow,
} from "./types";
import type {
  OriginDocLite,
  OriginSearchFilters,
} from "@/app/(workspace)/gestionVentas/docs-tribut-ventas/components/tradeDocs/types";

/** Reutilizamos trade_docs con doc_class = NON_FISCAL */
const TABLE = "trade_docs" as const;
const DOC_CLASS = "NON_FISCAL" as const;
const MODULE = "SALES" as const;
const OUR_DOC_TYPES = ["OTRO_INGRESO", "DEVOLUCION"] as const;

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

/**
 * Carga todas las contrapartes activas de la empresa en un mapa
 * indexado por identifier_normalized.
 */
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

// ─── Carga de documentos ──────────────────────────────────────────────────────

export async function loadOtherDocs(
  companyId: string,
  statusFilter: "BORRADOR" | "VIGENTE_OR_CANCELADO",
  offset = 0,
  limit = 50
): Promise<OtherDocRow[]> {
  let q = supabase
    .from(TABLE)
    .select(
      "id,company_id,doc_type,status,non_fiscal_doc_code,issue_date,series,number,reference," +
      "counterparty_identifier_snapshot,counterparty_name_snapshot,grand_total,balance," +
      "origin_doc_id,journal_entry_id,created_at"
    )
    .eq("company_id", companyId)
    .eq("doc_class", DOC_CLASS)
    .in("doc_type", [...OUR_DOC_TYPES])
    .order("issue_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (statusFilter === "BORRADOR") {
    q = q.eq("status", "BORRADOR");
  } else {
    q = q.in("status", ["VIGENTE", "CANCELADO"]);
  }

  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as unknown) as OtherDocRow[];
}

export async function loadOtherDocById(
  companyId: string,
  docId: string
): Promise<any | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("company_id", companyId)
    .eq("id", docId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

// ─── Guardar / actualizar ─────────────────────────────────────────────────────

export async function upsertOtherDoc(args: {
  companyId: string;
  docId: string | null;
  payload: Record<string, unknown>;
}): Promise<{ id: string; status: string }> {
  const { companyId, docId, payload } = args;

  // Campos fijos para NON_FISCAL en trade_docs
  const base = {
    doc_class: DOC_CLASS,
    module: MODULE,
    net_taxable: 0,
    net_exempt: 0,
    tax_total: 0,
    non_fiscal_doc_type_id: null,
    fiscal_doc_type_id: null,
    fiscal_doc_code: null,
  };

  if (!docId) {
    const { data, error } = await supabase
      .from(TABLE)
      .insert({ ...base, ...payload })
      .select("id,status")
      .single();
    if (error) throw error;
    return data as { id: string; status: string };
  }

  const { error } = await supabase
    .from(TABLE)
    .update({ ...base, ...payload })
    .eq("company_id", companyId)
    .eq("id", docId);
  if (error) throw error;
  return { id: docId, status: String(payload.status ?? "") };
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
  docId: string;
  entryDate: string;
  description: string;
  currencyCode: string;
  userId: string | null;
  existingJournalEntryId: string | null;
}): Promise<string> {
  const {
    companyId, docId, entryDate, description, currencyCode,
    userId, existingJournalEntryId,
  } = args;

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
    extra: { source: "trade_docs_non_fiscal", trade_doc_id: docId },
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

  // Si ya existe, actualizar solo si sigue en DRAFT
  const { error } = await supabase
    .from("journal_entries")
    .update(payload as any)
    .eq("company_id", companyId)
    .eq("id", existingJournalEntryId)
    .eq("status", "DRAFT");
  if (error) throw error;
  return existingJournalEntryId;
}

/**
 * Llama al RPC post_journal_entry para cambiar el asiento de DRAFT → POSTED.
 */
export async function postJournalEntry(journalEntryId: string): Promise<void> {
  const { error } = await supabase.rpc("post_journal_entry", {
    _entry_id: journalEntryId,
  });
  if (error) throw error;
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

  const branchByCode = Object.fromEntries(
    branches.map((b) => [b.code.toUpperCase(), b])
  );
  const buByCode = Object.fromEntries(
    businessLines.map((b) => [b.code.toUpperCase(), b])
  );

  const rows = usedLines.map((l, i) => {
    const code = String(l.account_code || "").trim();
    const acc = accByCode[code];
    if (!acc) {
      throw new Error(`Cuenta contable "${code}" no encontrada. Verifica el código.`);
    }
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

  const { error } = await supabase
    .from("journal_entry_lines")
    .insert(rows as any);
  if (error) throw error;
}

export async function loadJournalLinesForDoc(
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

  const accById = Object.fromEntries(
    Object.values(accByCode).map((a) => [a.id, a])
  );

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

// ─── Registrar documento (DRAFT → VIGENTE via RPC) ────────────────────────────

/**
 * Postea el asiento (DRAFT→POSTED via RPC) y cambia el doc a VIGENTE.
 * Llamar solo cuando el doc tiene journal_entry_id.
 */
export async function registerOtherDoc(args: {
  companyId: string;
  docId: string;
  journalEntryId: string;
}): Promise<void> {
  const { companyId, docId, journalEntryId } = args;

  // 1. Verificar si el asiento ya fue posteado (fallo parcial previo).
  //    Si ya está POSTED, no volver a llamar post_journal_entry.
  const { data: jeRow } = await supabase
    .from("journal_entries")
    .select("status")
    .eq("id", journalEntryId)
    .single();

  if ((jeRow as any)?.status !== "POSTED") {
    await postJournalEntry(journalEntryId);
  }

  // 2. Cambiar el doc a VIGENTE
  const { error } = await supabase
    .from(TABLE)
    .update({ status: "VIGENTE" })
    .eq("company_id", companyId)
    .eq("id", docId)
    .eq("status", "BORRADOR");
  if (error) throw error;
}

// ─── Rollback de artefactos (cleanup si algo falla) ───────────────────────────

/**
 * Elimina en cascada: allocations → payments → je_lines → journal_entry (DRAFT) → doc (BORRADOR).
 * Solo para reverter una operación fallida; no usar para eliminación normal.
 */
export async function rollbackOtherDocArtifacts(args: {
  companyId: string;
  docId: string;
  journalEntryId: string | null;
}): Promise<void> {
  const { companyId, docId, journalEntryId } = args;

  // 1. payment_allocations
  await supabase
    .from("payment_allocations")
    .delete()
    .eq("company_id", companyId)
    .eq("trade_doc_id", docId);

  // 2. payments (vía allocations ya borradas — buscar por doc en extra)
  // No podemos referenciarlos directamente sin los IDs, así que los dejamos
  // para la siguiente carga (orphaned). El trigger del balance los ignorará.

  // 3. journal_entry_lines
  if (journalEntryId) {
    await supabase
      .from("journal_entry_lines")
      .delete()
      .eq("company_id", companyId)
      .eq("journal_entry_id", journalEntryId);

    // 4. journal_entry (solo si sigue en DRAFT)
    await supabase
      .from("journal_entries")
      .delete()
      .eq("company_id", companyId)
      .eq("id", journalEntryId)
      .eq("status", "DRAFT");
  }

  // 5. doc (solo si sigue en BORRADOR)
  await supabase
    .from(TABLE)
    .delete()
    .eq("company_id", companyId)
    .eq("id", docId)
    .eq("status", "BORRADOR");
}

// ─── Eliminar borrador ─────────────────────────────────────────────────────────

export async function deleteOtherDoc(
  companyId: string,
  docId: string
): Promise<void> {
  // 1. Obtener journal_entry_id del doc
  const { data: doc } = await supabase
    .from(TABLE)
    .select("journal_entry_id")
    .eq("company_id", companyId)
    .eq("id", docId)
    .maybeSingle();

  // 2. Obtener IDs de payments vinculados antes de borrar las allocations
  const { data: allocData } = await supabase
    .from("payment_allocations")
    .select("payment_id")
    .eq("company_id", companyId)
    .eq("trade_doc_id", docId);
  const paymentIds = Array.from(
    new Set(((allocData as any[]) || []).map((x) => x.payment_id).filter(Boolean))
  );

  // 3. Borrar payment_allocations (FK)
  await supabase
    .from("payment_allocations")
    .delete()
    .eq("company_id", companyId)
    .eq("trade_doc_id", docId);

  // 4a. Borrar payments
  if (paymentIds.length > 0) {
    await supabase
      .from("payments")
      .delete()
      .eq("company_id", companyId)
      .in("id", paymentIds);
  }

  // 4b. Borrar líneas del asiento
  if (doc?.journal_entry_id) {
    await supabase
      .from("journal_entry_lines")
      .delete()
      .eq("company_id", companyId)
      .eq("journal_entry_id", doc.journal_entry_id);

    // 4c. Borrar el asiento (solo si es DRAFT)
    await supabase
      .from("journal_entries")
      .delete()
      .eq("company_id", companyId)
      .eq("id", doc.journal_entry_id)
      .eq("status", "DRAFT");
  }

  // 5. Borrar el doc (solo BORRADOR)
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq("company_id", companyId)
    .eq("id", docId)
    .eq("status", "BORRADOR");
  if (error) throw error;
}

// ─── Cancelar documento ────────────────────────────────────────────────────────

export async function cancelOtherDoc(args: {
  companyId: string;
  docId: string;
  cancelDate: string;
  cancelReason: string;
  journalLines: JournalLine[];
  accByCode: Record<string, { id: string; code: string; name: string }>;
  branches: BranchLite[];
  businessLines: BusinessLineLite[];
  userId: string | null;
  currencyCode: string;
}): Promise<void> {
  const {
    companyId, docId, cancelDate, cancelReason, journalLines,
    accByCode, branches, businessLines, userId, currencyCode,
  } = args;

  // 1. Validar período contable
  const periodId = await getCurrentAccountingPeriodId(companyId, cancelDate);
  if (!periodId) {
    throw new Error(`La fecha ${cancelDate} no pertenece a un período contable abierto.`);
  }

  // 2. Crear asiento de reversa en DRAFT
  const { data: jeData, error: jeErr } = await supabase
    .from("journal_entries")
    .insert({
      company_id: companyId,
      accounting_period_id: periodId,
      entry_date: cancelDate,
      description: `Reversa: ${cancelReason}`,
      currency_code: currencyCode,
      status: "DRAFT",
      created_by: userId,
      posted_at: null,
      posted_by: null,
      extra: { source: "trade_docs_non_fiscal_cancel", trade_doc_id: docId },
    } as any)
    .select("id")
    .single();
  if (jeErr) throw jeErr;

  // 3. Insertar líneas del asiento de reversa
  await saveJournalLines(
    companyId, jeData.id, journalLines, accByCode, branches, businessLines
  );

  // 4. Postear el asiento via RPC
  await postJournalEntry(jeData.id);

  // 5. Cambiar el doc a CANCELADO
  const { error } = await supabase
    .from(TABLE)
    .update({
      status: "CANCELADO",
      cancelled_at: cancelDate,
      cancel_reason: cancelReason,
    } as any)
    .eq("company_id", companyId)
    .eq("id", docId);
  if (error) throw error;
}

// ─── Búsqueda de doc. origen para devoluciones ────────────────────────────────

/**
 * Busca documentos FISCALES (facturas, boletas, NC, ND) para usar como
 * origen de una DEVOLUCION. Los documentos de devolución nacen de documentos
 * del módulo tributario (doc_class = FISCAL).
 */
export async function searchOriginOtherDocs(args: {
  companyId: string;
  counterpartyIdentifier?: string;
  filters: OriginSearchFilters;
}): Promise<OriginDocLite[]> {
  const { companyId, counterpartyIdentifier, filters } = args;

  let q = supabase
    .from(TABLE)
    .select(
      "id,doc_type,fiscal_doc_code,series,number,issue_date," +
      "net_taxable,net_exempt,tax_total,grand_total,balance," +
      "currency_code,status,counterparty_identifier_snapshot"
    )
    .eq("company_id", companyId)
    .in("doc_type", ["INVOICE", "CREDIT_NOTE", "DEBIT_NOTE"])
    .order("issue_date", { ascending: false })
    .limit(60);

  // Filtrar por RUT/identificador de la contraparte si está disponible
  if (counterpartyIdentifier?.trim()) {
    q = q.ilike(
      "counterparty_identifier_snapshot",
      `%${counterpartyIdentifier.trim()}%`
    );
  }

  // Filtros adicionales del modal
  if (filters.fiscal_doc_code?.trim()) {
    q = q.ilike("fiscal_doc_code", `%${filters.fiscal_doc_code.trim()}%`);
  }
  if (filters.folio?.trim()) {
    q = q.ilike("number", `%${filters.folio.trim()}%`);
  }
  if (filters.issue_date_from) {
    q = q.gte("issue_date", filters.issue_date_from);
  }
  if (filters.issue_date_to) {
    q = q.lte("issue_date", filters.issue_date_to);
  }
  if (filters.only_vigente) {
    q = q.eq("status", "VIGENTE");
  }
  if (filters.only_open_balance) {
    q = q.gt("balance", 0);
  }

  const { data, error } = await q;
  if (error) throw error;

  return ((data as any[]) ?? []).map((r): OriginDocLite => ({
    id: String(r.id),
    doc_type: r.doc_type ?? null,
    fiscal_doc_code: r.fiscal_doc_code ?? null,
    series: r.series ?? null,
    number: r.number ?? null,
    issue_date: r.issue_date ?? null,
    counterparty_identifier: r.counterparty_identifier_snapshot ?? null,
    net_taxable: r.net_taxable ?? null,
    net_exempt: r.net_exempt ?? null,
    tax_total: r.tax_total ?? null,
    grand_total: r.grand_total ?? null,
    balance: r.balance ?? null,
    currency_code: r.currency_code ?? null,
    payment_status: null,
    status: r.status ?? null,
  }));
}

// ─── Pagos ────────────────────────────────────────────────────────────────────

/**
 * Guarda formas de pago para un doc NON_FISCAL.
 * Primero borra los pagos anteriores (allocations + payments), luego inserta.
 * Retorna el total pagado para actualizar el balance en trade_docs.
 */
export async function savePaymentsForDoc(args: {
  companyId: string;
  docId: string;
  issueDate: string;
  currencyCode: string;
  payments: PaymentRow[];
  userId: string | null;
}): Promise<number> {
  const { companyId, docId, issueDate, currencyCode, payments, userId } = args;

  // 1. Borrar allocations existentes para este doc
  const { data: existingAllocs } = await supabase
    .from("payment_allocations")
    .select("payment_id")
    .eq("company_id", companyId)
    .eq("trade_doc_id", docId);

  const existingPaymentIds = Array.from(
    new Set(((existingAllocs as any[]) || []).map((x) => x.payment_id).filter(Boolean))
  );

  if (existingPaymentIds.length > 0) {
    await supabase
      .from("payment_allocations")
      .delete()
      .eq("company_id", companyId)
      .eq("trade_doc_id", docId);

    await supabase
      .from("payments")
      .delete()
      .eq("company_id", companyId)
      .in("id", existingPaymentIds);
  }

  // 2. Filtrar pagos con monto > 0
  const usedPayments = payments.filter((p) => Number(p.amount) > 0);
  if (!usedPayments.length) return 0;

  // 3. Insertar nuevos payments
  const paymentRows = usedPayments.map((p) => ({
    company_id: companyId,
    payment_date: p.payment_date || issueDate,
    currency_code: currencyCode,
    method: p.method,
    reference: p.reference || null,
    card_kind: p.method === "TARJETA" ? (p.card_kind || null) : null,
    card_last4: p.method === "TARJETA" ? (p.card_last4 || null) : null,
    auth_code: p.method === "TARJETA" ? (p.auth_code || null) : null,
    total_amount: Number(p.amount),
    notes: null,
    extra: {
      source: "trade_docs_non_fiscal",
      trade_doc_id: docId,
      ui_payment_row_id: p.id,
    },
    created_by: userId,
  }));

  const { data: inserted, error: insertErr } = await supabase
    .from("payments")
    .insert(paymentRows as any)
    .select("id,total_amount");
  if (insertErr) throw insertErr;

  // 4. Insertar allocations
  const allocRows = ((inserted as any[]) || []).map((row) => ({
    company_id: companyId,
    payment_id: row.id,
    trade_doc_id: docId,
    allocated_amount: Number(row.total_amount || 0),
    created_by: userId,
  }));

  if (allocRows.length > 0) {
    const { error: allocErr } = await supabase
      .from("payment_allocations")
      .insert(allocRows as any);
    if (allocErr) throw allocErr;
  }

  return usedPayments.reduce((s, p) => s + Number(p.amount), 0);
}

/**
 * Carga las formas de pago existentes de un doc, indexadas por trade_doc_id.
 */
export async function loadPaymentsForDoc(
  companyId: string,
  docId: string
): Promise<PaymentRow[]> {
  const { data: allocData } = await supabase
    .from("payment_allocations")
    .select("payment_id")
    .eq("company_id", companyId)
    .eq("trade_doc_id", docId);

  const paymentIds = Array.from(
    new Set(((allocData as any[]) || []).map((x) => x.payment_id).filter(Boolean))
  );
  if (!paymentIds.length) return [];

  const { data, error } = await supabase
    .from("payments")
    .select("id,payment_date,method,total_amount,reference,card_kind,card_last4,auth_code")
    .eq("company_id", companyId)
    .in("id", paymentIds)
    .order("payment_date", { ascending: true });
  if (error) throw error;

  return ((data as any[]) || []).map((p): PaymentRow => ({
    id: String(p.id),
    payment_date: String(p.payment_date || ""),
    method: (p.method || "EFECTIVO") as PaymentRow["method"],
    amount: String(p.total_amount ?? 0),
    reference: String(p.reference || ""),
    card_kind: (p.card_kind || "") as PaymentRow["card_kind"],
    card_last4: String(p.card_last4 || ""),
    auth_code: String(p.auth_code || ""),
  }));
}

/**
 * Elimina todos los pagos vinculados a un doc (para borrar borradores con pagos).
 */
export async function deletePaymentsForDoc(
  companyId: string,
  docId: string
): Promise<void> {
  const { data: allocData } = await supabase
    .from("payment_allocations")
    .select("payment_id")
    .eq("company_id", companyId)
    .eq("trade_doc_id", docId);

  const paymentIds = Array.from(
    new Set(((allocData as any[]) || []).map((x) => x.payment_id).filter(Boolean))
  );

  await supabase
    .from("payment_allocations")
    .delete()
    .eq("company_id", companyId)
    .eq("trade_doc_id", docId);

  if (paymentIds.length > 0) {
    await supabase
      .from("payments")
      .delete()
      .eq("company_id", companyId)
      .in("id", paymentIds);
  }
}

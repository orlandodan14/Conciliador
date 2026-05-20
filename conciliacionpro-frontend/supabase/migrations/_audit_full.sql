-- ================================================================
-- Auditoría completa — ejecutar en Supabase SQL Editor
-- ================================================================

-- ── 1. RESUMEN EJECUTIVO ─────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM public.trade_docs)                                    AS trade_docs_total,
  (SELECT COUNT(*) FROM public.trade_docs   WHERE status = 'VIGENTE')         AS td_vigente,
  (SELECT COUNT(*) FROM public.trade_docs   WHERE status = 'BORRADOR')        AS td_borrador,
  (SELECT COUNT(*) FROM public.trade_docs   WHERE status = 'CANCELADO')       AS td_cancelado,
  (SELECT COUNT(*) FROM public.payments)                                       AS payments_total,
  (SELECT COUNT(*) FROM public.payments     WHERE status = 'VIGENTE')         AS pay_vigente,
  (SELECT COUNT(*) FROM public.payments     WHERE status = 'BORRADOR')        AS pay_borrador,
  (SELECT COUNT(*) FROM public.payments     WHERE status = 'CANCELADO')       AS pay_cancelado,
  (SELECT COUNT(*) FROM public.payment_allocations)                           AS allocations_total,
  (SELECT COUNT(*) FROM public.journal_entries)                               AS je_total,
  (SELECT COUNT(*) FROM public.journal_entries WHERE status = 'POSTED')       AS je_posted,
  (SELECT COUNT(*) FROM public.journal_entries WHERE status = 'DRAFT')        AS je_draft,
  (SELECT COUNT(*) FROM public.journal_entry_lines)                           AS je_lines_total,
  (SELECT COUNT(*) FROM public.counterparties)                                AS counterparties_total,
  (SELECT COUNT(*) FROM public.trade_doc_import_jobs)                         AS import_jobs_total;

-- ── 2. TRADE_DOCS: distribución de estados ───────────────────────
SELECT status, doc_class, COUNT(*) AS cantidad
FROM public.trade_docs
GROUP BY status, doc_class
ORDER BY doc_class, status;

-- ── 3. TRADE_DOCS: líneas sin cabecera ───────────────────────────
SELECT COUNT(*) AS trade_doc_lines_sin_cabecera
FROM public.trade_doc_lines tdl
WHERE NOT EXISTS (
  SELECT 1 FROM public.trade_docs td WHERE td.id = tdl.trade_doc_id
);

-- ── 4. TRADE_DOCS: balance negativo (no debería ocurrir) ─────────
SELECT id, doc_class, doc_type, number, grand_total, balance, status
FROM public.trade_docs
WHERE balance < 0;

-- ── 5. TRADE_DOCS: balance > grand_total (incoherente) ───────────
SELECT id, doc_class, doc_type, number, grand_total, balance, status
FROM public.trade_docs
WHERE balance > grand_total + 1;

-- ── 6. TRADE_DOCS: VIGENTE sin journal_entry ─────────────────────
SELECT COUNT(*) AS td_vigente_sin_je
FROM public.trade_docs
WHERE status = 'VIGENTE' AND journal_entry_id IS NULL;

-- ── 7. TRADE_DOCS: sin counterparty_id ───────────────────────────
SELECT status, doc_class, COUNT(*) AS cantidad
FROM public.trade_docs
WHERE counterparty_id IS NULL
GROUP BY status, doc_class;

-- ── 8. PAYMENTS: distribución ────────────────────────────────────
SELECT status, payment_type, COUNT(*) AS cantidad, SUM(total_amount)::bigint AS monto_total
FROM public.payments
GROUP BY status, payment_type
ORDER BY status, payment_type;

-- ── 9. PAYMENTS: VIGENTE sin journal_entry ───────────────────────
SELECT COUNT(*) AS pay_vigente_sin_je
FROM public.payments
WHERE status = 'VIGENTE' AND journal_entry_id IS NULL;

-- ── 10. PAYMENTS: VIGENTE sin allocation y sin trade_doc en extra ─
SELECT p.id, p.payment_type, p.total_amount,
       p.created_at::date AS fecha, p.reference,
       p.extra->>'source' AS fuente
FROM public.payments p
WHERE p.status = 'VIGENTE'
  AND NOT EXISTS (
    SELECT 1 FROM public.payment_allocations pa WHERE pa.payment_id = p.id
  )
  AND (p.extra->>'trade_doc_id') IS NULL;

-- ── 11. PAYMENTS: sobreasignados (asignado > total) ───────────────
SELECT p.id, p.total_amount,
       SUM(pa.allocated_amount) AS total_asignado
FROM public.payments p
JOIN public.payment_allocations pa ON pa.payment_id = p.id
GROUP BY p.id, p.total_amount
HAVING SUM(pa.allocated_amount) > p.total_amount + 1;

-- ── 12. PAYMENT_ALLOCATIONS: huérfanas ───────────────────────────
SELECT COUNT(*) AS allocations_huerfanas
FROM public.payment_allocations pa
WHERE NOT EXISTS (SELECT 1 FROM public.payments  p  WHERE p.id  = pa.payment_id)
   OR NOT EXISTS (SELECT 1 FROM public.trade_docs td WHERE td.id = pa.trade_doc_id);

-- ── 13. PAYMENT_ALLOCATIONS: monto <= 0 ──────────────────────────
SELECT COUNT(*) AS allocations_monto_cero
FROM public.payment_allocations
WHERE allocated_amount <= 0;

-- ── 14. JOURNAL_ENTRIES: asientos POSTED sin líneas ──────────────
SELECT je.id, je.entry_number, je.description, je.entry_date::date AS fecha
FROM public.journal_entries je
WHERE je.status = 'POSTED'
  AND NOT EXISTS (
    SELECT 1 FROM public.journal_entry_lines jel WHERE jel.journal_entry_id = je.id
  );

-- ── 15. JOURNAL_ENTRIES: desbalanceados (debe ≠ haber) ───────────
SELECT je.id, je.entry_number, je.status,
       ROUND(SUM(jel.debit),2)   AS total_debe,
       ROUND(SUM(jel.credit),2)  AS total_haber,
       ROUND(ABS(SUM(jel.debit) - SUM(jel.credit)),2) AS diferencia
FROM public.journal_entries je
JOIN public.journal_entry_lines jel ON jel.journal_entry_id = je.id
GROUP BY je.id, je.entry_number, je.status
HAVING ABS(SUM(jel.debit) - SUM(jel.credit)) > 1
ORDER BY diferencia DESC;

-- ── 16. JOURNAL_ENTRY_LINES: sin cuenta contable ─────────────────
SELECT COUNT(*) AS lines_sin_cuenta
FROM public.journal_entry_lines
WHERE account_node_id IS NULL;

-- ── 17. COUNTERPARTIES: duplicadas ───────────────────────────────
SELECT company_id,
       upper(trim(identifier)) AS identifier_norm,
       COUNT(*) AS duplicados
FROM public.counterparties
GROUP BY company_id, upper(trim(identifier))
HAVING COUNT(*) > 1;

-- ── 18. COUNTERPARTIES: sin nombre ───────────────────────────────
SELECT COUNT(*) AS sin_nombre
FROM public.counterparties
WHERE name IS NULL OR trim(name) = '';

-- ── 19. IMPORT JOBS: historial ───────────────────────────────────
SELECT status, COUNT(*) AS cantidad, MAX(created_at)::date AS ultimo
FROM public.trade_doc_import_jobs
GROUP BY status ORDER BY status;

-- ── 20. STAGING: registros sin job asociado (debería ser 0) ──────
SELECT COUNT(*) AS stg_docs_sin_job
FROM public.trade_doc_import_docs_stg stg
WHERE NOT EXISTS (
  SELECT 1 FROM public.trade_doc_import_jobs j WHERE j.id = stg.job_id
);

-- ── 21. JOURNAL_NUMBER_LOG: consistencia ─────────────────────────
SELECT
  jnl.company_id,
  js.name   AS serie,
  COUNT(*)  AS entradas,
  MAX(jnl.used_number) AS ultimo_numero
FROM public.journal_number_log jnl
JOIN public.journal_series js ON js.id = jnl.series_id
GROUP BY jnl.company_id, js.name;

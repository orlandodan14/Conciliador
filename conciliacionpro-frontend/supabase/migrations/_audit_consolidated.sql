-- ================================================================
-- Auditoría consolidada — un solo result set con todos los checks
-- ================================================================
SELECT check_name, resultado, detalle FROM (

  -- ── RESUMEN GENERAL ──────────────────────────────────────────
  SELECT 1 AS ord, 'trade_docs total'           AS check_name,
    COUNT(*)::text AS resultado, '' AS detalle FROM public.trade_docs
  UNION ALL
  SELECT 2, 'trade_docs VIGENTE',
    COUNT(*)::text, '' FROM public.trade_docs WHERE status = 'VIGENTE'
  UNION ALL
  SELECT 3, 'trade_docs BORRADOR',
    COUNT(*)::text, '' FROM public.trade_docs WHERE status = 'BORRADOR'
  UNION ALL
  SELECT 4, 'trade_docs CANCELADO',
    COUNT(*)::text, '' FROM public.trade_docs WHERE status = 'CANCELADO'
  UNION ALL
  SELECT 5, 'payments total',
    COUNT(*)::text, '' FROM public.payments
  UNION ALL
  SELECT 6, 'payments VIGENTE',
    COUNT(*)::text, '' FROM public.payments WHERE status = 'VIGENTE'
  UNION ALL
  SELECT 7, 'payments BORRADOR',
    COUNT(*)::text, '' FROM public.payments WHERE status = 'BORRADOR'
  UNION ALL
  SELECT 8, 'payments CANCELADO',
    COUNT(*)::text, '' FROM public.payments WHERE status = 'CANCELADO'
  UNION ALL
  SELECT 9, 'payment_allocations total',
    COUNT(*)::text, '' FROM public.payment_allocations
  UNION ALL
  SELECT 10, 'journal_entries POSTED',
    COUNT(*)::text, '' FROM public.journal_entries WHERE status = 'POSTED'
  UNION ALL
  SELECT 11, 'journal_entries DRAFT',
    COUNT(*)::text, '' FROM public.journal_entries WHERE status = 'DRAFT'
  UNION ALL
  SELECT 12, 'journal_entry_lines total',
    COUNT(*)::text, '' FROM public.journal_entry_lines
  UNION ALL
  SELECT 13, 'counterparties total',
    COUNT(*)::text, '' FROM public.counterparties
  UNION ALL
  SELECT 14, 'import_jobs total',
    COUNT(*)::text, '' FROM public.trade_doc_import_jobs

  UNION ALL SELECT 99, '─── CHECKS DE INTEGRIDAD ───', '', ''

  -- ── TRADE_DOCS ───────────────────────────────────────────────
  UNION ALL
  SELECT 100, '⚠ trade_doc_lines sin cabecera',
    COUNT(*)::text, 'Deben ser 0'
  FROM public.trade_doc_lines tdl
  WHERE NOT EXISTS (SELECT 1 FROM public.trade_docs td WHERE td.id = tdl.trade_doc_id)

  UNION ALL
  SELECT 101, '⚠ trade_docs con balance negativo',
    COUNT(*)::text, 'Deben ser 0'
  FROM public.trade_docs WHERE balance < 0

  UNION ALL
  SELECT 102, '⚠ trade_docs balance > grand_total',
    COUNT(*)::text, 'Deben ser 0'
  FROM public.trade_docs WHERE balance > grand_total + 1

  UNION ALL
  SELECT 103, '⚠ trade_docs VIGENTE sin journal_entry',
    COUNT(*)::text, 'Deben ser 0'
  FROM public.trade_docs WHERE status = 'VIGENTE' AND journal_entry_id IS NULL

  UNION ALL
  SELECT 104, '⚠ trade_docs sin counterparty_id',
    COUNT(*)::text, 'Idealmente 0'
  FROM public.trade_docs WHERE counterparty_id IS NULL

  -- ── PAYMENTS ─────────────────────────────────────────────────
  UNION ALL
  SELECT 200, '⚠ payments VIGENTE sin journal_entry',
    COUNT(*)::text, 'Deben ser 0'
  FROM public.payments WHERE status = 'VIGENTE' AND journal_entry_id IS NULL

  UNION ALL
  SELECT 201, '⚠ payments VIGENTE sin allocation (pago suelto)',
    COUNT(*)::text, 'Revisar si son cobros sin asignar'
  FROM public.payments p
  WHERE p.status = 'VIGENTE'
    AND NOT EXISTS (SELECT 1 FROM public.payment_allocations pa WHERE pa.payment_id = p.id)
    AND (p.extra->>'trade_doc_id') IS NULL

  UNION ALL
  SELECT 202, '⚠ payments sobreasignados',
    COUNT(*)::text, 'Deben ser 0'
  FROM (
    SELECT p.id FROM public.payments p
    JOIN public.payment_allocations pa ON pa.payment_id = p.id
    GROUP BY p.id, p.total_amount
    HAVING SUM(pa.allocated_amount) > p.total_amount + 1
  ) x

  -- ── ALLOCATIONS ──────────────────────────────────────────────
  UNION ALL
  SELECT 300, '⚠ payment_allocations huérfanas',
    COUNT(*)::text, 'Deben ser 0'
  FROM public.payment_allocations pa
  WHERE NOT EXISTS (SELECT 1 FROM public.payments  p  WHERE p.id  = pa.payment_id)
     OR NOT EXISTS (SELECT 1 FROM public.trade_docs td WHERE td.id = pa.trade_doc_id)

  UNION ALL
  SELECT 301, '⚠ allocations con monto <= 0',
    COUNT(*)::text, 'Deben ser 0'
  FROM public.payment_allocations WHERE allocated_amount <= 0

  -- ── JOURNAL ENTRIES ──────────────────────────────────────────
  UNION ALL
  SELECT 400, '⚠ JEs DRAFT huérfanos (sin doc ni pago)',
    COUNT(*)::text, 'Deben ser 0 tras limpieza'
  FROM public.journal_entries je
  WHERE je.status = 'DRAFT'
    AND NOT EXISTS (SELECT 1 FROM public.trade_docs td WHERE td.journal_entry_id = je.id)
    AND NOT EXISTS (SELECT 1 FROM public.payments  p  WHERE p.journal_entry_id  = je.id)

  UNION ALL
  SELECT 401, '⚠ JEs POSTED sin líneas',
    COUNT(*)::text, 'Deben ser 0'
  FROM public.journal_entries je
  WHERE je.status = 'POSTED'
    AND NOT EXISTS (SELECT 1 FROM public.journal_entry_lines jel WHERE jel.journal_entry_id = je.id)

  UNION ALL
  SELECT 402, '⚠ JEs desbalanceados (debe ≠ haber)',
    COUNT(*)::text, 'Deben ser 0'
  FROM (
    SELECT je.id FROM public.journal_entries je
    JOIN public.journal_entry_lines jel ON jel.journal_entry_id = je.id
    GROUP BY je.id
    HAVING ABS(SUM(jel.debit) - SUM(jel.credit)) > 1
  ) x

  UNION ALL
  SELECT 403, '⚠ journal_entry_lines sin cuenta contable',
    COUNT(*)::text, 'Deben ser 0'
  FROM public.journal_entry_lines WHERE account_node_id IS NULL

  -- ── COUNTERPARTIES ───────────────────────────────────────────
  UNION ALL
  SELECT 500, '⚠ counterparties duplicadas (mismo identifier)',
    COUNT(*)::text, 'Idealmente 0'
  FROM (
    SELECT company_id, upper(trim(identifier))
    FROM public.counterparties
    GROUP BY company_id, upper(trim(identifier))
    HAVING COUNT(*) > 1
  ) x

  UNION ALL
  SELECT 501, '⚠ counterparties sin nombre',
    COUNT(*)::text, 'Idealmente 0'
  FROM public.counterparties WHERE name IS NULL OR trim(name) = ''

  -- ── STAGING ──────────────────────────────────────────────────
  UNION ALL
  SELECT 600, '⚠ stg_docs sin job asociado',
    COUNT(*)::text, 'Deben ser 0'
  FROM public.trade_doc_import_docs_stg stg
  WHERE NOT EXISTS (SELECT 1 FROM public.trade_doc_import_jobs j WHERE j.id = stg.job_id)

) t
ORDER BY ord;

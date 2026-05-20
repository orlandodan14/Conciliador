-- Detalle de los JEs DRAFT que NO tienen trade_doc NI payment vinculado
-- (los que realmente se pueden borrar)
SELECT
  je.id,
  je.description,
  je.created_at::date          AS fecha,
  je.extra->>'source'          AS fuente,
  je.created_by
FROM public.journal_entries je
WHERE je.status = 'DRAFT'
  AND NOT EXISTS (SELECT 1 FROM public.trade_docs td WHERE td.journal_entry_id = je.id)
  AND NOT EXISTS (SELECT 1 FROM public.payments  p  WHERE p.journal_entry_id  = je.id)
ORDER BY je.extra->>'source', je.created_at DESC;

-- ── Resumen por fuente ───────────────────────────────────────────────────────
SELECT
  je.extra->>'source' AS fuente,
  COUNT(*)            AS total
FROM public.journal_entries je
WHERE je.status = 'DRAFT'
  AND NOT EXISTS (SELECT 1 FROM public.trade_docs td WHERE td.journal_entry_id = je.id)
  AND NOT EXISTS (SELECT 1 FROM public.payments  p  WHERE p.journal_entry_id  = je.id)
GROUP BY fuente
ORDER BY total DESC;

-- ── JEs DRAFT con payment BORRADOR pero sin trade_doc ────────────────────────
-- (estos NO se borran todavía — son cobros importados pendientes de registrar)
SELECT
  COUNT(*) AS cobros_importados_borrador
FROM public.journal_entries je
WHERE je.status = 'DRAFT'
  AND NOT EXISTS (SELECT 1 FROM public.trade_docs td WHERE td.journal_entry_id = je.id)
  AND EXISTS     (SELECT 1 FROM public.payments  p  WHERE p.journal_entry_id  = je.id);

-- ── Conteo exacto por categoría ──────────────────────────────────────────────
SELECT
  EXISTS(SELECT 1 FROM public.payments p WHERE p.journal_entry_id = je.id) AS tiene_pago,
  COUNT(*) AS cantidad
FROM public.journal_entries je
WHERE je.status = 'DRAFT'
  AND NOT EXISTS (SELECT 1 FROM public.trade_docs td WHERE td.journal_entry_id = je.id)
GROUP BY tiene_pago;

-- ── Fuentes de los JEs que SÍ tienen pago ────────────────────────────────────
SELECT
  je.extra->>'source' AS fuente,
  p.status            AS pago_status,
  COUNT(*)            AS cantidad
FROM public.journal_entries je
JOIN public.payments p ON p.journal_entry_id = je.id
WHERE je.status = 'DRAFT'
  AND NOT EXISTS (SELECT 1 FROM public.trade_docs td WHERE td.journal_entry_id = je.id)
GROUP BY fuente, pago_status;

-- ── Fuentes de los JEs que NO tienen pago ni trade_doc ───────────────────────
SELECT
  je.extra->>'source' AS fuente,
  COUNT(*)            AS cantidad
FROM public.journal_entries je
WHERE je.status = 'DRAFT'
  AND NOT EXISTS (SELECT 1 FROM public.trade_docs td WHERE td.journal_entry_id = je.id)
  AND NOT EXISTS (SELECT 1 FROM public.payments  p  WHERE p.journal_entry_id  = je.id)
GROUP BY fuente;

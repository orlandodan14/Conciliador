-- JEs DRAFT que tienen payments vinculados pero sin trade_doc
SELECT
  je.id,
  je.status,
  je.description,
  je.created_at::date          AS fecha,
  je.extra->>'source'          AS fuente,
  p.id                         AS payment_id,
  p.status                     AS payment_status,
  p.payment_type,
  p.total_amount
FROM public.journal_entries je
JOIN public.payments p ON p.journal_entry_id = je.id
WHERE je.status = 'DRAFT'
  AND NOT EXISTS (
    SELECT 1 FROM public.trade_docs td WHERE td.journal_entry_id = je.id
  )
ORDER BY je.created_at DESC
LIMIT 20;

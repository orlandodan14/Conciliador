-- Identificar el JE POSTED que no tiene líneas
SELECT
  je.id,
  je.entry_number,
  je.description,
  je.entry_date,
  je.created_at::date        AS creado,
  je.extra->>'source'        AS fuente,
  -- Ver si algún trade_doc o payment lo referencia
  (SELECT COUNT(*) FROM public.trade_docs td WHERE td.journal_entry_id = je.id) AS trade_docs_vinculados,
  (SELECT COUNT(*) FROM public.payments   p  WHERE p.journal_entry_id  = je.id) AS payments_vinculados
FROM public.journal_entries je
WHERE je.status = 'POSTED'
  AND NOT EXISTS (
    SELECT 1 FROM public.journal_entry_lines jel WHERE jel.journal_entry_id = je.id
  );

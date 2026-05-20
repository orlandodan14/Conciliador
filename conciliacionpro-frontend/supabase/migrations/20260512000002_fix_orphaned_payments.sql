-- =========================================================
-- 20260512000002_fix_orphaned_payments.sql
--
-- Repara pagos huérfanos creados por process_other_doc_import_batch
-- (y cualquier flujo "registrar directo con pago") que quedaron sin:
--   • counterparty_id  (NULL)
--   • payment_allocations (0 registros)
--
-- La FK extra->>'trade_doc_id' apunta al trade_doc correcto,
-- lo usamos para recuperar la contraparte y crear la asignación.
-- Solo se procesan payments cuyo trade_doc sigue existiendo y
-- pertenece a la misma empresa (evita violar la FK compuesta).
-- =========================================================

-- ─── 1. Backfill counterparty_id ────────────────────────────────────────────
UPDATE public.payments p
SET    counterparty_id = td.counterparty_id
FROM   public.trade_docs td
WHERE  td.id              = (p.extra->>'trade_doc_id')::uuid
  AND  td.company_id      = p.company_id          -- mismo tenant
  AND  p.counterparty_id  IS NULL
  AND  p.extra->>'source' = 'trade_docs_non_fiscal'
  AND  td.counterparty_id IS NOT NULL;

-- ─── 2. Crear payment_allocations faltantes ──────────────────────────────────
-- INNER JOIN valida que el trade_doc exista con el mismo company_id
-- (la FK compuesta requiere que (company_id, trade_doc_id) esté en trade_docs).
INSERT INTO public.payment_allocations
  (company_id, payment_id, trade_doc_id, allocated_amount)
SELECT
  p.company_id,
  p.id,
  td.id,
  p.total_amount
FROM public.payments p
JOIN public.trade_docs td
  ON  td.id         = (p.extra->>'trade_doc_id')::uuid
  AND td.company_id = p.company_id
WHERE p.extra->>'source'       = 'trade_docs_non_fiscal'
  AND p.extra->>'trade_doc_id' IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM   public.payment_allocations pa
    WHERE  pa.payment_id = p.id
  );

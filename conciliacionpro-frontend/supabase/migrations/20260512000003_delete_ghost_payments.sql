-- =========================================================
-- 20260512000003_delete_ghost_payments.sql
--
-- Elimina pagos huérfanos que quedaron sin trade_doc, sin asiento
-- contable y sin movimiento bancario. Son datos residuales de
-- importaciones OTI cuyo trade_doc fue eliminado posteriormente.
--
-- Condiciones (todas deben cumplirse):
--   • source = 'trade_docs_non_fiscal'  → creados por importación OTI
--   • counterparty_id IS NULL           → nunca tuvieron contraparte
--   • journal_entry_id IS NULL          → sin impacto contable
--   • bank_movement_id IS NULL          → no conciliados
--   • trade_doc referenciado no existe  → doc origen borrado
-- =========================================================

DELETE FROM public.payments
WHERE  extra->>'source'       = 'trade_docs_non_fiscal'
  AND  counterparty_id        IS NULL
  AND  journal_entry_id       IS NULL
  AND  bank_movement_id       IS NULL
  AND  NOT EXISTS (
         SELECT 1
         FROM   public.trade_docs td
         WHERE  td.id = (extra->>'trade_doc_id')::uuid
       );

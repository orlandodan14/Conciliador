-- ================================================================
-- 20260513000005_void_empty_posted_je.sql
--
-- Anula el único journal_entry POSTED que quedó sin líneas
-- (entry_number 33, residuo de desarrollo temprano del módulo
-- trade_docs_non_fiscal).
--
-- Se VOIDS en lugar de DELETE para preservar la numeración
-- contable — entry_number 33 ya quedó registrado en
-- journal_number_log y no debe reutilizarse.
-- ================================================================

UPDATE public.journal_entries
SET
  status    = 'VOID',
  voided_at = now()
WHERE id = '892d65f6-2fde-48ad-9ad6-9e181fcd8df4'
  AND status = 'POSTED'
  AND NOT EXISTS (
    SELECT 1 FROM public.journal_entry_lines jel
    WHERE jel.journal_entry_id = '892d65f6-2fde-48ad-9ad6-9e181fcd8df4'
  );

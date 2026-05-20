-- ================================================================
-- 20260513000004_cleanup_orphaned_records.sql
--
-- Limpieza de 53 journal_entries DRAFT huérfanos acumulados por
-- bugs anteriores en las funciones de borrado (corregidos en
-- 20260505000003, 20260512000002, 20260512000003).
--
-- CRITERIO DE BORRADO (todos deben cumplirse):
--   • status = 'DRAFT'
--   • Ningún trade_doc apunta a este JE  (trade_docs.journal_entry_id)
--   • Ningún payment apunta a este JE    (payments.journal_entry_id)
--
-- QUÉ NO SE TOCA:
--   • journal_entries en POSTED / VOIDED
--   • JEs de cobros_import que tienen payments BORRADOR vinculados
--   • Cualquier registro que tenga al menos una referencia activa
-- ================================================================

DO $$
DECLARE
  v_orphan_ids  uuid[];
  v_deleted_lines int;
  v_deleted_jes   int;
BEGIN
  -- ── Paso 1: Capturar IDs exactos de JEs huérfanos ────────────
  SELECT array_agg(je.id)
    INTO v_orphan_ids
    FROM public.journal_entries je
   WHERE je.status = 'DRAFT'
     AND NOT EXISTS (
           SELECT 1 FROM public.trade_docs td
            WHERE td.journal_entry_id = je.id
         )
     AND NOT EXISTS (
           SELECT 1 FROM public.payments p
            WHERE p.journal_entry_id = je.id
         );

  IF v_orphan_ids IS NULL OR array_length(v_orphan_ids, 1) = 0 THEN
    RAISE NOTICE 'No se encontraron journal_entries huérfanos. Nada que limpiar.';
    RETURN;
  END IF;

  RAISE NOTICE 'JEs huérfanos encontrados: %', array_length(v_orphan_ids, 1);

  -- ── Paso 2: Eliminar sus líneas (respeta FK) ──────────────────
  DELETE FROM public.journal_entry_lines
   WHERE journal_entry_id = ANY(v_orphan_ids);
  GET DIAGNOSTICS v_deleted_lines = ROW_COUNT;
  RAISE NOTICE 'journal_entry_lines eliminadas: %', v_deleted_lines;

  -- ── Paso 3: Eliminar los JEs por IDs exactos ─────────────────
  DELETE FROM public.journal_entries
   WHERE id = ANY(v_orphan_ids)
     AND status = 'DRAFT';        -- doble guarda de seguridad
  GET DIAGNOSTICS v_deleted_jes = ROW_COUNT;
  RAISE NOTICE 'journal_entries eliminados: %', v_deleted_jes;

  -- ── Paso 4: Eliminar payment_allocations huérfanas ───────────
  -- Apuntan a un payment o trade_doc que ya no existe
  DELETE FROM public.payment_allocations pa
   WHERE NOT EXISTS (SELECT 1 FROM public.payments  p  WHERE p.id  = pa.payment_id)
      OR NOT EXISTS (SELECT 1 FROM public.trade_docs td WHERE td.id = pa.trade_doc_id);
  GET DIAGNOSTICS v_deleted_lines = ROW_COUNT;
  RAISE NOTICE 'payment_allocations huérfanas eliminadas: %', v_deleted_lines;

  -- ── Paso 5: journal_entry_lines sin padre ────────────────────
  -- Residuos donde el JE fue borrado pero las líneas sobrevivieron
  DELETE FROM public.journal_entry_lines jel
   WHERE NOT EXISTS (
           SELECT 1 FROM public.journal_entries je
            WHERE je.id = jel.journal_entry_id
         );
  GET DIAGNOSTICS v_deleted_lines = ROW_COUNT;
  IF v_deleted_lines > 0 THEN
    RAISE NOTICE 'journal_entry_lines sin padre eliminadas: %', v_deleted_lines;
  END IF;

END $$;

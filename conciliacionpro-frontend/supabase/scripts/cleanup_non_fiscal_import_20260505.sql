-- =====================================================================
-- LIMPIEZA: eliminar docs NON_FISCAL importados hoy (2026-05-05)
-- que quedaron con errores de segmentación.
--
-- ¡REVISAR LA SECCIÓN "IDENTIFICAR" ANTES DE EJECUTAR DELETE!
-- Ejecutar primero solo el SELECT para confirmar qué se va a borrar.
-- =====================================================================

-- ── PASO 1: IDENTIFICAR los documentos a borrar ──────────────────────
-- Muestra todos los NON_FISCAL creados hoy (ajusta la fecha si es otro día)
SELECT
  td.id,
  td.status,
  td.doc_type,
  td.number,
  td.issue_date,
  td.grand_total,
  td.created_at,
  td.journal_entry_id,
  cp.identifier AS rut,
  cp.name       AS nombre
FROM public.trade_docs td
LEFT JOIN public.counterparties cp ON cp.id = td.counterparty_id
WHERE td.company_id = (
  -- Reemplaza con tu company_id real si lo conoces, o deja el subquery
  SELECT id FROM public.companies ORDER BY created_at DESC LIMIT 1
)
  AND td.doc_class = 'NON_FISCAL'
  AND td.created_at >= current_date   -- creados hoy
  AND td.created_at <  current_date + interval '1 day'
ORDER BY td.created_at DESC;


-- ── PASO 2: LIMPIAR (ejecutar solo después de confirmar el SELECT) ────
-- Cambia la condición de fecha si necesitas borrar de otro rango.
-- También puedes filtrar por status = 'VIGENTE' si solo quieres esos.

DO $$
DECLARE
  v_company_id uuid;
  v_doc_ids    uuid[];
  v_je_ids     uuid[];
  v_pay_ids    uuid[];
BEGIN
  -- ← Reemplaza aquí por tu company_id real
  -- v_company_id := 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx';
  -- O usa el subquery de arriba:
  SELECT id INTO v_company_id FROM public.companies ORDER BY created_at DESC LIMIT 1;

  -- Recoger IDs de docs NON_FISCAL creados hoy
  SELECT array_agg(id) INTO v_doc_ids
  FROM public.trade_docs
  WHERE company_id = v_company_id
    AND doc_class  = 'NON_FISCAL'
    AND created_at >= current_date
    AND created_at <  current_date + interval '1 day';

  IF v_doc_ids IS NULL OR array_length(v_doc_ids, 1) = 0 THEN
    RAISE NOTICE 'No se encontraron documentos NON_FISCAL creados hoy. Nada que borrar.';
    RETURN;
  END IF;

  RAISE NOTICE 'Documentos a borrar: % (IDs: %)', array_length(v_doc_ids, 1), v_doc_ids;

  -- Recoger journal_entry_ids asociados
  SELECT array_agg(DISTINCT journal_entry_id) INTO v_je_ids
  FROM public.trade_docs
  WHERE id = ANY(v_doc_ids)
    AND journal_entry_id IS NOT NULL;

  -- Recoger payment IDs desde payment_allocations
  SELECT array_agg(DISTINCT payment_id) INTO v_pay_ids
  FROM public.payment_allocations
  WHERE company_id   = v_company_id
    AND trade_doc_id = ANY(v_doc_ids);

  -- 1. Eliminar payment_allocations
  DELETE FROM public.payment_allocations
  WHERE company_id   = v_company_id
    AND trade_doc_id = ANY(v_doc_ids);
  RAISE NOTICE 'payment_allocations eliminados';

  -- 2. Eliminar payments
  IF v_pay_ids IS NOT NULL AND array_length(v_pay_ids, 1) > 0 THEN
    DELETE FROM public.payments
    WHERE company_id = v_company_id
      AND id = ANY(v_pay_ids);
    RAISE NOTICE 'payments eliminados: %', array_length(v_pay_ids, 1);
  END IF;

  -- 3. Eliminar journal_entry_lines
  IF v_je_ids IS NOT NULL AND array_length(v_je_ids, 1) > 0 THEN
    DELETE FROM public.journal_entry_lines
    WHERE company_id       = v_company_id
      AND journal_entry_id = ANY(v_je_ids);
    RAISE NOTICE 'journal_entry_lines eliminadas';

    -- 4. Eliminar journal_entries
    DELETE FROM public.journal_entries
    WHERE company_id = v_company_id
      AND id = ANY(v_je_ids);
    RAISE NOTICE 'journal_entries eliminados: %', array_length(v_je_ids, 1);
  END IF;

  -- 5. Eliminar trade_docs
  DELETE FROM public.trade_docs
  WHERE company_id = v_company_id
    AND id = ANY(v_doc_ids);
  RAISE NOTICE 'trade_docs eliminados: %', array_length(v_doc_ids, 1);

  RAISE NOTICE '✅ Limpieza completada.';
END $$;

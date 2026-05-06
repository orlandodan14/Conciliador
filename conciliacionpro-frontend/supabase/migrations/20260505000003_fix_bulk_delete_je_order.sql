-- =========================================================
-- 20260505000003_fix_bulk_delete_je_order.sql
--
-- Corrige el orden de borrado en bulk_delete_other_docs:
--   ANTES: journal_entries → trade_docs  (FK violation)
--   AHORA: trade_docs → journal_entries  (correcto)
--
-- trade_docs.journal_entry_id es FK → journal_entries.id,
-- por lo tanto hay que borrar trade_docs PRIMERO para liberar
-- la referencia y después borrar journal_entries.
-- =========================================================

CREATE OR REPLACE FUNCTION public.bulk_delete_other_docs(
  _company_id     uuid,
  _trade_doc_ids  uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
  v_doc_ids    uuid[];
  v_je_ids     uuid[];
  v_pay_ids    uuid[];
  v_deleted    int := 0;
  v_skipped    int := 0;
BEGIN
  -- Solo borramos docs en BORRADOR de la empresa
  SELECT array_agg(id) INTO v_doc_ids
  FROM public.trade_docs
  WHERE company_id = _company_id
    AND id         = ANY(_trade_doc_ids)
    AND status     = 'BORRADOR';

  v_skipped := array_length(_trade_doc_ids, 1) - coalesce(array_length(v_doc_ids, 1), 0);
  v_deleted  := coalesce(array_length(v_doc_ids, 1), 0);

  IF v_deleted = 0 THEN
    RETURN jsonb_build_object('deleted_count', 0, 'skipped_count', v_skipped);
  END IF;

  -- JE IDs asociados (capturar ANTES de borrar trade_docs)
  SELECT array_agg(DISTINCT journal_entry_id) INTO v_je_ids
  FROM public.trade_docs
  WHERE id = ANY(v_doc_ids) AND journal_entry_id IS NOT NULL;

  -- Payment IDs desde allocations
  SELECT array_agg(DISTINCT payment_id) INTO v_pay_ids
  FROM public.payment_allocations
  WHERE company_id   = _company_id
    AND trade_doc_id = ANY(v_doc_ids);

  -- 1. Borrar payment_allocations
  DELETE FROM public.payment_allocations
  WHERE company_id   = _company_id
    AND trade_doc_id = ANY(v_doc_ids);

  -- 2. Borrar payments
  IF v_pay_ids IS NOT NULL AND array_length(v_pay_ids, 1) > 0 THEN
    DELETE FROM public.payments
    WHERE company_id = _company_id
      AND id         = ANY(v_pay_ids);
  END IF;

  -- 3. Borrar journal_entry_lines
  IF v_je_ids IS NOT NULL AND array_length(v_je_ids, 1) > 0 THEN
    DELETE FROM public.journal_entry_lines
    WHERE company_id       = _company_id
      AND journal_entry_id = ANY(v_je_ids);
  END IF;

  -- 4. Borrar trade_docs PRIMERO → libera la FK journal_entry_id → journal_entries
  DELETE FROM public.trade_docs
  WHERE company_id = _company_id
    AND id         = ANY(v_doc_ids)
    AND status     = 'BORRADOR';

  -- 5. Ahora sí podemos borrar journal_entries (ya no hay FK apuntando a ellos)
  IF v_je_ids IS NOT NULL AND array_length(v_je_ids, 1) > 0 THEN
    DELETE FROM public.journal_entries
    WHERE company_id = _company_id
      AND id         = ANY(v_je_ids)
      AND status     = 'DRAFT';
  END IF;

  RETURN jsonb_build_object('deleted_count', v_deleted, 'skipped_count', v_skipped);
END;
$func$;

GRANT EXECUTE ON FUNCTION public.bulk_delete_other_docs(uuid, uuid[])
  TO authenticated, service_role;

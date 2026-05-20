-- =============================================================
-- 20260513000001_bulk_delete_cobros.sql
--
-- RPC bulk_delete_cobros(_company_id, _payment_ids)
--   Elimina N cobros en estado BORRADOR en una sola transacción.
--   Limpia en orden: payment_allocations → journal_entry_lines
--                  → journal_entries (DRAFT) → payments (BORRADOR)
--   Devuelve: { deleted_count, skipped_count }
-- =============================================================

CREATE OR REPLACE FUNCTION public.bulk_delete_cobros(
  _company_id   uuid,
  _payment_ids  uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
  v_pay_ids  uuid[];
  v_je_ids   uuid[];
  v_deleted  int := 0;
  v_skipped  int := 0;
BEGIN
  -- Solo pagos en BORRADOR que pertenecen a la empresa
  SELECT array_agg(id) INTO v_pay_ids
  FROM public.payments
  WHERE company_id = _company_id
    AND id         = ANY(_payment_ids)
    AND status     = 'BORRADOR';

  v_skipped := array_length(_payment_ids, 1)
             - coalesce(array_length(v_pay_ids, 1), 0);
  v_deleted  := coalesce(array_length(v_pay_ids, 1), 0);

  IF v_deleted = 0 THEN
    RETURN jsonb_build_object('deleted_count', 0, 'skipped_count', v_skipped);
  END IF;

  -- JE IDs vinculados a estos pagos
  SELECT array_agg(DISTINCT journal_entry_id) INTO v_je_ids
  FROM public.payments
  WHERE id = ANY(v_pay_ids)
    AND journal_entry_id IS NOT NULL;

  -- 1. Eliminar allocations de estos cobros
  DELETE FROM public.payment_allocations
  WHERE company_id = _company_id
    AND payment_id = ANY(v_pay_ids);

  -- 2. Eliminar los cobros
  DELETE FROM public.payments
  WHERE company_id = _company_id
    AND id         = ANY(v_pay_ids);

  -- 3. Limpiar journal_entry_lines y journal_entries huérfanos (DRAFT)
  IF v_je_ids IS NOT NULL AND array_length(v_je_ids, 1) > 0 THEN
    DELETE FROM public.journal_entry_lines
    WHERE company_id       = _company_id
      AND journal_entry_id = ANY(v_je_ids);

    DELETE FROM public.journal_entries
    WHERE company_id = _company_id
      AND id         = ANY(v_je_ids)
      AND status     = 'DRAFT';
  END IF;

  RETURN jsonb_build_object(
    'deleted_count', v_deleted,
    'skipped_count', v_skipped
  );
END;
$func$;

GRANT EXECUTE ON FUNCTION public.bulk_delete_cobros(uuid, uuid[])
  TO authenticated, service_role;

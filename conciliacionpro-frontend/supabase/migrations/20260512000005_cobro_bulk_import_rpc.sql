-- =============================================================
-- 20260512000005_cobro_bulk_import_rpc.sql
--
-- RPC para carga masiva de Cobros.
--
-- process_cobro_import_batch(p_company_id, p_docs)
--   Recibe un array JSONB de cobros, los procesa con SAVEPOINT
--   por elemento para aislar errores.
--   Crea: payment (BORRADOR), journal_entry (DRAFT),
--         journal_entry_lines, payment_allocation (si hay doc).
--   Retorna: {ok_count, error_count, results:[...]}
--
-- Columnas del Excel (A-U):
--   cobro_type, payment_date, counterparty_identifier, currency_code,
--   total_amount, payment_method, reference, description,
--   card_kind, card_last4, auth_code, bank_id,
--   alloc_doc_class, alloc_doc_number, alloc_amount,
--   account_debe, account_haber,
--   branch_code_debe, branch_code_haber,
--   business_line_code_debe, business_line_code_haber
-- =============================================================

CREATE OR REPLACE FUNCTION public.process_cobro_import_batch(
  p_company_id  uuid,
  p_docs        jsonb   -- array de objetos cobro
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_doc             jsonb;
  v_ok_count        int   := 0;
  v_error_count     int   := 0;
  v_results         jsonb[] := '{}';

  -- Identificadores
  v_payment_id      uuid;
  v_je_id           uuid;
  v_cp_id           uuid;
  v_acc_debe_id     uuid;
  v_acc_haber_id    uuid;
  v_acc_debe_name   text;
  v_acc_haber_name  text;
  v_bl_debe_id      uuid;
  v_bl_haber_id     uuid;
  v_branch_debe_id  uuid;
  v_branch_haber_id uuid;
  v_alloc_doc_id    uuid;

  -- Campos del cobro
  v_cobro_type      text;
  v_payment_type    text;
  v_payment_date    date;
  v_reference       text;
  v_cp_identifier   text;
  v_currency        text;
  v_total_amount    numeric;
  v_description     text;
  v_pay_method      text;
  v_card_kind       text;
  v_card_last4      text;
  v_auth_code       text;
  v_bank_id         text;
  -- Doc. a asociar
  v_alloc_doc_class  text;
  v_alloc_doc_number text;
  v_alloc_doc_type   text;    -- para FISCAL: código SII (33,34,56,61…); para NON_FISCAL: doc_type (OTRO_INGRESO,DEVOLUCION)
  v_alloc_amount    numeric;
  -- Asiento
  v_acc_debe_code   text;
  v_acc_haber_code  text;
  v_br_debe_code    text;
  v_br_haber_code   text;
  v_bl_debe_code    text;
  v_bl_haber_code   text;

  v_period_id       uuid;
  v_row_no          int;
  v_line_desc       text;
  v_error_msg       text;
BEGIN
  -- Período contable vigente (el más reciente abierto)
  SELECT id INTO v_period_id
  FROM public.accounting_periods
  WHERE company_id = p_company_id
    AND upper(coalesce(status, '')) IN ('ABIERTO', 'OPEN', 'ACTIVE')
  ORDER BY start_date DESC
  LIMIT 1;

  v_row_no := 0;

  FOR v_doc IN SELECT jsonb_array_elements(p_docs) LOOP
    v_row_no := v_row_no + 1;

    BEGIN
      -- ── 1. Leer campos ───────────────────────────────────────────────────────
      v_cobro_type      := upper(trim(coalesce(v_doc->>'cobro_type',   'COBRO')));
      v_payment_date    := nullif(trim(coalesce(v_doc->>'payment_date','')), '')::date;
      v_reference       := nullif(trim(coalesce(v_doc->>'reference',   '')), '');
      v_cp_identifier   := trim(coalesce(v_doc->>'counterparty_identifier', ''));
      v_currency        := upper(trim(coalesce(v_doc->>'currency_code','CLP')));
      v_total_amount    := coalesce((v_doc->>'total_amount')::numeric, 0);
      v_description     := nullif(trim(coalesce(v_doc->>'description', '')), '');
      v_pay_method      := nullif(upper(trim(coalesce(v_doc->>'payment_method', ''))), '');
      v_card_kind       := nullif(upper(trim(coalesce(v_doc->>'card_kind',  ''))), '');
      v_card_last4      := nullif(trim(coalesce(v_doc->>'card_last4',  '')), '');
      v_auth_code       := nullif(trim(coalesce(v_doc->>'auth_code',   '')), '');
      v_bank_id         := nullif(trim(coalesce(v_doc->>'bank_id',     '')), '');
      -- doc a asociar
      v_alloc_doc_class  := nullif(upper(trim(coalesce(v_doc->>'alloc_doc_class',  ''))), '');
      v_alloc_doc_number := nullif(trim(coalesce(v_doc->>'alloc_doc_number', '')), '');
      v_alloc_doc_type   := nullif(trim(coalesce(v_doc->>'alloc_doc_type',   '')), '');
      v_alloc_amount    := CASE WHEN nullif(trim(coalesce(v_doc->>'alloc_amount','')),'') IS NULL
                               THEN NULL
                               ELSE (v_doc->>'alloc_amount')::numeric END;
      -- asiento
      v_acc_debe_code   := nullif(trim(coalesce(v_doc->>'account_debe',  '')), '');
      v_acc_haber_code  := nullif(trim(coalesce(v_doc->>'account_haber', '')), '');
      v_br_debe_code    := nullif(trim(coalesce(v_doc->>'branch_code_debe',  '')), '');
      v_br_haber_code   := nullif(trim(coalesce(v_doc->>'branch_code_haber', '')), '');
      v_bl_debe_code    := nullif(trim(coalesce(v_doc->>'business_line_code_debe',  '')), '');
      v_bl_haber_code   := nullif(trim(coalesce(v_doc->>'business_line_code_haber', '')), '');

      -- ── 2. Normalizar cobro_type → payment_type ─────────────────────────────
      IF v_cobro_type IN ('AJUSTE', 'AJUSTE_COBRO') THEN
        v_payment_type := 'AJUSTE_COBRO';
      ELSE
        v_payment_type := 'COBRO';
      END IF;

      -- ── 3. Validaciones obligatorias ─────────────────────────────────────────
      IF v_payment_date IS NULL THEN
        RAISE EXCEPTION 'payment_date es obligatorio (fila %)', v_row_no;
      END IF;
      IF v_cp_identifier = '' OR v_cp_identifier IS NULL THEN
        RAISE EXCEPTION 'counterparty_identifier es obligatorio (fila %)', v_row_no;
      END IF;
      IF v_total_amount = 0 THEN
        RAISE EXCEPTION 'total_amount debe ser distinto de 0 (fila %)', v_row_no;
      END IF;
      IF v_payment_type = 'COBRO' AND v_pay_method IS NULL THEN
        RAISE EXCEPTION 'payment_method es obligatorio para tipo COBRO (fila %)', v_row_no;
      END IF;
      IF v_acc_debe_code IS NULL THEN
        RAISE EXCEPTION 'account_debe es obligatorio (fila %)', v_row_no;
      END IF;
      IF v_acc_haber_code IS NULL THEN
        RAISE EXCEPTION 'account_haber es obligatorio (fila %)', v_row_no;
      END IF;

      -- ── 4. Resolver / crear contraparte ──────────────────────────────────────
      SELECT id INTO v_cp_id
      FROM public.counterparties
      WHERE company_id = p_company_id
        AND upper(trim(identifier)) = upper(trim(v_cp_identifier))
      LIMIT 1;

      IF v_cp_id IS NULL THEN
        INSERT INTO public.counterparties (company_id, identifier, name, counterparty_type)
        VALUES (
          p_company_id,
          v_cp_identifier,
          v_cp_identifier,   -- sin counterparty_name en el Excel; se actualiza después si es necesario
          'CUSTOMER'
        )
        RETURNING id INTO v_cp_id;
      END IF;

      -- ── 5. Resolver cuentas contables ─────────────────────────────────────────
      SELECT id, name INTO v_acc_debe_id, v_acc_debe_name
      FROM public.account_nodes
      WHERE company_id = p_company_id AND code = v_acc_debe_code
      LIMIT 1;
      IF v_acc_debe_id IS NULL THEN
        RAISE EXCEPTION 'account_debe "%" no encontrada (fila %)', v_acc_debe_code, v_row_no;
      END IF;

      SELECT id, name INTO v_acc_haber_id, v_acc_haber_name
      FROM public.account_nodes
      WHERE company_id = p_company_id AND code = v_acc_haber_code
      LIMIT 1;
      IF v_acc_haber_id IS NULL THEN
        RAISE EXCEPTION 'account_haber "%" no encontrada (fila %)', v_acc_haber_code, v_row_no;
      END IF;

      -- ── 6. Resolver sucursales ────────────────────────────────────────────────
      v_branch_debe_id  := NULL;
      v_branch_haber_id := NULL;
      IF v_br_debe_code IS NOT NULL THEN
        SELECT id INTO v_branch_debe_id FROM public.branches
        WHERE company_id = p_company_id
          AND upper(trim(code)) = upper(v_br_debe_code) LIMIT 1;
      END IF;
      IF v_br_haber_code IS NOT NULL THEN
        SELECT id INTO v_branch_haber_id FROM public.branches
        WHERE company_id = p_company_id
          AND upper(trim(code)) = upper(v_br_haber_code) LIMIT 1;
      END IF;

      -- ── 7. Resolver líneas de negocio ─────────────────────────────────────────
      v_bl_debe_id  := NULL;
      v_bl_haber_id := NULL;
      IF v_bl_debe_code IS NOT NULL THEN
        SELECT id INTO v_bl_debe_id FROM public.business_lines
        WHERE company_id = p_company_id
          AND upper(trim(code)) = upper(v_bl_debe_code) LIMIT 1;
      END IF;
      IF v_bl_haber_code IS NOT NULL THEN
        SELECT id INTO v_bl_haber_id FROM public.business_lines
        WHERE company_id = p_company_id
          AND upper(trim(code)) = upper(v_bl_haber_code) LIMIT 1;
      END IF;

      -- ── 8. Crear journal_entry (DRAFT) ────────────────────────────────────────
      v_line_desc := trim(concat_ws(' · ',
        CASE v_payment_type WHEN 'AJUSTE_COBRO' THEN 'Ajuste cobro' ELSE 'Cobro' END,
        coalesce(v_reference, ''),
        v_cp_identifier
      ));

      INSERT INTO public.journal_entries (
        company_id, accounting_period_id, entry_date,
        description, currency_code, status,
        created_by, posted_at, posted_by, extra
      ) VALUES (
        p_company_id, v_period_id, v_payment_date,
        v_line_desc, v_currency, 'DRAFT',
        null, null, null,
        jsonb_build_object('source', 'cobros_import')
      )
      RETURNING id INTO v_je_id;

      -- ── 9. Insertar líneas del asiento (DEBE y HABER) ─────────────────────────
      INSERT INTO public.journal_entry_lines (
        journal_entry_id, company_id, line_no,
        account_node_id, account_code_snapshot, account_name_snapshot,
        line_description,
        debit, credit,
        branch_id, business_line_id
      ) VALUES (
        v_je_id, p_company_id, 1,
        v_acc_debe_id,  v_acc_debe_code,  v_acc_debe_name,
        v_line_desc,
        abs(v_total_amount), 0,
        v_branch_debe_id, v_bl_debe_id
      );

      INSERT INTO public.journal_entry_lines (
        journal_entry_id, company_id, line_no,
        account_node_id, account_code_snapshot, account_name_snapshot,
        line_description,
        debit, credit,
        branch_id, business_line_id
      ) VALUES (
        v_je_id, p_company_id, 2,
        v_acc_haber_id, v_acc_haber_code, v_acc_haber_name,
        v_line_desc,
        0, abs(v_total_amount),
        v_branch_haber_id, v_bl_haber_id
      );

      -- ── 10. Crear payment (BORRADOR) ──────────────────────────────────────────
      INSERT INTO public.payments (
        company_id,
        payment_type,
        status,
        method,
        card_kind,
        card_last4,
        auth_code,
        payment_date,
        reference,
        notes,
        total_amount,
        currency_code,
        counterparty_id,
        journal_entry_id,
        extra
      ) VALUES (
        p_company_id,
        v_payment_type,
        'BORRADOR',
        CASE WHEN v_payment_type = 'COBRO' THEN v_pay_method ELSE NULL END,
        v_card_kind,
        v_card_last4,
        v_auth_code,
        v_payment_date,
        v_reference,
        v_description,
        v_total_amount,
        v_currency,
        v_cp_id,
        v_je_id,
        jsonb_strip_nulls(jsonb_build_object(
          'source',  'cobros_import',
          'bank_id', v_bank_id
        ))
      )
      RETURNING id INTO v_payment_id;

      -- ── 11. Actualizar journal_entry.extra con el payment_id ─────────────────
      UPDATE public.journal_entries
      SET extra = extra || jsonb_build_object('cobro_id', v_payment_id)
      WHERE id = v_je_id;

      -- ── 12. Asociar documento a cobrar (allocation) ──────────────────────────
      IF v_alloc_doc_number IS NOT NULL THEN
        SELECT id INTO v_alloc_doc_id
        FROM public.trade_docs
        WHERE company_id = p_company_id
          AND number = v_alloc_doc_number
          AND (v_alloc_doc_class IS NULL OR doc_class = v_alloc_doc_class)
          AND (
            v_alloc_doc_type IS NULL
            OR (doc_class = 'FISCAL'     AND fiscal_doc_code = v_alloc_doc_type)
            OR (doc_class = 'NON_FISCAL' AND doc_type        = v_alloc_doc_type)
          )
          AND status = 'VIGENTE'
        ORDER BY issue_date DESC
        LIMIT 1;

        IF v_alloc_doc_id IS NOT NULL THEN
          INSERT INTO public.payment_allocations (
            company_id, payment_id, trade_doc_id, allocated_amount
          ) VALUES (
            p_company_id,
            v_payment_id,
            v_alloc_doc_id,
            coalesce(v_alloc_amount, abs(v_total_amount))
          );
        END IF;
        -- No es error si el doc no se encuentra (puede no estar registrado aún)
      END IF;

      -- ── 13. Éxito ────────────────────────────────────────────────────────────
      v_ok_count := v_ok_count + 1;
      v_results  := array_append(v_results, jsonb_build_object(
        'row_no',     v_row_no,
        'status',     'OK',
        'payment_id', v_payment_id,
        'number',     coalesce(v_reference, ''),
        'message',    'Creado correctamente'
      ));

    EXCEPTION WHEN OTHERS THEN
      v_error_count := v_error_count + 1;
      v_results     := array_append(v_results, jsonb_build_object(
        'row_no',     v_row_no,
        'status',     'ERROR',
        'payment_id', null,
        'number',     coalesce(v_reference, ''),
        'message',    SQLERRM
      ));
    END;

  END LOOP;

  RETURN jsonb_build_object(
    'ok_count',    v_ok_count,
    'error_count', v_error_count,
    'results',     to_jsonb(v_results)
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.process_cobro_import_batch(uuid, jsonb)
  TO authenticated, service_role;

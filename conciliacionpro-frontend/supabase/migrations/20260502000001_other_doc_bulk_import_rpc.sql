-- =========================================================
-- 20260502000001_other_doc_bulk_import_rpc.sql
--
-- RPC para carga masiva de Otros Documentos de Ingresos
-- (OTRO_INGRESO y DEVOLUCION — doc_class = NON_FISCAL)
--
-- process_other_doc_import_batch(p_company_id, p_docs)
--   Recibe un array JSONB de documentos, los procesa en
--   lotes con SAVEPOINT por documento para aislar errores.
--   Crea: trade_doc (BORRADOR), journal_entry (DRAFT),
--         journal_entry_lines, payment + payment_allocation.
--   Retorna: {ok_count, error_count, results:[...]}
-- =========================================================

CREATE OR REPLACE FUNCTION public.process_other_doc_import_batch(
  p_company_id  uuid,
  p_docs        jsonb   -- array de objetos doc
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_doc            jsonb;
  v_ok_count       int  := 0;
  v_error_count    int  := 0;
  v_results        jsonb[] := '{}';

  -- helpers
  v_doc_id         uuid;
  v_je_id          uuid;
  v_cp_id          uuid;
  v_branch_id      uuid;
  v_origin_doc_id  uuid;
  v_acc_debe_id    uuid;
  v_acc_haber_id   uuid;
  v_bl_debe_id     uuid;
  v_bl_haber_id    uuid;
  v_branch_debe_id uuid;
  v_branch_haber_id uuid;

  -- campos del doc
  v_doc_type           text;
  v_nf_code            text;
  v_issue_date         date;
  v_due_date           date;
  v_series             text;
  v_number             text;
  v_currency           text;
  v_branch_code        text;
  v_cp_identifier      text;
  v_cp_name            text;
  v_grand_total        numeric;
  v_reference          text;
  v_origin_doc_type    text;
  v_origin_fdc         text;
  v_origin_number      text;
  v_pay_date           date;
  v_pay_method         text;
  v_pay_amount         numeric;
  v_pay_reference      text;
  v_acc_debe_code      text;
  v_acc_haber_code     text;
  v_br_debe_code       text;
  v_br_haber_code      text;
  v_bl_debe_code       text;
  v_bl_haber_code      text;
  v_balance            numeric;

  v_pay_id             uuid;
  v_period_id          uuid;
  v_row_no             int;
  v_error_msg          text;
BEGIN
  -- Obtener período contable abierto (puede ser null — opcional)
  SELECT id INTO v_period_id
  FROM public.accounting_periods
  WHERE company_id = p_company_id
    AND upper(coalesce(status,'')) IN ('ABIERTO','OPEN','ACTIVE')
  ORDER BY start_date DESC
  LIMIT 1;

  v_row_no := 0;

  FOR v_doc IN SELECT jsonb_array_elements(p_docs) LOOP
    v_row_no := v_row_no + 1;

    -- Leer campos
    v_doc_type        := upper(trim(coalesce(v_doc->>'doc_type',      'OTRO_INGRESO')));
    v_nf_code         := nullif(trim(coalesce(v_doc->>'non_fiscal_doc_code', '')), '');
    v_issue_date      := nullif(trim(coalesce(v_doc->>'issue_date',   '')), '')::date;
    v_due_date        := nullif(trim(coalesce(v_doc->>'due_date',     '')), '')::date;
    v_series          := nullif(trim(coalesce(v_doc->>'series',       '')), '');
    v_number          := nullif(trim(coalesce(v_doc->>'number',       '')), '');
    v_currency        := upper(trim(coalesce(v_doc->>'currency_code', 'CLP')));
    v_branch_code     := nullif(trim(coalesce(v_doc->>'branch_code',  '')), '');
    v_cp_identifier   := trim(coalesce(v_doc->>'counterparty_identifier', ''));
    v_cp_name         := trim(coalesce(v_doc->>'counterparty_name',   ''));
    v_grand_total     := coalesce((v_doc->>'grand_total')::numeric, 0);
    v_reference       := nullif(trim(coalesce(v_doc->>'reference',    '')), '');
    v_origin_doc_type := nullif(upper(trim(coalesce(v_doc->>'origin_doc_type',       ''))), '');
    v_origin_fdc      := nullif(trim(coalesce(v_doc->>'origin_fiscal_doc_code', '')), '');
    v_origin_number   := nullif(trim(coalesce(v_doc->>'origin_number', '')), '');
    v_pay_date        := nullif(trim(coalesce(v_doc->>'payment_date',  '')), '')::date;
    v_pay_method      := nullif(upper(trim(coalesce(v_doc->>'payment_method', ''))), '');
    v_pay_amount      := coalesce((v_doc->>'payment_amount')::numeric, 0);
    v_pay_reference   := nullif(trim(coalesce(v_doc->>'payment_reference', '')), '');
    v_acc_debe_code   := nullif(trim(coalesce(v_doc->>'account_debe',  '')), '');
    v_acc_haber_code  := nullif(trim(coalesce(v_doc->>'account_haber', '')), '');
    v_br_debe_code    := nullif(trim(coalesce(v_doc->>'branch_code_debe',  '')), '');
    v_br_haber_code   := nullif(trim(coalesce(v_doc->>'branch_code_haber', '')), '');
    v_bl_debe_code    := nullif(trim(coalesce(v_doc->>'business_line_code_debe',  '')), '');
    v_bl_haber_code   := nullif(trim(coalesce(v_doc->>'business_line_code_haber', '')), '');

    -- Normalizar doc_type
    IF v_doc_type IN ('DEV','DEVOLUCIÓN','DEVOLUCION') THEN
      v_doc_type := 'DEVOLUCION';
    ELSE
      v_doc_type := 'OTRO_INGRESO';
    END IF;

    -- Comenzar bloque con manejo de errores (subtransacción implícita en PL/pgSQL)
    BEGIN

      -- ── 1. Resolver contraparte ───────────────────────────────────────────
      IF v_cp_identifier = '' OR v_cp_identifier IS NULL THEN
        RAISE EXCEPTION 'counterparty_identifier vacío en fila %', v_row_no;
      END IF;
      IF v_cp_name = '' OR v_cp_name IS NULL THEN
        RAISE EXCEPTION 'counterparty_name vacío en fila %', v_row_no;
      END IF;

      -- Buscar por identifier normalizado
      SELECT id INTO v_cp_id
      FROM public.counterparties
      WHERE company_id = p_company_id
        AND is_active = true
        AND upper(regexp_replace(identifier, '[^0-9A-Za-z]', '', 'g'))
            = upper(regexp_replace(v_cp_identifier, '[^0-9A-Za-z]', '', 'g'))
      LIMIT 1;

      -- Si no existe, crear
      IF v_cp_id IS NULL THEN
        INSERT INTO public.counterparties (company_id, identifier, name, is_active)
        VALUES (p_company_id, v_cp_identifier, v_cp_name, true)
        RETURNING id INTO v_cp_id;
      END IF;

      -- ── 2. Resolver sucursal ──────────────────────────────────────────────
      v_branch_id := NULL;
      IF v_branch_code IS NOT NULL THEN
        SELECT id INTO v_branch_id
        FROM public.branches
        WHERE company_id = p_company_id
          AND upper(code) = upper(v_branch_code)
          AND is_active = true
        LIMIT 1;
      END IF;

      -- ── 3. Resolver doc de origen (solo DEVOLUCION) ───────────────────────
      v_origin_doc_id := NULL;
      IF v_doc_type = 'DEVOLUCION' AND v_origin_number IS NOT NULL THEN
        SELECT td.id INTO v_origin_doc_id
        FROM public.trade_docs td
        WHERE td.company_id = p_company_id
          AND upper(coalesce(td.status,'')) = 'VIGENTE'
          AND (
            -- FISCAL: buscar por fiscal_doc_code + number
            (v_origin_fdc IS NOT NULL AND upper(coalesce(td.fiscal_doc_code,'')) = upper(v_origin_fdc)
             AND upper(coalesce(td.number,'')) = upper(v_origin_number))
            OR
            -- cualquier tipo: buscar solo por number si no hay código
            (v_origin_fdc IS NULL AND upper(coalesce(td.number,'')) = upper(v_origin_number))
          )
          AND (v_origin_doc_type IS NULL
               OR upper(coalesce(td.doc_type,'')) = v_origin_doc_type)
        ORDER BY td.issue_date DESC
        LIMIT 1;
      END IF;

      -- ── 4. Resolver cuentas contables ─────────────────────────────────────
      v_acc_debe_id := NULL;
      IF v_acc_debe_code IS NOT NULL THEN
        SELECT id INTO v_acc_debe_id
        FROM public.account_nodes
        WHERE company_id = p_company_id
          AND code = v_acc_debe_code
        LIMIT 1;
        IF v_acc_debe_id IS NULL THEN
          RAISE EXCEPTION 'Cuenta DEBE "%" no encontrada en fila %', v_acc_debe_code, v_row_no;
        END IF;
      END IF;

      v_acc_haber_id := NULL;
      IF v_acc_haber_code IS NOT NULL THEN
        SELECT id INTO v_acc_haber_id
        FROM public.account_nodes
        WHERE company_id = p_company_id
          AND code = v_acc_haber_code
        LIMIT 1;
        IF v_acc_haber_id IS NULL THEN
          RAISE EXCEPTION 'Cuenta HABER "%" no encontrada en fila %', v_acc_haber_code, v_row_no;
        END IF;
      END IF;

      -- ── 5. Resolver sucursales de segmentación ─────────────────────────────
      v_branch_debe_id  := NULL;
      v_branch_haber_id := NULL;
      IF v_br_debe_code IS NOT NULL THEN
        SELECT id INTO v_branch_debe_id FROM public.branches
        WHERE company_id = p_company_id AND upper(code) = upper(v_br_debe_code) AND is_active = true LIMIT 1;
      END IF;
      IF v_br_haber_code IS NOT NULL THEN
        SELECT id INTO v_branch_haber_id FROM public.branches
        WHERE company_id = p_company_id AND upper(code) = upper(v_br_haber_code) AND is_active = true LIMIT 1;
      END IF;

      -- ── 6. Resolver líneas de negocio ─────────────────────────────────────
      v_bl_debe_id  := NULL;
      v_bl_haber_id := NULL;
      IF v_bl_debe_code IS NOT NULL THEN
        SELECT id INTO v_bl_debe_id FROM public.business_lines
        WHERE company_id = p_company_id AND upper(code) = upper(v_bl_debe_code) AND is_active = true LIMIT 1;
      END IF;
      IF v_bl_haber_code IS NOT NULL THEN
        SELECT id INTO v_bl_haber_id FROM public.business_lines
        WHERE company_id = p_company_id AND upper(code) = upper(v_bl_haber_code) AND is_active = true LIMIT 1;
      END IF;

      -- ── 7. Calcular balance inicial ───────────────────────────────────────
      v_balance := CASE
        WHEN v_pay_amount > 0 THEN greatest(v_grand_total - v_pay_amount, 0)
        ELSE v_grand_total
      END;

      -- ── 8. Insertar trade_doc ─────────────────────────────────────────────
      INSERT INTO public.trade_docs (
        company_id, doc_type, doc_class, status,
        non_fiscal_doc_code, issue_date, due_date,
        series, number, currency_code, branch_id,
        counterparty_id, counterparty_identifier_snapshot, counterparty_name_snapshot,
        grand_total, balance, reference, origin_doc_id
      ) VALUES (
        p_company_id, v_doc_type, 'NON_FISCAL', 'BORRADOR',
        v_nf_code, v_issue_date, coalesce(v_due_date, v_issue_date),
        v_series, v_number, v_currency, v_branch_id,
        v_cp_id, v_cp_identifier, v_cp_name,
        v_grand_total, v_balance, v_reference, v_origin_doc_id
      )
      RETURNING id INTO v_doc_id;

      -- ── 9. Insertar journal_entry (DRAFT) ─────────────────────────────────
      INSERT INTO public.journal_entries (
        company_id, trade_doc_id, status, entry_date,
        description, currency_code, accounting_period_id
      ) VALUES (
        p_company_id, v_doc_id, 'DRAFT', v_issue_date,
        coalesce(v_nf_code, v_doc_type) ||
          coalesce(' ' || v_number, '') ||
          coalesce(' · ' || v_cp_name, ''),
        v_currency,
        v_period_id
      )
      RETURNING id INTO v_je_id;

      -- Enlazar JE al trade_doc
      UPDATE public.trade_docs SET journal_entry_id = v_je_id
      WHERE id = v_doc_id AND company_id = p_company_id;

      -- ── 10. Insertar líneas del asiento (si se proporcionaron cuentas) ─────
      IF v_acc_debe_id IS NOT NULL OR v_acc_haber_id IS NOT NULL THEN
        -- Línea DEBE
        IF v_acc_debe_id IS NOT NULL AND v_grand_total > 0 THEN
          INSERT INTO public.journal_entry_lines (
            journal_entry_id, company_id, line_no, account_node_id,
            description, debit, credit, branch_id, business_line_id
          ) VALUES (
            v_je_id, p_company_id, 1, v_acc_debe_id,
            coalesce(v_reference, v_doc_type || ' ' || coalesce(v_number, '')),
            v_grand_total, 0,
            v_branch_debe_id,
            v_bl_debe_id
          );
        END IF;

        -- Línea HABER
        IF v_acc_haber_id IS NOT NULL AND v_grand_total > 0 THEN
          INSERT INTO public.journal_entry_lines (
            journal_entry_id, company_id, line_no, account_node_id,
            description, debit, credit, branch_id, business_line_id
          ) VALUES (
            v_je_id, p_company_id, 2, v_acc_haber_id,
            coalesce(v_reference, v_doc_type || ' ' || coalesce(v_number, '')),
            0, v_grand_total,
            v_branch_haber_id,
            v_bl_haber_id
          );
        END IF;
      END IF;

      -- ── 11. Insertar pago (si se proporcionó) ─────────────────────────────
      IF v_pay_amount > 0 AND v_pay_method IS NOT NULL THEN
        INSERT INTO public.payments (
          company_id, payment_date, method, amount, reference,
          currency_code, status
        ) VALUES (
          p_company_id,
          coalesce(v_pay_date, v_issue_date),
          v_pay_method,
          v_pay_amount,
          v_pay_reference,
          v_currency,
          'APPLIED'
        )
        RETURNING id INTO v_pay_id;

        INSERT INTO public.payment_allocations (
          company_id, payment_id, trade_doc_id, allocated_amount
        ) VALUES (
          p_company_id, v_pay_id, v_doc_id, v_pay_amount
        );

        -- Actualizar balance con pago
        v_balance := greatest(v_grand_total - v_pay_amount, 0);
        UPDATE public.trade_docs SET balance = v_balance
        WHERE id = v_doc_id AND company_id = p_company_id;
      END IF;

      -- ── 12. Éxito ─────────────────────────────────────────────────────────
      v_ok_count := v_ok_count + 1;
      v_results := array_append(v_results, jsonb_build_object(
        'row_no', v_row_no,
        'status', 'OK',
        'trade_doc_id', v_doc_id,
        'number', coalesce(v_number, ''),
        'message', 'Creado correctamente'
      ));

    EXCEPTION WHEN OTHERS THEN
      -- El bloque EXCEPTION en PL/pgSQL realiza rollback automático del bloque
      v_error_count := v_error_count + 1;
      v_error_msg := SQLERRM;
      v_results := array_append(v_results, jsonb_build_object(
        'row_no', v_row_no,
        'status', 'ERROR',
        'trade_doc_id', null,
        'number', coalesce(v_number, ''),
        'message', v_error_msg
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

-- Permisos
GRANT EXECUTE ON FUNCTION public.process_other_doc_import_batch(uuid, jsonb)
  TO authenticated, service_role;

-- =========================================================
-- 20260502000005_other_doc_import_fix_payment_columns.sql
--
-- Corrige columnas del INSERT en public.payments dentro de
-- process_other_doc_import_batch:
--   ANTES (incorrecto): amount, status
--   AHORA (correcto)  : total_amount, extra (JSONB con source)
-- =========================================================

CREATE OR REPLACE FUNCTION public.process_other_doc_import_batch(
  p_company_id  uuid,
  p_docs        jsonb
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

  v_doc_id          uuid;
  v_je_id           uuid;
  v_cp_id           uuid;
  v_branch_id       uuid;
  v_origin_doc_id   uuid;
  v_acc_debe_id     uuid;
  v_acc_haber_id    uuid;
  v_bl_debe_id      uuid;
  v_bl_haber_id     uuid;
  v_branch_debe_id  uuid;
  v_branch_haber_id uuid;

  v_acc_debe_name   text;
  v_acc_haber_name  text;

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
  v_card_kind          text;
  v_card_last4         text;
  v_auth_code          text;
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
  v_line_desc          text;
BEGIN
  SELECT id INTO v_period_id
  FROM public.accounting_periods
  WHERE company_id = p_company_id
    AND upper(coalesce(status,'')) IN ('ABIERTO','OPEN','ACTIVE')
  ORDER BY start_date DESC
  LIMIT 1;

  v_row_no := 0;

  FOR v_doc IN SELECT jsonb_array_elements(p_docs) LOOP
    v_row_no := v_row_no + 1;

    BEGIN
      -- ── 1. Leer campos ──────────────────────────────────────────────────────
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
      v_card_kind       := nullif(upper(trim(coalesce(v_doc->>'card_kind',  ''))), '');
      v_card_last4      := nullif(trim(coalesce(v_doc->>'card_last4', '')), '');
      v_auth_code       := nullif(trim(coalesce(v_doc->>'auth_code',  '')), '');
      v_acc_debe_code   := nullif(trim(coalesce(v_doc->>'account_debe',  '')), '');
      v_acc_haber_code  := nullif(trim(coalesce(v_doc->>'account_haber', '')), '');
      v_br_debe_code    := nullif(trim(coalesce(v_doc->>'branch_code_debe',  '')), '');
      v_br_haber_code   := nullif(trim(coalesce(v_doc->>'branch_code_haber', '')), '');
      v_bl_debe_code    := nullif(trim(coalesce(v_doc->>'business_line_code_debe',  '')), '');
      v_bl_haber_code   := nullif(trim(coalesce(v_doc->>'business_line_code_haber', '')), '');

      -- ── 2. Normalizar doc_type ──────────────────────────────────────────────
      IF v_doc_type IN ('DEV','DEVOLUCIÓN','DEVOLUCION') THEN
        v_doc_type := 'DEVOLUCION';
      ELSE
        v_doc_type := 'OTRO_INGRESO';
      END IF;

      -- ── 3. Validaciones básicas ─────────────────────────────────────────────
      IF v_issue_date IS NULL THEN
        RAISE EXCEPTION 'issue_date es obligatorio (fila %)', v_row_no;
      END IF;
      IF v_number IS NULL THEN
        RAISE EXCEPTION 'number es obligatorio (fila %)', v_row_no;
      END IF;
      IF v_cp_identifier = '' OR v_cp_identifier IS NULL THEN
        RAISE EXCEPTION 'counterparty_identifier es obligatorio (fila %)', v_row_no;
      END IF;
      IF v_grand_total <= 0 THEN
        RAISE EXCEPTION 'grand_total debe ser > 0 (fila %)', v_row_no;
      END IF;
      IF v_acc_debe_code IS NULL THEN
        RAISE EXCEPTION 'account_debe es obligatorio (fila %)', v_row_no;
      END IF;
      IF v_acc_haber_code IS NULL THEN
        RAISE EXCEPTION 'account_haber es obligatorio (fila %)', v_row_no;
      END IF;

      -- ── 4. Resolver / crear contraparte ────────────────────────────────────
      SELECT id INTO v_cp_id
      FROM public.counterparties
      WHERE company_id = p_company_id
        AND upper(trim(identifier)) = upper(trim(v_cp_identifier))
      LIMIT 1;

      IF v_cp_id IS NULL THEN
        INSERT INTO public.counterparties (company_id, identifier, name, counterparty_type)
        VALUES (p_company_id, v_cp_identifier, coalesce(nullif(v_cp_name,''), v_cp_identifier), 'CUSTOMER')
        RETURNING id INTO v_cp_id;
      END IF;

      -- ── 5. Resolver sucursal (cabecera) ─────────────────────────────────────
      v_branch_id := NULL;
      IF v_branch_code IS NOT NULL THEN
        SELECT id INTO v_branch_id
        FROM public.branches
        WHERE company_id = p_company_id
          AND upper(trim(code)) = upper(v_branch_code)
        LIMIT 1;
      END IF;

      -- ── 6. Resolver documento de origen (solo DEVOLUCION) ───────────────────
      v_origin_doc_id := NULL;
      IF v_doc_type = 'DEVOLUCION' AND v_origin_number IS NOT NULL THEN
        SELECT td.id INTO v_origin_doc_id
        FROM public.trade_docs td
        WHERE td.company_id = p_company_id
          AND td.number = v_origin_number
          AND (v_origin_doc_type IS NULL OR upper(td.doc_type) = upper(v_origin_doc_type))
          AND (v_origin_fdc IS NULL OR td.fiscal_doc_code::text = v_origin_fdc)
        ORDER BY td.issue_date DESC
        LIMIT 1;
      END IF;

      -- ── 7. Resolver cuentas contables (con nombre para snapshot) ────────────
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

      -- ── 8. Resolver sucursales de línea ─────────────────────────────────────
      v_branch_debe_id  := NULL;
      v_branch_haber_id := NULL;
      IF v_br_debe_code IS NOT NULL THEN
        SELECT id INTO v_branch_debe_id FROM public.branches
        WHERE company_id = p_company_id AND upper(trim(code)) = upper(v_br_debe_code) LIMIT 1;
      END IF;
      IF v_br_haber_code IS NOT NULL THEN
        SELECT id INTO v_branch_haber_id FROM public.branches
        WHERE company_id = p_company_id AND upper(trim(code)) = upper(v_br_haber_code) LIMIT 1;
      END IF;

      -- ── 9. Resolver business lines ──────────────────────────────────────────
      v_bl_debe_id  := NULL;
      v_bl_haber_id := NULL;
      IF v_bl_debe_code IS NOT NULL THEN
        SELECT id INTO v_bl_debe_id FROM public.business_lines
        WHERE company_id = p_company_id AND upper(trim(code)) = upper(v_bl_debe_code) LIMIT 1;
      END IF;
      IF v_bl_haber_code IS NOT NULL THEN
        SELECT id INTO v_bl_haber_id FROM public.business_lines
        WHERE company_id = p_company_id AND upper(trim(code)) = upper(v_bl_haber_code) LIMIT 1;
      END IF;

      -- ── 10. Insertar trade_doc ──────────────────────────────────────────────
      INSERT INTO public.trade_docs (
        company_id, doc_class, doc_type, non_fiscal_doc_code,
        issue_date, due_date, series, number,
        currency_code, branch_id, counterparty_id,
        grand_total, balance, reference,
        origin_doc_id, status
      ) VALUES (
        p_company_id, 'NON_FISCAL', v_doc_type, v_nf_code,
        v_issue_date, coalesce(v_due_date, v_issue_date), v_series, v_number,
        v_currency, v_branch_id, v_cp_id,
        v_grand_total, v_grand_total, v_reference,
        v_origin_doc_id, 'BORRADOR'
      )
      RETURNING id INTO v_doc_id;

      -- ── 11. Insertar journal_entry + líneas ─────────────────────────────────
      v_line_desc := coalesce(v_reference, v_doc_type || ' ' || coalesce(v_number, ''));

      INSERT INTO public.journal_entries (
        company_id, accounting_period_id, entry_date, description,
        currency_code, status, created_by, posted_at, posted_by, extra
      ) VALUES (
        p_company_id, v_period_id, v_issue_date, v_line_desc,
        v_currency, 'DRAFT', null, null, null,
        jsonb_build_object('source', 'trade_docs_non_fiscal', 'trade_doc_id', v_doc_id)
      )
      RETURNING id INTO v_je_id;

      UPDATE public.trade_docs SET journal_entry_id = v_je_id
      WHERE id = v_doc_id AND company_id = p_company_id;

      INSERT INTO public.journal_entry_lines (
        journal_entry_id, company_id, line_no,
        account_node_id, account_code_snapshot, account_name_snapshot,
        line_description, debit, credit, branch_id, business_line_id
      ) VALUES (
        v_je_id, p_company_id, 1,
        v_acc_debe_id, v_acc_debe_code, v_acc_debe_name,
        v_line_desc, v_grand_total, 0,
        v_branch_debe_id, v_bl_debe_id
      );

      INSERT INTO public.journal_entry_lines (
        journal_entry_id, company_id, line_no,
        account_node_id, account_code_snapshot, account_name_snapshot,
        line_description, debit, credit, branch_id, business_line_id
      ) VALUES (
        v_je_id, p_company_id, 2,
        v_acc_haber_id, v_acc_haber_code, v_acc_haber_name,
        v_line_desc, 0, v_grand_total,
        v_branch_haber_id, v_bl_haber_id
      );

      -- ── 12. Insertar pago (si se proporcionó) ──────────────────────────────
      IF v_pay_amount > 0 AND v_pay_method IS NOT NULL THEN
        INSERT INTO public.payments (
          company_id,
          payment_date,
          method,
          total_amount,        -- ← columna correcta
          reference,
          card_kind,
          card_last4,
          auth_code,
          currency_code,
          notes,
          extra,
          created_by
        ) VALUES (
          p_company_id,
          coalesce(v_pay_date, v_issue_date),
          v_pay_method,
          v_pay_amount,
          v_pay_reference,
          v_card_kind,
          v_card_last4,
          v_auth_code,
          v_currency,
          null,
          jsonb_build_object(
            'source',       'trade_docs_non_fiscal',
            'trade_doc_id', v_doc_id
          ),
          null
        )
        RETURNING id INTO v_pay_id;

        INSERT INTO public.payment_allocations (
          company_id, payment_id, trade_doc_id, allocated_amount, created_by
        ) VALUES (
          p_company_id, v_pay_id, v_doc_id, v_pay_amount, null
        );

        v_balance := greatest(v_grand_total - v_pay_amount, 0);
        UPDATE public.trade_docs SET balance = v_balance
        WHERE id = v_doc_id AND company_id = p_company_id;
      END IF;

      -- ── 13. Éxito ───────────────────────────────────────────────────────────
      v_ok_count := v_ok_count + 1;
      v_results := array_append(v_results, jsonb_build_object(
        'row_no', v_row_no, 'status', 'OK',
        'trade_doc_id', v_doc_id,
        'number', coalesce(v_number, ''),
        'message', 'Creado correctamente'
      ));

    EXCEPTION WHEN OTHERS THEN
      v_error_count := v_error_count + 1;
      v_results := array_append(v_results, jsonb_build_object(
        'row_no', v_row_no, 'status', 'ERROR',
        'trade_doc_id', null,
        'number', coalesce(v_number, ''),
        'message', SQLERRM
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

GRANT EXECUTE ON FUNCTION public.process_other_doc_import_batch(uuid, jsonb)
  TO authenticated, service_role;

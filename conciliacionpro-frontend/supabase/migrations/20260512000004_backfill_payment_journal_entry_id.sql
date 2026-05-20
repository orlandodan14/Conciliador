-- =========================================================
-- 20260512000004_backfill_payment_journal_entry_id.sql
--
-- Objetivo: cada payment.journal_entry_id debe apuntar al
-- asiento contable que cubre esa cobranza, sea el asiento
-- propio del cobro (cobros manuales) o el del trade_doc
-- (importación masiva / registro directo con pago).
--
-- 1. Backfill datos existentes: copia trade_doc.journal_entry_id
--    al payment para todos los pagos que aún tienen NULL.
-- 2. Actualiza process_other_doc_import_batch para que los
--    pagos futuros incluyan journal_entry_id = v_je_id.
-- 3. Actualiza process_trade_doc_import_job para que los
--    pagos futuros incluyan journal_entry_id y counterparty_id.
-- =========================================================

-- ── 1. Backfill ───────────────────────────────────────────────────────────────
UPDATE public.payments p
SET    journal_entry_id = td.journal_entry_id
FROM   public.trade_docs td
WHERE  td.id                 = (p.extra->>'trade_doc_id')::uuid
  AND  td.company_id         = p.company_id
  AND  p.journal_entry_id    IS NULL
  AND  td.journal_entry_id   IS NOT NULL;

-- ── 2. process_other_doc_import_batch — agrega journal_entry_id al INSERT ────
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

      -- ── 7. Resolver cuentas contables ───────────────────────────────────────
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
          payment_type,
          status,
          payment_date,
          method,
          total_amount,
          reference,
          card_kind,
          card_last4,
          auth_code,
          currency_code,
          notes,
          journal_entry_id,
          extra,
          created_by,
          counterparty_id
        ) VALUES (
          p_company_id,
          CASE WHEN v_doc_type = 'DEVOLUCION' THEN 'PAGO' ELSE 'COBRO' END,
          'VIGENTE',
          coalesce(v_pay_date, v_issue_date),
          v_pay_method,
          v_pay_amount,
          v_pay_reference,
          v_card_kind,
          v_card_last4,
          v_auth_code,
          v_currency,
          null,
          v_je_id,
          jsonb_build_object(
            'source',       'trade_docs_non_fiscal',
            'trade_doc_id', v_doc_id
          ),
          null,
          v_cp_id
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


-- ── 3. process_trade_doc_import_job — agrega journal_entry_id + counterparty_id ──
CREATE OR REPLACE FUNCTION public.process_trade_doc_import_job(
  _job_id uuid,
  _company_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid;
  v_role text;
  v_doc record;
  v_trade_doc_id uuid;
  v_counterparty_id uuid;
  v_branch_id uuid;
  v_fiscal_doc_type_id uuid;
  v_origin_doc_id uuid;
  v_journal_entry_id uuid;
  v_ok_docs int := 0;
  v_error_docs int := 0;
  v_warning_docs int := 0;
  v_doc_total numeric := 0;
  v_payments_total numeric := 0;
  v_doc_type text;
  v_is_note boolean;
  v_has_lines boolean;
BEGIN
  v_uid := auth.uid();

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado.';
  END IF;

  IF _job_id IS NULL THEN
    RAISE EXCEPTION 'job_id es obligatorio.';
  END IF;

  IF _company_id IS NULL THEN
    RAISE EXCEPTION 'company_id es obligatorio.';
  END IF;

  SELECT cm.role
    INTO v_role
  FROM public.company_members cm
  WHERE cm.company_id = _company_id
    AND cm.user_id = v_uid
    AND upper(coalesce(cm.status, '')) = 'ACTIVE'
  LIMIT 1;

  IF v_role IS NULL OR upper(v_role) NOT IN ('OWNER', 'EDITOR') THEN
    RAISE EXCEPTION 'No tienes permisos para procesar importaciones en esta empresa.';
  END IF;

  UPDATE public.trade_doc_import_jobs
  SET status = 'PROCESSING',
      started_at = now()
  WHERE id = _job_id
    AND company_id = _company_id;

  FOR v_doc IN
    SELECT *
    FROM public.trade_doc_import_docs_stg d
    WHERE d.job_id = _job_id
      AND d.company_id = _company_id
    ORDER BY coalesce(d.source_row_no, 999999), d.created_at
  LOOP
    BEGIN
      v_trade_doc_id := NULL;
      v_counterparty_id := NULL;
      v_branch_id := NULL;
      v_fiscal_doc_type_id := NULL;
      v_origin_doc_id := NULL;
      v_journal_entry_id := NULL;
      v_doc_total := 0;
      v_payments_total := 0;
      v_doc_type := upper(trim(coalesce(v_doc.doc_type, '')));
      v_is_note := v_doc_type IN ('CREDIT_NOTE', 'DEBIT_NOTE');

      -- 1) validar cabecera mínima
      IF trim(coalesce(v_doc.doc_key, '')) = '' THEN
        RAISE EXCEPTION 'doc_key es obligatorio.';
      END IF;

      IF v_doc_type NOT IN ('INVOICE', 'CREDIT_NOTE', 'DEBIT_NOTE') THEN
        RAISE EXCEPTION 'doc_type % no es válido.', coalesce(v_doc.doc_type, '');
      END IF;

      IF trim(coalesce(v_doc.fiscal_doc_code, '')) = '' THEN
        RAISE EXCEPTION 'fiscal_doc_code es obligatorio.';
      END IF;

      IF v_doc.issue_date IS NULL THEN
        RAISE EXCEPTION 'issue_date es obligatorio.';
      END IF;

      IF v_doc.due_date IS NULL THEN
        RAISE EXCEPTION 'due_date es obligatorio.';
      END IF;

      IF trim(coalesce(v_doc.number, '')) = '' THEN
        RAISE EXCEPTION 'number es obligatorio.';
      END IF;

      IF trim(coalesce(v_doc.currency_code, '')) = '' THEN
        RAISE EXCEPTION 'currency_code es obligatorio.';
      END IF;

      IF trim(coalesce(v_doc.branch_code, '')) = '' THEN
        RAISE EXCEPTION 'branch_code es obligatorio.';
      END IF;

      IF trim(coalesce(v_doc.counterparty_identifier, '')) = '' THEN
        RAISE EXCEPTION 'counterparty_identifier es obligatorio.';
      END IF;

      IF trim(coalesce(v_doc.counterparty_name, '')) = '' THEN
        RAISE EXCEPTION 'counterparty_name es obligatorio.';
      END IF;

      -- 2) validar líneas
      SELECT EXISTS (
        SELECT 1
        FROM public.trade_doc_import_lines_stg l
        WHERE l.job_id = _job_id
          AND l.company_id = _company_id
          AND l.doc_key = v_doc.doc_key
      )
      INTO v_has_lines;

      IF NOT v_has_lines THEN
        RAISE EXCEPTION 'El documento no tiene líneas.';
      END IF;

      -- 3) validar duplicado interno dentro del mismo archivo
      IF EXISTS (
        SELECT 1
        FROM public.trade_doc_import_docs_stg d2
        WHERE d2.job_id = _job_id
          AND d2.company_id = _company_id
          AND d2.id <> v_doc.id
          AND upper(trim(coalesce(d2.fiscal_doc_code,''))) = upper(trim(coalesce(v_doc.fiscal_doc_code,'')))
          AND upper(trim(coalesce(d2.series,''))) = upper(trim(coalesce(v_doc.series,'')))
          AND upper(trim(coalesce(d2.number,''))) = upper(trim(coalesce(v_doc.number,'')))
      ) THEN
        RAISE EXCEPTION 'El folio está duplicado dentro del archivo.';
      END IF;

      -- 4) resolver tercero
      v_counterparty_id := public.resolve_or_create_import_counterparty(
        _company_id,
        v_doc.counterparty_identifier,
        v_doc.counterparty_name,
        v_uid
      );

      -- 5) resolver sucursal
      v_branch_id := public.resolve_import_branch(_company_id, v_doc.branch_code);

      -- 6) resolver tipo fiscal
      v_fiscal_doc_type_id := public.resolve_import_fiscal_doc_type(_company_id, v_doc.fiscal_doc_code);

      -- 7) resolver origen si NC/ND
      IF v_is_note THEN
        v_origin_doc_id := public.resolve_import_origin_doc(
          _company_id,
          v_doc.origin_fiscal_doc_code,
          v_doc.origin_series,
          v_doc.origin_number,
          v_counterparty_id
        );
      ELSE
        v_origin_doc_id := NULL;
      END IF;

      -- 8) validar pagos
      SELECT coalesce(sum(p.amount), 0)
      INTO v_payments_total
      FROM public.trade_doc_import_payments_stg p
      WHERE p.job_id = _job_id
        AND p.company_id = _company_id
        AND p.doc_key = v_doc.doc_key;

      IF v_is_note AND v_payments_total > 0 THEN
        RAISE EXCEPTION 'Las notas de crédito/débito no pueden traer pagos.';
      END IF;

      -- 9) insertar cabecera
      INSERT INTO public.trade_docs (
        company_id,
        module,
        doc_class,
        status,
        doc_type,
        fiscal_doc_type_id,
        fiscal_doc_code,
        issue_date,
        due_date,
        series,
        number,
        series_norm,
        number_norm,
        currency_code,
        counterparty_id,
        reference,
        origin_doc_id,
        branch_id,
        created_by,
        updated_by
      )
      VALUES (
        _company_id,
        'SALES',
        'FISCAL',
        'BORRADOR',
        v_doc_type,
        v_fiscal_doc_type_id,
        trim(v_doc.fiscal_doc_code),
        v_doc.issue_date,
        v_doc.due_date,
        nullif(trim(coalesce(v_doc.series, '')), ''),
        trim(v_doc.number),
        upper(trim(coalesce(v_doc.series, ''))),
        upper(trim(coalesce(v_doc.number, ''))),
        upper(trim(v_doc.currency_code)),
        v_counterparty_id,
        nullif(trim(coalesce(v_doc.reference, '')), ''),
        v_origin_doc_id,
        v_branch_id,
        v_uid,
        v_uid
      )
      RETURNING id INTO v_trade_doc_id;

      -- 10) insertar líneas
      INSERT INTO public.trade_doc_lines (
        company_id,
        trade_doc_id,
        line_no,
        sku,
        description,
        qty,
        unit_price,
        tax_kind,
        tax_rate,
        exempt_amount,
        taxable_amount,
        tax_amount,
        line_total,
        created_by,
        item_id
      )
      SELECT
        _company_id,
        v_trade_doc_id,
        l.line_no,
        l.sku,
        l.description,
        l.qty,
        l.unit_price,
        upper(trim(l.tax_kind)),
        l.tax_rate,
        l.exempt_amount,
        l.taxable_amount,
        l.tax_amount,
        l.line_total,
        v_uid,
        (
          SELECT i.id
          FROM public.items i
          WHERE i.company_id = _company_id
            AND upper(trim(i.sku)) = upper(trim(coalesce(l.sku, '')))
            AND i.is_active = TRUE
          LIMIT 1
        ) AS item_id
      FROM public.trade_doc_import_lines_stg l
      WHERE l.job_id = _job_id
        AND l.company_id = _company_id
        AND l.doc_key = v_doc.doc_key
      ORDER BY l.line_no;

      -- 11) releer total real calculado por trigger
      SELECT td.grand_total
        INTO v_doc_total
      FROM public.trade_docs td
      WHERE td.company_id = _company_id
        AND td.id = v_trade_doc_id;

      IF v_payments_total > v_doc_total THEN
        RAISE EXCEPTION 'La suma de pagos excede el total del documento.';
      END IF;

      -- 12) crear journal entry draft
      INSERT INTO public.journal_entries (
        company_id,
        entry_date,
        description,
        reference,
        currency_code,
        status,
        created_by,
        extra
      )
      VALUES (
        _company_id,
        v_doc.issue_date,
        'Importación masiva ' || trim(v_doc.fiscal_doc_code) || ' ' || trim(v_doc.number),
        nullif(trim(coalesce(v_doc.reference, '')), ''),
        upper(trim(v_doc.currency_code)),
        'DRAFT',
        v_uid,
        jsonb_build_object(
          'source', 'trade_doc_mass_import',
          'journal_mode', 'AUTO',
          'trade_doc_id', v_trade_doc_id
        )
      )
      RETURNING id INTO v_journal_entry_id;

      -- 13) vincular journal entry al documento
      UPDATE public.trade_docs
      SET journal_entry_id = v_journal_entry_id,
          updated_by = v_uid
      WHERE company_id = _company_id
        AND id = v_trade_doc_id;

      -- 14) pagos draft — ahora con journal_entry_id y counterparty_id
      INSERT INTO public.payments (
        company_id,
        payment_date,
        currency_code,
        method,
        reference,
        card_kind,
        card_last4,
        auth_code,
        total_amount,
        journal_entry_id,
        counterparty_id,
        extra,
        created_by
      )
      SELECT
        _company_id,
        p.payment_date,
        upper(trim(v_doc.currency_code)),
        upper(trim(p.method)),
        p.reference,
        p.card_kind,
        p.card_last4,
        p.auth_code,
        p.amount,
        v_journal_entry_id,
        v_counterparty_id,
        jsonb_build_object(
          'source', 'trade_doc_mass_import',
          'trade_doc_id', v_trade_doc_id,
          'draft', true
        ),
        v_uid
      FROM public.trade_doc_import_payments_stg p
      WHERE p.job_id = _job_id
        AND p.company_id = _company_id
        AND p.doc_key = v_doc.doc_key;

      INSERT INTO public.payment_allocations (
        company_id,
        payment_id,
        trade_doc_id,
        allocated_amount,
        created_by
      )
      SELECT
        _company_id,
        p.id,
        v_trade_doc_id,
        p.total_amount,
        v_uid
      FROM public.payments p
      WHERE p.company_id = _company_id
        AND coalesce(p.extra->>'trade_doc_id','') = v_trade_doc_id::text
        AND coalesce(p.extra->>'source','') = 'trade_doc_mass_import';

      -- 15) marcar staging como importado
      UPDATE public.trade_doc_import_docs_stg
      SET process_status = 'IMPORTED',
          created_trade_doc_id = v_trade_doc_id,
          created_counterparty_id = v_counterparty_id,
          created_journal_entry_id = v_journal_entry_id
      WHERE id = v_doc.id;

      PERFORM public.log_trade_doc_import_result(
        _job_id,
        _company_id,
        v_doc.doc_key,
        v_doc.doc_type,
        v_doc.fiscal_doc_code,
        v_doc.series,
        v_doc.number,
        'OK',
        'MATERIALIZATION',
        'Documento importado correctamente.',
        jsonb_build_object(
          'trade_doc_id', v_trade_doc_id,
          'journal_entry_id', v_journal_entry_id
        ),
        v_trade_doc_id
      );

      v_ok_docs := v_ok_docs + 1;

    EXCEPTION
      WHEN OTHERS THEN
        UPDATE public.trade_doc_import_docs_stg
        SET process_status = 'ERROR',
            error_count = error_count + 1
        WHERE id = v_doc.id;

        PERFORM public.log_trade_doc_import_result(
          _job_id,
          _company_id,
          v_doc.doc_key,
          v_doc.doc_type,
          v_doc.fiscal_doc_code,
          v_doc.series,
          v_doc.number,
          'ERROR',
          'VALIDATION',
          sqlerrm,
          jsonb_build_object('doc_stg_id', v_doc.id),
          NULL
        );

        v_error_docs := v_error_docs + 1;
    END;
  END LOOP;

  UPDATE public.trade_doc_import_jobs
  SET status = CASE WHEN v_error_docs > 0 THEN 'DONE_WITH_ERRORS' ELSE 'DONE' END,
      finished_at = now(),
      ok_docs = v_ok_docs,
      error_docs = v_error_docs,
      warning_docs = v_warning_docs,
      summary = jsonb_build_object(
        'total_docs', v_ok_docs + v_error_docs + v_warning_docs,
        'ok_docs', v_ok_docs,
        'error_docs', v_error_docs,
        'warning_docs', v_warning_docs
      )
  WHERE id = _job_id
    AND company_id = _company_id;

  RETURN jsonb_build_object(
    'job_id', _job_id,
    'ok_docs', v_ok_docs,
    'error_docs', v_error_docs,
    'warning_docs', v_warning_docs
  );
END;
$$;

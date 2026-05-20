-- =============================================================
-- 20260515000001_je_drop_unused_columns.sql
--
-- Elimina las columnas que no se usan de journal_entries:
--   reference, voided_at, voided_by, void_reason
--
-- Antes de bajar las columnas se actualiza la función
-- process_trade_doc_import_job que era la única que todavía
-- insertaba en journal_entries.reference.
-- =============================================================

-- ── 1. Actualizar RPC: quitar reference del INSERT de journal_entries ────────
CREATE OR REPLACE FUNCTION public.process_trade_doc_import_job(
  _job_id     uuid,
  _company_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid               uuid;
  v_role              text;
  v_doc               record;
  v_trade_doc_id      uuid;
  v_counterparty_id   uuid;
  v_branch_id         uuid;
  v_fiscal_doc_type_id uuid;
  v_origin_doc_id     uuid;
  v_journal_entry_id  uuid;
  v_ok_docs           int     := 0;
  v_error_docs        int     := 0;
  v_warning_docs      int     := 0;
  v_doc_total         numeric := 0;
  v_payments_total    numeric := 0;
  v_doc_type          text;
  v_is_note           boolean;
  v_has_lines         boolean;
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

  SELECT cm.role INTO v_role
  FROM public.company_members cm
  WHERE cm.company_id = _company_id
    AND cm.user_id = v_uid
    AND upper(coalesce(cm.status, '')) = 'ACTIVE'
  LIMIT 1;

  IF v_role IS NULL OR upper(v_role) NOT IN ('OWNER', 'EDITOR') THEN
    RAISE EXCEPTION 'No tienes permisos para procesar importaciones en esta empresa.';
  END IF;

  UPDATE public.trade_doc_import_jobs
  SET status = 'PROCESSING', started_at = now()
  WHERE id = _job_id AND company_id = _company_id;

  FOR v_doc IN
    SELECT *
    FROM public.trade_doc_import_docs_stg d
    WHERE d.job_id = _job_id AND d.company_id = _company_id
    ORDER BY coalesce(d.source_row_no, 999999), d.created_at
  LOOP
    BEGIN
      v_trade_doc_id       := null;
      v_counterparty_id    := null;
      v_branch_id          := null;
      v_fiscal_doc_type_id := null;
      v_origin_doc_id      := null;
      v_journal_entry_id   := null;
      v_doc_total          := 0;
      v_payments_total     := 0;
      v_doc_type           := upper(trim(coalesce(v_doc.doc_type, '')));
      v_is_note            := v_doc_type IN ('CREDIT_NOTE', 'DEBIT_NOTE');

      -- 1) Validar cabecera
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

      -- 2) Validar líneas
      SELECT EXISTS (
        SELECT 1 FROM public.trade_doc_import_lines_stg l
        WHERE l.job_id = _job_id AND l.company_id = _company_id AND l.doc_key = v_doc.doc_key
      ) INTO v_has_lines;

      IF NOT v_has_lines THEN
        RAISE EXCEPTION 'El documento no tiene líneas.';
      END IF;

      -- 3) Validar duplicado interno
      IF EXISTS (
        SELECT 1 FROM public.trade_doc_import_docs_stg d2
        WHERE d2.job_id = _job_id AND d2.company_id = _company_id AND d2.id <> v_doc.id
          AND upper(trim(coalesce(d2.fiscal_doc_code,''))) = upper(trim(coalesce(v_doc.fiscal_doc_code,'')))
          AND upper(trim(coalesce(d2.series,'')))          = upper(trim(coalesce(v_doc.series,'')))
          AND upper(trim(coalesce(d2.number,'')))          = upper(trim(coalesce(v_doc.number,'')))
      ) THEN
        RAISE EXCEPTION 'El folio está duplicado dentro del archivo.';
      END IF;

      -- 4) Resolver tercero
      v_counterparty_id := public.resolve_or_create_import_counterparty(
        _company_id, v_doc.counterparty_identifier, v_doc.counterparty_name, v_uid
      );

      -- 5) Resolver sucursal
      v_branch_id := public.resolve_import_branch(_company_id, v_doc.branch_code);

      -- 6) Resolver tipo fiscal
      v_fiscal_doc_type_id := public.resolve_import_fiscal_doc_type(_company_id, v_doc.fiscal_doc_code);

      -- 7) Resolver origen si NC/ND
      IF v_is_note THEN
        v_origin_doc_id := public.resolve_import_origin_doc(
          _company_id, v_doc.origin_fiscal_doc_code, v_doc.origin_series,
          v_doc.origin_number, v_counterparty_id
        );
      ELSE
        v_origin_doc_id := null;
      END IF;

      -- 8) Validar pagos
      SELECT coalesce(sum(p.amount), 0) INTO v_payments_total
      FROM public.trade_doc_import_payments_stg p
      WHERE p.job_id = _job_id AND p.company_id = _company_id AND p.doc_key = v_doc.doc_key;

      IF v_is_note AND v_payments_total > 0 THEN
        RAISE EXCEPTION 'Las notas de crédito/débito no pueden traer pagos.';
      END IF;

      -- 9) Insertar cabecera
      INSERT INTO public.trade_docs (
        company_id, module, doc_class, status, doc_type,
        fiscal_doc_type_id, fiscal_doc_code,
        issue_date, due_date, series, number,
        series_norm, number_norm, currency_code,
        counterparty_id, reference, origin_doc_id,
        branch_id, created_by, updated_by
      ) VALUES (
        _company_id, 'SALES', 'FISCAL', 'BORRADOR', v_doc_type,
        v_fiscal_doc_type_id, trim(v_doc.fiscal_doc_code),
        v_doc.issue_date, v_doc.due_date,
        nullif(trim(coalesce(v_doc.series, '')), ''), trim(v_doc.number),
        upper(trim(coalesce(v_doc.series, ''))), upper(trim(coalesce(v_doc.number, ''))),
        upper(trim(v_doc.currency_code)),
        v_counterparty_id, nullif(trim(coalesce(v_doc.reference, '')), ''),
        v_origin_doc_id, v_branch_id, v_uid, v_uid
      )
      RETURNING id INTO v_trade_doc_id;

      -- 10) Insertar líneas
      INSERT INTO public.trade_doc_lines (
        company_id, trade_doc_id, line_no, sku, description,
        qty, unit_price, tax_kind, tax_rate,
        exempt_amount, taxable_amount, tax_amount, line_total,
        created_by, item_id
      )
      SELECT
        _company_id, v_trade_doc_id, l.line_no, l.sku, l.description,
        l.qty, l.unit_price, upper(trim(l.tax_kind)), l.tax_rate,
        l.exempt_amount, l.taxable_amount, l.tax_amount, l.line_total,
        v_uid,
        (SELECT i.id FROM public.items i
         WHERE i.company_id = _company_id
           AND upper(trim(i.sku)) = upper(trim(coalesce(l.sku, '')))
           AND i.is_active = true
         LIMIT 1) AS item_id
      FROM public.trade_doc_import_lines_stg l
      WHERE l.job_id = _job_id AND l.company_id = _company_id AND l.doc_key = v_doc.doc_key
      ORDER BY l.line_no;

      -- 11) Leer total real calculado por trigger
      SELECT td.grand_total INTO v_doc_total
      FROM public.trade_docs td
      WHERE td.company_id = _company_id AND td.id = v_trade_doc_id;

      IF v_payments_total > v_doc_total THEN
        RAISE EXCEPTION 'La suma de pagos excede el total del documento.';
      END IF;

      -- 12) Crear journal entry draft
      INSERT INTO public.journal_entries (
        company_id, entry_date, description,
        currency_code, status, created_by,
        counterparty_id,
        extra
      ) VALUES (
        _company_id,
        v_doc.issue_date,
        'Importación masiva ' || trim(v_doc.fiscal_doc_code) || ' ' || trim(v_doc.number),
        upper(trim(v_doc.currency_code)),
        'DRAFT',
        v_uid,
        v_counterparty_id,
        jsonb_build_object(
          'source',       'trade_doc_mass_import',
          'journal_mode', 'AUTO',
          'trade_doc_id', v_trade_doc_id
        )
      )
      RETURNING id INTO v_journal_entry_id;

      -- 13) Vincular journal entry al documento
      UPDATE public.trade_docs
      SET journal_entry_id = v_journal_entry_id, updated_by = v_uid
      WHERE company_id = _company_id AND id = v_trade_doc_id;

      -- 14) Pagos draft si aplica
      INSERT INTO public.payments (
        company_id, payment_date, currency_code, method, reference,
        card_kind, card_last4, auth_code, total_amount, extra, created_by
      )
      SELECT
        _company_id, p.payment_date, upper(trim(v_doc.currency_code)),
        upper(trim(p.method)), p.reference,
        p.card_kind, p.card_last4, p.auth_code, p.amount,
        jsonb_build_object('source', 'trade_doc_mass_import', 'trade_doc_id', v_trade_doc_id, 'draft', true),
        v_uid
      FROM public.trade_doc_import_payments_stg p
      WHERE p.job_id = _job_id AND p.company_id = _company_id AND p.doc_key = v_doc.doc_key;

      INSERT INTO public.payment_allocations (
        company_id, payment_id, trade_doc_id, allocated_amount, created_by
      )
      SELECT _company_id, p.id, v_trade_doc_id, p.total_amount, v_uid
      FROM public.payments p
      WHERE p.company_id = _company_id
        AND coalesce(p.extra->>'trade_doc_id','') = v_trade_doc_id::text
        AND coalesce(p.extra->>'source','') = 'trade_doc_mass_import';

      -- 15) Marcar staging como importado
      UPDATE public.trade_doc_import_docs_stg
      SET process_status        = 'IMPORTED',
          created_trade_doc_id  = v_trade_doc_id,
          created_counterparty_id = v_counterparty_id,
          created_journal_entry_id = v_journal_entry_id
      WHERE id = v_doc.id;

      PERFORM public.log_trade_doc_import_result(
        _job_id, _company_id,
        v_doc.doc_key, v_doc.doc_type, v_doc.fiscal_doc_code, v_doc.series, v_doc.number,
        'OK', 'MATERIALIZATION', 'Documento importado correctamente.',
        jsonb_build_object('trade_doc_id', v_trade_doc_id, 'journal_entry_id', v_journal_entry_id),
        v_trade_doc_id
      );

      v_ok_docs := v_ok_docs + 1;

    EXCEPTION WHEN OTHERS THEN
      UPDATE public.trade_doc_import_docs_stg
      SET process_status = 'ERROR', error_count = error_count + 1
      WHERE id = v_doc.id;

      PERFORM public.log_trade_doc_import_result(
        _job_id, _company_id,
        v_doc.doc_key, v_doc.doc_type, v_doc.fiscal_doc_code, v_doc.series, v_doc.number,
        'ERROR', 'VALIDATION', SQLERRM,
        jsonb_build_object('doc_stg_id', v_doc.id),
        null
      );

      v_error_docs := v_error_docs + 1;
    END;
  END LOOP;

  UPDATE public.trade_doc_import_jobs
  SET status       = CASE WHEN v_error_docs > 0 THEN 'DONE_WITH_ERRORS' ELSE 'DONE' END,
      finished_at  = now(),
      ok_docs      = v_ok_docs,
      error_docs   = v_error_docs,
      warning_docs = v_warning_docs,
      summary      = jsonb_build_object(
        'total_docs',   v_ok_docs + v_error_docs + v_warning_docs,
        'ok_docs',      v_ok_docs,
        'error_docs',   v_error_docs,
        'warning_docs', v_warning_docs
      )
  WHERE id = _job_id AND company_id = _company_id;

  RETURN jsonb_build_object(
    'job_id',      _job_id,
    'ok_docs',     v_ok_docs,
    'error_docs',  v_error_docs,
    'warning_docs', v_warning_docs
  );
END;
$$;

-- ── 2. Bajar las columnas que ya no se usan ──────────────────────────────────
ALTER TABLE public.journal_entries
  DROP COLUMN IF EXISTS reference,
  DROP COLUMN IF EXISTS voided_at,
  DROP COLUMN IF EXISTS voided_by,
  DROP COLUMN IF EXISTS void_reason;

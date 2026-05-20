-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260520000001_anticipo_in_cobros
--
-- Objetivo:
--   Mover el concepto "Anticipo de cliente" (CUSTOMER_ADVANCE) desde el módulo
--   de Otros Ingresos (trade_docs NON_FISCAL) hacia el módulo de Cobros
--   (payments table).
--
-- Cambios:
--   1. Extender el CHECK constraint de payments.payment_type para incluir 'ANTICIPO'.
--   2. Asegurar que el proceso CUSTOMER_ADVANCE_LIABILITY exista en
--      account_default_processes (si la tabla existe) para que la UI lo encuentre.
--   3. Actualizar el RPC process_other_doc_import_batch para que NO acepte
--      CUSTOMER_ADVANCE como doc_type válido en importaciones masivas.
--
-- Backward compat:
--   - Los docs históricos con doc_type='CUSTOMER_ADVANCE' en trade_docs siguen
--     existiendo y son legibles. No se borran ni se migran.
--   - El CHECK constraint de trade_docs.doc_type NO se toca (ya permite
--     CUSTOMER_ADVANCE desde migration 20260519000001).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Extender payment_type CHECK en payments ──────────────────────────────

ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS chk_payments_payment_type;

ALTER TABLE public.payments
  ADD CONSTRAINT chk_payments_payment_type
  CHECK (
    payment_type IS NULL
    OR payment_type IN ('COBRO', 'ANTICIPO', 'PAGO', 'AJUSTE_COBRO', 'AJUSTE_PAGO')
  );

-- Default sigue siendo COBRO (si la columna ya tenía default, esto lo reafirma)
ALTER TABLE public.payments
  ALTER COLUMN payment_type SET DEFAULT 'COBRO';


-- ── 2. Asegurar CUSTOMER_ADVANCE_LIABILITY en account_default_processes ──────
--    Esta tabla almacena las "process keys" disponibles para asignar cuentas.
--    La UI la usa para mostrar el selector de cuenta predeterminada.

INSERT INTO public.account_default_processes (process_key, label, module)
VALUES (
  'CUSTOMER_ADVANCE_LIABILITY',
  'Anticipos de clientes (pasivo)',
  'SALES'
)
ON CONFLICT (process_key) DO UPDATE
  SET label  = EXCLUDED.label,
      module = EXCLUDED.module;


-- ── 3. Actualizar process_other_doc_import_batch ─────────────────────────────
--    Revertir la normalización de ANTICIPO/CUSTOMER_ADVANCE que se agregó en
--    20260519000001_add_customer_advance_doc_type.sql.
--    Los nuevos anticipos se crean en payments (módulo Cobros), no aquí.

CREATE OR REPLACE FUNCTION public.process_other_doc_import_batch(
  p_company_id uuid,
  p_docs       jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_doc          jsonb;
  v_idx          int := 0;
  v_ok_count     int := 0;
  v_error_count  int := 0;
  v_results      jsonb := '[]'::jsonb;
  v_result_row   jsonb;

  -- doc fields
  v_doc_type              text;
  v_non_fiscal_doc_code   text;
  v_issue_date            date;
  v_due_date              date;
  v_series                text;
  v_number                text;
  v_currency_code         text;
  v_branch_id             uuid;
  v_counterparty_id       uuid;
  v_counterparty_ident    text;
  v_counterparty_name     text;
  v_grand_total           numeric;
  v_reference             text;
  v_origin_doc_id         uuid;
  v_payment_method        text;
  v_payment_amount        numeric;
  v_payment_date          date;
  v_payment_reference     text;
  v_card_kind             text;
  v_card_last4            text;
  v_auth_code             text;
  v_account_debe          text;
  v_account_haber         text;
  v_branch_code_debe      text;
  v_branch_code_haber     text;
  v_bu_code_debe          text;
  v_bu_code_haber         text;

  -- resolved IDs
  v_doc_id                uuid;
  v_je_id                 uuid;
  v_payment_id            uuid;
  v_period_id             uuid;
  v_acc_debe_id           uuid;
  v_acc_haber_id          uuid;
  v_branch_debe_id        uuid;
  v_branch_haber_id       uuid;
  v_bu_debe_id            uuid;
  v_bu_haber_id           uuid;

  v_error_msg             text;
BEGIN
  FOR v_doc IN SELECT jsonb_array_elements(p_docs) LOOP
    v_idx := v_idx + 1;
    v_error_msg := NULL;

    BEGIN
      -- ── Parse doc fields ──────────────────────────────────────────────────
      v_doc_type            := COALESCE(v_doc->>'doc_type', 'OTRO_INGRESO');
      v_non_fiscal_doc_code := NULLIF(TRIM(v_doc->>'non_fiscal_doc_code'), '');
      v_issue_date          := (v_doc->>'issue_date')::date;
      v_due_date            := COALESCE(NULLIF(v_doc->>'due_date','')::date, v_issue_date);
      v_series              := NULLIF(TRIM(v_doc->>'series'), '');
      v_number              := NULLIF(TRIM(v_doc->>'number'), '');
      v_currency_code       := COALESCE(NULLIF(TRIM(v_doc->>'currency_code'),''), 'CLP');
      v_counterparty_ident  := TRIM(v_doc->>'counterparty_identifier');
      v_counterparty_name   := TRIM(v_doc->>'counterparty_name');
      v_grand_total         := (v_doc->>'grand_total')::numeric;
      v_reference           := NULLIF(TRIM(v_doc->>'reference'), '');
      v_payment_method      := NULLIF(TRIM(v_doc->>'payment_method'), '');
      v_payment_amount      := COALESCE((v_doc->>'payment_amount')::numeric, 0);
      v_payment_date        := COALESCE(NULLIF(v_doc->>'payment_date','')::date, v_issue_date);
      v_payment_reference   := NULLIF(TRIM(v_doc->>'payment_reference'), '');
      v_card_kind           := NULLIF(TRIM(v_doc->>'card_kind'), '');
      v_card_last4          := NULLIF(TRIM(v_doc->>'card_last4'), '');
      v_auth_code           := NULLIF(TRIM(v_doc->>'auth_code'), '');
      v_account_debe        := NULLIF(TRIM(v_doc->>'account_debe'), '');
      v_account_haber       := NULLIF(TRIM(v_doc->>'account_haber'), '');
      v_branch_code_debe    := NULLIF(TRIM(v_doc->>'branch_code_debe'), '');
      v_branch_code_haber   := NULLIF(TRIM(v_doc->>'branch_code_haber'), '');
      v_bu_code_debe        := NULLIF(TRIM(v_doc->>'business_line_code_debe'), '');
      v_bu_code_haber       := NULLIF(TRIM(v_doc->>'business_line_code_haber'), '');

      -- ── Normalizar doc_type (CUSTOMER_ADVANCE ya NO es válido aquí) ───────
      IF v_doc_type NOT IN ('OTRO_INGRESO', 'DEVOLUCION') THEN
        v_doc_type := 'OTRO_INGRESO';
      END IF;

      -- ── Validaciones mínimas ──────────────────────────────────────────────
      IF v_issue_date IS NULL THEN
        RAISE EXCEPTION 'issue_date vacío';
      END IF;
      IF v_number IS NULL THEN
        RAISE EXCEPTION 'number vacío';
      END IF;
      IF v_grand_total IS NULL OR v_grand_total <= 0 THEN
        RAISE EXCEPTION 'grand_total debe ser > 0';
      END IF;

      -- ── Período contable ──────────────────────────────────────────────────
      SELECT ap.id INTO v_period_id
      FROM public.accounting_periods ap
      WHERE ap.company_id   = p_company_id
        AND ap.start_date  <= v_issue_date
        AND ap.end_date    >= v_issue_date
        AND ap.status NOT IN ('BLOQUEADO','BLOCKED','CERRADO','CLOSED')
      ORDER BY ap.start_date DESC
      LIMIT 1;

      IF v_period_id IS NULL THEN
        RAISE EXCEPTION 'No hay período contable abierto para la fecha %', v_issue_date;
      END IF;

      -- ── Sucursal ──────────────────────────────────────────────────────────
      v_branch_id := NULL;
      IF v_doc->>'branch_code' IS NOT NULL AND TRIM(v_doc->>'branch_code') <> '' THEN
        SELECT id INTO v_branch_id
        FROM public.branches
        WHERE company_id = p_company_id
          AND UPPER(code) = UPPER(TRIM(v_doc->>'branch_code'))
        LIMIT 1;
      END IF;

      -- ── Contraparte ───────────────────────────────────────────────────────
      SELECT id INTO v_counterparty_id
      FROM public.counterparties
      WHERE company_id = p_company_id
        AND (
          identifier_normalized = LOWER(REGEXP_REPLACE(v_counterparty_ident, '[\.\-\s]', '', 'g'))
          OR identifier = v_counterparty_ident
        )
        AND is_active = TRUE
      LIMIT 1;

      -- ── Documento origen (DEVOLUCION) ─────────────────────────────────────
      v_origin_doc_id := NULL;
      IF v_doc_type = 'DEVOLUCION' AND (v_doc->>'origin_number') IS NOT NULL
                                    AND TRIM(v_doc->>'origin_number') <> '' THEN
        -- Buscar origen en trade_docs (FISCAL o NON_FISCAL)
        SELECT id INTO v_origin_doc_id
        FROM public.trade_docs
        WHERE company_id = p_company_id
          AND number     = TRIM(v_doc->>'origin_number')
        ORDER BY issue_date DESC
        LIMIT 1;
      END IF;

      -- ── Cuentas contables ─────────────────────────────────────────────────
      SELECT id INTO v_acc_debe_id
      FROM public.account_nodes
      WHERE company_id = p_company_id
        AND code       = v_account_debe
      LIMIT 1;
      IF v_acc_debe_id IS NULL THEN
        RAISE EXCEPTION 'Cuenta DEBE "%" no encontrada', v_account_debe;
      END IF;

      SELECT id INTO v_acc_haber_id
      FROM public.account_nodes
      WHERE company_id = p_company_id
        AND code       = v_account_haber
      LIMIT 1;
      IF v_acc_haber_id IS NULL THEN
        RAISE EXCEPTION 'Cuenta HABER "%" no encontrada', v_account_haber;
      END IF;

      -- Sucursales de asiento
      v_branch_debe_id  := NULL;
      v_branch_haber_id := NULL;
      IF v_branch_code_debe IS NOT NULL THEN
        SELECT id INTO v_branch_debe_id  FROM public.branches WHERE company_id = p_company_id AND UPPER(code) = UPPER(v_branch_code_debe)  LIMIT 1;
      END IF;
      IF v_branch_code_haber IS NOT NULL THEN
        SELECT id INTO v_branch_haber_id FROM public.branches WHERE company_id = p_company_id AND UPPER(code) = UPPER(v_branch_code_haber) LIMIT 1;
      END IF;

      -- CU de asiento
      v_bu_debe_id  := NULL;
      v_bu_haber_id := NULL;
      IF v_bu_code_debe IS NOT NULL THEN
        SELECT id INTO v_bu_debe_id  FROM public.business_lines WHERE company_id = p_company_id AND UPPER(code) = UPPER(v_bu_code_debe)  LIMIT 1;
      END IF;
      IF v_bu_code_haber IS NOT NULL THEN
        SELECT id INTO v_bu_haber_id FROM public.business_lines WHERE company_id = p_company_id AND UPPER(code) = UPPER(v_bu_code_haber) LIMIT 1;
      END IF;

      -- ── Crear trade_doc ───────────────────────────────────────────────────
      INSERT INTO public.trade_docs (
        company_id, doc_class, module, doc_type,
        non_fiscal_doc_code, issue_date, due_date, series, number,
        currency_code, branch_id, counterparty_id,
        counterparty_identifier_snapshot, counterparty_name_snapshot,
        grand_total, balance, reference, origin_doc_id,
        status,
        net_taxable, net_exempt, tax_total,
        fiscal_doc_type_id, non_fiscal_doc_type_id, fiscal_doc_code
      ) VALUES (
        p_company_id, 'NON_FISCAL', 'SALES', v_doc_type,
        v_non_fiscal_doc_code, v_issue_date, v_due_date, v_series, v_number,
        v_currency_code, v_branch_id, v_counterparty_id,
        v_counterparty_ident, v_counterparty_name,
        v_grand_total,
        CASE WHEN v_payment_amount > 0 THEN GREATEST(v_grand_total - v_payment_amount, 0) ELSE v_grand_total END,
        v_reference, v_origin_doc_id,
        'BORRADOR',
        0, 0, 0,
        NULL, NULL, NULL
      )
      RETURNING id INTO v_doc_id;

      -- ── Crear asiento contable (DRAFT) ────────────────────────────────────
      INSERT INTO public.journal_entries (
        company_id, accounting_period_id, entry_date, description,
        currency_code, status, counterparty_id,
        extra
      ) VALUES (
        p_company_id, v_period_id, v_issue_date,
        CONCAT(
          CASE v_doc_type WHEN 'DEVOLUCION' THEN 'Devolución' ELSE 'Otro Ingreso' END,
          CASE WHEN v_number IS NOT NULL THEN CONCAT(' · ', v_number) ELSE '' END,
          CASE WHEN v_counterparty_name <> '' THEN CONCAT(' · ', v_counterparty_name) ELSE '' END
        ),
        v_currency_code, 'DRAFT', v_counterparty_id,
        jsonb_build_object('source', 'other_doc_import', 'trade_doc_id', v_doc_id)
      )
      RETURNING id INTO v_je_id;

      -- Líneas del asiento
      INSERT INTO public.journal_entry_lines (
        company_id, journal_entry_id, line_no,
        account_node_id, account_code_snapshot, account_name_snapshot,
        debit, credit,
        branch_id, business_line_id, line_description
      ) VALUES
        (p_company_id, v_je_id, 1,
         v_acc_debe_id,
         (SELECT code FROM public.account_nodes WHERE id = v_acc_debe_id),
         (SELECT name FROM public.account_nodes WHERE id = v_acc_debe_id),
         v_grand_total, 0,
         v_branch_debe_id, v_bu_debe_id,
         CONCAT(
           CASE v_doc_type WHEN 'DEVOLUCION' THEN 'Devolución' ELSE 'Otro Ingreso' END,
           CASE WHEN v_number IS NOT NULL THEN CONCAT(' · ', v_number) ELSE '' END
         )
        ),
        (p_company_id, v_je_id, 2,
         v_acc_haber_id,
         (SELECT code FROM public.account_nodes WHERE id = v_acc_haber_id),
         (SELECT name FROM public.account_nodes WHERE id = v_acc_haber_id),
         0, v_grand_total,
         v_branch_haber_id, v_bu_haber_id,
         CONCAT(
           CASE v_doc_type WHEN 'DEVOLUCION' THEN 'Devolución' ELSE 'Otro Ingreso' END,
           CASE WHEN v_number IS NOT NULL THEN CONCAT(' · ', v_number) ELSE '' END
         )
        );

      -- Enlazar JE al doc
      UPDATE public.trade_docs
      SET journal_entry_id = v_je_id
      WHERE id = v_doc_id;

      -- ── Forma de pago (si tiene) ──────────────────────────────────────────
      IF v_payment_method IS NOT NULL AND v_payment_amount > 0 THEN
        INSERT INTO public.payments (
          company_id, payment_date, currency_code, method,
          reference, card_kind, card_last4, auth_code,
          total_amount, extra
        ) VALUES (
          p_company_id, v_payment_date, v_currency_code, v_payment_method,
          v_payment_reference,
          CASE WHEN v_payment_method = 'TARJETA' THEN v_card_kind  ELSE NULL END,
          CASE WHEN v_payment_method = 'TARJETA' THEN v_card_last4 ELSE NULL END,
          CASE WHEN v_payment_method = 'TARJETA' THEN v_auth_code  ELSE NULL END,
          v_payment_amount,
          jsonb_build_object('source','other_doc_import','trade_doc_id', v_doc_id)
        )
        RETURNING id INTO v_payment_id;

        INSERT INTO public.payment_allocations (
          company_id, payment_id, trade_doc_id, allocated_amount
        ) VALUES (
          p_company_id, v_payment_id, v_doc_id, v_payment_amount
        );
      END IF;

      -- ── Éxito ─────────────────────────────────────────────────────────────
      v_ok_count := v_ok_count + 1;
      v_result_row := jsonb_build_object(
        'status',       'OK',
        'row_no',       v_idx,
        'number',       v_number,
        'trade_doc_id', v_doc_id,
        'message',      'OK'
      );

    EXCEPTION WHEN OTHERS THEN
      v_error_count := v_error_count + 1;
      v_result_row := jsonb_build_object(
        'status',  'ERROR',
        'row_no',  v_idx,
        'number',  v_doc->>'number',
        'message', SQLERRM
      );
    END;

    v_results := v_results || jsonb_build_array(v_result_row);
  END LOOP;

  RETURN jsonb_build_object(
    'ok_count',    v_ok_count,
    'error_count', v_error_count,
    'results',     v_results
  );
END;
$$;

COMMENT ON FUNCTION public.process_other_doc_import_batch IS
  'Importación masiva de Otros Docs de Ingresos (OTRO_INGRESO / DEVOLUCION). '
  'CUSTOMER_ADVANCE ya no es aceptado aquí — los anticipos se crean en el módulo Cobros '
  '(payments.payment_type = ANTICIPO). Migración: 20260520000001_anticipo_in_cobros.';

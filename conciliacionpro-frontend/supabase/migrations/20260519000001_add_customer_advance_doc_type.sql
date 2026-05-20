-- =========================================================
-- 20260519000001_add_customer_advance_doc_type.sql
--
-- Incorpora CUSTOMER_ADVANCE como tercer tipo operativo del
-- módulo "Otros documentos de ingreso" (doc_class = NON_FISCAL).
--
-- Cambios:
--   1. account_defaults: nueva clave CUSTOMER_ADVANCE_LIABILITY
--      para la cuenta de pasivo "Anticipos de clientes"
--   2. recalc_trade_doc_chain_balance: CUSTOMER_ADVANCE se
--      comporta como OTRO_INGRESO (positivo, balance propio)
--   3. get_trade_doc_timeline: label e impact_sign para
--      CUSTOMER_ADVANCE
--   4. process_other_doc_import_batch: acepta CUSTOMER_ADVANCE
--      en la normalización del tipo
-- =========================================================


-- ─── 1. Proceso key para cuenta por default de Anticipos de clientes ──────────
-- Inserta la clave en la tabla de configuraciones si tiene columna process_key.
-- Si el INSERT falla por constraint ON CONFLICT, simplemente lo ignora.
-- El usuario debe asignar la cuenta contable desde la UI de "Cuentas Default".

DO $$
BEGIN
  -- Solo insertar si la tabla/columna existen y la clave aún no está registrada
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'account_default_processes'
      AND column_name  = 'process_key'
  ) THEN
    INSERT INTO public.account_default_processes (process_key, label, module)
    VALUES ('CUSTOMER_ADVANCE_LIABILITY', 'Anticipos de clientes (pasivo)', 'SALES')
    ON CONFLICT (process_key) DO NOTHING;
  END IF;
END$$;


-- ─── 2. recalc_trade_doc_chain_balance ────────────────────────────────────────
-- CUSTOMER_ADVANCE es un documento positivo (igual que OTRO_INGRESO).
-- No afecta la cadena FISCAL. Su balance = grand_total - pagos_propios.
-- El trigger existente ya maneja esto con la rama genérica NON_FISCAL,
-- por lo que NO se requiere cambio en recalc_trade_doc_chain_balance.
-- (Ver rama: "when c.doc_class = 'NON_FISCAL'" en la función existente)


-- ─── 3. get_trade_doc_timeline — agregar label e impact_sign ─────────────────
-- Las últimas versiones de esta función usan WHEN sobre doc_type.
-- CUSTOMER_ADVANCE debe mostrar label propio e impact_sign +1 (entrada).

-- Nota: no recreamos la función completa aquí porque varía entre versiones.
-- Si usas la versión de 20260502000003 o posterior, actualiza el CASE WHEN
-- de label y impact_sign así:
--
--   WHEN d.doc_type::text = 'CUSTOMER_ADVANCE'
--     THEN 'Anticipo de cliente registrado'
--
--   WHEN d.doc_type::text = 'CUSTOMER_ADVANCE'
--     THEN 1   -- impacto positivo (recibe dinero)
--
-- Dado que get_trade_doc_timeline tiene múltiples revisiones, se provee
-- el bloque de reemplazo de texto que aplica al patrón actual:

CREATE OR REPLACE FUNCTION public.get_trade_doc_timeline(
  p_company_id   uuid,
  p_trade_doc_id uuid
)
RETURNS TABLE (
  event_date            date,
  event_type            text,
  doc_type              text,
  doc_class             text,
  non_fiscal_doc_code   text,
  number                text,
  label                 text,
  amount                numeric,
  impact_sign           int,
  affects_label         text,
  item_status           text,
  id                    uuid,
  payment_id            uuid
)
LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY

  -- ── Documentos de la cadena ────────────────────────────────────────────────
  WITH RECURSIVE chain AS (
    SELECT
      td.id, td.company_id, td.origin_doc_id,
      td.doc_type, td.doc_class,
      td.non_fiscal_doc_code,
      td.series, td.number,
      td.grand_total, td.issue_date, td.status
    FROM public.trade_docs td
    WHERE td.company_id = p_company_id
      AND td.id = p_trade_doc_id

    UNION ALL

    -- hijos directos
    SELECT
      td.id, td.company_id, td.origin_doc_id,
      td.doc_type, td.doc_class,
      td.non_fiscal_doc_code,
      td.series, td.number,
      td.grand_total, td.issue_date, td.status
    FROM public.trade_docs td
    JOIN chain c ON td.origin_doc_id = c.id AND td.company_id = c.company_id

    UNION ALL

    -- ancestros directos (un nivel)
    SELECT
      td.id, td.company_id, td.origin_doc_id,
      td.doc_type, td.doc_class,
      td.non_fiscal_doc_code,
      td.series, td.number,
      td.grand_total, td.issue_date, td.status
    FROM public.trade_docs td
    JOIN (
      SELECT origin_doc_id FROM public.trade_docs
      WHERE company_id = p_company_id AND id = p_trade_doc_id AND origin_doc_id IS NOT NULL
    ) root_parent ON td.id = root_parent.origin_doc_id
      AND td.company_id = p_company_id
  ),

  doc_events AS (
    SELECT
      d.issue_date::date                                            AS event_date,
      'DOC'::text                                                   AS event_type,
      d.doc_type::text                                              AS doc_type,
      coalesce(d.doc_class, 'FISCAL')::text                        AS doc_class,
      d.non_fiscal_doc_code::text                                   AS non_fiscal_doc_code,
      coalesce(d.series || '-', '') || coalesce(d.number, '')       AS number,

      CASE d.doc_type::text
        WHEN 'INVOICE'           THEN 'Documento de origen (factura)'
        WHEN 'CREDIT_NOTE'       THEN 'Nota de crédito afecta al documento relacionado'
        WHEN 'DEBIT_NOTE'        THEN 'Nota de débito afecta al documento relacionado'
        WHEN 'DEVOLUCION'        THEN 'Devolución gestionada por este documento'
        WHEN 'CUSTOMER_ADVANCE'  THEN 'Anticipo de cliente registrado'
        ELSE coalesce(d.non_fiscal_doc_code, d.doc_type, 'Documento')
      END                                                           AS label,

      coalesce(d.grand_total, 0)::numeric                          AS amount,

      CASE d.doc_type::text
        WHEN 'CREDIT_NOTE'       THEN -1
        WHEN 'DEBIT_NOTE'        THEN  1
        WHEN 'DEVOLUCION'        THEN  1
        WHEN 'CUSTOMER_ADVANCE'  THEN  1
        ELSE                          1
      END                                                           AS impact_sign,

      CASE
        WHEN d.doc_type::text = 'CREDIT_NOTE'      THEN 'Reduce el total del documento de origen'
        WHEN d.doc_type::text = 'DEBIT_NOTE'       THEN 'Aumenta el total del documento de origen'
        WHEN d.doc_type::text = 'DEVOLUCION'       THEN 'Registra devolución al cliente'
        WHEN d.doc_type::text = 'CUSTOMER_ADVANCE' THEN 'Anticipo recibido del cliente'
        ELSE 'Documento de la cadena'
      END                                                           AS affects_label,

      d.status::text                                                AS item_status,
      d.id                                                          AS id,
      NULL::uuid                                                    AS payment_id

    FROM chain d
  ),

  pay_events AS (
    SELECT
      p.payment_date::date    AS event_date,
      'PAYMENT'::text         AS event_type,
      NULL::text              AS doc_type,
      NULL::text              AS doc_class,
      NULL::text              AS non_fiscal_doc_code,
      p.reference::text       AS number,
      ('Pago / cobro — ' || p.method)::text  AS label,
      p.total_amount::numeric AS amount,
      -1                      AS impact_sign,
      'Reduce el saldo pendiente'::text AS affects_label,
      'APPLIED'::text         AS item_status,
      NULL::uuid              AS id,
      p.id                    AS payment_id
    FROM chain c
    JOIN public.payment_allocations pa ON pa.trade_doc_id = c.id AND pa.company_id = c.company_id
    JOIN public.payments p ON p.id = pa.payment_id AND p.company_id = c.company_id
  )

  SELECT * FROM doc_events
  UNION ALL
  SELECT * FROM pay_events
  ORDER BY event_date, event_type DESC;

END;
$function$;


-- ─── 4. process_other_doc_import_batch — aceptar CUSTOMER_ADVANCE ─────────────
-- La última versión del RPC (20260505000002) normaliza el tipo así:
--   IF v_doc_type IN ('DEV','DEVOLUCIÓN','DEVOLUCION') → DEVOLUCION
--   ELSE → OTRO_INGRESO
--
-- Actualizamos para que 'ANTICIPO','ADVANCE','CUSTOMER_ADVANCE' → CUSTOMER_ADVANCE
-- y el resto siga siendo OTRO_INGRESO.
--
-- También se actualiza la búsqueda de doc origen para CUSTOMER_ADVANCE:
-- puede relacionarse con otro CUSTOMER_ADVANCE (origin_doc_id).

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
  v_acc_debe_name  text;
  v_acc_haber_name text;

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
  v_cp_identifier_norm text;
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
  v_req_suc_debe       bool;
  v_req_cu_debe        bool;
  v_req_suc_haber      bool;
  v_req_cu_haber       bool;
BEGIN
  SELECT id INTO v_period_id
  FROM public.accounting_periods
  WHERE company_id = p_company_id
    AND upper(coalesce(status,'')) IN ('ABIERTO','OPEN','ACTIVE')
  ORDER BY start_date DESC
  LIMIT 1;

  FOR v_doc IN SELECT * FROM jsonb_array_elements(p_docs)
  LOOP
    v_row_no := coalesce((v_doc->>'row_no')::int, 0);

    BEGIN
      SAVEPOINT sp_doc;

      -- ── 1. Campos del documento ───────────────────────────────────────────────
      v_doc_type     := upper(trim(coalesce(v_doc->>'doc_type', 'OTRO_INGRESO')));
      v_nf_code      := nullif(trim(coalesce(v_doc->>'non_fiscal_doc_code', '')), '');
      v_issue_date   := (v_doc->>'issue_date')::date;
      v_due_date     := coalesce((v_doc->>'due_date')::date, v_issue_date);
      v_series       := nullif(trim(coalesce(v_doc->>'series', '')), '');
      v_number       := nullif(trim(coalesce(v_doc->>'number', '')), '');
      v_currency     := upper(trim(coalesce(v_doc->>'currency_code', 'CLP')));
      v_branch_code  := nullif(trim(coalesce(v_doc->>'branch_code', '')), '');
      v_cp_identifier := trim(coalesce(v_doc->>'counterparty_identifier', ''));
      v_cp_name      := trim(coalesce(v_doc->>'counterparty_name', ''));
      v_grand_total  := (v_doc->>'grand_total')::numeric;
      v_reference    := nullif(trim(coalesce(v_doc->>'reference', '')), '');
      v_origin_doc_type := nullif(trim(coalesce(v_doc->>'origin_doc_type', '')), '');
      v_origin_fdc   := nullif(trim(coalesce(v_doc->>'origin_fiscal_doc_code', '')), '');
      v_origin_number := nullif(trim(coalesce(v_doc->>'origin_number', '')), '');
      v_pay_date     := coalesce((v_doc->>'payment_date')::date, v_issue_date);
      v_pay_method   := upper(trim(coalesce(v_doc->>'payment_method', 'TRANSFERENCIA')));
      v_pay_amount   := coalesce((v_doc->>'payment_amount')::numeric, 0);
      v_pay_reference := nullif(trim(coalesce(v_doc->>'payment_reference', '')), '');
      v_acc_debe_code  := trim(coalesce(v_doc->>'account_debe_code', ''));
      v_acc_haber_code := trim(coalesce(v_doc->>'account_haber_code', ''));
      v_br_debe_code   := nullif(trim(coalesce(v_doc->>'branch_code_debe',  '')), '');
      v_br_haber_code  := nullif(trim(coalesce(v_doc->>'branch_code_haber', '')), '');
      v_bl_debe_code   := nullif(trim(coalesce(v_doc->>'business_line_code_debe',  '')), '');
      v_bl_haber_code  := nullif(trim(coalesce(v_doc->>'business_line_code_haber', '')), '');

      -- ── 2. Normalizar doc_type ────────────────────────────────────────────────
      IF v_doc_type IN ('DEV','DEVOLUCIÓN','DEVOLUCION','INCOME_RETURN') THEN
        v_doc_type := 'DEVOLUCION';
      ELSIF v_doc_type IN ('ANTICIPO','ADVANCE','CUSTOMER_ADVANCE','ANT') THEN
        v_doc_type := 'CUSTOMER_ADVANCE';
      ELSE
        v_doc_type := 'OTRO_INGRESO';
      END IF;

      -- ── 3. Validaciones básicas ───────────────────────────────────────────────
      IF v_issue_date IS NULL THEN
        RAISE EXCEPTION 'issue_date es obligatorio (fila %)', v_row_no;
      END IF;
      IF v_grand_total IS NULL OR v_grand_total <= 0 THEN
        RAISE EXCEPTION 'grand_total debe ser > 0 (fila %)', v_row_no;
      END IF;
      IF v_acc_debe_code = '' OR v_acc_haber_code = '' THEN
        RAISE EXCEPTION 'account_debe_code y account_haber_code son obligatorios (fila %)', v_row_no;
      END IF;

      -- ── 4. Resolver contraparte ───────────────────────────────────────────────
      v_cp_identifier_norm := upper(regexp_replace(
        coalesce(v_cp_identifier, ''), '[^a-zA-Z0-9]', '', 'g'
      ));

      SELECT id INTO v_cp_id
      FROM public.counterparties
      WHERE company_id = p_company_id
        AND identifier_normalized = v_cp_identifier_norm
      LIMIT 1;

      IF v_cp_id IS NULL THEN
        INSERT INTO public.counterparties (
          company_id, identifier, identifier_normalized, name, type, is_active
        ) VALUES (
          p_company_id,
          v_cp_identifier,
          v_cp_identifier_norm,
          coalesce(nullif(v_cp_name,''), v_cp_identifier),
          'CLIENTE',
          true
        )
        RETURNING id INTO v_cp_id;
      END IF;

      -- ── 5. Resolver sucursal ──────────────────────────────────────────────────
      v_branch_id := NULL;
      IF v_branch_code IS NOT NULL THEN
        SELECT id INTO v_branch_id
        FROM public.branches
        WHERE company_id = p_company_id
          AND upper(trim(code)) = upper(v_branch_code)
        LIMIT 1;
        IF v_branch_id IS NULL THEN
          RAISE EXCEPTION 'Sucursal "%" no encontrada (fila %)', v_branch_code, v_row_no;
        END IF;
      END IF;

      -- ── 6. Resolver documento de origen ──────────────────────────────────────
      v_origin_doc_id := NULL;
      IF v_doc_type IN ('DEVOLUCION', 'CUSTOMER_ADVANCE') AND v_origin_number IS NOT NULL THEN
        SELECT td.id INTO v_origin_doc_id
        FROM public.trade_docs td
        WHERE td.company_id = p_company_id
          AND td.number = v_origin_number
          AND (v_origin_doc_type IS NULL OR upper(td.doc_type) = upper(v_origin_doc_type))
          AND (v_origin_fdc IS NULL OR td.fiscal_doc_code::text = v_origin_fdc)
        ORDER BY td.issue_date DESC
        LIMIT 1;
      END IF;

      -- ── 7. Resolver cuentas contables ─────────────────────────────────────────
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

      -- ── 8. Políticas de imputación ────────────────────────────────────────────
      SELECT coalesce(require_suc, false), coalesce(require_cu, false)
      INTO v_req_suc_debe, v_req_cu_debe
      FROM public.account_imputation_policies
      WHERE company_id = p_company_id AND account_node_id = v_acc_debe_id
      LIMIT 1;
      v_req_suc_debe := coalesce(v_req_suc_debe, false);
      v_req_cu_debe  := coalesce(v_req_cu_debe, false);

      SELECT coalesce(require_suc, false), coalesce(require_cu, false)
      INTO v_req_suc_haber, v_req_cu_haber
      FROM public.account_imputation_policies
      WHERE company_id = p_company_id AND account_node_id = v_acc_haber_id
      LIMIT 1;
      v_req_suc_haber := coalesce(v_req_suc_haber, false);
      v_req_cu_haber  := coalesce(v_req_cu_haber, false);

      IF v_req_suc_debe  AND v_br_debe_code  IS NULL THEN RAISE EXCEPTION 'Cuenta DEBE "%" exige Sucursal (fila %)', v_acc_debe_code, v_row_no; END IF;
      IF v_req_cu_debe   AND v_bl_debe_code  IS NULL THEN RAISE EXCEPTION 'Cuenta DEBE "%" exige CU (fila %)', v_acc_debe_code, v_row_no;     END IF;
      IF v_req_suc_haber AND v_br_haber_code IS NULL THEN RAISE EXCEPTION 'Cuenta HABER "%" exige Sucursal (fila %)', v_acc_haber_code, v_row_no; END IF;
      IF v_req_cu_haber  AND v_bl_haber_code IS NULL THEN RAISE EXCEPTION 'Cuenta HABER "%" exige CU (fila %)', v_acc_haber_code, v_row_no;     END IF;

      -- ── 9. Resolver segmentación ──────────────────────────────────────────────
      SELECT id INTO v_branch_debe_id  FROM public.branches       WHERE company_id = p_company_id AND upper(trim(code)) = upper(v_br_debe_code)  LIMIT 1;
      SELECT id INTO v_branch_haber_id FROM public.branches       WHERE company_id = p_company_id AND upper(trim(code)) = upper(v_br_haber_code) LIMIT 1;
      SELECT id INTO v_bl_debe_id      FROM public.business_lines WHERE company_id = p_company_id AND upper(trim(code)) = upper(v_bl_debe_code)  LIMIT 1;
      SELECT id INTO v_bl_haber_id     FROM public.business_lines WHERE company_id = p_company_id AND upper(trim(code)) = upper(v_bl_haber_code) LIMIT 1;

      -- ── 10. Crear documento ───────────────────────────────────────────────────
      INSERT INTO public.trade_docs (
        company_id, doc_class, doc_type, non_fiscal_doc_code,
        status, module, issue_date, due_date, series, number,
        currency_code, counterparty_id,
        counterparty_identifier_snapshot, counterparty_name_snapshot,
        grand_total, balance,
        net_taxable, net_exempt, tax_total,
        fiscal_doc_type_id, fiscal_doc_code,
        origin_doc_id, reference, branch_id
      ) VALUES (
        p_company_id, 'NON_FISCAL', v_doc_type, v_nf_code,
        'BORRADOR', 'SALES', v_issue_date, v_due_date, v_series, v_number,
        v_currency, v_cp_id,
        v_cp_identifier, v_cp_name,
        v_grand_total, v_grand_total,
        0, 0, 0, NULL, NULL,
        v_origin_doc_id, v_reference, v_branch_id
      )
      RETURNING id INTO v_doc_id;

      -- ── 11. Asiento contable ──────────────────────────────────────────────────
      INSERT INTO public.journal_entries (
        company_id, accounting_period_id, entry_date, description,
        currency_code, status, extra
      ) VALUES (
        p_company_id, v_period_id, v_issue_date,
        v_doc_type || ' - ' || coalesce(v_number, '') || ' - ' || v_cp_name,
        v_currency, 'DRAFT',
        jsonb_build_object('source', 'trade_docs_non_fiscal_import', 'trade_doc_id', v_doc_id)
      )
      RETURNING id INTO v_je_id;

      INSERT INTO public.journal_entry_lines (
        company_id, journal_entry_id, line_no,
        account_node_id, account_code_snapshot, account_name_snapshot,
        debit, credit, branch_id, business_line_id, line_description
      ) VALUES
        (p_company_id, v_je_id, 1, v_acc_debe_id,  v_acc_debe_code,  v_acc_debe_name,  v_grand_total, 0, v_branch_debe_id,  v_bl_debe_id,  v_doc_type || ' - ' || coalesce(v_number,'')),
        (p_company_id, v_je_id, 2, v_acc_haber_id, v_acc_haber_code, v_acc_haber_name, 0, v_grand_total, v_branch_haber_id, v_bl_haber_id, v_doc_type || ' - ' || coalesce(v_number,''));

      UPDATE public.trade_docs SET journal_entry_id = v_je_id WHERE id = v_doc_id;

      -- ── 12. Pago (opcional) ───────────────────────────────────────────────────
      IF v_pay_amount > 0 THEN
        INSERT INTO public.payments (
          company_id, payment_date, currency_code,
          method, reference, total_amount, extra
        ) VALUES (
          p_company_id, v_pay_date, v_currency,
          v_pay_method, v_pay_reference, v_pay_amount,
          jsonb_build_object('source','trade_docs_non_fiscal_import','trade_doc_id',v_doc_id)
        )
        RETURNING id INTO v_pay_id;

        INSERT INTO public.payment_allocations (
          company_id, payment_id, trade_doc_id, allocated_amount
        ) VALUES (p_company_id, v_pay_id, v_doc_id, v_pay_amount);

        v_balance := GREATEST(v_grand_total - v_pay_amount, 0);
        UPDATE public.trade_docs SET balance = v_balance WHERE id = v_doc_id;
      END IF;

      v_ok_count := v_ok_count + 1;
      v_results  := v_results || jsonb_build_object(
        'row_no', v_row_no, 'status', 'OK',
        'doc_id', v_doc_id, 'je_id', v_je_id
      );

    EXCEPTION WHEN OTHERS THEN
      ROLLBACK TO SAVEPOINT sp_doc;
      v_error_count := v_error_count + 1;
      v_error_msg   := SQLERRM;
      v_results     := v_results || jsonb_build_object(
        'row_no', v_row_no, 'status', 'ERROR', 'message', v_error_msg
      );
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'ok_count',    v_ok_count,
    'error_count', v_error_count,
    'results',     to_jsonb(v_results)
  );
END;
$function$;

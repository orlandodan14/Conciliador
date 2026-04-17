-- =========================================================
-- 20260416_005_trade_doc_mass_import_process.sql
-- Validar y materializar documentos de importación
-- =========================================================

create or replace function public.process_trade_doc_import_job(
  _job_id uuid,
  _company_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
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
begin
  v_uid := auth.uid();

  if v_uid is null then
    raise exception 'Usuario no autenticado.';
  end if;

  if _job_id is null then
    raise exception 'job_id es obligatorio.';
  end if;

  if _company_id is null then
    raise exception 'company_id es obligatorio.';
  end if;

  select cm.role
    into v_role
  from public.company_members cm
  where cm.company_id = _company_id
    and cm.user_id = v_uid
    and upper(coalesce(cm.status, '')) = 'ACTIVE'
  limit 1;

  if v_role is null or upper(v_role) not in ('OWNER', 'EDITOR') then
    raise exception 'No tienes permisos para procesar importaciones en esta empresa.';
  end if;

  update public.trade_doc_import_jobs
  set status = 'PROCESSING',
      started_at = now()
  where id = _job_id
    and company_id = _company_id;

  for v_doc in
    select *
    from public.trade_doc_import_docs_stg d
    where d.job_id = _job_id
      and d.company_id = _company_id
    order by coalesce(d.source_row_no, 999999), d.created_at
  loop
    begin
      v_trade_doc_id := null;
      v_counterparty_id := null;
      v_branch_id := null;
      v_fiscal_doc_type_id := null;
      v_origin_doc_id := null;
      v_journal_entry_id := null;
      v_doc_total := 0;
      v_payments_total := 0;
      v_doc_type := upper(trim(coalesce(v_doc.doc_type, '')));
      v_is_note := v_doc_type in ('CREDIT_NOTE', 'DEBIT_NOTE');

      -- 1) validar cabecera mínima
      if trim(coalesce(v_doc.doc_key, '')) = '' then
        raise exception 'doc_key es obligatorio.';
      end if;

      if v_doc_type not in ('INVOICE', 'CREDIT_NOTE', 'DEBIT_NOTE') then
        raise exception 'doc_type % no es válido.', coalesce(v_doc.doc_type, '');
      end if;

      if trim(coalesce(v_doc.fiscal_doc_code, '')) = '' then
        raise exception 'fiscal_doc_code es obligatorio.';
      end if;

      if v_doc.issue_date is null then
        raise exception 'issue_date es obligatorio.';
      end if;

      if v_doc.due_date is null then
        raise exception 'due_date es obligatorio.';
      end if;

      if trim(coalesce(v_doc.number, '')) = '' then
        raise exception 'number es obligatorio.';
      end if;

      if trim(coalesce(v_doc.currency_code, '')) = '' then
        raise exception 'currency_code es obligatorio.';
      end if;

      if trim(coalesce(v_doc.branch_code, '')) = '' then
        raise exception 'branch_code es obligatorio.';
      end if;

      if trim(coalesce(v_doc.counterparty_identifier, '')) = '' then
        raise exception 'counterparty_identifier es obligatorio.';
      end if;

      if trim(coalesce(v_doc.counterparty_name, '')) = '' then
        raise exception 'counterparty_name es obligatorio.';
      end if;

      -- 2) validar líneas
      select exists (
        select 1
        from public.trade_doc_import_lines_stg l
        where l.job_id = _job_id
          and l.company_id = _company_id
          and l.doc_key = v_doc.doc_key
      )
      into v_has_lines;

      if not v_has_lines then
        raise exception 'El documento no tiene líneas.';
      end if;

      -- 3) validar duplicado interno dentro del mismo archivo
      if exists (
        select 1
        from public.trade_doc_import_docs_stg d2
        where d2.job_id = _job_id
          and d2.company_id = _company_id
          and d2.id <> v_doc.id
          and upper(trim(coalesce(d2.fiscal_doc_code,''))) = upper(trim(coalesce(v_doc.fiscal_doc_code,'')))
          and upper(trim(coalesce(d2.series,''))) = upper(trim(coalesce(v_doc.series,'')))
          and upper(trim(coalesce(d2.number,''))) = upper(trim(coalesce(v_doc.number,'')))
      ) then
        raise exception 'El folio está duplicado dentro del archivo.';
      end if;

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
      if v_is_note then
        v_origin_doc_id := public.resolve_import_origin_doc(
          _company_id,
          v_doc.origin_fiscal_doc_code,
          v_doc.origin_series,
          v_doc.origin_number,
          v_counterparty_id
        );
      else
        v_origin_doc_id := null;
      end if;

      -- 8) validar pagos
      select coalesce(sum(p.amount), 0)
      into v_payments_total
      from public.trade_doc_import_payments_stg p
      where p.job_id = _job_id
        and p.company_id = _company_id
        and p.doc_key = v_doc.doc_key;

      if v_is_note and v_payments_total > 0 then
        raise exception 'Las notas de crédito/débito no pueden traer pagos.';
      end if;

      -- 9) insertar cabecera
      insert into public.trade_docs (
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
      values (
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
      returning id into v_trade_doc_id;

      -- 10) insertar líneas
      insert into public.trade_doc_lines (
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
      select
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
          select i.id
          from public.items i
          where i.company_id = _company_id
            and upper(trim(i.sku)) = upper(trim(coalesce(l.sku, '')))
            and i.is_active = true
          limit 1
        ) as item_id
      from public.trade_doc_import_lines_stg l
      where l.job_id = _job_id
        and l.company_id = _company_id
        and l.doc_key = v_doc.doc_key
      order by l.line_no;

      -- 11) releer total real calculado por trigger
      select td.grand_total
        into v_doc_total
      from public.trade_docs td
      where td.company_id = _company_id
        and td.id = v_trade_doc_id;

      if v_payments_total > v_doc_total then
        raise exception 'La suma de pagos excede el total del documento.';
      end if;

      -- 12) crear journal entry draft
      insert into public.journal_entries (
        company_id,
        entry_date,
        description,
        reference,
        currency_code,
        status,
        created_by,
        extra
      )
      values (
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
      returning id into v_journal_entry_id;

      -- 13) vincular journal entry al documento
      update public.trade_docs
      set journal_entry_id = v_journal_entry_id,
          updated_by = v_uid
      where company_id = _company_id
        and id = v_trade_doc_id;

      -- 14) pagos draft si aplica
      insert into public.payments (
        company_id,
        payment_date,
        currency_code,
        method,
        reference,
        card_kind,
        card_last4,
        auth_code,
        total_amount,
        extra,
        created_by
      )
      select
        _company_id,
        p.payment_date,
        upper(trim(v_doc.currency_code)),
        upper(trim(p.method)),
        p.reference,
        p.card_kind,
        p.card_last4,
        p.auth_code,
        p.amount,
        jsonb_build_object(
          'source', 'trade_doc_mass_import',
          'trade_doc_id', v_trade_doc_id,
          'draft', true
        ),
        v_uid
      from public.trade_doc_import_payments_stg p
      where p.job_id = _job_id
        and p.company_id = _company_id
        and p.doc_key = v_doc.doc_key;

      insert into public.payment_allocations (
        company_id,
        payment_id,
        trade_doc_id,
        allocated_amount,
        created_by
      )
      select
        _company_id,
        p.id,
        v_trade_doc_id,
        p.total_amount,
        v_uid
      from public.payments p
      where p.company_id = _company_id
        and coalesce(p.extra->>'trade_doc_id','') = v_trade_doc_id::text
        and coalesce(p.extra->>'source','') = 'trade_doc_mass_import';

      -- 15) marcar staging como importado
      update public.trade_doc_import_docs_stg
      set process_status = 'IMPORTED',
          created_trade_doc_id = v_trade_doc_id,
          created_counterparty_id = v_counterparty_id,
          created_journal_entry_id = v_journal_entry_id
      where id = v_doc.id;

      perform public.log_trade_doc_import_result(
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

    exception
      when others then
        update public.trade_doc_import_docs_stg
        set process_status = 'ERROR',
            error_count = error_count + 1
        where id = v_doc.id;

        perform public.log_trade_doc_import_result(
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
          null
        );

        v_error_docs := v_error_docs + 1;
    end;
  end loop;

  update public.trade_doc_import_jobs
  set status = case when v_error_docs > 0 then 'DONE_WITH_ERRORS' else 'DONE' end,
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
  where id = _job_id
    and company_id = _company_id;

  return jsonb_build_object(
    'job_id', _job_id,
    'ok_docs', v_ok_docs,
    'error_docs', v_error_docs,
    'warning_docs', v_warning_docs
  );
end;
$$;


create or replace function public.get_trade_doc_import_job_result(
  _job_id uuid,
  _company_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_job jsonb;
  v_results jsonb;
begin
  select to_jsonb(j)
    into v_job
  from (
    select *
    from public.trade_doc_import_jobs
    where id = _job_id
      and company_id = _company_id
  ) j;

  select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at, r.doc_key), '[]'::jsonb)
    into v_results
  from (
    select *
    from public.trade_doc_import_results
    where job_id = _job_id
      and company_id = _company_id
  ) r;

  return jsonb_build_object(
    'job', coalesce(v_job, '{}'::jsonb),
    'results', v_results
  );
end;
$$;
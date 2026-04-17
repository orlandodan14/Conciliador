-- =========================================================
-- 20260416_004_trade_doc_mass_import_append_batch.sql
-- Insertar staging en lote
-- =========================================================

create or replace function public.append_trade_doc_import_batch(
  _job_id uuid,
  _company_id uuid,
  _docs jsonb,
  _lines jsonb,
  _payments jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid;
  v_role text;
  v_docs_count int := 0;
  v_lines_count int := 0;
  v_payments_count int := 0;
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
    raise exception 'No tienes permisos para cargar staging en esta empresa.';
  end if;

  if _docs is not null and jsonb_typeof(_docs) = 'array' then
    insert into public.trade_doc_import_docs_stg (
      job_id,
      company_id,
      source_row_no,
      doc_key,
      doc_type,
      fiscal_doc_code,
      issue_date,
      due_date,
      series,
      number,
      currency_code,
      branch_code,
      counterparty_identifier,
      counterparty_name,
      reference,
      origin_fiscal_doc_code,
      origin_series,
      origin_number,
      raw_payload,
      normalized_payload
    )
    select
      _job_id,
      _company_id,
      nullif(x->>'source_row_no','')::int,
      x->>'doc_key',
      x->>'doc_type',
      x->>'fiscal_doc_code',
      (x->>'issue_date')::date,
      (x->>'due_date')::date,
      nullif(x->>'series',''),
      x->>'number',
      x->>'currency_code',
      x->>'branch_code',
      x->>'counterparty_identifier',
      x->>'counterparty_name',
      nullif(x->>'reference',''),
      nullif(x->>'origin_fiscal_doc_code',''),
      nullif(x->>'origin_series',''),
      nullif(x->>'origin_number',''),
      x,
      x
    from jsonb_array_elements(_docs) x;

    get diagnostics v_docs_count = row_count;
  end if;

  if _lines is not null and jsonb_typeof(_lines) = 'array' then
    insert into public.trade_doc_import_lines_stg (
      job_id,
      company_id,
      doc_key,
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
      raw_payload
    )
    select
      _job_id,
      _company_id,
      x->>'doc_key',
      (x->>'line_no')::int,
      nullif(x->>'sku',''),
      x->>'description',
      coalesce(nullif(x->>'qty','')::numeric, 0),
      coalesce(nullif(x->>'unit_price','')::numeric, 0),
      x->>'tax_kind',
      coalesce(nullif(x->>'tax_rate','')::numeric, 0),
      coalesce(nullif(x->>'exempt_amount','')::numeric, 0),
      coalesce(nullif(x->>'taxable_amount','')::numeric, 0),
      coalesce(nullif(x->>'tax_amount','')::numeric, 0),
      coalesce(nullif(x->>'line_total','')::numeric, 0),
      x
    from jsonb_array_elements(_lines) x;

    get diagnostics v_lines_count = row_count;
  end if;

  if _payments is not null and jsonb_typeof(_payments) = 'array' then
    insert into public.trade_doc_import_payments_stg (
      job_id,
      company_id,
      doc_key,
      payment_no,
      payment_date,
      method,
      reference,
      card_kind,
      card_last4,
      auth_code,
      amount,
      raw_payload
    )
    select
      _job_id,
      _company_id,
      x->>'doc_key',
      (x->>'payment_no')::int,
      (x->>'payment_date')::date,
      x->>'method',
      nullif(x->>'reference',''),
      nullif(x->>'card_kind',''),
      nullif(x->>'card_last4',''),
      nullif(x->>'auth_code',''),
      coalesce(nullif(x->>'amount','')::numeric, 0),
      x
    from jsonb_array_elements(_payments) x;

    get diagnostics v_payments_count = row_count;
  end if;

  update public.trade_doc_import_jobs
  set total_docs = (
    select count(*)
    from public.trade_doc_import_docs_stg d
    where d.job_id = _job_id
  )
  where id = _job_id;

  return jsonb_build_object(
    'docs_inserted', v_docs_count,
    'lines_inserted', v_lines_count,
    'payments_inserted', v_payments_count
  );
end;
$$;
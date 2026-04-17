-- =========================================================
-- 20260416_003_trade_doc_mass_import_functions_base.sql
-- Funciones base para carga masiva
-- =========================================================

-- =========================
-- Helper: registrar resultado
-- =========================
create or replace function public.log_trade_doc_import_result(
  _job_id uuid,
  _company_id uuid,
  _doc_key text,
  _doc_type text,
  _fiscal_doc_code text,
  _series text,
  _number text,
  _status text,
  _stage text,
  _message text,
  _detail jsonb default '{}'::jsonb,
  _trade_doc_id uuid default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.trade_doc_import_results (
    job_id,
    company_id,
    doc_key,
    doc_type,
    fiscal_doc_code,
    series,
    number,
    status,
    stage,
    message,
    detail,
    trade_doc_id
  )
  values (
    _job_id,
    _company_id,
    _doc_key,
    _doc_type,
    _fiscal_doc_code,
    _series,
    _number,
    _status,
    _stage,
    _message,
    coalesce(_detail, '{}'::jsonb),
    _trade_doc_id
  );
end;
$$;


-- =========================
-- Crear job
-- =========================
create or replace function public.create_trade_doc_import_job(
  _company_id uuid,
  _source text,
  _file_name text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid;
  v_role text;
  v_job_id uuid;
begin
  v_uid := auth.uid();

  if v_uid is null then
    raise exception 'Usuario no autenticado.';
  end if;

  if _company_id is null then
    raise exception 'company_id es obligatorio.';
  end if;

  if _source is null or _source not in ('EXCEL', 'API') then
    raise exception 'source debe ser EXCEL o API.';
  end if;

  select cm.role
    into v_role
  from public.company_members cm
  where cm.company_id = _company_id
    and cm.user_id = v_uid
    and upper(coalesce(cm.status, '')) = 'ACTIVE'
  limit 1;

  if v_role is null or upper(v_role) not in ('OWNER', 'EDITOR') then
    raise exception 'No tienes permisos para crear importaciones en esta empresa.';
  end if;

  insert into public.trade_doc_import_jobs (
    company_id,
    source,
    status,
    file_name,
    requested_by
  )
  values (
    _company_id,
    _source,
    'PENDING',
    _file_name,
    v_uid
  )
  returning id into v_job_id;

  return v_job_id;
end;
$$;


-- =========================
-- Resolver o crear tercero
-- =========================
create or replace function public.resolve_or_create_import_counterparty(
  _company_id uuid,
  _identifier text,
  _name text,
  _user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id uuid;
  v_identifier text;
  v_identifier_normalized text;
  v_name text;
begin
  v_identifier := trim(coalesce(_identifier, ''));
  v_name := trim(coalesce(_name, ''));

  if v_identifier = '' then
    raise exception 'counterparty_identifier es obligatorio.';
  end if;

  if v_name = '' then
    raise exception 'counterparty_name es obligatorio.';
  end if;

  v_identifier_normalized := upper(regexp_replace(v_identifier, '[^A-Za-z0-9]', '', 'g'));

  if v_identifier_normalized = '' then
    raise exception 'counterparty_identifier no es válido.';
  end if;

  select c.id
    into v_id
  from public.counterparties c
  where c.company_id = _company_id
    and c.identifier_normalized = v_identifier_normalized
  limit 1;

  if v_id is not null then
    return v_id;
  end if;

  insert into public.counterparties (
    company_id,
    identifier,
    identifier_normalized,
    name,
    type,
    is_active,
    created_by,
    updated_by
  )
  values (
    _company_id,
    v_identifier,
    v_identifier_normalized,
    v_name,
    'OTRO',
    true,
    _user_id,
    _user_id
  )
  returning id into v_id;

  return v_id;
end;
$$;


-- =========================
-- Resolver sucursal
-- =========================
create or replace function public.resolve_import_branch(
  _company_id uuid,
  _branch_code text
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_branch_id uuid;
  v_code text;
begin
  v_code := trim(coalesce(_branch_code, ''));

  if v_code = '' then
    raise exception 'branch_code es obligatorio.';
  end if;

  select b.id
    into v_branch_id
  from public.branches b
  where b.company_id = _company_id
    and upper(trim(b.code)) = upper(v_code)
    and b.is_active = true
  limit 1;

  if v_branch_id is null then
    raise exception 'La sucursal % no existe o está inactiva.', v_code;
  end if;

  return v_branch_id;
end;
$$;


-- =========================
-- Resolver tipo fiscal
-- =========================
create or replace function public.resolve_import_fiscal_doc_type(
  _company_id uuid,
  _fiscal_doc_code text
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id uuid;
  v_code text;
begin
  v_code := trim(coalesce(_fiscal_doc_code, ''));

  if v_code = '' then
    raise exception 'fiscal_doc_code es obligatorio.';
  end if;

  select fdt.id
    into v_id
  from public.fiscal_doc_types fdt
  where fdt.company_id = _company_id
    and upper(trim(fdt.code)) = upper(v_code)
    and fdt.is_active = true
  limit 1;

  if v_id is null then
    raise exception 'El tipo fiscal % no existe o está inactivo.', v_code;
  end if;

  return v_id;
end;
$$;


-- =========================
-- Resolver origen para NC/ND
-- =========================
create or replace function public.resolve_import_origin_doc(
  _company_id uuid,
  _origin_fiscal_doc_code text,
  _origin_series text,
  _origin_number text,
  _counterparty_id uuid
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_origin_id uuid;
  v_fiscal_doc_type_id uuid;
  v_series_norm text;
  v_number_norm text;
begin
  if trim(coalesce(_origin_fiscal_doc_code, '')) = '' then
    raise exception 'origin_fiscal_doc_code es obligatorio para NC/ND.';
  end if;

  if trim(coalesce(_origin_number, '')) = '' then
    raise exception 'origin_number es obligatorio para NC/ND.';
  end if;

  v_fiscal_doc_type_id := public.resolve_import_fiscal_doc_type(_company_id, _origin_fiscal_doc_code);
  v_series_norm := upper(trim(coalesce(_origin_series, '')));
  v_number_norm := upper(trim(coalesce(_origin_number, '')));

  select td.id
    into v_origin_id
  from public.trade_docs td
  where td.company_id = _company_id
    and td.doc_class = 'FISCAL'
    and td.fiscal_doc_type_id = v_fiscal_doc_type_id
    and coalesce(td.series_norm, '') = v_series_norm
    and coalesce(td.number_norm, '') = v_number_norm
    and td.counterparty_id = _counterparty_id
  limit 1;

  if v_origin_id is null then
    raise exception 'No se encontró documento origen válido para % %.',
      trim(coalesce(_origin_fiscal_doc_code,'')),
      trim(coalesce(_origin_number,''));
  end if;

  return v_origin_id;
end;
$$;
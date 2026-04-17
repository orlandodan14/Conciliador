-- =========================================================
-- 20260416_001_trade_doc_mass_import_base.sql
-- Base para carga masiva de documentos tributarios
-- =========================================================

-- =========================
-- 1) TABLA JOBS
-- =========================
create table if not exists public.trade_doc_import_jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  source text not null check (source in ('EXCEL', 'API')),
  status text not null check (status in ('PENDING', 'PROCESSING', 'DONE', 'DONE_WITH_ERRORS', 'FAILED')),
  file_name text null,
  requested_by uuid null,
  created_at timestamptz not null default now(),
  started_at timestamptz null,
  finished_at timestamptz null,
  total_docs int not null default 0,
  ok_docs int not null default 0,
  error_docs int not null default 0,
  warning_docs int not null default 0,
  summary jsonb not null default '{}'::jsonb
);

create index if not exists idx_trade_doc_import_jobs_company_status_created
  on public.trade_doc_import_jobs(company_id, status, created_at desc);


-- =========================
-- 2) STAGING DOCUMENTOS
-- =========================
create table if not exists public.trade_doc_import_docs_stg (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.trade_doc_import_jobs(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  source_row_no int null,
  doc_key text not null,
  doc_type text not null,
  fiscal_doc_code text not null,
  issue_date date not null,
  due_date date not null,
  series text null,
  number text not null,
  currency_code text not null,
  branch_code text not null,
  counterparty_identifier text not null,
  counterparty_name text not null,
  reference text null,
  origin_fiscal_doc_code text null,
  origin_series text null,
  origin_number text null,
  raw_payload jsonb not null default '{}'::jsonb,
  normalized_payload jsonb not null default '{}'::jsonb,
  process_status text not null default 'PENDING'
    check (process_status in ('PENDING','VALIDATED','ERROR','IMPORTED')),
  error_count int not null default 0,
  created_trade_doc_id uuid null,
  created_counterparty_id uuid null,
  created_journal_entry_id uuid null,
  created_at timestamptz not null default now()
);

create unique index if not exists ux_trade_doc_import_docs_stg_job_doc_key
  on public.trade_doc_import_docs_stg(job_id, doc_key);

create index if not exists idx_trade_doc_import_docs_stg_job_company
  on public.trade_doc_import_docs_stg(job_id, company_id);

create index if not exists idx_trade_doc_import_docs_stg_job_status
  on public.trade_doc_import_docs_stg(job_id, process_status);


-- =========================
-- 3) STAGING LINEAS
-- =========================
create table if not exists public.trade_doc_import_lines_stg (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.trade_doc_import_jobs(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  doc_key text not null,
  line_no int not null,
  sku text null,
  description text not null,
  qty numeric not null default 0,
  unit_price numeric not null default 0,
  tax_kind text not null,
  tax_rate numeric not null default 0,
  exempt_amount numeric not null default 0,
  taxable_amount numeric not null default 0,
  tax_amount numeric not null default 0,
  line_total numeric not null default 0,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint chk_trade_doc_import_lines_stg_qty_non_negative check (qty >= 0),
  constraint chk_trade_doc_import_lines_stg_unit_price_non_negative check (unit_price >= 0),
  constraint chk_trade_doc_import_lines_stg_tax_rate_non_negative check (tax_rate >= 0),
  constraint chk_trade_doc_import_lines_stg_exempt_non_negative check (exempt_amount >= 0),
  constraint chk_trade_doc_import_lines_stg_taxable_non_negative check (taxable_amount >= 0),
  constraint chk_trade_doc_import_lines_stg_tax_non_negative check (tax_amount >= 0),
  constraint chk_trade_doc_import_lines_stg_total_non_negative check (line_total >= 0)
);

create unique index if not exists ux_trade_doc_import_lines_stg_job_doc_line
  on public.trade_doc_import_lines_stg(job_id, doc_key, line_no);

create index if not exists idx_trade_doc_import_lines_stg_job_doc
  on public.trade_doc_import_lines_stg(job_id, doc_key);


-- =========================
-- 4) STAGING PAGOS
-- =========================
create table if not exists public.trade_doc_import_payments_stg (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.trade_doc_import_jobs(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  doc_key text not null,
  payment_no int not null,
  payment_date date not null,
  method text not null,
  reference text null,
  card_kind text null,
  card_last4 text null,
  auth_code text null,
  amount numeric not null default 0,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint chk_trade_doc_import_payments_stg_amount_positive check (amount >= 0)
);

create unique index if not exists ux_trade_doc_import_payments_stg_job_doc_payment
  on public.trade_doc_import_payments_stg(job_id, doc_key, payment_no);

create index if not exists idx_trade_doc_import_payments_stg_job_doc
  on public.trade_doc_import_payments_stg(job_id, doc_key);


-- =========================
-- 5) RESULTADOS
-- =========================
create table if not exists public.trade_doc_import_results (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.trade_doc_import_jobs(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  doc_key text not null,
  doc_type text null,
  fiscal_doc_code text null,
  series text null,
  number text null,
  status text not null check (status in ('OK', 'ERROR', 'WARNING')),
  stage text not null check (stage in ('STRUCTURE', 'VALIDATION', 'MATERIALIZATION', 'POST_PROCESS')),
  message text not null,
  detail jsonb not null default '{}'::jsonb,
  trade_doc_id uuid null,
  created_at timestamptz not null default now()
);

create index if not exists idx_trade_doc_import_results_job_doc
  on public.trade_doc_import_results(job_id, doc_key);

create index if not exists idx_trade_doc_import_results_job_status
  on public.trade_doc_import_results(job_id, status);


-- =========================
-- 6) HABILITAR RLS
-- =========================
alter table public.trade_doc_import_jobs enable row level security;
alter table public.trade_doc_import_docs_stg enable row level security;
alter table public.trade_doc_import_lines_stg enable row level security;
alter table public.trade_doc_import_payments_stg enable row level security;
alter table public.trade_doc_import_results enable row level security;


-- =========================
-- 7) POLICIES JOBS
-- =========================
drop policy if exists p_trade_doc_import_jobs_select on public.trade_doc_import_jobs;
create policy p_trade_doc_import_jobs_select
on public.trade_doc_import_jobs
for select
using (
  exists (
    select 1
    from public.company_members cm
    where cm.company_id = trade_doc_import_jobs.company_id
      and cm.user_id = auth.uid()
      and cm.status ilike 'active%'
  )
);

drop policy if exists p_trade_doc_import_jobs_write on public.trade_doc_import_jobs;
create policy p_trade_doc_import_jobs_write
on public.trade_doc_import_jobs
for all
using (
  exists (
    select 1
    from public.company_members cm
    where cm.company_id = trade_doc_import_jobs.company_id
      and cm.user_id = auth.uid()
      and cm.status ilike 'active%'
      and cm.role in ('OWNER', 'EDITOR')
  )
)
with check (
  exists (
    select 1
    from public.company_members cm
    where cm.company_id = trade_doc_import_jobs.company_id
      and cm.user_id = auth.uid()
      and cm.status ilike 'active%'
      and cm.role in ('OWNER', 'EDITOR')
  )
);


-- =========================
-- 8) POLICIES DOCS STG
-- =========================
drop policy if exists p_trade_doc_import_docs_stg_select on public.trade_doc_import_docs_stg;
create policy p_trade_doc_import_docs_stg_select
on public.trade_doc_import_docs_stg
for select
using (
  exists (
    select 1
    from public.company_members cm
    where cm.company_id = trade_doc_import_docs_stg.company_id
      and cm.user_id = auth.uid()
      and cm.status ilike 'active%'
  )
);

drop policy if exists p_trade_doc_import_docs_stg_write on public.trade_doc_import_docs_stg;
create policy p_trade_doc_import_docs_stg_write
on public.trade_doc_import_docs_stg
for all
using (
  exists (
    select 1
    from public.company_members cm
    where cm.company_id = trade_doc_import_docs_stg.company_id
      and cm.user_id = auth.uid()
      and cm.status ilike 'active%'
      and cm.role in ('OWNER', 'EDITOR')
  )
)
with check (
  exists (
    select 1
    from public.company_members cm
    where cm.company_id = trade_doc_import_docs_stg.company_id
      and cm.user_id = auth.uid()
      and cm.status ilike 'active%'
      and cm.role in ('OWNER', 'EDITOR')
  )
);


-- =========================
-- 9) POLICIES LINES STG
-- =========================
drop policy if exists p_trade_doc_import_lines_stg_select on public.trade_doc_import_lines_stg;
create policy p_trade_doc_import_lines_stg_select
on public.trade_doc_import_lines_stg
for select
using (
  exists (
    select 1
    from public.company_members cm
    where cm.company_id = trade_doc_import_lines_stg.company_id
      and cm.user_id = auth.uid()
      and cm.status ilike 'active%'
  )
);

drop policy if exists p_trade_doc_import_lines_stg_write on public.trade_doc_import_lines_stg;
create policy p_trade_doc_import_lines_stg_write
on public.trade_doc_import_lines_stg
for all
using (
  exists (
    select 1
    from public.company_members cm
    where cm.company_id = trade_doc_import_lines_stg.company_id
      and cm.user_id = auth.uid()
      and cm.status ilike 'active%'
      and cm.role in ('OWNER', 'EDITOR')
  )
)
with check (
  exists (
    select 1
    from public.company_members cm
    where cm.company_id = trade_doc_import_lines_stg.company_id
      and cm.user_id = auth.uid()
      and cm.status ilike 'active%'
      and cm.role in ('OWNER', 'EDITOR')
  )
);


-- =========================
-- 10) POLICIES PAYMENTS STG
-- =========================
drop policy if exists p_trade_doc_import_payments_stg_select on public.trade_doc_import_payments_stg;
create policy p_trade_doc_import_payments_stg_select
on public.trade_doc_import_payments_stg
for select
using (
  exists (
    select 1
    from public.company_members cm
    where cm.company_id = trade_doc_import_payments_stg.company_id
      and cm.user_id = auth.uid()
      and cm.status ilike 'active%'
  )
);

drop policy if exists p_trade_doc_import_payments_stg_write on public.trade_doc_import_payments_stg;
create policy p_trade_doc_import_payments_stg_write
on public.trade_doc_import_payments_stg
for all
using (
  exists (
    select 1
    from public.company_members cm
    where cm.company_id = trade_doc_import_payments_stg.company_id
      and cm.user_id = auth.uid()
      and cm.status ilike 'active%'
      and cm.role in ('OWNER', 'EDITOR')
  )
)
with check (
  exists (
    select 1
    from public.company_members cm
    where cm.company_id = trade_doc_import_payments_stg.company_id
      and cm.user_id = auth.uid()
      and cm.status ilike 'active%'
      and cm.role in ('OWNER', 'EDITOR')
  )
);


-- =========================
-- 11) POLICIES RESULTS
-- =========================
drop policy if exists p_trade_doc_import_results_select on public.trade_doc_import_results;
create policy p_trade_doc_import_results_select
on public.trade_doc_import_results
for select
using (
  exists (
    select 1
    from public.company_members cm
    where cm.company_id = trade_doc_import_results.company_id
      and cm.user_id = auth.uid()
      and cm.status ilike 'active%'
  )
);

drop policy if exists p_trade_doc_import_results_write on public.trade_doc_import_results;
create policy p_trade_doc_import_results_write
on public.trade_doc_import_results
for all
using (
  exists (
    select 1
    from public.company_members cm
    where cm.company_id = trade_doc_import_results.company_id
      and cm.user_id = auth.uid()
      and cm.status ilike 'active%'
      and cm.role in ('OWNER', 'EDITOR')
  )
)
with check (
  exists (
    select 1
    from public.company_members cm
    where cm.company_id = trade_doc_import_results.company_id
      and cm.user_id = auth.uid()
      and cm.status ilike 'active%'
      and cm.role in ('OWNER', 'EDITOR')
  )
);
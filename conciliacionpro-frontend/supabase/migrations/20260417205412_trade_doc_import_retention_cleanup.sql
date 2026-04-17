create or replace function public.cleanup_trade_doc_import_retention()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted_docs_stg_success integer := 0;
  v_deleted_lines_stg_success integer := 0;
  v_deleted_payments_stg_success integer := 0;
  v_deleted_results_success integer := 0;

  v_deleted_docs_stg_error integer := 0;
  v_deleted_lines_stg_error integer := 0;
  v_deleted_payments_stg_error integer := 0;
  v_deleted_results_error integer := 0;

  v_deleted_jobs integer := 0;
begin
  -- 1) Jobs exitosos: borrar staging + results a los 30 días
  with success_jobs as (
    select j.id, j.company_id
    from public.trade_doc_import_jobs j
    where upper(coalesce(j.status, '')) = 'DONE'
      and coalesce(j.finished_at, j.created_at) < now() - interval '30 days'
  )
  delete from public.trade_doc_import_docs_stg d
  using success_jobs s
  where d.job_id = s.id
    and d.company_id = s.company_id;
  get diagnostics v_deleted_docs_stg_success = row_count;

  with success_jobs as (
    select j.id, j.company_id
    from public.trade_doc_import_jobs j
    where upper(coalesce(j.status, '')) = 'DONE'
      and coalesce(j.finished_at, j.created_at) < now() - interval '30 days'
  )
  delete from public.trade_doc_import_lines_stg l
  using success_jobs s
  where l.job_id = s.id
    and l.company_id = s.company_id;
  get diagnostics v_deleted_lines_stg_success = row_count;

  with success_jobs as (
    select j.id, j.company_id
    from public.trade_doc_import_jobs j
    where upper(coalesce(j.status, '')) = 'DONE'
      and coalesce(j.finished_at, j.created_at) < now() - interval '30 days'
  )
  delete from public.trade_doc_import_payments_stg p
  using success_jobs s
  where p.job_id = s.id
    and p.company_id = s.company_id;
  get diagnostics v_deleted_payments_stg_success = row_count;

  with success_jobs as (
    select j.id, j.company_id
    from public.trade_doc_import_jobs j
    where upper(coalesce(j.status, '')) = 'DONE'
      and coalesce(j.finished_at, j.created_at) < now() - interval '30 days'
  )
  delete from public.trade_doc_import_results r
  using success_jobs s
  where r.job_id = s.id
    and r.company_id = s.company_id;
  get diagnostics v_deleted_results_success = row_count;

  -- 2) Jobs con error: borrar staging + results a los 90 días
  with error_jobs as (
    select j.id, j.company_id
    from public.trade_doc_import_jobs j
    where upper(coalesce(j.status, '')) = 'DONE_WITH_ERRORS'
      and coalesce(j.finished_at, j.created_at) < now() - interval '90 days'
  )
  delete from public.trade_doc_import_docs_stg d
  using error_jobs e
  where d.job_id = e.id
    and d.company_id = e.company_id;
  get diagnostics v_deleted_docs_stg_error = row_count;

  with error_jobs as (
    select j.id, j.company_id
    from public.trade_doc_import_jobs j
    where upper(coalesce(j.status, '')) = 'DONE_WITH_ERRORS'
      and coalesce(j.finished_at, j.created_at) < now() - interval '90 days'
  )
  delete from public.trade_doc_import_lines_stg l
  using error_jobs e
  where l.job_id = e.id
    and l.company_id = e.company_id;
  get diagnostics v_deleted_lines_stg_error = row_count;

  with error_jobs as (
    select j.id, j.company_id
    from public.trade_doc_import_jobs j
    where upper(coalesce(j.status, '')) = 'DONE_WITH_ERRORS'
      and coalesce(j.finished_at, j.created_at) < now() - interval '90 days'
  )
  delete from public.trade_doc_import_payments_stg p
  using error_jobs e
  where p.job_id = e.id
    and p.company_id = e.company_id;
  get diagnostics v_deleted_payments_stg_error = row_count;

  with error_jobs as (
    select j.id, j.company_id
    from public.trade_doc_import_jobs j
    where upper(coalesce(j.status, '')) = 'DONE_WITH_ERRORS'
      and coalesce(j.finished_at, j.created_at) < now() - interval '90 days'
  )
  delete from public.trade_doc_import_results r
  using error_jobs e
  where r.job_id = e.id
    and r.company_id = e.company_id;
  get diagnostics v_deleted_results_error = row_count;

  -- 3) Jobs de auditoría: borrar a los 2 años
  delete from public.trade_doc_import_jobs j
  where upper(coalesce(j.status, '')) in ('DONE', 'DONE_WITH_ERRORS')
    and coalesce(j.finished_at, j.created_at) < now() - interval '2 years';
  get diagnostics v_deleted_jobs = row_count;

  return jsonb_build_object(
    'docs_stg_success_deleted', v_deleted_docs_stg_success,
    'lines_stg_success_deleted', v_deleted_lines_stg_success,
    'payments_stg_success_deleted', v_deleted_payments_stg_success,
    'results_success_deleted', v_deleted_results_success,
    'docs_stg_error_deleted', v_deleted_docs_stg_error,
    'lines_stg_error_deleted', v_deleted_lines_stg_error,
    'payments_stg_error_deleted', v_deleted_payments_stg_error,
    'results_error_deleted', v_deleted_results_error,
    'jobs_deleted', v_deleted_jobs
  );
end;
$$;

create index if not exists idx_trade_doc_import_jobs_status_finished_at
  on public.trade_doc_import_jobs (status, finished_at, created_at);

create index if not exists idx_trade_doc_import_docs_stg_job_company
  on public.trade_doc_import_docs_stg (job_id, company_id);

create index if not exists idx_trade_doc_import_lines_stg_job_company
  on public.trade_doc_import_lines_stg (job_id, company_id);

create index if not exists idx_trade_doc_import_payments_stg_job_company
  on public.trade_doc_import_payments_stg (job_id, company_id);

create index if not exists idx_trade_doc_import_results_job_company_status
  on public.trade_doc_import_results (job_id, company_id, status, created_at);
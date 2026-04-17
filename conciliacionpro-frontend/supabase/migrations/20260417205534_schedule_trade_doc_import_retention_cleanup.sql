do $$
begin
  if not exists (
    select 1
    from cron.job
    where jobname = 'cleanup-trade-doc-import-retention-daily'
  ) then
    perform cron.schedule(
      'cleanup-trade-doc-import-retention-daily',
      '0 3 * * *',
      $$select public.cleanup_trade_doc_import_retention();$$
    );
  end if;
end
$$;
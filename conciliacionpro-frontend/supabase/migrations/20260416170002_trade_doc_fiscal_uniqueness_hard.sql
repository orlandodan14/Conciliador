-- =========================================================
-- 20260416_002_trade_doc_fiscal_uniqueness_hard.sql
-- Folio fiscal no reutilizable, incluso cancelado
-- Compatible con series_norm / number_norm generadas
-- =========================================================

-- 1) Eliminar índice que permite reutilizar folios cancelados
drop index if exists public.ux_trade_docs_fiscal_folio_active;

-- 2) Validación preventiva opcional:
--    Si esto devuelve filas, tienes duplicados históricos y el índice único no podrá crearse.
--    Puedes ejecutar esta consulta manualmente en SQL Editor antes del push:
--
--    select
--      company_id,
--      fiscal_doc_type_id,
--      series_norm,
--      number_norm,
--      count(*)
--    from public.trade_docs
--    where doc_class = 'FISCAL'
--      and fiscal_doc_type_id is not null
--      and number_norm <> ''
--    group by company_id, fiscal_doc_type_id, series_norm, number_norm
--    having count(*) > 1;

-- 3) Crear regla única fiscal estricta.
--    Como series_norm y number_norm son columnas generadas, NO se actualizan manualmente.
create unique index if not exists ux_trade_docs_folio_fiscal
on public.trade_docs (
  company_id,
  fiscal_doc_type_id,
  series_norm,
  number_norm
)
where doc_class = 'FISCAL'
  and fiscal_doc_type_id is not null
  and number_norm <> '';
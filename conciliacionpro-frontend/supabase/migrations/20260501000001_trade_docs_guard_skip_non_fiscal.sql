-- =========================================================
-- 20260501000001_trade_docs_guard_skip_non_fiscal.sql
--
-- Corrige trg_trade_docs_guard para que documentos NON_FISCAL
-- (Otros Ingresos, Devoluciones) no requieran trade_doc_lines.
-- Los documentos NON_FISCAL usan payments + journal_entry_lines
-- en lugar de líneas de ítems (trade_doc_lines).
-- =========================================================

CREATE OR REPLACE FUNCTION public.trg_trade_docs_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
declare
  v_lines int;
begin
  new.updated_at := now();

  if new.counterparty_id is null then
    raise exception 'counterparty_id es obligatorio.';
  end if;

  -- Los documentos NON_FISCAL (Otros Ingresos, Devoluciones) no usan
  -- trade_doc_lines — usan payments + journal_entry_lines.
  -- Solo validar líneas de ítems para documentos FISCALES.
  if coalesce(new.doc_class, old.doc_class) = 'NON_FISCAL' then
    return new;
  end if;

  select count(*) into v_lines
  from public.trade_doc_lines
  where company_id = new.company_id and trade_doc_id = new.id;

  -- Permitir 0 líneas en BORRADOR durante procesos de eliminación/limpieza.
  -- Para cualquier otro estado, sigue siendo obligatorio tener al menos 1 línea.
  if tg_op = 'UPDATE'
     and v_lines = 0
     and coalesce(new.status, old.status) <> 'BORRADOR' then
    raise exception 'El documento debe tener al menos 1 línea.';
  end if;

  return new;
end;
$function$;

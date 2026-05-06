-- =========================================================
-- 20260502000003_timeline_add_status.sql
--
-- Agrega la columna "item_status" al output de
-- get_trade_doc_timeline para que el frontend pueda mostrar
-- el estado de cada fila en el expander row.
--
--  - DOC rows  → status del documento relacionado (VIGENTE, CANCELADO, BORRADOR…)
--  - PAYMENT rows → 'APPLIED'
-- =========================================================

DROP FUNCTION IF EXISTS public.get_trade_doc_timeline(uuid, uuid);

CREATE OR REPLACE FUNCTION public.get_trade_doc_timeline(
  p_company_id uuid,
  p_trade_doc_id uuid
)
RETURNS TABLE(
  event_date date,
  event_type text,
  related_doc_id uuid,
  payment_id uuid,
  doc_type text,
  fiscal_doc_code text,
  series text,
  number text,
  display_folio text,
  affects_label text,
  amount numeric,
  impact_sign int,
  running_group text,
  source_doc_id uuid,
  sort_ts timestamptz,
  item_status text          -- ← nuevo
)
LANGUAGE sql
STABLE
AS $function$
with recursive
-- ── Documento objetivo ─────────────────────────────────────────────────────
target_doc as (
  select
    td.id, td.company_id, td.origin_doc_id,
    td.issue_date, td.doc_type, td.fiscal_doc_code,
    td.series, td.number, td.grand_total, td.status
  from public.trade_docs td
  where td.company_id = p_company_id
    and td.id = p_trade_doc_id
),

-- ── Cadena ascendente (solo para INVOICE necesita llegar a root) ────────────
upward as (
  select
    td.id, td.company_id, td.origin_doc_id,
    td.issue_date, td.doc_type, td.fiscal_doc_code,
    td.series, td.number, td.grand_total, td.status
  from target_doc td
  union all
  select
    parent.id, parent.company_id, parent.origin_doc_id,
    parent.issue_date, parent.doc_type, parent.fiscal_doc_code,
    parent.series, parent.number, parent.grand_total, parent.status
  from public.trade_docs parent
  join upward u on parent.id = u.origin_doc_id
  where parent.company_id = p_company_id
),

-- ── Padre directo de NC/ND (un solo nivel hacia arriba) ─────────────────────
direct_parent as (
  select
    parent.id, parent.company_id, parent.origin_doc_id,
    parent.issue_date, parent.doc_type, parent.fiscal_doc_code,
    parent.series, parent.number, parent.grand_total, parent.status
  from target_doc t
  join public.trade_docs parent
    on parent.id = t.origin_doc_id
   and parent.company_id = p_company_id
),

-- ── Cadena descendente (INVOICE: NC, ND, DEV hijos y nietos) ────────────────
downward as (
  select
    td.id, td.company_id, td.origin_doc_id,
    td.issue_date, td.doc_type, td.fiscal_doc_code,
    td.series, td.number, td.grand_total, td.status, 0 as lvl
  from target_doc td
  union all
  select
    child.id, child.company_id, child.origin_doc_id,
    child.issue_date, child.doc_type, child.fiscal_doc_code,
    child.series, child.number, child.grand_total, child.status, d.lvl + 1
  from public.trade_docs child
  join downward d on child.origin_doc_id = d.id
  where child.company_id = p_company_id
    and d.lvl < 10
),

-- ── Documentos visibles según tipo del doc objetivo ─────────────────────────
visible_docs as (
  -- INVOICE → muestra toda la cadena descendente
  select d.id, d.company_id, d.origin_doc_id, d.issue_date,
         d.doc_type, d.fiscal_doc_code, d.series, d.number, d.grand_total, d.status
  from downward d
  join target_doc t on true
  where t.doc_type = 'INVOICE'
    and d.id <> p_trade_doc_id   -- excluir el propio doc

  union all

  -- NC/ND → muestra SOLO su padre directo
  select dp.id, dp.company_id, dp.origin_doc_id, dp.issue_date,
         dp.doc_type, dp.fiscal_doc_code, dp.series, dp.number, dp.grand_total, dp.status
  from direct_parent dp
  join target_doc t on true
  where t.doc_type in ('CREDIT_NOTE', 'DEBIT_NOTE')
),

-- ── Eventos de documentos ────────────────────────────────────────────────────
doc_events as (
  select
    d.issue_date as event_date,
    'DOC'::text as event_type,
    d.id as related_doc_id,
    null::uuid as payment_id,
    d.doc_type::text as doc_type,
    d.fiscal_doc_code::text as fiscal_doc_code,
    d.series::text as series,
    d.number::text as number,
    trim(both ' ' from concat(
      coalesce(d.series, ''),
      case when d.series is not null and d.number is not null then '-' else '' end,
      coalesce(d.number, '')
    )) as display_folio,
    case
      when d.id = p_trade_doc_id                  then 'Documento actual'
      when d.origin_doc_id is null                 then 'Documento raíz'
      when d.doc_type::text = 'CREDIT_NOTE'        then 'Nota de crédito afecta al documento relacionado'
      when d.doc_type::text = 'DEBIT_NOTE'         then 'Nota de débito afecta al documento relacionado'
      when d.doc_type::text = 'DEVOLUCION'         then 'Devolución gestionada por este documento'
      else                                              'Documento relacionado'
    end as affects_label,
    coalesce(d.grand_total, 0)::numeric as amount,
    case
      when d.id = p_trade_doc_id then
        case
          when d.doc_type::text = 'CREDIT_NOTE' then -1
          when d.doc_type::text = 'DEBIT_NOTE'  then  1
          else 1
        end
      when d.origin_doc_id is null                 then  1
      when d.doc_type::text = 'CREDIT_NOTE'        then -1
      when d.doc_type::text = 'DEBIT_NOTE'         then  1
      when d.doc_type::text = 'DEVOLUCION'         then  1
      else                                               1
    end as impact_sign,
    'DOCS'::text as running_group,
    d.origin_doc_id as source_doc_id,
    (d.issue_date::timestamp at time zone 'UTC') as sort_ts,
    d.status::text as item_status       -- ← status del doc relacionado
  from visible_docs d
),

-- ── Eventos de pagos (solo para INVOICE) ──────────────────────────────────
payment_events as (
  select
    coalesce(p.payment_date, p.created_at::date) as event_date,
    'PAYMENT'::text as event_type,
    pa.trade_doc_id as related_doc_id,
    p.id as payment_id,
    null::text as doc_type,
    null::text as fiscal_doc_code,
    null::text as series,
    null::text as number,
    null::text as display_folio,
    'Pago aplicado al documento relacionado' as affects_label,
    coalesce(pa.allocated_amount, 0)::numeric as amount,
    -1 as impact_sign,
    'PAYMENTS'::text as running_group,
    pa.trade_doc_id as source_doc_id,
    coalesce(p.payment_date::timestamp, p.created_at) as sort_ts,
    'APPLIED'::text as item_status      -- ← pagos siempre están aplicados
  from public.payment_allocations pa
  join public.payments p
    on p.id = pa.payment_id
   and p.company_id = pa.company_id
  join target_doc t on true
  where pa.company_id = p_company_id
    and t.doc_type = 'INVOICE'
    and pa.trade_doc_id = p_trade_doc_id
)

select *
from (
  select * from doc_events
  union all
  select * from payment_events
) q
order by q.event_date asc, q.sort_ts asc, q.event_type asc;
$function$;

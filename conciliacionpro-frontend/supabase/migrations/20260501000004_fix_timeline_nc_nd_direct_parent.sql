-- =========================================================
-- 20260501000004_fix_timeline_nc_nd_direct_parent.sql
--
-- Corrige get_trade_doc_timeline para NC y ND:
--   - INVOICE: muestra toda la cadena descendente (NC, ND, DEV) + pagos propios ✓
--   - NC:      muestra SOLO su origen directo (INVOICE o ND — nunca ambos)
--   - ND:      muestra SOLO su origen directo (INVOICE o NC — nunca ambos)
--
-- El filtro anterior usaba el upward completo para NC/ND, lo que
-- podría mostrar la cadena entera (NC → ND → INVOICE) en vez de
-- solo el padre inmediato (NC → ND).
-- =========================================================

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
  sort_ts timestamptz
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
  join upward u
    on parent.id = u.origin_doc_id
   and parent.company_id = u.company_id
),
root_doc as (
  select * from upward where origin_doc_id is null limit 1
),

-- ── Cadena descendente desde root (para INVOICE) ──────────────────────────
downward as (
  select
    td.id, td.company_id, td.origin_doc_id,
    td.issue_date, td.doc_type, td.fiscal_doc_code,
    td.series, td.number, td.grand_total, td.status,
    0 as lvl
  from public.trade_docs td
  join root_doc r on td.id = r.id and td.company_id = r.company_id

  union all

  select
    child.id, child.company_id, child.origin_doc_id,
    child.issue_date, child.doc_type, child.fiscal_doc_code,
    child.series, child.number, child.grand_total, child.status,
    d.lvl + 1
  from public.trade_docs child
  join downward d
    on child.origin_doc_id = d.id
   and child.company_id = d.company_id
),

-- ── Padre inmediato del doc objetivo ──────────────────────────────────────
direct_parent as (
  select
    parent.id, parent.company_id, parent.origin_doc_id,
    parent.issue_date, parent.doc_type, parent.fiscal_doc_code,
    parent.series, parent.number, parent.grand_total, parent.status
  from public.trade_docs parent
  join target_doc t on parent.id = t.origin_doc_id
    and parent.company_id = t.company_id
),

-- ── Documentos visibles según tipo del objetivo ───────────────────────────
-- INVOICE  → toda la cadena descendente (NC, ND, DEV, etc.)
-- NC / ND  → solo el padre inmediato (no toda la ascendencia)
visible_docs as (

  -- INVOICE: cadena completa hacia abajo
  select d.*
  from downward d
  join target_doc t on true
  where t.doc_type = 'INVOICE'
    and d.id in (select id from downward)

  union all

  -- NC o ND: el doc objetivo más su padre directo solamente
  select d.id, d.company_id, d.origin_doc_id,
         d.issue_date, d.doc_type, d.fiscal_doc_code,
         d.series, d.number, d.grand_total, d.status, 0 as lvl
  from (
    -- el propio doc objetivo
    select id, company_id, origin_doc_id, issue_date, doc_type,
           fiscal_doc_code, series, number, grand_total, status
    from target_doc
    union all
    -- su padre directo
    select id, company_id, origin_doc_id, issue_date, doc_type,
           fiscal_doc_code, series, number, grand_total, status
    from direct_parent
  ) d
  join target_doc t on true
  where t.doc_type in ('CREDIT_NOTE', 'DEBIT_NOTE')
),

-- ── Eventos de documentos ─────────────────────────────────────────────────
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
    (d.issue_date::timestamp at time zone 'UTC') as sort_ts
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
    coalesce(p.payment_date::timestamp, p.created_at) as sort_ts
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

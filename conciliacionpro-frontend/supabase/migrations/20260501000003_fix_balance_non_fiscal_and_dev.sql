-- =========================================================
-- 20260501000003_fix_balance_non_fiscal_and_dev.sql
--
-- Corrige recalc_trade_doc_chain_balance para:
--   1. Docs NON_FISCAL root (OTI, DEV independiente):
--      balance = grand_total - pagos_propios
--   2. Docs NON_FISCAL hijos en cadena FISCAL (DEV ligado a NC):
--      balance = grand_total - pagos_propios
--   3. INVOICE con DEV VIGENTE en cadena:
--      el grand_total del DEV offsets el NC, de modo que cuando
--      la devolución ya existe, el INVOICE queda en 0 y el saldo
--      pendiente migra al DEV.
--   4. Los pagos de docs NON_FISCAL NO se acumulan como pagos del
--      cliente en la fórmula del INVOICE (son pagos de devolución).
--
-- También mejora get_trade_doc_timeline para mostrar label correcto
-- para documentos DEVOLUCION.
-- =========================================================

-- ─── 1. recalc_trade_doc_chain_balance ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.recalc_trade_doc_chain_balance(
  p_company_id uuid,
  p_trade_doc_id uuid
)
RETURNS void
LANGUAGE plpgsql
AS $function$
declare
  v_root_id uuid;
  v_root_status text;
begin
  v_root_id := public.get_trade_doc_root_id(p_company_id, p_trade_doc_id);

  if v_root_id is null then
    return;
  end if;

  select upper(coalesce(td.status, ''))
    into v_root_status
  from public.trade_docs td
  where td.company_id = p_company_id
    and td.id = v_root_id;

  if v_root_status is null then
    return;
  end if;

  with recursive chain as (
    select
      td.id,
      td.company_id,
      td.origin_doc_id,
      upper(coalesce(td.doc_type,  ''))      as doc_type,
      upper(coalesce(td.doc_class, 'FISCAL')) as doc_class,
      upper(coalesce(td.status,    ''))      as status,
      coalesce(td.grand_total, 0)::numeric   as grand_total
    from public.trade_docs td
    where td.company_id = p_company_id
      and td.id = v_root_id

    union all

    select
      td.id,
      td.company_id,
      td.origin_doc_id,
      upper(coalesce(td.doc_type,  ''))      as doc_type,
      upper(coalesce(td.doc_class, 'FISCAL')) as doc_class,
      upper(coalesce(td.status,    ''))      as status,
      coalesce(td.grand_total, 0)::numeric   as grand_total
    from public.trade_docs td
    join chain c
      on td.origin_doc_id = c.id
     and td.company_id = c.company_id
  ),

  -- Solo documentos con el mismo estado que la raíz
  scope_chain as (
    select * from chain where status = v_root_status
  ),

  -- Pagos asignados a cada documento en scope
  per_doc_paid as (
    select
      pa.trade_doc_id,
      coalesce(sum(pa.allocated_amount), 0)::numeric as paid
    from public.payment_allocations pa
    where pa.company_id = p_company_id
      and pa.trade_doc_id in (select id from scope_chain)
    group by pa.trade_doc_id
  ),

  -- Pagos del cliente: solo a documentos FISCALES (no devoluciones)
  fiscal_payments as (
    select coalesce(sum(pdp.paid), 0)::numeric as total_fiscal_paid
    from per_doc_paid pdp
    join scope_chain sc on sc.id = pdp.trade_doc_id
    where sc.doc_class = 'FISCAL'
  ),

  -- Documentos hijos (sin la raíz) para calcular efectos NC/ND/DEV
  descendants_of_root as (
    select * from scope_chain where id <> v_root_id
  ),

  root_effect as (
    select
      -- NC reducen el saldo del INVOICE
      coalesce(sum(case
        when doc_type in ('CREDIT_NOTE','NC','NOTA_CREDITO','NOTA DE CREDITO')
        then grand_total else 0
      end), 0)::numeric as total_nc,
      -- ND aumentan el saldo del INVOICE
      coalesce(sum(case
        when doc_type in ('DEBIT_NOTE','ND','NOTA_DEBITO','NOTA DE DEBITO')
        then grand_total else 0
      end), 0)::numeric as total_nd,
      -- DEV VIGENTE en cadena: offsets la reducción del NC en el INVOICE.
      -- Cuando existe un DEV, el INVOICE queda "cerrado" y el saldo
      -- pendiente pasa al DEV. El DEV lleva su propio saldo hasta que
      -- sea pagado.
      coalesce(sum(case
        when doc_type = 'DEVOLUCION'
         and status not in ('CANCELADO','ANULADO','VOID','CANCELLED')
        then grand_total else 0
      end), 0)::numeric as total_dev_vigente
    from descendants_of_root
  ),

  balances as (
    select
      c.id,
      case
        -- Cancelado/anulado: saldo cero
        when c.status in ('CANCELADO','ANULADO','VOID','CANCELLED') then
          0::numeric

        -- ── RAÍZ INVOICE ──────────────────────────────────────────────
        -- Saldo = total - pagos_cliente - NC + ND + DEV_vigente
        -- Cuando el DEV existe y está vigente, offset el NC y el INVOICE
        -- queda en 0 (el saldo pasa al DEV).
        when c.id = v_root_id
         and c.doc_type in ('INVOICE','FACTURA','FISCAL_INVOICE') then
          c.grand_total
          - coalesce((select total_fiscal_paid   from fiscal_payments), 0)
          - coalesce((select total_nc            from root_effect),     0)
          + coalesce((select total_nd            from root_effect),     0)
          + coalesce((select total_dev_vigente   from root_effect),     0)

        -- ── RAÍZ CREDIT_NOTE ──────────────────────────────────────────
        when c.id = v_root_id
         and c.doc_type in ('CREDIT_NOTE','NC','NOTA_CREDITO','NOTA DE CREDITO') then
          c.grand_total
          - coalesce((select total_nd from root_effect), 0)

        -- ── RAÍZ DEBIT_NOTE ───────────────────────────────────────────
        when c.id = v_root_id
         and c.doc_type in ('DEBIT_NOTE','ND','NOTA_DEBITO','NOTA DE DEBITO') then
          c.grand_total
          - coalesce((select total_nc from root_effect), 0)

        -- ── RAÍZ NON_FISCAL (OTI o DEV independiente) ─────────────────
        -- balance = grand_total - pagos_propios
        when c.id = v_root_id
         and c.doc_class = 'NON_FISCAL' then
          c.grand_total
          - coalesce((select paid from per_doc_paid where trade_doc_id = c.id), 0)

        -- ── HIJOS FISCAL NC/ND: absorbidos en raíz ───────────────────
        when c.origin_doc_id is not null
         and c.doc_class = 'FISCAL'
         and c.doc_type in (
           'CREDIT_NOTE','NC','NOTA_CREDITO','NOTA DE CREDITO',
           'DEBIT_NOTE','ND','NOTA_DEBITO','NOTA DE DEBITO'
         ) then
          0::numeric

        -- ── HIJOS NON_FISCAL (DEV/OTI en cadena FISCAL) ──────────────
        -- balance propio = grand_total - pagos_propios
        when c.doc_class = 'NON_FISCAL' then
          c.grand_total
          - coalesce((select paid from per_doc_paid where trade_doc_id = c.id), 0)

        -- ── Otros hijos FISCAL ────────────────────────────────────────
        else
          coalesce(c.grand_total, 0)

      end as new_balance
    from scope_chain c
  )

  update public.trade_docs td
     set balance = b.new_balance
    from balances b
   where td.company_id = p_company_id
     and td.id = b.id
     and td.balance is distinct from b.new_balance;

end;
$function$;

-- ─── 2. get_trade_doc_timeline: mejor label para DEVOLUCION ──────────────────
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
target_doc as (
  select
    td.id, td.company_id, td.origin_doc_id,
    td.issue_date, td.doc_type, td.fiscal_doc_code,
    td.series, td.number, td.grand_total, td.status
  from public.trade_docs td
  where td.company_id = p_company_id
    and td.id = p_trade_doc_id
),
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
visible_docs as (
  select d.*
  from downward d
  join target_doc t on true
  where
    (
      t.doc_type = 'INVOICE'
      and d.id in (select id from downward)
    )
    or
    (
      t.doc_type in ('CREDIT_NOTE', 'DEBIT_NOTE')
      and d.id in (
        select id from upward
        union
        select t.id from target_doc t
      )
    )
),
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
      when d.id = p_trade_doc_id                    then 'Documento actual'
      when d.origin_doc_id is null                   then 'Documento raíz'
      when d.doc_type::text = 'CREDIT_NOTE'          then 'Nota de crédito afecta al documento relacionado'
      when d.doc_type::text = 'DEBIT_NOTE'           then 'Nota de débito afecta al documento relacionado'
      when d.doc_type::text = 'DEVOLUCION'           then 'Devolución gestionada por este documento'
      else                                                'Documento relacionado'
    end as affects_label,
    coalesce(d.grand_total, 0)::numeric as amount,
    case
      when d.id = p_trade_doc_id then
        case
          when d.doc_type::text = 'CREDIT_NOTE' then -1
          when d.doc_type::text = 'DEBIT_NOTE'  then  1
          else 1
        end
      when d.origin_doc_id is null                   then  1
      when d.doc_type::text = 'CREDIT_NOTE'          then -1
      when d.doc_type::text = 'DEBIT_NOTE'           then  1
      when d.doc_type::text = 'DEVOLUCION'           then  1
      else                                                  1
    end as impact_sign,
    'DOCS'::text as running_group,
    d.origin_doc_id as source_doc_id,
    (d.issue_date::timestamp at time zone 'UTC') as sort_ts
  from visible_docs d
),
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

-- ─── 3. Recalcular saldos de todos los documentos de la empresa ──────────────
DO $$
declare
  v_company record;
  v_count int;
begin
  for v_company in
    select distinct company_id from public.trade_docs
  loop
    v_count := public.recalc_all_trade_doc_balances_for_company(v_company.company_id);
    raise notice 'Recalculados % cadenas para company %', v_count, v_company.company_id;
  end loop;
end;
$$;

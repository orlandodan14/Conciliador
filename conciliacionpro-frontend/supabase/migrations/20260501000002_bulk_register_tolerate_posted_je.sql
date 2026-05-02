-- =========================================================
-- 20260501000002_bulk_register_tolerate_posted_je.sql
--
-- Actualiza bulk_register_trade_docs para tolerar el caso
-- en que el journal_entry ya está POSTED pero el trade_doc
-- sigue en BORRADOR (fallo parcial de un intento anterior).
-- En ese caso se omite post_journal_entry y solo se actualiza
-- el estado del documento a VIGENTE.
-- =========================================================

CREATE OR REPLACE FUNCTION public.bulk_register_trade_docs(
  _company_id uuid,
  _trade_doc_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
declare
  v_uid uuid;
  v_role text;
  v_doc record;
  v_period_id uuid;
  v_ok_count int := 0;
  v_error_count int := 0;
  v_errors jsonb := '[]'::jsonb;
  v_ids uuid[];
  v_errmsg text;
  v_duplicate_id uuid;
  v_je_status public.journal_entry_status;
begin
  v_uid := auth.uid();

  if v_uid is null then
    raise exception 'Usuario no autenticado.';
  end if;

  if _company_id is null then
    raise exception 'company_id es obligatorio.';
  end if;

  if _trade_doc_ids is null or array_length(_trade_doc_ids, 1) is null then
    raise exception 'Debe enviar al menos un trade_doc_id.';
  end if;

  select cm.role
    into v_role
  from public.company_members cm
  where cm.company_id = _company_id
    and cm.user_id = v_uid
    and upper(coalesce(cm.status, '')) = 'ACTIVE'
  limit 1;

  if v_role is null or upper(v_role) not in ('OWNER', 'EDITOR') then
    raise exception 'No tienes permisos para registrar documentos en esta empresa.';
  end if;

  select array_agg(distinct x)
    into v_ids
  from unnest(_trade_doc_ids) as x;

  for v_doc in
    select
      td.id,
      td.company_id,
      td.issue_date,
      td.status,
      td.journal_entry_id,
      td.fiscal_doc_code,
      td.series,
      td.number
    from public.trade_docs td
    where td.company_id = _company_id
      and td.id = any(v_ids)
  loop
    begin
      if v_doc.status <> 'BORRADOR' then
        raise exception 'El documento no está en BORRADOR.';
      end if;

      if v_doc.journal_entry_id is null then
        raise exception 'El documento no tiene asiento borrador asociado.';
      end if;

      if not exists (
        select 1
        from public.journal_entry_lines jel
        where jel.company_id = _company_id
          and jel.journal_entry_id = v_doc.journal_entry_id
      ) then
        raise exception 'El asiento borrador no tiene líneas.';
      end if;

      if coalesce(trim(v_doc.fiscal_doc_code), '') <> ''
         and coalesce(trim(v_doc.number), '') <> '' then

        select td2.id
          into v_duplicate_id
        from public.trade_docs td2
        where td2.company_id = _company_id
          and td2.id <> v_doc.id
          and coalesce(td2.status, '') <> 'CANCELADO'
          and upper(trim(coalesce(td2.fiscal_doc_code, ''))) = upper(trim(coalesce(v_doc.fiscal_doc_code, '')))
          and upper(trim(coalesce(td2.number, ''))) = upper(trim(coalesce(v_doc.number, '')))
          and upper(trim(coalesce(td2.series, ''))) = upper(trim(coalesce(v_doc.series, '')))
        limit 1;

        if v_duplicate_id is not null then
          raise exception 'El folio fiscal % % ya está usado en otro documento.',
            trim(coalesce(v_doc.fiscal_doc_code, '')),
            case
              when coalesce(trim(v_doc.series), '') <> '' then trim(v_doc.series) || '-' || trim(coalesce(v_doc.number, ''))
              else trim(coalesce(v_doc.number, ''))
            end;
        end if;
      end if;

      select ap.id
        into v_period_id
      from public.accounting_periods ap
      where ap.company_id = _company_id
        and ap.start_date <= coalesce(v_doc.issue_date, current_date)
        and ap.end_date >= coalesce(v_doc.issue_date, current_date)
        and upper(coalesce(ap.status, '')) in ('ABIERTO', 'OPEN')
      order by ap.start_date desc
      limit 1;

      if v_period_id is null then
        raise exception 'La fecha del documento no pertenece a un período contable ABIERTO o el período está bloqueado.';
      end if;

      -- Verificar si el asiento ya fue posteado en un intento parcial anterior.
      -- Si es así, omitir post_journal_entry para evitar el error "Solo se puede
      -- contabilizar un asiento en DRAFT".
      select je.status
        into v_je_status
      from public.journal_entries je
      where je.id = v_doc.journal_entry_id;

      if v_je_status <> 'POSTED' then
        perform public.post_journal_entry(v_doc.journal_entry_id);
      end if;

      update public.trade_docs
      set
        status = 'VIGENTE',
        cancelled_at = null,
        cancel_reason = null
      where company_id = _company_id
        and id = v_doc.id
        and status = 'BORRADOR';

      v_ok_count := v_ok_count + 1;

    exception
      when others then
        v_error_count := v_error_count + 1;
        v_errmsg := sqlerrm;

        v_errors := v_errors || jsonb_build_array(
          jsonb_build_object(
            'trade_doc_id', v_doc.id,
            'message', v_errmsg
          )
        );
    end;
  end loop;

  return jsonb_build_object(
    'ok_count', v_ok_count,
    'error_count', v_error_count,
    'errors', v_errors
  );
end;
$function$;

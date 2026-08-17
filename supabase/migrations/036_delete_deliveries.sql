-- Allow removing delivery history rows without touching the delivered production lots.

create or replace function public.delete_deliveries(p_delivery_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delivery_ids uuid[] := coalesce(p_delivery_ids, array[]::uuid[]);
  v_actor_id uuid := public.ensure_traceability_profile();
  v_deleted_count integer := 0;
  v_delivery record;
begin
  if array_length(v_delivery_ids, 1) is null then
    return 0;
  end if;

  for v_delivery in
    select
      delivery.id,
      delivery.delivery_code,
      delivery.delivery_date,
      delivery.store_name,
      delivery.delivery_number,
      delivery.confirmed_product_count
    from public.deliveries delivery
    where delivery.id = any(v_delivery_ids)
  loop
    perform public.log_traceability_event(
      'delivery.deleted',
      'delivery',
      v_delivery.id,
      jsonb_build_object(
        'delivery_code', v_delivery.delivery_code,
        'delivery_date', v_delivery.delivery_date,
        'store_name', v_delivery.store_name,
        'delivery_number', v_delivery.delivery_number,
        'confirmed_product_count', v_delivery.confirmed_product_count,
        'deleted_by', v_actor_id
      )
    );
  end loop;

  delete from public.delivery_confirmations confirmation
  using public.deliveries delivery
  where delivery.id = any(v_delivery_ids)
    and confirmation.delivery_date = delivery.delivery_date
    and confirmation.store_name = delivery.store_name
    and confirmation.delivery_number = delivery.delivery_number;

  delete from public.deliveries delivery
  where delivery.id = any(v_delivery_ids);

  get diagnostics v_deleted_count = row_count;

  return v_deleted_count;
end;
$$;

revoke all on function public.delete_deliveries(uuid[]) from public;
grant execute on function public.delete_deliveries(uuid[]) to authenticated;

notify pgrst, 'reload schema';

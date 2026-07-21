create or replace function delete_production_batches(p_batch_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch_ids uuid[] := coalesce(p_batch_ids, array[]::uuid[]);
  v_deleted_count integer := 0;
  v_blocking_count integer := 0;
begin
  if array_length(v_batch_ids, 1) is null then
    return 0;
  end if;

  select count(*)
  into v_blocking_count
  from lots produced_lot
  join production_consumptions downstream_consumption
    on downstream_consumption.consumed_lot_id = produced_lot.id
  where produced_lot.source_type = 'fabrication'
    and produced_lot.source_id = any(v_batch_ids)
    and not downstream_consumption.production_batch_id = any(v_batch_ids);

  if v_blocking_count > 0 then
    raise exception 'Impossible de supprimer une production dont le lot est deja utilise dans une autre production.';
  end if;

  delete from production_batches batch
  where batch.id = any(v_batch_ids);

  get diagnostics v_deleted_count = row_count;

  delete from lots produced_lot
  where produced_lot.source_type = 'fabrication'
    and produced_lot.source_id = any(v_batch_ids);

  return v_deleted_count;
end;
$$;

grant execute on function delete_production_batches(uuid[]) to anon, authenticated;

create or replace function delete_production_batches(p_batch_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch_ids uuid[] := coalesce(p_batch_ids, array[]::uuid[]);
  v_actor_id uuid := auth.uid();
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

  if to_regclass('public.production_plans') is not null then
    execute $sql$
      update production_plans
      set status = 'cancelled',
          production_batch_id = null,
          cancelled_reason = coalesce(cancelled_reason, 'Production supprimee depuis l''historique'),
          cancelled_at = coalesce(cancelled_at, now()),
          cancelled_by = coalesce(cancelled_by, $2),
          completed_at = null,
          completed_by = null,
          updated_by = coalesce($2, updated_by),
          updated_at = now()
      where production_batch_id = any($1)
    $sql$ using v_batch_ids, v_actor_id;
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

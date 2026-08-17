-- Allow deletion of production history rows created by Planification.
-- Auto-confirmed batches are referenced by production_plans.production_batch_id,
-- so the linked plan occurrence must be detached before deleting the batch.

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

  update production_plans
  set status = 'cancelled',
      production_batch_id = null,
      cancelled_reason = coalesce(cancelled_reason, 'Production supprimee depuis l''historique'),
      cancelled_at = coalesce(cancelled_at, now()),
      cancelled_by = coalesce(cancelled_by, v_actor_id),
      completed_at = null,
      completed_by = null,
      updated_by = coalesce(v_actor_id, updated_by),
      updated_at = now()
  where production_batch_id = any(v_batch_ids);

  delete from production_batches batch
  where batch.id = any(v_batch_ids);

  get diagnostics v_deleted_count = row_count;

  delete from lots produced_lot
  where produced_lot.source_type = 'fabrication'
    and produced_lot.source_id = any(v_batch_ids);

  return v_deleted_count;
end;
$$;

revoke all on function delete_production_batches(uuid[]) from public;
grant execute on function delete_production_batches(uuid[]) to authenticated;

notify pgrst, 'reload schema';

-- Repair production snapshots whose substituted semi-finished child nodes were
-- preserved structurally but lost their consumed lots.
--
-- Run after 022_biscuit_semi_finished_substitutions.sql.

create or replace function hydrate_production_traceability_snapshot_lots(
  p_batch_id uuid,
  p_snapshot jsonb
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with snapshot_components as (
    select component.value, component.ordinality
    from jsonb_array_elements(coalesce(p_snapshot->'components', '[]'::jsonb))
      with ordinality as component(value, ordinality)
  ),
  hydrated_components as (
    select
      component.ordinality,
      case
        when jsonb_array_length(coalesce(component.value->'lots', '[]'::jsonb)) > 0 then component.value
        else jsonb_set(
          component.value,
          '{lots}',
          coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'lotId', lot.id,
                'lotNumber', lot.lot_number,
                'supplierLot', lot.supplier_lot,
                'sourceType', lot.source_type,
                'lotCreatedAt', lot.created_at,
                'productId', lot.product_id,
                'productName', consumed_product.name,
                'productType', consumed_product.type,
                'productCategory', consumed_product.category,
                'expectedProductId', coalesce(consumption.expected_component_product_id, lot.product_id),
                'expectedProductName', expected_product.name
              )
              order by lot.created_at desc, lot.id
            )
            from production_consumptions consumption
            join lots lot on lot.id = consumption.consumed_lot_id
            join products consumed_product on consumed_product.id = lot.product_id
            join products expected_product
              on expected_product.id = coalesce(consumption.expected_component_product_id, lot.product_id)
            where consumption.production_batch_id = p_batch_id
              and (
                consumption.component_node_key = component.value->>'nodeId'
                or (
                  not exists (
                    select 1
                    from production_consumptions exact_consumption
                    where exact_consumption.production_batch_id = p_batch_id
                      and exact_consumption.component_node_key = component.value->>'nodeId'
                  )
                  and coalesce(
                    consumption.selected_component_product_id,
                    consumption.expected_component_product_id,
                    lot.product_id
                  ) = nullif(component.value->>'productId', '')::uuid
                )
              )
          ), '[]'::jsonb),
          true
        )
      end as value
    from snapshot_components component
  )
  select case
    when p_snapshot is null then null
    else jsonb_set(
      p_snapshot,
      '{components}',
      coalesce(
        (select jsonb_agg(component.value order by component.ordinality) from hydrated_components component),
        '[]'::jsonb
      ),
      true
    )
  end;
$$;

revoke all on function hydrate_production_traceability_snapshot_lots(uuid, jsonb) from public;
grant execute on function hydrate_production_traceability_snapshot_lots(uuid, jsonb) to authenticated;

create or replace function refresh_production_traceability_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update production_batches batch
  set traceability_snapshot = hydrate_production_traceability_snapshot_lots(
    batch.id,
    build_production_traceability_snapshot(batch.id)
  )
  where batch.id in (
    select distinct inserted.production_batch_id
    from inserted_production_consumptions inserted
  );

  return null;
end;
$$;

revoke all on function refresh_production_traceability_snapshot() from public;

drop trigger if exists production_consumptions_refresh_traceability_snapshot on production_consumptions;
create trigger production_consumptions_refresh_traceability_snapshot
after insert on production_consumptions
referencing new table as inserted_production_consumptions
for each statement
execute function refresh_production_traceability_snapshot();

-- A substituted lot always points to a production batch created earlier than
-- the parent production that consumes it. Repairing oldest first lets each
-- parent snapshot inherit the already-repaired child snapshot.
do $$
declare
  v_batch record;
begin
  for v_batch in
    select batch.id
    from production_batches batch
    order by batch.created_at, batch.id
  loop
    update production_batches batch
    set traceability_snapshot = hydrate_production_traceability_snapshot_lots(
      batch.id,
      build_production_traceability_snapshot(batch.id)
    )
    where batch.id = v_batch.id;
  end loop;
end;
$$;

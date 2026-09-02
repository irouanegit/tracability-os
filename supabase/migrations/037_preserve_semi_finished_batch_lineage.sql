-- A parent production consumes its direct semi-finished batch, not the raw
-- materials that were already recorded when that child batch was produced.
-- The child batch snapshot is embedded to preserve the complete lineage.

create or replace function build_production_traceability_snapshot_with_batch_lineage(p_batch_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select hydrate_production_traceability_snapshot_lots(
      p_batch_id,
      build_production_traceability_snapshot(p_batch_id)
    ) as snapshot
  ),
  inherited_components as (
    select jsonb_build_object(
      'nodeId', concat(pc.component_node_key, '/lot:', lot.id, '/', child.value->>'nodeId'),
      'parentNodeId', case
        when child.value->>'parentNodeId' = child_batch.product_id::text
          then pc.component_node_key
        else concat(pc.component_node_key, '/lot:', lot.id, '/', child.value->>'parentNodeId')
      end,
      'productId', child.value->'productId',
      'productName', child.value->'productName',
      'productType', child.value->'productType',
      'depth', coalesce(pc.component_depth, 1) + coalesce(nullif(child.value->>'depth', '')::integer, 1),
      'lots', coalesce(child.value->'lots', '[]'::jsonb)
    ) as component
    from production_consumptions pc
    join lots lot on lot.id = pc.consumed_lot_id
    join products selected_product on selected_product.id = coalesce(pc.selected_component_product_id, lot.product_id)
    join production_batches child_batch on child_batch.id = lot.source_id
    cross join lateral (
      select coalesce(
        child_batch.traceability_snapshot,
        hydrate_production_traceability_snapshot_lots(
          child_batch.id,
          build_production_traceability_snapshot(child_batch.id)
        )
      ) as snapshot
    ) child_trace
    cross join lateral jsonb_array_elements(coalesce(child_trace.snapshot->'components', '[]'::jsonb)) child(value)
    cross join base
    where pc.production_batch_id = p_batch_id
      and pc.parent_component_node_key is null
      and pc.component_node_key is not null
      and lot.source_type = 'fabrication'
      and selected_product.type = 'semi_finished'
      and not exists (
        select 1
        from production_consumptions descendant
        where descendant.production_batch_id = pc.production_batch_id
          and descendant.parent_component_node_key = pc.component_node_key
      )
      and not exists (
        select 1
        from jsonb_array_elements(coalesce(base.snapshot->'components', '[]'::jsonb)) existing(value)
        where existing.value->>'nodeId' like concat(pc.component_node_key, '/lot:', lot.id, '/%')
      )
  ),
  inherited as (
    select coalesce(jsonb_agg(component), '[]'::jsonb) as components
    from inherited_components
  )
  select case
    when base.snapshot is null then null
    else jsonb_set(
      base.snapshot,
      '{components}',
      coalesce(base.snapshot->'components', '[]'::jsonb) || inherited.components,
      true
    )
  end
  from base cross join inherited;
$$;

revoke all on function build_production_traceability_snapshot_with_batch_lineage(uuid) from public;
grant execute on function build_production_traceability_snapshot_with_batch_lineage(uuid) to authenticated;

create or replace function refresh_production_traceability_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update production_batches batch
  set traceability_snapshot = build_production_traceability_snapshot_with_batch_lineage(batch.id)
  where batch.id in (
    select distinct inserted.production_batch_id
    from inserted_production_consumptions inserted
  );

  return null;
end;
$$;

create or replace function create_production_with_traceability_v2(
  p_production_date timestamptz,
  p_product_id uuid,
  p_generated_lot text,
  p_responsible_name text,
  p_operation text,
  p_observations text,
  p_consumed_lot_selections jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := ensure_traceability_profile();
  v_product products;
  v_recipe_id uuid;
  v_batch_id uuid;
  v_required_count integer;
  v_selected_count integer;
  v_missing_count integer;
  v_invalid_count integer;
begin
  select *
  into v_product
  from products
  where id = p_product_id
    and is_active = true
    and type in ('finished', 'semi_finished');

  if not found then
    raise exception 'Production product does not exist or is not manufactured.';
  end if;

  select id
  into v_recipe_id
  from recipes
  where product_id = p_product_id
    and is_active = true
  order by version desc, created_at desc
  limit 1;

  if v_recipe_id is null then
    raise exception 'Production product must have an active blueprint.';
  end if;

  if nullif(trim(coalesce(p_generated_lot, '')), '') is null then
    raise exception 'Generated lot is required.';
  end if;

  select count(*)
  into v_required_count
  from recipe_components rc
  join products product on product.id = rc.component_product_id
  where rc.recipe_id = v_recipe_id
    and not (product.type = 'raw' and lower(trim(product.name)) = 'eau');

  with selected_lots as (
    select distinct
      nullif(coalesce(item.value->>'nodeKey', item.value->>'node_key', item.value->>'componentNodeKey', item.value->>'component_node_key'), '') as node_key,
      nullif(coalesce(item.value->>'parentNodeKey', item.value->>'parent_node_key', item.value->>'parentComponentNodeKey', item.value->>'parent_component_node_key'), '') as parent_node_key,
      nullif(coalesce(item.value->>'expectedProductId', item.value->>'expected_product_id'), '')::uuid as expected_product_id,
      nullif(coalesce(item.value->>'selectedProductId', item.value->>'selected_product_id'), '')::uuid as selected_product_id,
      nullif(coalesce(item.value->>'consumedLotId', item.value->>'consumed_lot_id'), '')::uuid as consumed_lot_id
    from jsonb_array_elements(coalesce(p_consumed_lot_selections, '[]'::jsonb)) item(value)
    where nullif(coalesce(item.value->>'expectedProductId', item.value->>'expected_product_id'), '') is not null
      and nullif(coalesce(item.value->>'consumedLotId', item.value->>'consumed_lot_id'), '') is not null
  )
  select count(*) into v_selected_count from selected_lots;

  if v_selected_count = 0 and v_required_count > 0 then
    raise exception 'At least one consumed lot is required.';
  end if;

  with selected_lots as (
    select distinct
      nullif(coalesce(item.value->>'parentNodeKey', item.value->>'parent_node_key', item.value->>'parentComponentNodeKey', item.value->>'parent_component_node_key'), '') as parent_node_key,
      nullif(coalesce(item.value->>'expectedProductId', item.value->>'expected_product_id'), '')::uuid as expected_product_id
    from jsonb_array_elements(coalesce(p_consumed_lot_selections, '[]'::jsonb)) item(value)
    where nullif(coalesce(item.value->>'expectedProductId', item.value->>'expected_product_id'), '') is not null
      and nullif(coalesce(item.value->>'consumedLotId', item.value->>'consumed_lot_id'), '') is not null
  )
  select count(*)
  into v_missing_count
  from recipe_components required
  join products product on product.id = required.component_product_id
  where required.recipe_id = v_recipe_id
    and not (product.type = 'raw' and lower(trim(product.name)) = 'eau')
    and not exists (
      select 1
      from selected_lots selected
      where selected.parent_node_key is null
        and selected.expected_product_id = required.component_product_id
    );

  if v_missing_count > 0 then
    raise exception 'Every direct blueprint component must have a confirmed lot.';
  end if;

  with selected_lots as (
    select distinct
      nullif(coalesce(item.value->>'nodeKey', item.value->>'node_key', item.value->>'componentNodeKey', item.value->>'component_node_key'), '') as node_key,
      nullif(coalesce(item.value->>'parentNodeKey', item.value->>'parent_node_key', item.value->>'parentComponentNodeKey', item.value->>'parent_component_node_key'), '') as parent_node_key,
      nullif(coalesce(item.value->>'expectedProductId', item.value->>'expected_product_id'), '')::uuid as expected_product_id,
      nullif(coalesce(item.value->>'selectedProductId', item.value->>'selected_product_id'), '')::uuid as selected_product_id,
      nullif(coalesce(item.value->>'consumedLotId', item.value->>'consumed_lot_id'), '')::uuid as consumed_lot_id
    from jsonb_array_elements(coalesce(p_consumed_lot_selections, '[]'::jsonb)) item(value)
    where nullif(coalesce(item.value->>'expectedProductId', item.value->>'expected_product_id'), '') is not null
      and nullif(coalesce(item.value->>'consumedLotId', item.value->>'consumed_lot_id'), '') is not null
  ),
  selected_with_lots as (
    select
      selected.*,
      required.component_product_id as required_component_product_id,
      coalesce(selected.selected_product_id, lot.product_id) as effective_selected_product_id,
      lot.product_id as lot_product_id,
      expected_product.substitution_group as expected_group,
      selected_product.substitution_group as selected_group,
      selected_product.type as selected_product_type,
      exists (
        select 1 from recipes selected_recipe
        where selected_recipe.product_id = selected_product.id
          and selected_recipe.is_active = true
      ) as selected_has_active_recipe
    from selected_lots selected
    left join recipe_components required
      on required.recipe_id = v_recipe_id
      and required.component_product_id = selected.expected_product_id
    left join products expected_product
      on expected_product.id = selected.expected_product_id
      and expected_product.is_active = true
    left join lots lot
      on lot.id = selected.consumed_lot_id
      and lot.lot_status = 'available'
      and lot.quality_status = 'conforme'
    left join products selected_product
      on selected_product.id = coalesce(selected.selected_product_id, lot.product_id)
      and selected_product.is_active = true
  ),
  invalid as (
    select selected.node_key
    from selected_with_lots selected
    where selected.parent_node_key is not null
       or selected.required_component_product_id is null
       or selected.expected_product_id is null
       or selected.lot_product_id is null
       or selected.effective_selected_product_id is null
       or selected.lot_product_id <> selected.effective_selected_product_id
       or (
         selected.effective_selected_product_id <> selected.expected_product_id
         and not (
           selected.expected_group is not null
           and selected.expected_group = selected.selected_group
           and (selected.selected_product_type <> 'semi_finished' or selected.selected_has_active_recipe)
         )
       )
  )
  select count(*) into v_invalid_count from invalid;

  if v_invalid_count > 0 then
    raise exception 'Selected lots must be available lots for the direct active blueprint components or an allowed substitution group.';
  end if;

  insert into production_batches (
    production_date, product_id, generated_lot, quantity_produced, unit,
    responsible_name, operation, observations, status, confirmed_by,
    confirmed_at, created_by, updated_by, updated_at
  ) values (
    coalesce(p_production_date, now()), p_product_id, trim(p_generated_lot), null, null,
    nullif(trim(coalesce(p_responsible_name, '')), ''),
    nullif(trim(coalesce(p_operation, '')), ''),
    nullif(trim(coalesce(p_observations, '')), ''),
    'validated', v_actor_id, now(), v_actor_id, v_actor_id, now()
  ) returning id into v_batch_id;

  insert into lots (
    product_id, lot_number, quantity_initial, quantity_available, unit,
    quality_status, lot_status, source_type, source_id,
    created_by, updated_by, updated_at
  ) values (
    p_product_id, trim(p_generated_lot), 0, 0, v_product.unit,
    'conforme', 'available', 'fabrication', v_batch_id,
    v_actor_id, v_actor_id, now()
  );

  insert into production_consumptions (
    production_batch_id, expected_component_product_id, selected_component_product_id,
    component_node_key, parent_component_node_key, component_depth,
    consumed_lot_id, quantity_used, unit, created_by, updated_by, updated_at
  )
  select distinct
    v_batch_id,
    selected.expected_product_id,
    coalesce(selected.selected_product_id, lot.product_id),
    coalesce(selected.node_key, selected.expected_product_id::text),
    null,
    coalesce(selected.depth, 1),
    selected.consumed_lot_id,
    null::numeric,
    null::text,
    v_actor_id,
    v_actor_id,
    now()
  from (
    select
      nullif(coalesce(item.value->>'nodeKey', item.value->>'node_key', item.value->>'componentNodeKey', item.value->>'component_node_key'), '') as node_key,
      coalesce(nullif(coalesce(item.value->>'depth', item.value->>'componentDepth', item.value->>'component_depth'), '')::integer, 1) as depth,
      nullif(coalesce(item.value->>'expectedProductId', item.value->>'expected_product_id'), '')::uuid as expected_product_id,
      nullif(coalesce(item.value->>'selectedProductId', item.value->>'selected_product_id'), '')::uuid as selected_product_id,
      nullif(coalesce(item.value->>'consumedLotId', item.value->>'consumed_lot_id'), '')::uuid as consumed_lot_id
    from jsonb_array_elements(coalesce(p_consumed_lot_selections, '[]'::jsonb)) item(value)
    where nullif(coalesce(item.value->>'expectedProductId', item.value->>'expected_product_id'), '') is not null
      and nullif(coalesce(item.value->>'consumedLotId', item.value->>'consumed_lot_id'), '') is not null
      and nullif(coalesce(item.value->>'parentNodeKey', item.value->>'parent_node_key', item.value->>'parentComponentNodeKey', item.value->>'parent_component_node_key'), '') is null
  ) selected
  join lots lot on lot.id = selected.consumed_lot_id;

  perform log_traceability_event(
    'production_lots.confirmed',
    'production_batch',
    v_batch_id,
    jsonb_build_object(
      'productId', p_product_id,
      'productName', v_product.name,
      'generatedLot', trim(p_generated_lot),
      'consumedLotCount', v_selected_count,
      'consumptionBoundary', 'direct_components'
    )
  );

  return v_batch_id;
end;
$$;

revoke all on function create_production_with_traceability_v2(timestamptz, uuid, text, text, text, text, jsonb) from public;
grant execute on function create_production_with_traceability_v2(timestamptz, uuid, text, text, text, text, jsonb) to authenticated;

create or replace function get_production_plan_confirmation_context(p_plan_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with resolved as (
    select
      dependency.node_key,
      dependency.parent_node_key,
      dependency.depth,
      dependency.expected_product_id,
      dependency.selected_product_id,
      case
        when dependency.source_kind in ('raw_lot', 'existing_production_lot') then dependency.source_lot_id
        when dependency.source_kind = 'planned_production' then produced.id
        else null
      end as lot_id
    from production_plan_dependencies dependency
    left join production_plans child on child.id = dependency.source_plan_id
    left join lots produced
      on produced.source_type = 'fabrication'
      and produced.source_id = child.production_batch_id
      and produced.product_id = dependency.selected_product_id
    where dependency.plan_id = p_plan_id
      and dependency.source_kind <> 'water'
  )
  select jsonb_build_object(
    'planId', plan.id,
    'productId', plan.product_id,
    'plannedDate', plan.planned_date,
    'plannedTime', plan.planned_time,
    'responsibleName', plan.responsible_name,
    'status', overview.derived_status,
    'selections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'nodeKey', resolved.node_key,
        'parentNodeKey', resolved.parent_node_key,
        'depth', resolved.depth,
        'expectedProductId', resolved.expected_product_id,
        'selectedProductId', resolved.selected_product_id,
        'lotId', resolved.lot_id
      ) order by resolved.depth, resolved.node_key)
      from resolved
    ), '[]'::jsonb)
  )
  from production_plans plan
  join production_plan_overview overview on overview.id = plan.id
  where plan.id = p_plan_id;
$$;

grant execute on function get_production_plan_confirmation_context(uuid) to authenticated;

create or replace function create_production_with_traceability_v3(
  p_plan_id uuid,
  p_production_date timestamptz,
  p_product_id uuid,
  p_generated_lot text,
  p_responsible_name text,
  p_operation text,
  p_observations text,
  p_consumed_lot_selections jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := ensure_traceability_profile();
  v_plan production_plans%rowtype;
  v_status text;
  v_batch_id uuid;
  v_plan_lot_mismatch_count integer;
begin
  select plan.* into v_plan
  from production_plans plan
  where plan.id = p_plan_id
  for update of plan;

  if v_plan.id is null then raise exception 'Production plan not found.'; end if;
  select derived_status into v_status from production_plan_overview where id = p_plan_id;
  if v_plan.status <> 'planned' or v_status not in ('ready', 'overdue') then
    raise exception 'Only ready or overdue plans can be confirmed.';
  end if;
  if v_plan.product_id <> p_product_id or v_plan.planned_date <> p_production_date::date then
    raise exception 'Confirmed product and date must match the production plan.';
  end if;

  with planned_selections as (
    select
      dependency.node_key,
      case
        when dependency.source_kind in ('raw_lot', 'existing_production_lot') then dependency.source_lot_id
        when dependency.source_kind = 'planned_production' then produced.id
        else null
      end as consumed_lot_id
    from production_plan_dependencies dependency
    left join production_plans child on child.id = dependency.source_plan_id
    left join lots produced
      on produced.source_type = 'fabrication'
      and produced.source_id = child.production_batch_id
      and produced.product_id = dependency.selected_product_id
    where dependency.plan_id = p_plan_id
      and dependency.source_kind <> 'water'
  ),
  submitted_selections as (
    select distinct
      nullif(coalesce(item.value->>'nodeKey', item.value->>'node_key'), '') as node_key,
      nullif(coalesce(item.value->>'consumedLotId', item.value->>'consumed_lot_id'), '')::uuid as consumed_lot_id
    from jsonb_array_elements(coalesce(p_consumed_lot_selections, '[]'::jsonb)) item(value)
    where nullif(coalesce(item.value->>'consumedLotId', item.value->>'consumed_lot_id'), '') is not null
  ),
  mismatches as (
    (select node_key, consumed_lot_id from planned_selections where consumed_lot_id is not null
     except
     select node_key, consumed_lot_id from submitted_selections)
    union all
    (select node_key, consumed_lot_id from submitted_selections
     except
     select node_key, consumed_lot_id from planned_selections where consumed_lot_id is not null)
  )
  select count(*) into v_plan_lot_mismatch_count from mismatches;

  if v_plan_lot_mismatch_count > 0 then
    raise exception 'Confirmed lots must match the direct lots reserved by the production plan.';
  end if;

  v_batch_id := create_production_with_traceability_v2(
    p_production_date, p_product_id, p_generated_lot, p_responsible_name,
    p_operation, p_observations, p_consumed_lot_selections
  );

  update production_plans
  set status = 'completed', production_batch_id = v_batch_id,
      completed_at = now(), completed_by = v_actor_id,
      updated_by = v_actor_id, updated_at = now()
  where id = p_plan_id
    and status = 'planned'
    and production_batch_id is null;

  if not found then
    raise exception 'Production plan was already confirmed by another request.';
  end if;

  perform log_traceability_event(
    'production_plan.completed', 'production_plan', p_plan_id,
    jsonb_build_object('productionBatchId', v_batch_id)
  );

  return v_batch_id;
end;
$$;

revoke all on function create_production_with_traceability_v3(uuid, timestamptz, uuid, text, text, text, text, jsonb) from public;
grant execute on function create_production_with_traceability_v3(uuid, timestamptz, uuid, text, text, text, text, jsonb) to authenticated;

notify pgrst, 'reload schema';

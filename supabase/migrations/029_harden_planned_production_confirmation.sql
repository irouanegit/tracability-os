-- Harden planned production confirmation against duplicate submissions.
-- This RPC runs only when a confirmation has an explicit plan id, whether it is
-- submitted by the manual Production screen or by the guarded auto-confirm runner.

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
  select p.*
  into v_plan
  from production_plans p
  where p.id = p_plan_id
  for update of p;

  if v_plan.id is null then raise exception 'Production plan not found.'; end if;
  select derived_status into v_status from production_plan_overview where id = p_plan_id;
  if v_plan.status <> 'planned' or v_status not in ('ready', 'overdue') then
    raise exception 'Only ready or overdue plans can be confirmed.';
  end if;
  if v_plan.product_id <> p_product_id or v_plan.planned_date <> p_production_date::date then
    raise exception 'Confirmed product and date must match the production plan.';
  end if;

  with recursive dependency_walk as (
    select
      d.*,
      array[p_plan_id]::uuid[] as plan_path
    from production_plan_dependencies d
    where d.plan_id = p_plan_id
    union all
    select
      child.*,
      parent.plan_path || parent.source_plan_id
    from dependency_walk parent
    join production_plan_dependencies child on child.plan_id = parent.source_plan_id
    where parent.source_kind = 'planned_production'
      and parent.source_plan_id is not null
      and not parent.source_plan_id = any(parent.plan_path)
  ),
  planned_selections as (
    select distinct on (walk.expected_product_id)
      walk.expected_product_id,
      case
        when walk.source_kind in ('raw_lot', 'existing_production_lot') then walk.source_lot_id
        when walk.source_kind = 'planned_production' then produced.id
        else null
      end as consumed_lot_id
    from dependency_walk walk
    left join production_plans child on child.id = walk.source_plan_id
    left join lots produced
      on produced.source_type = 'fabrication'
      and produced.source_id = child.production_batch_id
      and produced.product_id = walk.selected_product_id
    where walk.source_kind <> 'water'
    order by walk.expected_product_id, walk.depth
  ),
  submitted_selections as (
    select distinct
      nullif(coalesce(item.value->>'expectedProductId', item.value->>'expected_product_id'), '')::uuid as expected_product_id,
      nullif(coalesce(item.value->>'consumedLotId', item.value->>'consumed_lot_id'), '')::uuid as consumed_lot_id
    from jsonb_array_elements(coalesce(p_consumed_lot_selections, '[]'::jsonb)) as item(value)
    where nullif(coalesce(item.value->>'expectedProductId', item.value->>'expected_product_id'), '') is not null
      and nullif(coalesce(item.value->>'consumedLotId', item.value->>'consumed_lot_id'), '') is not null
  ),
  missing_expected as (
    select expected_product_id, consumed_lot_id
    from planned_selections
    where consumed_lot_id is not null
    except
    select expected_product_id, consumed_lot_id
    from submitted_selections
  ),
  unexpected_submitted as (
    select expected_product_id, consumed_lot_id
    from submitted_selections
    except
    select expected_product_id, consumed_lot_id
    from planned_selections
    where consumed_lot_id is not null
  ),
  mismatches as (
    select expected_product_id, consumed_lot_id
    from missing_expected
    union all
    select expected_product_id, consumed_lot_id
    from unexpected_submitted
  )
  select count(*)
  into v_plan_lot_mismatch_count
  from mismatches;

  if v_plan_lot_mismatch_count > 0 then
    raise exception 'Confirmed lots must match the lots reserved by the production plan.';
  end if;

  v_batch_id := create_production_with_traceability_v2(
    p_production_date,
    p_product_id,
    p_generated_lot,
    p_responsible_name,
    p_operation,
    p_observations,
    p_consumed_lot_selections
  );

  update production_plans
  set status = 'completed',
      production_batch_id = v_batch_id,
      completed_at = now(),
      completed_by = v_actor_id,
      updated_by = v_actor_id,
      updated_at = now()
  where id = p_plan_id
    and status = 'planned'
    and production_batch_id is null;

  if not found then
    raise exception 'Production plan was already confirmed by another request.';
  end if;

  perform log_traceability_event(
    'production_plan.completed',
    'production_plan',
    p_plan_id,
    jsonb_build_object('productionBatchId', v_batch_id)
  );

  return v_batch_id;
end;
$$;

revoke all on function create_production_with_traceability_v3(uuid, timestamptz, uuid, text, text, text, text, jsonb) from public;
grant execute on function create_production_with_traceability_v3(uuid, timestamptz, uuid, text, text, text, text, jsonb) to authenticated;

notify pgrst, 'reload schema';

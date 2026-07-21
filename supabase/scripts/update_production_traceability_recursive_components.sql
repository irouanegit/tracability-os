create or replace function create_production_with_traceability(
  p_production_date timestamptz,
  p_product_id uuid,
  p_generated_lot text,
  p_responsible_name text,
  p_operation text,
  p_observations text,
  p_consumed_lot_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product products;
  v_recipe_id uuid;
  v_batch_id uuid;
  v_consumed_lot_ids uuid[] := coalesce(p_consumed_lot_ids, array[]::uuid[]);
  v_required_traceable_count integer;
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
  limit 1;

  if v_recipe_id is null then
    raise exception 'Production product must have an active blueprint.';
  end if;

  if nullif(trim(coalesce(p_generated_lot, '')), '') is null then
    raise exception 'Generated lot is required.';
  end if;

  with recursive required_components(component_product_id) as (
    select rc.component_product_id
    from recipe_components rc
    where rc.recipe_id = v_recipe_id
    union
    select child_rc.component_product_id
    from required_components parent
    join recipes child_recipe on child_recipe.product_id = parent.component_product_id
      and child_recipe.is_active = true
    join recipe_components child_rc on child_rc.recipe_id = child_recipe.id
  )
  select count(*)
  into v_required_traceable_count
  from required_components rc
  join products p on p.id = rc.component_product_id
  where not (p.type = 'raw' and lower(trim(p.name)) = 'eau');

  if array_length(v_consumed_lot_ids, 1) is null and v_required_traceable_count > 0 then
    raise exception 'At least one consumed lot is required.';
  end if;

  with recursive required_components(component_product_id) as (
    select rc.component_product_id
    from recipe_components rc
    where rc.recipe_id = v_recipe_id
    union
    select child_rc.component_product_id
    from required_components parent
    join recipes child_recipe on child_recipe.product_id = parent.component_product_id
      and child_recipe.is_active = true
    join recipe_components child_rc on child_rc.recipe_id = child_recipe.id
  ),
  selected_lots as (
    select distinct l.id, l.product_id
    from unnest(v_consumed_lot_ids) as selected(lot_id)
    join lots l on l.id = selected.lot_id
    where l.lot_status = 'available'
      and l.quality_status = 'conforme'
  )
  select count(*)
  into v_missing_count
  from required_components rc
  join products p on p.id = rc.component_product_id
  where not (p.type = 'raw' and lower(trim(p.name)) = 'eau')
    and not exists (
    select 1
    from selected_lots sl
    where sl.product_id = rc.component_product_id
  );

  if v_missing_count > 0 then
    raise exception 'Every blueprint component must have a confirmed lot.';
  end if;

  with recursive required_components(component_product_id) as (
    select rc.component_product_id
    from recipe_components rc
    where rc.recipe_id = v_recipe_id
    union
    select child_rc.component_product_id
    from required_components parent
    join recipes child_recipe on child_recipe.product_id = parent.component_product_id
      and child_recipe.is_active = true
    join recipe_components child_rc on child_rc.recipe_id = child_recipe.id
  ),
  selected_lots as (
    select distinct selected.lot_id, l.product_id
    from unnest(v_consumed_lot_ids) as selected(lot_id)
    left join lots l on l.id = selected.lot_id
      and l.lot_status = 'available'
      and l.quality_status = 'conforme'
  )
  select count(*)
  into v_invalid_count
  from selected_lots sl
  left join required_components rc on rc.component_product_id = sl.product_id
  where sl.product_id is null
     or rc.component_product_id is null;

  if v_invalid_count > 0 then
    raise exception 'Selected lots must be available lots for the active blueprint components.';
  end if;

  insert into production_batches (
    production_date,
    product_id,
    generated_lot,
    quantity_produced,
    unit,
    responsible_name,
    operation,
    observations,
    status
  )
  values (
    coalesce(p_production_date, now()),
    p_product_id,
    trim(p_generated_lot),
    null,
    null,
    nullif(trim(coalesce(p_responsible_name, '')), ''),
    nullif(trim(coalesce(p_operation, '')), ''),
    nullif(trim(coalesce(p_observations, '')), ''),
    'validated'
  )
  returning id into v_batch_id;

  insert into lots (
    product_id,
    lot_number,
    quantity_initial,
    quantity_available,
    unit,
    quality_status,
    lot_status,
    source_type,
    source_id
  )
  values (
    p_product_id,
    trim(p_generated_lot),
    0,
    0,
    v_product.unit,
    'conforme',
    'available',
    'fabrication',
    v_batch_id
  );

  insert into production_consumptions (
    production_batch_id,
    consumed_lot_id,
    quantity_used,
    unit
  )
  select distinct
    v_batch_id,
    selected.lot_id,
    null::numeric,
    null::text
  from unnest(v_consumed_lot_ids) as selected(lot_id);

  return v_batch_id;
end;
$$;

grant execute on function create_production_with_traceability(timestamptz, uuid, text, text, text, text, uuid[]) to authenticated;

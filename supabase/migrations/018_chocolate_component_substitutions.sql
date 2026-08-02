alter table products
  add column if not exists substitution_group text;

with chocolate_materials(name) as (
  values
    ('Chocolat au lait Callebaut'),
    ('Chocolat au lait Lubeca'),
    ('Chocolat blanc Callebaut'),
    ('Chocolat blanc Lubeca'),
    ('Chocolat caramel'),
    ('Chocolat noir Callebaut'),
    ('Chocolat noir Lubeca'),
    ('Gala blanc'),
    ('Gala noir')
)
update products p
set substitution_group = 'chocolate'
from chocolate_materials c
where p.type = 'raw'
  and p.is_active = true
  and lower(trim(p.name)) = lower(trim(c.name));

do $$
declare
  v_missing text[];
  v_duplicates text[];
begin
  with chocolate_materials(name) as (
    values
      ('Chocolat au lait Callebaut'),
      ('Chocolat au lait Lubeca'),
      ('Chocolat blanc Callebaut'),
      ('Chocolat blanc Lubeca'),
      ('Chocolat caramel'),
      ('Chocolat noir Callebaut'),
      ('Chocolat noir Lubeca'),
      ('Gala blanc'),
      ('Gala noir')
  )
  select coalesce(array_agg(c.name order by c.name), array[]::text[])
  into v_missing
  from chocolate_materials c
  where not exists (
    select 1
    from products p
    where p.type = 'raw'
      and p.is_active = true
      and lower(trim(p.name)) = lower(trim(c.name))
  );

  with chocolate_materials(name) as (
    values
      ('Chocolat au lait Callebaut'),
      ('Chocolat au lait Lubeca'),
      ('Chocolat blanc Callebaut'),
      ('Chocolat blanc Lubeca'),
      ('Chocolat caramel'),
      ('Chocolat noir Callebaut'),
      ('Chocolat noir Lubeca'),
      ('Gala blanc'),
      ('Gala noir')
  ),
  matches as (
    select c.name, count(p.id) as match_count
    from chocolate_materials c
    left join products p on p.type = 'raw'
      and p.is_active = true
      and lower(trim(p.name)) = lower(trim(c.name))
    group by c.name
  )
  select coalesce(array_agg(name order by name), array[]::text[])
  into v_duplicates
  from matches
  where match_count > 1;

  if cardinality(v_missing) > 0 then
    raise exception 'Missing chocolate raw materials: %', v_missing;
  end if;

  if cardinality(v_duplicates) > 0 then
    raise exception 'Duplicate active chocolate raw materials: %', v_duplicates;
  end if;
end;
$$;

alter table production_consumptions
  add column if not exists expected_component_product_id uuid;

update production_consumptions pc
set expected_component_product_id = l.product_id
from lots l
where pc.consumed_lot_id = l.id
  and pc.expected_component_product_id is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'production_consumptions_expected_component_product_id_fkey'
      and conrelid = 'production_consumptions'::regclass
  ) then
    alter table production_consumptions
      add constraint production_consumptions_expected_component_product_id_fkey
      foreign key (expected_component_product_id) references products(id);
  end if;
end;
$$;

create index if not exists production_consumptions_expected_component_idx
  on production_consumptions(expected_component_product_id);

drop view if exists production_consumption_details;

create or replace view production_consumption_details as
select
  pc.id,
  pc.production_batch_id,
  coalesce(pc.expected_component_product_id, l.product_id) as expected_component_product_id,
  expected_product.code as expected_component_product_code,
  expected_product.name as expected_component_product_name,
  expected_product.type as expected_component_product_type,
  expected_product.category as expected_component_product_category,
  l.id as lot_id,
  l.lot_number,
  l.product_id as consumed_product_id,
  consumed_product.code as consumed_product_code,
  consumed_product.name as consumed_product_name,
  consumed_product.type as consumed_product_type,
  consumed_product.category as consumed_product_category,
  l.supplier_lot,
  l.source_type,
  l.created_at as lot_created_at,
  pc.created_at as linked_at
from production_consumptions pc
join lots l on l.id = pc.consumed_lot_id
join products consumed_product on consumed_product.id = l.product_id
join products expected_product on expected_product.id = coalesce(pc.expected_component_product_id, l.product_id);

create or replace function build_production_traceability_snapshot(p_batch_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with recursive batch_context as (
    select
      pb.id,
      pb.product_id,
      pb.generated_lot,
      p.name as product_name,
      p.type as product_type,
      r.id as recipe_id,
      r.diagram_nodes,
      r.diagram_edges,
      r.diagram_viewport
    from production_batches pb
    join products p on p.id = pb.product_id
    left join lateral (
      select recipes.id, recipes.diagram_nodes, recipes.diagram_edges, recipes.diagram_viewport
      from recipes
      where recipes.product_id = pb.product_id
        and recipes.is_active = true
      order by recipes.version desc, recipes.created_at desc
      limit 1
    ) r on true
    where pb.id = p_batch_id
  ),
  schema_tree as (
    select
      bc.product_id as parent_product_id,
      rc.component_product_id,
      array[bc.product_id, rc.component_product_id]::uuid[] as product_path,
      1 as depth
    from batch_context bc
    join recipe_components rc on rc.recipe_id = bc.recipe_id

    union all

    select
      tree.component_product_id,
      child_rc.component_product_id,
      tree.product_path || child_rc.component_product_id,
      tree.depth + 1
    from schema_tree tree
    join recipes child_recipe on child_recipe.product_id = tree.component_product_id
      and child_recipe.is_active = true
    join recipe_components child_rc on child_rc.recipe_id = child_recipe.id
    where not child_rc.component_product_id = any(tree.product_path)
  ),
  component_nodes as (
    select
      array_to_string(tree.product_path, '__') as node_id,
      case
        when tree.depth = 1 then tree.product_path[1]::text
        else array_to_string(tree.product_path[1:cardinality(tree.product_path) - 1], '__')
      end as parent_node_id,
      tree.component_product_id as product_id,
      product.name as product_name,
      product.type as product_type,
      tree.depth,
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'lotId', lot.id,
            'lotNumber', lot.lot_number,
            'supplierLot', lot.supplier_lot,
            'sourceType', lot.source_type,
            'lotCreatedAt', lot.created_at,
            'productId', lot_product.id,
            'productName', lot_product.name,
            'productType', lot_product.type,
            'productCategory', lot_product.category,
            'expectedProductId', tree.component_product_id,
            'expectedProductName', product.name
          )
          order by lot.created_at desc, lot.id
        )
        from production_consumptions consumption
        join lots lot on lot.id = consumption.consumed_lot_id
        join products lot_product on lot_product.id = lot.product_id
        where consumption.production_batch_id = p_batch_id
          and (
            consumption.expected_component_product_id = tree.component_product_id
            or (consumption.expected_component_product_id is null and lot.product_id = tree.component_product_id)
          )
      ), '[]'::jsonb) as lots
    from schema_tree tree
    join products product on product.id = tree.component_product_id
  )
  select jsonb_build_object(
    'version', 1,
    'root', jsonb_build_object(
      'productId', bc.product_id,
      'productName', bc.product_name,
      'productType', bc.product_type,
      'lotNumber', bc.generated_lot
    ),
    'components', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'nodeId', node.node_id,
          'parentNodeId', node.parent_node_id,
          'productId', node.product_id,
          'productName', node.product_name,
          'productType', node.product_type,
          'depth', node.depth,
          'lots', node.lots
        )
        order by node.depth, node.node_id
      )
      from component_nodes node
    ), '[]'::jsonb),
    'diagram', jsonb_build_object(
      'nodes', coalesce(bc.diagram_nodes, '[]'::jsonb),
      'edges', coalesce(bc.diagram_edges, '[]'::jsonb),
      'viewport', bc.diagram_viewport
    )
  )
  from batch_context bc;
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
  v_required_traceable_count integer;
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

  with selected_lots as (
    select distinct
      nullif(coalesce(selected.value->>'expectedProductId', selected.value->>'expected_product_id'), '')::uuid as expected_product_id,
      nullif(coalesce(selected.value->>'consumedLotId', selected.value->>'consumed_lot_id'), '')::uuid as consumed_lot_id
    from jsonb_array_elements(coalesce(p_consumed_lot_selections, '[]'::jsonb)) as selected(value)
    where nullif(coalesce(selected.value->>'expectedProductId', selected.value->>'expected_product_id'), '') is not null
      and nullif(coalesce(selected.value->>'consumedLotId', selected.value->>'consumed_lot_id'), '') is not null
  )
  select count(*)
  into v_selected_count
  from selected_lots;

  if v_selected_count = 0 and v_required_traceable_count > 0 then
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
    select distinct
      nullif(coalesce(selected.value->>'expectedProductId', selected.value->>'expected_product_id'), '')::uuid as expected_product_id,
      nullif(coalesce(selected.value->>'consumedLotId', selected.value->>'consumed_lot_id'), '')::uuid as consumed_lot_id
    from jsonb_array_elements(coalesce(p_consumed_lot_selections, '[]'::jsonb)) as selected(value)
    where nullif(coalesce(selected.value->>'expectedProductId', selected.value->>'expected_product_id'), '') is not null
      and nullif(coalesce(selected.value->>'consumedLotId', selected.value->>'consumed_lot_id'), '') is not null
  )
  select count(*)
  into v_missing_count
  from required_components rc
  join products p on p.id = rc.component_product_id
  where not (p.type = 'raw' and lower(trim(p.name)) = 'eau')
    and not exists (
      select 1
      from selected_lots sl
      where sl.expected_product_id = rc.component_product_id
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
    select distinct
      nullif(coalesce(selected.value->>'expectedProductId', selected.value->>'expected_product_id'), '')::uuid as expected_product_id,
      nullif(coalesce(selected.value->>'consumedLotId', selected.value->>'consumed_lot_id'), '')::uuid as consumed_lot_id
    from jsonb_array_elements(coalesce(p_consumed_lot_selections, '[]'::jsonb)) as selected(value)
    where nullif(coalesce(selected.value->>'expectedProductId', selected.value->>'expected_product_id'), '') is not null
      and nullif(coalesce(selected.value->>'consumedLotId', selected.value->>'consumed_lot_id'), '') is not null
  ),
  validated_lots as (
    select
      sl.expected_product_id,
      sl.consumed_lot_id,
      expected_product.substitution_group as expected_group,
      consumed_product.substitution_group as consumed_group,
      l.product_id as consumed_product_id
    from selected_lots sl
    left join required_components rc on rc.component_product_id = sl.expected_product_id
    left join products expected_product on expected_product.id = sl.expected_product_id
      and expected_product.is_active = true
    left join lots l on l.id = sl.consumed_lot_id
      and l.lot_status = 'available'
      and l.quality_status = 'conforme'
    left join products consumed_product on consumed_product.id = l.product_id
      and consumed_product.is_active = true
    where rc.component_product_id is null
       or l.id is null
       or expected_product.id is null
       or consumed_product.id is null
       or (
         l.product_id <> sl.expected_product_id
         and not (
           expected_product.substitution_group is not null
           and expected_product.substitution_group = consumed_product.substitution_group
         )
       )
  )
  select count(*)
  into v_invalid_count
  from validated_lots;

  if v_invalid_count > 0 then
    raise exception 'Selected lots must be available lots for the active blueprint components or an allowed substitution group.';
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
    status,
    confirmed_by,
    confirmed_at,
    created_by,
    updated_by,
    updated_at
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
    'validated',
    v_actor_id,
    now(),
    v_actor_id,
    v_actor_id,
    now()
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
    source_id,
    created_by,
    updated_by,
    updated_at
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
    v_batch_id,
    v_actor_id,
    v_actor_id,
    now()
  );

  insert into production_consumptions (
    production_batch_id,
    expected_component_product_id,
    consumed_lot_id,
    quantity_used,
    unit,
    created_by,
    updated_by,
    updated_at
  )
  select distinct
    v_batch_id,
    selected.expected_product_id,
    selected.consumed_lot_id,
    null::numeric,
    null::text,
    v_actor_id,
    v_actor_id,
    now()
  from (
    select
      nullif(coalesce(item.value->>'expectedProductId', item.value->>'expected_product_id'), '')::uuid as expected_product_id,
      nullif(coalesce(item.value->>'consumedLotId', item.value->>'consumed_lot_id'), '')::uuid as consumed_lot_id
    from jsonb_array_elements(coalesce(p_consumed_lot_selections, '[]'::jsonb)) as item(value)
    where nullif(coalesce(item.value->>'expectedProductId', item.value->>'expected_product_id'), '') is not null
      and nullif(coalesce(item.value->>'consumedLotId', item.value->>'consumed_lot_id'), '') is not null
  ) selected;

  perform log_traceability_event(
    'production_lots.confirmed',
    'production_batch',
    v_batch_id,
    jsonb_build_object(
      'productId', p_product_id,
      'productName', v_product.name,
      'generatedLot', trim(p_generated_lot),
      'consumedLotCount', v_selected_count,
      'supportsSubstitutions', true
    )
  );

  return v_batch_id;
end;
$$;

revoke all on function create_production_with_traceability_v2(timestamptz, uuid, text, text, text, text, jsonb) from public;
grant execute on function create_production_with_traceability_v2(timestamptz, uuid, text, text, text, text, jsonb) to authenticated;

grant select on production_consumption_details to authenticated;

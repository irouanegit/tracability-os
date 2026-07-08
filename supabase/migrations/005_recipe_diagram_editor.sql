do $$ begin
  alter table recipes add column diagram_nodes jsonb not null default '[]'::jsonb;
exception when duplicate_column then null;
end $$;

do $$ begin
  alter table recipes add column diagram_edges jsonb not null default '[]'::jsonb;
exception when duplicate_column then null;
end $$;

do $$ begin
  alter table recipes add column diagram_viewport jsonb;
exception when duplicate_column then null;
end $$;

drop function if exists save_product_schema(uuid, uuid[]);
drop function if exists save_product_schema(uuid, uuid[], jsonb, jsonb, jsonb);

create or replace function save_product_schema(
  p_target_product_id uuid,
  p_component_product_ids uuid[],
  p_diagram_nodes jsonb default '[]'::jsonb,
  p_diagram_edges jsonb default '[]'::jsonb,
  p_diagram_viewport jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target products;
  v_component_ids uuid[] := coalesce(p_component_product_ids, array[]::uuid[]);
  v_component_count integer;
  v_distinct_component_count integer;
  v_invalid_component_count integer;
  v_cycle_exists boolean;
  v_next_version integer;
  v_recipe_id uuid;
begin
  select *
  into v_target
  from products
  where id = p_target_product_id
    and is_active = true;

  if not found then
    raise exception 'Target product does not exist or is inactive.';
  end if;

  if v_target.type = 'raw' then
    raise exception 'Raw materials cannot have fabrication schemas.';
  end if;

  select count(*), count(distinct component_id)
  into v_component_count, v_distinct_component_count
  from unnest(v_component_ids) as component(component_id);

  if v_component_count = 0 then
    raise exception 'A schema must contain at least one component.';
  end if;

  if v_component_count <> v_distinct_component_count then
    raise exception 'Schema components cannot contain duplicates.';
  end if;

  if exists (
    select 1
    from unnest(v_component_ids) as component(component_id)
    where component.component_id is null
  ) then
    raise exception 'Schema components cannot contain null values.';
  end if;

  if p_target_product_id = any(v_component_ids) then
    raise exception 'A product cannot be linked to itself.';
  end if;

  select count(*)
  into v_invalid_component_count
  from unnest(v_component_ids) as component(component_id)
  left join products p on p.id = component.component_id and p.is_active = true
  where p.id is null
    or p.type not in ('raw', 'semi_finished');

  if v_invalid_component_count > 0 then
    raise exception 'Components must be active raw materials or semi-finished products.';
  end if;

  with recursive downstream(product_id, path) as (
    select component_id, array[component_id]
    from unnest(v_component_ids) as component(component_id)
    union all
    select rc.component_product_id, downstream.path || rc.component_product_id
    from downstream
    join recipes r on r.product_id = downstream.product_id and r.is_active = true
    join recipe_components rc on rc.recipe_id = r.id
    where not rc.component_product_id = any(downstream.path)
  )
  select exists (
    select 1
    from downstream
    where product_id = p_target_product_id
  )
  into v_cycle_exists;

  if v_cycle_exists then
    raise exception 'This schema would create a circular semi-finished dependency.';
  end if;

  update recipes
  set is_active = false
  where product_id = p_target_product_id
    and is_active = true;

  select coalesce(max(version), 0) + 1
  into v_next_version
  from recipes
  where product_id = p_target_product_id;

  insert into recipes (
    product_id,
    version,
    is_active,
    notes,
    diagram_nodes,
    diagram_edges,
    diagram_viewport
  )
  values (
    p_target_product_id,
    v_next_version,
    true,
    'Diagram editor',
    coalesce(p_diagram_nodes, '[]'::jsonb),
    coalesce(p_diagram_edges, '[]'::jsonb),
    p_diagram_viewport
  )
  returning id into v_recipe_id;

  insert into recipe_components (recipe_id, component_product_id, quantity, unit)
  select v_recipe_id, component_id, null, null
  from unnest(v_component_ids) as component(component_id);

  update products
  set updated_at = now()
  where id = p_target_product_id;

  return v_recipe_id;
end;
$$;

grant execute on function save_product_schema(uuid, uuid[], jsonb, jsonb, jsonb) to anon, authenticated;

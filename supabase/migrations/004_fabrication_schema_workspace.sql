do $$ begin
  alter table products add column category text;
exception when duplicate_column then null;
end $$;

alter table products drop constraint if exists products_category_check;
alter table products add constraint products_category_check
  check (
    category is null
    or category in ('beldi', 'boulangerie', 'cake', 'patisserie', 'viennoiserie')
  );

alter table recipe_components alter column quantity drop not null;
alter table recipe_components alter column unit drop not null;
alter table recipe_components drop constraint if exists recipe_components_quantity_check;
alter table recipe_components drop constraint if exists recipe_components_quantity_positive;
alter table recipe_components add constraint recipe_components_quantity_positive
  check (quantity is null or quantity > 0);

create unique index if not exists recipe_components_recipe_component_idx
  on recipe_components (recipe_id, component_product_id);

drop view if exists product_catalog cascade;

create or replace view product_catalog as
select
  p.id,
  p.code,
  p.name,
  p.type,
  p.category,
  p.unit,
  case
    when p.type = 'raw' then 'not_required'::recipe_status
    when exists (
      select 1 from recipes r
      where r.product_id = p.id and r.is_active = true
    ) then 'active'::recipe_status
    else 'missing'::recipe_status
  end as recipe_status,
  coalesce((
    select count(*)::integer
    from recipes r
    join recipe_components rc on rc.recipe_id = r.id
    where r.product_id = p.id and r.is_active = true
  ), 0) as component_count,
  p.updated_at
from products p
where p.is_active = true;

create or replace view product_schema_components as
select
  r.product_id as target_product_id,
  r.id as recipe_id,
  r.version,
  rc.component_product_id,
  p.code as component_code,
  p.name as component_name,
  p.type as component_type,
  p.category as component_category,
  p.unit as component_unit,
  case
    when p.type = 'raw' then 'not_required'::recipe_status
    when exists (
      select 1 from recipes child_recipe
      where child_recipe.product_id = p.id and child_recipe.is_active = true
    ) then 'active'::recipe_status
    else 'missing'::recipe_status
  end as component_recipe_status,
  coalesce((
    select count(*)::integer
    from recipes child_recipe
    join recipe_components child_component on child_component.recipe_id = child_recipe.id
    where child_recipe.product_id = p.id and child_recipe.is_active = true
  ), 0) as component_count
from recipes r
join recipe_components rc on rc.recipe_id = r.id
join products p on p.id = rc.component_product_id
where r.is_active = true
  and p.is_active = true;

create or replace view product_lot_stock as
select
  p.id as product_id,
  count(l.id)::integer as available_lot_count,
  coalesce(sum(l.quantity_available), 0)::numeric(12, 3) as total_available,
  p.unit
from products p
left join lots l on l.product_id = p.id
  and l.lot_status = 'available'
  and l.quality_status = 'conforme'
  and l.quantity_available > 0
where p.is_active = true
group by p.id, p.unit;

create or replace function save_product_schema(
  p_target_product_id uuid,
  p_component_product_ids uuid[]
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

  insert into recipes (product_id, version, is_active, notes)
  values (p_target_product_id, v_next_version, true, 'Schema workspace')
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

grant select on product_catalog to anon, authenticated;
grant select on product_schema_components to anon, authenticated;
grant select on product_lot_stock to anon, authenticated;
grant execute on function save_product_schema(uuid, uuid[]) to anon, authenticated;

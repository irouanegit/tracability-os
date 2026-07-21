alter table products add column if not exists lot_zone text;
alter table products add column if not exists lot_code text;

alter table products drop constraint if exists products_lot_zone_not_blank;
alter table products add constraint products_lot_zone_not_blank
  check (lot_zone is null or length(trim(lot_zone)) > 0);

alter table products drop constraint if exists products_lot_code_not_blank;
alter table products add constraint products_lot_code_not_blank
  check (lot_code is null or length(trim(lot_code)) > 0);

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
  p.updated_at,
  p.lot_zone,
  p.lot_code
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
  ), 0) as component_count,
  p.lot_zone as component_lot_zone,
  p.lot_code as component_lot_code
from recipes r
join recipe_components rc on rc.recipe_id = r.id
join products p on p.id = rc.component_product_id
where r.is_active = true
  and p.is_active = true;

create or replace function update_product_lot_codification(
  p_product_id uuid,
  p_lot_zone text,
  p_lot_code text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lot_zone text := nullif(trim(p_lot_zone), '');
  v_lot_code text := nullif(regexp_replace(trim(p_lot_code), '[[:space:]]+', '', 'g'), '');
begin
  if v_lot_zone is null or v_lot_code is null then
    raise exception 'Zone and codification are required.';
  end if;

  update products
  set
    lot_zone = v_lot_zone,
    lot_code = v_lot_code,
    updated_at = now()
  where id = p_product_id
    and type <> 'raw'
    and is_active = true;

  if not found then
    raise exception 'Product not found or not eligible for lot codification.';
  end if;
end;
$$;

grant select on product_catalog to anon, authenticated;
grant select on product_schema_components to anon, authenticated;
grant execute on function update_product_lot_codification(uuid, text, text) to anon, authenticated;

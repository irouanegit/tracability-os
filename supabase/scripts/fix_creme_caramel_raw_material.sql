-- Fix Crème caramel: it is a raw material supplied by CREATIVE DISTRIBUTION.
-- Safe to run once; rerunning is harmless.

begin;

do $$
declare
  v_supplier_id uuid;
  v_raw_product_id uuid;
  v_wrong_product_id uuid;
begin
  select id
  into v_supplier_id
  from suppliers
  where lower(trim(name)) = lower('CREATIVE DISTRIBUTION')
  limit 1;

  if v_supplier_id is null then
    raise exception 'Supplier CREATIVE DISTRIBUTION does not exist.';
  end if;

  select id
  into v_raw_product_id
  from products
  where type = 'raw'::product_type
    and lower(trim(name)) = lower('Crème caramel')
  order by updated_at desc nulls last, created_at desc
  limit 1;

  select id
  into v_wrong_product_id
  from products
  where type <> 'raw'::product_type
    and lower(trim(name)) = lower('Crème caramel')
  order by updated_at desc nulls last, created_at desc
  limit 1;

  if v_raw_product_id is null and v_wrong_product_id is not null then
    v_raw_product_id := v_wrong_product_id;

    delete from recipes
    where product_id = v_raw_product_id;

    update products
    set code = case
          when code like 'MP-%' then code
          else 'MP-' || upper(substr(md5(id::text), 1, 12))
        end,
        type = 'raw'::product_type,
        category = null,
        unit = 'kg',
        is_active = true,
        updated_at = now()
    where id = v_raw_product_id;
  elsif v_raw_product_id is null then
    insert into products (code, name, type, unit, is_active)
    values (
      'MP-' || upper(substr(md5('Crème caramel'), 1, 12)),
      'Crème caramel',
      'raw'::product_type,
      'kg',
      true
    )
    returning id into v_raw_product_id;
  elsif v_wrong_product_id is not null and v_wrong_product_id <> v_raw_product_id then
    update recipe_components
    set component_product_id = v_raw_product_id
    where component_product_id = v_wrong_product_id;

    delete from recipes
    where product_id = v_wrong_product_id;

    update products
    set is_active = false,
        name = name || ' (ancienne fiche semi-fini)',
        updated_at = now()
    where id = v_wrong_product_id;
  end if;

  delete from recipes
  where product_id = v_raw_product_id;

  insert into supplier_raw_materials (supplier_id, product_id)
  values (v_supplier_id, v_raw_product_id)
  on conflict (supplier_id, product_id) do nothing;
end $$;

commit;

select
  products.name,
  products.type,
  products.unit,
  products.category,
  suppliers.name as supplier
from products
left join supplier_raw_materials on supplier_raw_materials.product_id = products.id
left join suppliers on suppliers.id = supplier_raw_materials.supplier_id
where lower(trim(products.name)) like lower('Crème caramel%')
order by products.is_active desc, products.type, products.name;

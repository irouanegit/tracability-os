create or replace function delete_product_catalog_item(p_product_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product products;
  v_active_usage_names text[];
begin
  select *
  into v_product
  from products
  where id = p_product_id
    and is_active = true;

  if not found then
    raise exception 'Product not found.';
  end if;

  select array_agg(distinct owner_product.name order by owner_product.name)
  into v_active_usage_names
  from recipe_components component
  join recipes recipe on recipe.id = component.recipe_id
  join products owner_product on owner_product.id = recipe.product_id
  where component.component_product_id = p_product_id
    and recipe.product_id <> p_product_id
    and recipe.is_active = true
    and owner_product.is_active = true;

  if coalesce(array_length(v_active_usage_names, 1), 0) > 0 then
    raise exception 'Cannot delete product because it is used in active schemas: %.', array_to_string(v_active_usage_names, ', ');
  end if;

  delete from recipe_components component
  using recipes recipe
  left join products owner_product on owner_product.id = recipe.product_id
  where component.recipe_id = recipe.id
    and component.component_product_id = p_product_id
    and (
      recipe.product_id = p_product_id
      or recipe.is_active = false
      or coalesce(owner_product.is_active, false) = false
    );

  update recipes
  set is_active = false
  where product_id = p_product_id
    and is_active = true;

  update products
  set
    is_active = false,
    updated_at = now()
  where id = p_product_id
    and is_active = true;

  if not found then
    raise exception 'Product not found.';
  end if;
end;
$$;

grant execute on function delete_product_catalog_item(uuid) to anon, authenticated;

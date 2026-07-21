drop table if exists pg_temp.beldi_corrected_finished_product_input;

create temp table beldi_corrected_finished_product_input (
  name text not null,
  unit text not null
);

insert into beldi_corrected_finished_product_input (name, unit)
values
  ('Corne gazelle', 'unites'),
  ('Diamantine', 'unites'),
  ('Fekkas sucré', 'unites'),
  ('Sablée Caramel', 'unites'),
  ('Sablée Citron', 'unites'),
  ('Sablée Pistache', 'unites');

do $$
declare
  v_duplicate_names text[];
begin
  select array_agg(input.name order by input.name)
  into v_duplicate_names
  from beldi_corrected_finished_product_input input
  where exists (
    select 1
    from products
    where products.type = 'semi_finished'
      and lower(trim(products.name)) = lower(trim(input.name))
  )
  and exists (
    select 1
    from products
    where products.type = 'finished'
      and lower(trim(products.name)) = lower(trim(input.name))
  );

  if coalesce(array_length(v_duplicate_names, 1), 0) > 0 then
    raise exception 'Both semi-finished and finished records exist for: %. Resolve duplicates before running correction.', v_duplicate_names;
  end if;
end $$;

with moved_products as (
  update products
  set type = 'finished'::product_type,
      category = 'beldi',
      unit = input.unit,
      code = 'PF-BELDI-' || upper(substr(md5(input.name), 1, 12)),
      updated_at = now()
  from beldi_corrected_finished_product_input input
  where products.type = 'semi_finished'
    and lower(trim(products.name)) = lower(trim(input.name))
  returning products.id, products.name
),
updated_existing_finished_products as (
  update products
  set category = 'beldi',
      unit = input.unit,
      code = 'PF-BELDI-' || upper(substr(md5(input.name), 1, 12)),
      updated_at = now()
  from beldi_corrected_finished_product_input input
  where products.type = 'finished'
    and lower(trim(products.name)) = lower(trim(input.name))
    and (
      products.category is distinct from 'beldi'
      or products.unit is distinct from input.unit
      or products.code is distinct from ('PF-BELDI-' || upper(substr(md5(input.name), 1, 12)))
    )
  returning products.id, products.name
),
updated_recipe_notes as (
  update recipes
  set notes = 'Beldi produit fini import'
  where product_id in (
    select products.id
    from products
    join beldi_corrected_finished_product_input input on lower(trim(products.name)) = lower(trim(input.name))
    where products.type = 'finished'
      and products.category = 'beldi'
  )
  returning recipes.id
),
found_finished_products as (
  select products.id, products.name
  from products
  join beldi_corrected_finished_product_input input on lower(trim(products.name)) = lower(trim(input.name))
  where products.type = 'finished'
    and products.category = 'beldi'
),
remaining_misclassified_products as (
  select products.name
  from products
  join beldi_corrected_finished_product_input input on lower(trim(products.name)) = lower(trim(input.name))
  where products.type = 'semi_finished'
)
select
  (select count(*) from beldi_corrected_finished_product_input) as requested_corrections,
  (select count(*) from moved_products) as moved_from_semi_finished_to_finished,
  (select count(*) from updated_existing_finished_products) as updated_existing_finished_products,
  (select count(*) from updated_recipe_notes) as updated_recipe_notes,
  (select count(*) from found_finished_products) as found_corrected_finished_products,
  coalesce((select array_agg(name order by name) from remaining_misclassified_products), array[]::text[]) as remaining_misclassified_products;

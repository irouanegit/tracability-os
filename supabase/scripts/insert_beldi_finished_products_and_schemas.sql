drop table if exists pg_temp.beldi_finished_product_input;
drop table if exists pg_temp.beldi_finished_only_raw_material_input;
drop table if exists pg_temp.beldi_finished_schema_input;

create temp table beldi_finished_product_input (
  name text not null,
  unit text not null
);

create temp table beldi_finished_only_raw_material_input (
  name text not null,
  unit text not null
);

create temp table beldi_finished_schema_input (
  target_name text not null,
  component_names text[] not null
);

insert into beldi_finished_product_input (name, unit)
values
  ('Sebbani GR', 'unites'),
  ('Corne gazelle', 'unites'),
  ('Diamantine', 'unites'),
  ('Richbond', 'unites'),
  ('Behla Mini', 'unites'),
  ('Behla', 'unites'),
  ('Fekkas sucré', 'unites'),
  ('Fekkas sans sucre', 'unites'),
  ('Raffaelo Coco', 'unites'),
  ('Raffaelo Kunafa', 'unites'),
  ('Mhencha Pistache', 'unites'),
  ('Tarte Fruit Secs', 'unites'),
  ('Baklava', 'unites'),
  ('Cookies drops', 'unites'),
  ('Cookies drops Pistache', 'unites'),
  ('Ghraiba effilée', 'unites'),
  ('Sebbani boites', 'unites'),
  ('Ghraiba effilée café', 'unites'),
  ('Chahda', 'unites'),
  ('Sablée Caramel', 'unites'),
  ('Sablée Citron', 'unites'),
  ('Sablée Pistache', 'unites'),
  ('Ghraiba effilée Noix', 'unites'),
  ('Biscuit salé', 'unites'),
  ('Fekkas prestige', 'unites'),
  ('Mhencha Pate Bastille', 'unites');

insert into beldi_finished_only_raw_material_input (name, unit)
values
  ('Pate bastille', 'kg');

insert into beldi_finished_schema_input (target_name, component_names)
values
  ('Sebbani GR', array['PATE Sebbani', 'Feuilletine', 'Chocolat blanc']),
  ('Corne gazelle', array['PATE AMANDE', 'Pate corne gazelle']),
  ('Diamantine', array['PATE Sablée', 'Praliné Amande', 'Ganache Caramel', 'Nougat sésame']),
  ('Richbond', array['PATE Richbond', 'Confiture Zakia', 'Eau de fleur', 'Poudre de coco']),
  ('Behla Mini', array['Amande hachée', 'Sucre glacé', 'Sésame', 'Farine', 'Huile', 'Fenouil', 'Levure', 'Sel', 'Cannelle']),
  ('Behla', array['Amande hachée', 'Sucre glacé', 'Sésame', 'Farine', 'Huile', 'Fenouil', 'Levure', 'Sel', 'Cannelle']),
  ('Fekkas sucré', array['Amande hachée', 'Sucre semoule', 'Sésame', 'Noix', 'Farine', 'Amande', 'Huile', 'Fenouil', 'Levure', 'Sel', 'Confiture Zakia']),
  ('Fekkas sans sucre', array['Amande hachée', 'Sésame', 'Farine', 'Amande', 'Huile', 'Vanille', 'Fenouil', 'Levure', 'Cannelle', 'Lait', 'Sel']),
  ('Raffaelo Coco', array['PATE Raffaelo', 'Chocolat blanc', 'Amande', 'Poudre de coco']),
  ('Raffaelo Kunafa', array['PATE Raffaelo', 'Chocolat blanc', 'Noisette', 'Kunafa']),
  ('Mhencha Pistache', array['PATE Mhencha Pistache', 'Amande hachée', 'Pistache', 'Nappage', 'Cornflower']),
  ('Tarte Fruit Secs', array['PATE Sablée', 'Miel', 'Acajou', 'Amande', 'Pistache', 'Noisette', 'Nappage', 'Glucose']),
  ('Baklava', array['Pate baklava', 'Farce baklava', 'Amande noire', 'Nappage']),
  ('Cookies drops', array['Farine', 'Beurre spécial', 'Œufs', 'Pistache', 'Drops', 'Vanille', 'Levure', 'Sucre glacé']),
  ('Cookies drops Pistache', array['Farine', 'Beurre spécial', 'Œufs', 'Pistache', 'Drops', 'Vanille', 'Levure', 'Sucre glacé']),
  ('Ghraiba effilée', array['Pate ghraiba effilée', 'Amande effilée', 'Nappage']),
  ('Sebbani boites', array['PATE Sebbani', 'Feuilletine']),
  ('Ghraiba effilée café', array['Pate ghraiba effilée', 'Amande effilée', 'Amande noire', 'Nappage']),
  ('Chahda', array['Pate Chahda', 'Amande hachée']),
  ('Sablée Caramel', array['PATE Sablée', 'Glucose', 'Ganache Caramel', 'Nappage', 'Amande hachée', 'Pétales de fleurs']),
  ('Sablée Citron', array['PATE Sablée', 'Glucose', 'Ganache Citron', 'Nappage', 'Nougat haché']),
  ('Sablée Pistache', array['PATE Sablée', 'Glucose', 'Ganache Pistache', 'Nappage', 'Amande hachée', 'Pistache']),
  ('Ghraiba effilée Noix', array['Pate Noix', 'Amande effilée', 'Noix', 'Nappage']),
  ('Biscuit salé', array['PATE Sablée', 'Amande', 'Tournesol', 'Mélange de graines', 'Amande effilée']),
  ('Fekkas prestige', array['Œufs', 'Beurre spécial', 'Huile', 'Vanille', 'Sucre semoule', 'Lait', 'Farine', 'Eau de fleur', 'Noix', 'Amande', 'Levure', 'Gingembre', 'Sel', 'Cannelle']),
  ('Mhencha Pate Bastille', array['Pâte Mhencha', 'Pate bastille']);

do $$
begin
  if not exists (
    select 1
    from suppliers
    where lower(trim(name)) = lower('BELDI')
  ) then
    raise exception 'BELDI supplier not found. Create supplier BELDI before running this import.';
  end if;
end $$;

with beldi_supplier as (
  select id
  from suppliers
  where lower(trim(name)) = lower('BELDI')
  limit 1
),
moved_misclassified_finished_products as (
  update products
  set type = 'finished'::product_type,
      category = 'beldi',
      unit = input.unit,
      code = 'PF-BELDI-' || upper(substr(md5(input.name), 1, 12)),
      updated_at = now()
  from beldi_finished_product_input input
  where products.type = 'semi_finished'
    and lower(trim(products.name)) = lower(trim(input.name))
    and not exists (
      select 1
      from products existing_finished
      where existing_finished.type = 'finished'
        and lower(trim(existing_finished.name)) = lower(trim(input.name))
    )
  returning products.id, products.name
),
inserted_finished_products as (
  insert into products (code, name, type, category, unit)
  select
    'PF-BELDI-' || upper(substr(md5(input.name), 1, 12)),
    input.name,
    'finished'::product_type,
    'beldi',
    input.unit
  from beldi_finished_product_input input
  where not exists (
    select 1
    from products
    where type = 'finished'
      and lower(trim(products.name)) = lower(trim(input.name))
  )
  on conflict (code) do nothing
  returning id, name
),
updated_finished_products as (
  update products
  set category = 'beldi',
      unit = input.unit,
      updated_at = now()
  from beldi_finished_product_input input
  where products.type = 'finished'
    and lower(trim(products.name)) = lower(trim(input.name))
    and (products.category is distinct from 'beldi' or products.unit is distinct from input.unit)
  returning products.id
),
inserted_raw_materials as (
  insert into products (code, name, type, unit)
  select
    'MP-BELDI-' || upper(substr(md5(input.name), 1, 12)),
    input.name,
    'raw'::product_type,
    input.unit
  from beldi_finished_only_raw_material_input input
  where not exists (
    select 1
    from products
    where type = 'raw'
      and lower(trim(products.name)) = lower(trim(input.name))
  )
  on conflict (code) do nothing
  returning id, name
),
all_finished_only_raw_materials as (
  select products.id, products.name
  from products
  join beldi_finished_only_raw_material_input input on lower(trim(products.name)) = lower(trim(input.name))
  where products.type = 'raw'
),
existing_supplier_links as (
  select supplier_raw_materials.product_id
  from supplier_raw_materials
  join beldi_supplier on beldi_supplier.id = supplier_raw_materials.supplier_id
  join all_finished_only_raw_materials on all_finished_only_raw_materials.id = supplier_raw_materials.product_id
),
inserted_supplier_links as (
  insert into supplier_raw_materials (supplier_id, product_id)
  select beldi_supplier.id, all_finished_only_raw_materials.id
  from beldi_supplier
  cross join all_finished_only_raw_materials
  where not exists (
    select 1
    from existing_supplier_links
    where existing_supplier_links.product_id = all_finished_only_raw_materials.id
  )
  on conflict (supplier_id, product_id) do nothing
  returning product_id
)
select
  (select count(*) from beldi_finished_product_input) as requested_finished_products,
  (select count(*) from moved_misclassified_finished_products) as moved_misclassified_finished_products,
  (select count(*) from inserted_finished_products) as newly_created_finished_products,
  (select count(*) from updated_finished_products) as updated_existing_finished_products,
  (
    select count(*)
    from products
    join beldi_finished_product_input input on lower(trim(products.name)) = lower(trim(input.name))
    where products.type = 'finished'
      and products.category = 'beldi'
  ) as total_beldi_finished_products_found,
  (select count(*) from inserted_raw_materials) as newly_created_finished_only_raw_materials,
  (select count(*) from inserted_supplier_links) as newly_linked_finished_only_raw_materials_to_beldi;

do $$
declare
  v_schema record;
  v_target_id uuid;
  v_recipe_id uuid;
  v_component_ids uuid[];
  v_missing_targets text[];
  v_missing_components text[];
  v_ambiguous_targets text[];
  v_ambiguous_components text[];
  v_self_links text[];
begin
  select array_agg(target_name order by target_name)
  into v_missing_targets
  from beldi_finished_schema_input input
  where not exists (
    select 1
    from products
    where type = 'finished'
      and category = 'beldi'
      and lower(trim(products.name)) = lower(trim(input.target_name))
  );

  if coalesce(array_length(v_missing_targets, 1), 0) > 0 then
    raise exception 'Missing Beldi finished target products: %', v_missing_targets;
  end if;

  select array_agg(distinct component_name order by component_name)
  into v_missing_components
  from (
    select unnest(component_names) as component_name
    from beldi_finished_schema_input
  ) components
  where not exists (
    select 1
    from products
    where type in ('raw', 'semi_finished')
      and is_active = true
      and lower(trim(products.name)) = lower(trim(components.component_name))
  );

  if coalesce(array_length(v_missing_components, 1), 0) > 0 then
    raise exception 'Missing finished schema component products: %', v_missing_components;
  end if;

  select array_agg(target_name || ' (' || match_count || ' matches)' order by target_name)
  into v_ambiguous_targets
  from (
    select
      input.target_name,
      count(products.id) as match_count
    from beldi_finished_schema_input input
    join products
      on products.type = 'finished'
     and products.category = 'beldi'
     and lower(trim(products.name)) = lower(trim(input.target_name))
    group by input.target_name
    having count(products.id) > 1
  ) ambiguous;

  if coalesce(array_length(v_ambiguous_targets, 1), 0) > 0 then
    raise exception 'Ambiguous Beldi finished target products: %', v_ambiguous_targets;
  end if;

  select array_agg(component_name || ' (' || match_count || ' matches)' order by component_name)
  into v_ambiguous_components
  from (
    select
      components.component_name,
      count(products.id) as match_count
    from (
      select distinct unnest(component_names) as component_name
      from beldi_finished_schema_input
    ) components
    join products
      on products.type in ('raw', 'semi_finished')
     and products.is_active = true
     and lower(trim(products.name)) = lower(trim(components.component_name))
    group by components.component_name
    having count(products.id) > 1
  ) ambiguous;

  if coalesce(array_length(v_ambiguous_components, 1), 0) > 0 then
    raise exception 'Ambiguous finished schema component products: %', v_ambiguous_components;
  end if;

  select array_agg(target_name order by target_name)
  into v_self_links
  from beldi_finished_schema_input
  where lower(trim(target_name)) = any (
    select lower(trim(component_name))
    from unnest(component_names) as component_name
  );

  if coalesce(array_length(v_self_links, 1), 0) > 0 then
    raise exception 'Self-linking finished schemas are not allowed: %', v_self_links;
  end if;

  for v_schema in
    select target_name, component_names
    from beldi_finished_schema_input
    order by target_name
  loop
    select id
    into v_target_id
    from products
    where type = 'finished'
      and category = 'beldi'
      and lower(trim(name)) = lower(trim(v_schema.target_name))
    limit 1;

    select array_agg(product_id order by component_order)
    into v_component_ids
    from (
      select distinct on (lower(trim(component_name)))
        component_order,
        products.id as product_id
      from unnest(v_schema.component_names) with ordinality as components(component_name, component_order)
      join products
        on products.type in ('raw', 'semi_finished')
       and products.is_active = true
       and lower(trim(products.name)) = lower(trim(components.component_name))
      order by lower(trim(component_name)), component_order
    ) resolved_components;

    select id
    into v_recipe_id
    from recipes
    where product_id = v_target_id
      and is_active = true
    order by version desc
    limit 1;

    if v_recipe_id is null then
      insert into recipes (product_id, version, is_active, notes)
      values (
        v_target_id,
        coalesce((select max(version) from recipes where product_id = v_target_id), 0) + 1,
        true,
        'Beldi produit fini import'
      )
      returning id into v_recipe_id;
    else
      update recipes
      set notes = 'Beldi produit fini import'
      where id = v_recipe_id;
    end if;

    update recipes
    set is_active = false
    where product_id = v_target_id
      and id <> v_recipe_id
      and is_active = true;

    delete from recipe_components
    where recipe_id = v_recipe_id;

    insert into recipe_components (recipe_id, component_product_id, quantity, unit)
    select v_recipe_id, component_id, null, null
    from unnest(v_component_ids) as component_id;

    update products
    set updated_at = now()
    where id = v_target_id;
  end loop;
end $$;

with expected_targets as (
  select target_name
  from beldi_finished_schema_input
),
expected_links as (
  select
    input.target_name,
    component_name
  from beldi_finished_schema_input input
  cross join lateral unnest(input.component_names) as component_name
),
active_beldi_recipes as (
  select
    target.id as target_id,
    target.name as target_name,
    recipes.id as recipe_id,
    component.name as component_name
  from recipes
  join products target on target.id = recipes.product_id
  join recipe_components on recipe_components.recipe_id = recipes.id
  join products component on component.id = recipe_components.component_product_id
  where recipes.is_active = true
    and target.type = 'finished'
    and target.category = 'beldi'
    and exists (
      select 1
      from expected_targets
      where lower(trim(expected_targets.target_name)) = lower(trim(target.name))
    )
),
missing_links as (
  select
    expected_links.target_name,
    expected_links.component_name
  from expected_links
  where not exists (
    select 1
    from active_beldi_recipes
    where lower(trim(active_beldi_recipes.target_name)) = lower(trim(expected_links.target_name))
      and lower(trim(active_beldi_recipes.component_name)) = lower(trim(expected_links.component_name))
  )
),
extra_links as (
  select
    active_beldi_recipes.target_name,
    active_beldi_recipes.component_name
  from active_beldi_recipes
  where not exists (
    select 1
    from expected_links
    where lower(trim(expected_links.target_name)) = lower(trim(active_beldi_recipes.target_name))
      and lower(trim(expected_links.component_name)) = lower(trim(active_beldi_recipes.component_name))
  )
),
duplicate_active_recipe_targets as (
  select
    target_name,
    count(distinct recipe_id) as active_recipe_count
  from active_beldi_recipes
  group by target_name
  having count(distinct recipe_id) > 1
)
select
  (select count(*) from expected_targets) as requested_schema_count,
  (select count(*) from expected_links) as requested_component_link_count,
  (
    select count(distinct target_id)
    from active_beldi_recipes
  ) as active_schema_count,
  (
    select count(*)
    from active_beldi_recipes
  ) as active_component_link_count,
  coalesce((select array_agg(target_name || ' -> ' || component_name order by target_name, component_name) from missing_links), array[]::text[]) as missing_component_links,
  coalesce((select array_agg(target_name || ' -> ' || component_name order by target_name, component_name) from extra_links), array[]::text[]) as extra_component_links,
  coalesce((select array_agg(target_name || ' (' || active_recipe_count || ' active)' order by target_name) from duplicate_active_recipe_targets), array[]::text[]) as duplicate_active_recipe_targets;

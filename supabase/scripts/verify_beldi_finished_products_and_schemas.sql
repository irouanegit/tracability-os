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

with expected_products as (
  select name
  from beldi_finished_product_input
),
found_products as (
  select products.id, products.name
  from products
  join expected_products on lower(trim(expected_products.name)) = lower(trim(products.name))
  where products.type = 'finished'
    and products.category = 'beldi'
),
missing_products as (
  select expected_products.name
  from expected_products
  where not exists (
    select 1
    from found_products
    where lower(trim(found_products.name)) = lower(trim(expected_products.name))
  )
),
expected_raw_materials as (
  select name
  from beldi_finished_only_raw_material_input
),
missing_raw_materials as (
  select expected_raw_materials.name
  from expected_raw_materials
  where not exists (
    select 1
    from products
    where products.type = 'raw'
      and lower(trim(products.name)) = lower(trim(expected_raw_materials.name))
  )
),
expected_targets as (
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
active_target_recipes as (
  select
    target.id as target_id,
    target.name as target_name,
    recipes.id as recipe_id
  from recipes
  join products target on target.id = recipes.product_id
  where recipes.is_active = true
    and target.type = 'finished'
    and target.category = 'beldi'
    and exists (
      select 1
      from expected_targets
      where lower(trim(expected_targets.target_name)) = lower(trim(target.name))
    )
),
actual_links as (
  select
    active_target_recipes.target_name,
    component.name as component_name
  from active_target_recipes
  join recipe_components on recipe_components.recipe_id = active_target_recipes.recipe_id
  join products component on component.id = recipe_components.component_product_id
),
missing_targets as (
  select expected_targets.target_name
  from expected_targets
  where not exists (
    select 1
    from active_target_recipes
    where lower(trim(active_target_recipes.target_name)) = lower(trim(expected_targets.target_name))
  )
),
missing_links as (
  select
    expected_links.target_name,
    expected_links.component_name
  from expected_links
  where not exists (
    select 1
    from actual_links
    where lower(trim(actual_links.target_name)) = lower(trim(expected_links.target_name))
      and lower(trim(actual_links.component_name)) = lower(trim(expected_links.component_name))
  )
),
extra_links as (
  select
    actual_links.target_name,
    actual_links.component_name
  from actual_links
  where not exists (
    select 1
    from expected_links
    where lower(trim(expected_links.target_name)) = lower(trim(actual_links.target_name))
      and lower(trim(expected_links.component_name)) = lower(trim(actual_links.component_name))
  )
),
duplicate_active_recipe_targets as (
  select
    target_name,
    count(*) as active_recipe_count
  from active_target_recipes
  group by target_name
  having count(*) > 1
)
select
  (select count(*) from expected_products) as expected_finished_product_count,
  (select count(*) from found_products) as found_finished_product_count,
  coalesce((select array_agg(name order by name) from missing_products), array[]::text[]) as missing_finished_products,
  coalesce((select array_agg(name order by name) from missing_raw_materials), array[]::text[]) as missing_finished_only_raw_materials,
  (select count(*) from expected_targets) as expected_schema_count,
  (select count(*) from active_target_recipes) as active_schema_count,
  (select count(*) from expected_links) as expected_component_link_count,
  (select count(*) from actual_links) as active_component_link_count,
  coalesce((select array_agg(target_name order by target_name) from missing_targets), array[]::text[]) as missing_schema_targets,
  coalesce((select array_agg(target_name || ' -> ' || component_name order by target_name, component_name) from missing_links), array[]::text[]) as missing_component_links,
  coalesce((select array_agg(target_name || ' -> ' || component_name order by target_name, component_name) from extra_links), array[]::text[]) as extra_component_links,
  coalesce((select array_agg(target_name || ' (' || active_recipe_count || ' active)' order by target_name) from duplicate_active_recipe_targets), array[]::text[]) as duplicate_active_recipe_targets;

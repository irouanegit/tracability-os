drop table if exists pg_temp.beldi_semi_finished_schema_input;

create temp table beldi_semi_finished_schema_input (
  target_name text not null,
  component_names text[] not null
);

insert into beldi_semi_finished_schema_input (target_name, component_names)
values
  ('Farce baklava', array['Sucre glacé', 'Amande noire', 'Beurre spécial', 'Cannelle']),
  ('Ganache Caramel', array['Glucose', 'Gala blanc', 'Miel', 'Nestlé caramel']),
  ('Ganache choco café', array['Nappage', 'Glucose', 'Gala noir', 'Miel', 'Trablit café']),
  ('Ganache Citron', array['Nappage', 'Glucose', 'Gala blanc', 'Arôme citron']),
  ('Ganache Pistache', array['Nappage', 'Glucose', 'Gala blanc', 'Arôme pistache']),
  ('Nougat haché', array['Glucose', 'Beurre spécial', 'Sucre semoule', 'Gala blanc', 'Pistache', 'Amande hachée']),
  ('Nougat sésame', array['Glucose', 'Beurre spécial', 'Sucre semoule', 'Chocolat blanc', 'Sésame blanc']),
  ('Nougat Tournesol', array['Glucose', 'Beurre spécial', 'Sucre semoule', 'Gala blanc', 'Tournesol']),
  ('PATE AMANDE', array['Amande noire', 'Confiture Zakia', 'Sucre semoule', 'Beurre spécial', 'Eau de fleur', 'Colorant']),
  ('Pate baklava', array['Sucre glacé', 'Farine', 'Sel', 'Beurre spécial', 'Colorant', 'Eau de fleur']),
  ('Pate Chahda', array['Amande noire concassée', 'Arôme orange', 'Écorces d’orange', 'Confiture Zakia', 'Eau florale']),
  ('Pate corne gazelle', array['Huile végétale', 'Farine', 'Miel', 'Eau florale', 'Beurre spécial', 'Colorant']),
  ('Pate ghraiba effilée', array['PATE AMANDE', 'Arôme orange', 'Écorces d’orange', 'Œufs', 'Trablit café', 'Levure']),
  ('PATE Mhencha Pistache', array['Amande noire', 'Pistache hachée', 'Beurre spécial', 'Confiture Zakia', 'Sucre semoule', 'Arôme pistache', 'Eau florale']),
  ('Pate Noix', array['Amande hachée', 'Noix hachée', 'Confiture', 'Beurre spécial', 'Eau de fleur', 'Arôme café']),
  ('PATE Raffaelo', array['Beurre spécial', 'Maïzena', 'Farine', 'Sucre glacé', 'Vanille', 'Huile', 'Levure', 'Sel']),
  ('PATE Richbond', array['Beurre spécial', 'Œufs', 'Sucre semoule', 'Huile', 'Farine', 'Arôme citron', 'Levure', 'Sel', 'Vanille']),
  ('PATE Sablée', array['Beurre spécial', 'Beurre Bonna', 'Œufs', 'Huile végétale', 'Arôme orange', 'Farine', 'Sel', 'Glucose']),
  ('PATE Sebbani', array['Amande hachée', 'Huile végétale', 'Sucre glacé', 'Levure', 'Farine', 'Cannelle', 'Sel']),
  ('Praliné Amande', array['Amande noire', 'Sucre glacé', 'Huile végétale']),
  ('Praliné Pistache', array['Pistache', 'Sucre glacé', 'Huile végétale']);

with expected_targets as (
  select target_name
  from beldi_semi_finished_schema_input
),
expected_links as (
  select
    input.target_name,
    component_name
  from beldi_semi_finished_schema_input input
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
    and target.type = 'semi_finished'
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
  (select count(*) from expected_targets) as expected_schema_count,
  (select count(*) from active_target_recipes) as active_schema_count,
  (select count(*) from expected_links) as expected_component_link_count,
  (select count(*) from actual_links) as active_component_link_count,
  coalesce((select array_agg(target_name order by target_name) from missing_targets), array[]::text[]) as missing_targets,
  coalesce((select array_agg(target_name || ' -> ' || component_name order by target_name, component_name) from missing_links), array[]::text[]) as missing_component_links,
  coalesce((select array_agg(target_name || ' -> ' || component_name order by target_name, component_name) from extra_links), array[]::text[]) as extra_component_links,
  coalesce((select array_agg(target_name || ' (' || active_recipe_count || ' active)' order by target_name) from duplicate_active_recipe_targets), array[]::text[]) as duplicate_active_recipe_targets;

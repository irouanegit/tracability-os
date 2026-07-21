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
  from beldi_semi_finished_schema_input input
  where not exists (
    select 1
    from products
    where type = 'semi_finished'
      and category = 'beldi'
      and lower(trim(products.name)) = lower(trim(input.target_name))
  );

  if coalesce(array_length(v_missing_targets, 1), 0) > 0 then
    raise exception 'Missing Beldi semi-finished target products: %', v_missing_targets;
  end if;

  select array_agg(distinct component_name order by component_name)
  into v_missing_components
  from (
    select unnest(component_names) as component_name
    from beldi_semi_finished_schema_input
  ) components
  where not exists (
    select 1
    from products
    where type in ('raw', 'semi_finished')
      and is_active = true
      and lower(trim(products.name)) = lower(trim(components.component_name))
  );

  if coalesce(array_length(v_missing_components, 1), 0) > 0 then
    raise exception 'Missing schema component products: %', v_missing_components;
  end if;

  select array_agg(target_name || ' (' || match_count || ' matches)' order by target_name)
  into v_ambiguous_targets
  from (
    select
      input.target_name,
      count(products.id) as match_count
    from beldi_semi_finished_schema_input input
    join products
      on products.type = 'semi_finished'
     and products.category = 'beldi'
     and lower(trim(products.name)) = lower(trim(input.target_name))
    group by input.target_name
    having count(products.id) > 1
  ) ambiguous;

  if coalesce(array_length(v_ambiguous_targets, 1), 0) > 0 then
    raise exception 'Ambiguous Beldi semi-finished target products: %', v_ambiguous_targets;
  end if;

  select array_agg(component_name || ' (' || match_count || ' matches)' order by component_name)
  into v_ambiguous_components
  from (
    select
      components.component_name,
      count(products.id) as match_count
    from (
      select distinct unnest(component_names) as component_name
      from beldi_semi_finished_schema_input
    ) components
    join products
      on products.type in ('raw', 'semi_finished')
     and products.is_active = true
     and lower(trim(products.name)) = lower(trim(components.component_name))
    group by components.component_name
    having count(products.id) > 1
  ) ambiguous;

  if coalesce(array_length(v_ambiguous_components, 1), 0) > 0 then
    raise exception 'Ambiguous schema component products: %', v_ambiguous_components;
  end if;

  select array_agg(target_name order by target_name)
  into v_self_links
  from beldi_semi_finished_schema_input
  where lower(trim(target_name)) = any (
    select lower(trim(component_name))
    from unnest(component_names) as component_name
  );

  if coalesce(array_length(v_self_links, 1), 0) > 0 then
    raise exception 'Self-linking schemas are not allowed: %', v_self_links;
  end if;

  for v_schema in
    select target_name, component_names
    from beldi_semi_finished_schema_input
    order by target_name
  loop
    select id
    into v_target_id
    from products
    where type = 'semi_finished'
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
        'Beldi semi-fini import'
      )
      returning id into v_recipe_id;
    else
      update recipes
      set notes = 'Beldi semi-fini import'
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
  from beldi_semi_finished_schema_input
),
expected_links as (
  select
    input.target_name,
    component_name
  from beldi_semi_finished_schema_input input
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
    and target.type = 'semi_finished'
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

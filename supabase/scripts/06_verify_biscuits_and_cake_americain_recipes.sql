-- Verification for 05_update_biscuits_and_cake_americain_recipes.sql.
-- Expected result: no missing recipes, no missing links, no extra active links,
-- and Pavot linked to DIVERS.

with expected_recipes(target_name, target_type, target_category, expected_components) as (
  values
    ('Biscuit cake Amr carotte', 'semi_finished', 'patisserie', array['Cannelle','Levure chimique','Sucre semoule','Farine force','Œufs','Noix']),
    ('Biscuit Joconde noire', 'semi_finished', 'patisserie', array['Blanc d''œuf','Sucre semoule','Œufs','Farine force','Sucre glacé','Poudre cacao','Amande poudre']),
    ('Biscuit Joconde blanc', 'semi_finished', 'patisserie', array['Blanc d''œuf','Sucre glacé','Œufs','Farine force','Amande poudre','Sucre semoule']),
    ('Biscuit cookies', 'semi_finished', 'patisserie', array['Beurre','Sucre semoule','Œufs','Farine','Sel','Levure','Drops']),
    ('Biscuit café', 'semi_finished', 'patisserie', array['Œufs','Poudre cacao','Sucre semoule','Blanc d''œuf','Farine force','Sucre glacé','Amande poudre','Extrait liquide café']),
    ('Biscuit pavot', 'semi_finished', 'patisserie', array['Miel','Beurre','Poudre vanille','Jaune d''œuf','Farine','Œufs','Lait','Pavot','Sucre semoule','Blanc d''œuf']),
    ('Biscuit 3chocolat', 'semi_finished', 'patisserie', array['Farine','Poudre cacao','Chocolat noir Callebaut','Beurre','Blanc d''œuf','Sucre semoule','Amande poudre']),
    ('Biscuit sans farine', 'semi_finished', 'patisserie', array['Farine','Blanc d''œuf','Jaune d''œuf','Sucre semoule','Poudre cacao']),
    ('Biscuit Tropical', 'semi_finished', 'patisserie', array['Beurre','Sucre semoule','Amande poudre','Farine','Blanc d''œuf','Trimoline','Pate pistache','Levure chimique']),
    ('Biscuit Joconde pistache', 'semi_finished', 'patisserie', array['Blanc d''œuf','Sucre glacé','Œufs','Farine force','Amande poudre','Colorant vert','Sucre semoule']),
    ('Biscuit noire', 'semi_finished', 'patisserie', array['Trimoline','Beurre','Crème fraîche','Chocolat noir Callebaut','Sucre glacé','Œufs','Farine force','Amande poudre','Levure chimique','Poudre cacao','Sucre semoule']),
    ('Biscuit Cake Américain', 'semi_finished', 'cake', array['Beurre','Huile','Levure chimique','Amande poudre','Sucre glacé','Poudre cacao','Trimoline','Farine','Œufs']),
    ('Cake AMR Ferrero', 'finished', 'cake', array['Entremet cake American Ferrero','Chocolat rochée noire','GANACHE CHOCOLAT','Crème au beurre','Ferrero']),
    ('Cake AMR nougat', 'finished', 'cake', array['Entremet cake American NOUGA','Praline','NOUGA','Crème au beurre','Chocolat noir Callebaut']),
    ('Cake AMR Nutella', 'finished', 'cake', array['Entremet cake American Nutella','GANACHE CHOCOLAT','Kitkat','Crème au beurre','Chocolat noir Callebaut']),
    ('Entremet cake American Ferrero', 'semi_finished', 'cake', array['Biscuit Cake Américain','Crème au beurre','Croquant','Praline noisette']),
    ('Entremet cake American NOUGA', 'semi_finished', 'cake', array['Biscuit Cake Américain','Crème au beurre','NOUGA','GANACHE CHOCOLAT','Praline noisette']),
    ('Entremet cake American Nutella', 'semi_finished', 'cake', array['Biscuit Cake Américain','Crème au beurre','Fromage blanc','GANACHE CHOCOLAT','Nutella']),
    ('Entremet cake American carotte', 'semi_finished', 'cake', array['Biscuit cake Amr carotte','Crème au beurre','Fromage blanc','Crème fraîche']),
    ('entremet Ferrero', 'finished', 'cake', array['Entremet cake American Ferrero','Chocolat rochée noire','GANACHE CHOCOLAT','Crème au beurre','Ferrero']),
    ('Cake AMR carotte', 'finished', 'cake', array['Entremet cake American carotte','Crème au beurre','Biscuit cake Amr carotte'])
),
expected_links as (
  select
    target_name,
    target_type,
    target_category,
    unnest(expected_components) as component_name
  from expected_recipes
),
active_recipes as (
  select
    er.target_name,
    er.target_type,
    er.target_category,
    p.id as target_id,
    r.id as recipe_id
  from expected_recipes er
  left join products p
    on p.is_active = true
   and p.type = er.target_type::product_type
   and p.category = er.target_category
   and lower(trim(p.name)) = lower(trim(er.target_name))
  left join recipes r
    on r.product_id = p.id
   and r.is_active = true
),
actual_links as (
  select
    ar.target_name,
    ar.target_type,
    ar.target_category,
    component.name as component_name
  from active_recipes ar
  join recipe_components rc on rc.recipe_id = ar.recipe_id
  join products component on component.id = rc.component_product_id
),
missing_recipes as (
  select target_name, target_type, target_category
  from active_recipes
  where recipe_id is null
),
missing_links as (
  select el.target_name || ' -> ' || el.component_name as link
  from expected_links el
  where not exists (
    select 1
    from actual_links al
    where lower(trim(al.target_name)) = lower(trim(el.target_name))
      and al.target_type = el.target_type
      and al.target_category = el.target_category
      and lower(trim(al.component_name)) = lower(trim(el.component_name))
  )
),
extra_links as (
  select al.target_name || ' -> ' || al.component_name as link
  from actual_links al
  where not exists (
    select 1
    from expected_links el
    where lower(trim(al.target_name)) = lower(trim(el.target_name))
      and al.target_type = el.target_type
      and al.target_category = el.target_category
      and lower(trim(al.component_name)) = lower(trim(el.component_name))
  )
),
pavot_supplier as (
  select exists (
    select 1
    from products p
    join supplier_raw_materials srm on srm.product_id = p.id
    join suppliers s on s.id = srm.supplier_id
    where p.type = 'raw'
      and p.is_active = true
      and lower(trim(p.name)) = lower('Pavot')
      and lower(trim(s.name)) = lower('DIVERS')
  ) as is_linked
)
select
  (select count(*) from expected_recipes) as expected_recipe_count,
  (select count(*) from active_recipes where recipe_id is not null) as found_active_recipe_count,
  (select count(*) from expected_links) as expected_component_link_count,
  (select count(*) from actual_links) as actual_component_link_count,
  coalesce((select array_agg(target_name order by target_name) from missing_recipes), array[]::text[]) as missing_recipes,
  coalesce((select array_agg(link order by link) from missing_links), array[]::text[]) as missing_component_links,
  coalesce((select array_agg(link order by link) from extra_links), array[]::text[]) as extra_component_links,
  (select is_linked from pavot_supplier) as pavot_linked_to_divers;

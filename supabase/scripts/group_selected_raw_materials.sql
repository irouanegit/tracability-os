-- Groups only the raw materials explicitly approved by the user.
-- Safe to review and run manually in the Supabase SQL editor.
--
-- This version does not use temp/helper tables because the Supabase SQL editor
-- can lose those relations between statements in some execution modes.

begin;

do $$
declare
  v_ambiguous_names text[];
  v_missing_targets text[];
begin
  with raw_material_grouping(source_name, target_name, merge_order) as (
    values
      ('Amande', 'Amande noire', 1),
      ('Beurre', 'Beurre spécial', 2),
      ('Gélatine', 'Gélatine poudre', 3),
      ('Farine', 'Farine viennoiserie', 4),
      ('Huile', 'Huile végétale', 5),
      ('Lait liquide', 'Lait', 6),
      ('Nappage normal', 'Nappage simple', 7),
      ('Nappage', 'Nappage simple', 8),
      ('Vanille poudre', 'Poudre vanille', 9),
      ('Vanille', 'Poudre vanille', 10),
      ('Confiture Zakia', 'Confiture', 11),
      ('Bicarbonate de soude', 'Bicarbonate', 12),
      ('Levure', 'Levure ideal', 13),
      ('Pectine', 'Pectine NH', 14)
  )
  select array_agg(name_key order by name_key)
  into v_ambiguous_names
  from (
    select lower(trim(products.name)) as name_key
    from products
    where products.type = 'raw'
      and products.is_active = true
      and lower(trim(products.name)) in (
        select lower(trim(source_name)) from raw_material_grouping
        union
        select lower(trim(target_name)) from raw_material_grouping
      )
    group by lower(trim(products.name))
    having count(*) > 1
  ) ambiguous;

  if coalesce(array_length(v_ambiguous_names, 1), 0) > 0 then
    raise exception 'Ambiguous active raw materials found. Resolve duplicates first: %', v_ambiguous_names;
  end if;

  -- If a canonical target does not exist yet, rename the first listed source for that target.
  with raw_material_grouping(source_name, target_name, merge_order) as (
    values
      ('Amande', 'Amande noire', 1),
      ('Beurre', 'Beurre spécial', 2),
      ('Gélatine', 'Gélatine poudre', 3),
      ('Farine', 'Farine viennoiserie', 4),
      ('Huile', 'Huile végétale', 5),
      ('Lait liquide', 'Lait', 6),
      ('Nappage normal', 'Nappage simple', 7),
      ('Nappage', 'Nappage simple', 8),
      ('Vanille poudre', 'Poudre vanille', 9),
      ('Vanille', 'Poudre vanille', 10),
      ('Confiture Zakia', 'Confiture', 11),
      ('Bicarbonate de soude', 'Bicarbonate', 12),
      ('Levure', 'Levure ideal', 13),
      ('Pectine', 'Pectine NH', 14)
  ),
  target_seed as (
    select distinct on (target_name)
      target_name,
      source_name
    from raw_material_grouping
    order by target_name, merge_order
  ),
  missing_targets as (
    select target_seed.target_name, target_seed.source_name
    from target_seed
    where not exists (
      select 1
      from products target_product
      where target_product.type = 'raw'
        and target_product.is_active = true
        and lower(trim(target_product.name)) = lower(trim(target_seed.target_name))
    )
  )
  update products source_product
  set
    name = missing_targets.target_name,
    updated_at = now()
  from missing_targets
  where source_product.type = 'raw'
    and source_product.is_active = true
    and lower(trim(source_product.name)) = lower(trim(missing_targets.source_name));

  with raw_material_grouping(source_name, target_name, merge_order) as (
    values
      ('Amande', 'Amande noire', 1),
      ('Beurre', 'Beurre spécial', 2),
      ('Gélatine', 'Gélatine poudre', 3),
      ('Farine', 'Farine viennoiserie', 4),
      ('Huile', 'Huile végétale', 5),
      ('Lait liquide', 'Lait', 6),
      ('Nappage normal', 'Nappage simple', 7),
      ('Nappage', 'Nappage simple', 8),
      ('Vanille poudre', 'Poudre vanille', 9),
      ('Vanille', 'Poudre vanille', 10),
      ('Confiture Zakia', 'Confiture', 11),
      ('Bicarbonate de soude', 'Bicarbonate', 12),
      ('Levure', 'Levure ideal', 13),
      ('Pectine', 'Pectine NH', 14)
  ),
  target_seed as (
    select distinct on (target_name)
      target_name,
      source_name
    from raw_material_grouping
    order by target_name, merge_order
  )
  select array_agg(target_seed.target_name order by target_seed.target_name)
  into v_missing_targets
  from target_seed
  where not exists (
    select 1
    from products target_product
    where target_product.type = 'raw'
      and target_product.is_active = true
      and lower(trim(target_product.name)) = lower(trim(target_seed.target_name))
  );

  if coalesce(array_length(v_missing_targets, 1), 0) > 0 then
    raise exception 'Could not create or find canonical target raw materials: %', v_missing_targets;
  end if;
end $$;

-- Keep supplier availability on the canonical target before removing source links.
with raw_material_grouping(source_name, target_name, merge_order) as (
  values
    ('Amande', 'Amande noire', 1),
    ('Beurre', 'Beurre spécial', 2),
    ('Gélatine', 'Gélatine poudre', 3),
    ('Farine', 'Farine viennoiserie', 4),
    ('Huile', 'Huile végétale', 5),
    ('Lait liquide', 'Lait', 6),
    ('Nappage normal', 'Nappage simple', 7),
    ('Nappage', 'Nappage simple', 8),
    ('Vanille poudre', 'Poudre vanille', 9),
    ('Vanille', 'Poudre vanille', 10),
    ('Confiture Zakia', 'Confiture', 11),
    ('Bicarbonate de soude', 'Bicarbonate', 12),
    ('Levure', 'Levure ideal', 13),
    ('Pectine', 'Pectine NH', 14)
),
resolved as (
  select distinct
    source_product.id as source_id,
    target_product.id as target_id
  from raw_material_grouping mapping
  join products source_product
    on source_product.type = 'raw'
   and source_product.is_active = true
   and lower(trim(source_product.name)) = lower(trim(mapping.source_name))
  join products target_product
    on target_product.type = 'raw'
   and target_product.is_active = true
   and lower(trim(target_product.name)) = lower(trim(mapping.target_name))
  where source_product.id <> target_product.id
)
insert into supplier_raw_materials (supplier_id, product_id)
select distinct supplier_raw_materials.supplier_id, resolved.target_id
from supplier_raw_materials
join resolved on resolved.source_id = supplier_raw_materials.product_id
on conflict (supplier_id, product_id) do nothing;

with raw_material_grouping(source_name, target_name, merge_order) as (
  values
    ('Amande', 'Amande noire', 1),
    ('Beurre', 'Beurre spécial', 2),
    ('Gélatine', 'Gélatine poudre', 3),
    ('Farine', 'Farine viennoiserie', 4),
    ('Huile', 'Huile végétale', 5),
    ('Lait liquide', 'Lait', 6),
    ('Nappage normal', 'Nappage simple', 7),
    ('Nappage', 'Nappage simple', 8),
    ('Vanille poudre', 'Poudre vanille', 9),
    ('Vanille', 'Poudre vanille', 10),
    ('Confiture Zakia', 'Confiture', 11),
    ('Bicarbonate de soude', 'Bicarbonate', 12),
    ('Levure', 'Levure ideal', 13),
    ('Pectine', 'Pectine NH', 14)
),
resolved as (
  select distinct source_product.id as source_id
  from raw_material_grouping mapping
  join products source_product
    on source_product.type = 'raw'
   and source_product.is_active = true
   and lower(trim(source_product.name)) = lower(trim(mapping.source_name))
  join products target_product
    on target_product.type = 'raw'
   and target_product.is_active = true
   and lower(trim(target_product.name)) = lower(trim(mapping.target_name))
  where source_product.id <> target_product.id
)
delete from supplier_raw_materials
using resolved
where supplier_raw_materials.product_id = resolved.source_id;

-- Merge active schema components. If the target already exists in the same recipe, remove the source row.
with raw_material_grouping(source_name, target_name, merge_order) as (
  values
    ('Amande', 'Amande noire', 1),
    ('Beurre', 'Beurre spécial', 2),
    ('Gélatine', 'Gélatine poudre', 3),
    ('Farine', 'Farine viennoiserie', 4),
    ('Huile', 'Huile végétale', 5),
    ('Lait liquide', 'Lait', 6),
    ('Nappage normal', 'Nappage simple', 7),
    ('Nappage', 'Nappage simple', 8),
    ('Vanille poudre', 'Poudre vanille', 9),
    ('Vanille', 'Poudre vanille', 10),
    ('Confiture Zakia', 'Confiture', 11),
    ('Bicarbonate de soude', 'Bicarbonate', 12),
    ('Levure', 'Levure ideal', 13),
    ('Pectine', 'Pectine NH', 14)
),
resolved as (
  select distinct
    source_product.id as source_id,
    target_product.id as target_id
  from raw_material_grouping mapping
  join products source_product
    on source_product.type = 'raw'
   and source_product.is_active = true
   and lower(trim(source_product.name)) = lower(trim(mapping.source_name))
  join products target_product
    on target_product.type = 'raw'
   and target_product.is_active = true
   and lower(trim(target_product.name)) = lower(trim(mapping.target_name))
  where source_product.id <> target_product.id
)
delete from recipe_components component
using resolved
where component.component_product_id = resolved.source_id
  and exists (
    select 1
    from recipe_components existing
    where existing.recipe_id = component.recipe_id
      and existing.component_product_id = resolved.target_id
  );

with raw_material_grouping(source_name, target_name, merge_order) as (
  values
    ('Amande', 'Amande noire', 1),
    ('Beurre', 'Beurre spécial', 2),
    ('Gélatine', 'Gélatine poudre', 3),
    ('Farine', 'Farine viennoiserie', 4),
    ('Huile', 'Huile végétale', 5),
    ('Lait liquide', 'Lait', 6),
    ('Nappage normal', 'Nappage simple', 7),
    ('Nappage', 'Nappage simple', 8),
    ('Vanille poudre', 'Poudre vanille', 9),
    ('Vanille', 'Poudre vanille', 10),
    ('Confiture Zakia', 'Confiture', 11),
    ('Bicarbonate de soude', 'Bicarbonate', 12),
    ('Levure', 'Levure ideal', 13),
    ('Pectine', 'Pectine NH', 14)
),
resolved as (
  select distinct
    source_product.id as source_id,
    target_product.id as target_id
  from raw_material_grouping mapping
  join products source_product
    on source_product.type = 'raw'
   and source_product.is_active = true
   and lower(trim(source_product.name)) = lower(trim(mapping.source_name))
  join products target_product
    on target_product.type = 'raw'
   and target_product.is_active = true
   and lower(trim(target_product.name)) = lower(trim(mapping.target_name))
  where source_product.id <> target_product.id
)
update recipe_components component
set component_product_id = resolved.target_id
from resolved
where component.component_product_id = resolved.source_id;

-- Move lots and reception rows so existing received lots become usable by the canonical component.
with raw_material_grouping(source_name, target_name, merge_order) as (
  values
    ('Amande', 'Amande noire', 1),
    ('Beurre', 'Beurre spécial', 2),
    ('Gélatine', 'Gélatine poudre', 3),
    ('Farine', 'Farine viennoiserie', 4),
    ('Huile', 'Huile végétale', 5),
    ('Lait liquide', 'Lait', 6),
    ('Nappage normal', 'Nappage simple', 7),
    ('Nappage', 'Nappage simple', 8),
    ('Vanille poudre', 'Poudre vanille', 9),
    ('Vanille', 'Poudre vanille', 10),
    ('Confiture Zakia', 'Confiture', 11),
    ('Bicarbonate de soude', 'Bicarbonate', 12),
    ('Levure', 'Levure ideal', 13),
    ('Pectine', 'Pectine NH', 14)
),
resolved as (
  select distinct
    source_product.id as source_id,
    target_product.id as target_id
  from raw_material_grouping mapping
  join products source_product
    on source_product.type = 'raw'
   and source_product.is_active = true
   and lower(trim(source_product.name)) = lower(trim(mapping.source_name))
  join products target_product
    on target_product.type = 'raw'
   and target_product.is_active = true
   and lower(trim(target_product.name)) = lower(trim(mapping.target_name))
  where source_product.id <> target_product.id
)
update lots lot
set product_id = resolved.target_id
from resolved
where lot.product_id = resolved.source_id;

with raw_material_grouping(source_name, target_name, merge_order) as (
  values
    ('Amande', 'Amande noire', 1),
    ('Beurre', 'Beurre spécial', 2),
    ('Gélatine', 'Gélatine poudre', 3),
    ('Farine', 'Farine viennoiserie', 4),
    ('Huile', 'Huile végétale', 5),
    ('Lait liquide', 'Lait', 6),
    ('Nappage normal', 'Nappage simple', 7),
    ('Nappage', 'Nappage simple', 8),
    ('Vanille poudre', 'Poudre vanille', 9),
    ('Vanille', 'Poudre vanille', 10),
    ('Confiture Zakia', 'Confiture', 11),
    ('Bicarbonate de soude', 'Bicarbonate', 12),
    ('Levure', 'Levure ideal', 13),
    ('Pectine', 'Pectine NH', 14)
),
resolved as (
  select distinct
    source_product.id as source_id,
    target_product.id as target_id
  from raw_material_grouping mapping
  join products source_product
    on source_product.type = 'raw'
   and source_product.is_active = true
   and lower(trim(source_product.name)) = lower(trim(mapping.source_name))
  join products target_product
    on target_product.type = 'raw'
   and target_product.is_active = true
   and lower(trim(target_product.name)) = lower(trim(mapping.target_name))
  where source_product.id <> target_product.id
)
update raw_material_receptions reception
set product_id = resolved.target_id
from resolved
where reception.product_id = resolved.source_id;

-- Update diagram node data so cards point at the canonical raw material.
with raw_material_grouping(source_name, target_name, merge_order) as (
  values
    ('Amande', 'Amande noire', 1),
    ('Beurre', 'Beurre spécial', 2),
    ('Gélatine', 'Gélatine poudre', 3),
    ('Farine', 'Farine viennoiserie', 4),
    ('Huile', 'Huile végétale', 5),
    ('Lait liquide', 'Lait', 6),
    ('Nappage normal', 'Nappage simple', 7),
    ('Nappage', 'Nappage simple', 8),
    ('Vanille poudre', 'Poudre vanille', 9),
    ('Vanille', 'Poudre vanille', 10),
    ('Confiture Zakia', 'Confiture', 11),
    ('Bicarbonate de soude', 'Bicarbonate', 12),
    ('Levure', 'Levure ideal', 13),
    ('Pectine', 'Pectine NH', 14)
),
resolved as (
  select distinct
    source_product.id as source_id,
    target_product.id as target_id
  from raw_material_grouping mapping
  join products source_product
    on source_product.type = 'raw'
   and source_product.is_active = true
   and lower(trim(source_product.name)) = lower(trim(mapping.source_name))
  join products target_product
    on target_product.type = 'raw'
   and target_product.is_active = true
   and lower(trim(target_product.name)) = lower(trim(mapping.target_name))
  where source_product.id <> target_product.id
)
update recipes recipe
set diagram_nodes = (
  select jsonb_agg(
    case
      when resolved.target_id is not null then
        jsonb_set(node_item.node, '{data,productId}', to_jsonb(resolved.target_id::text), true)
      else node_item.node
    end
    order by node_item.ordinality
  )
  from jsonb_array_elements(recipe.diagram_nodes) with ordinality as node_item(node, ordinality)
  left join resolved
    on node_item.node #>> '{data,productId}' = resolved.source_id::text
)
where recipe.diagram_nodes is not null
  and exists (
    select 1
    from jsonb_array_elements(recipe.diagram_nodes) as node_item(node)
    join resolved
      on node_item.node #>> '{data,productId}' = resolved.source_id::text
  );

-- Hide merged source raw materials from the catalog. Historical rows remain available for audit.
with raw_material_grouping(source_name, target_name, merge_order) as (
  values
    ('Amande', 'Amande noire', 1),
    ('Beurre', 'Beurre spécial', 2),
    ('Gélatine', 'Gélatine poudre', 3),
    ('Farine', 'Farine viennoiserie', 4),
    ('Huile', 'Huile végétale', 5),
    ('Lait liquide', 'Lait', 6),
    ('Nappage normal', 'Nappage simple', 7),
    ('Nappage', 'Nappage simple', 8),
    ('Vanille poudre', 'Poudre vanille', 9),
    ('Vanille', 'Poudre vanille', 10),
    ('Confiture Zakia', 'Confiture', 11),
    ('Bicarbonate de soude', 'Bicarbonate', 12),
    ('Levure', 'Levure ideal', 13),
    ('Pectine', 'Pectine NH', 14)
),
resolved as (
  select distinct
    source_product.id as source_id,
    target_product.id as target_id,
    source_product.name as source_name,
    target_product.name as target_name
  from raw_material_grouping mapping
  join products source_product
    on source_product.type = 'raw'
   and source_product.is_active = true
   and lower(trim(source_product.name)) = lower(trim(mapping.source_name))
  join products target_product
    on target_product.type = 'raw'
   and target_product.is_active = true
   and lower(trim(target_product.name)) = lower(trim(mapping.target_name))
  where source_product.id <> target_product.id
),
deactivated as (
  update products source_product
  set
    is_active = false,
    updated_at = now()
  from resolved
  where source_product.id = resolved.source_id
  returning resolved.source_name as merged_from, resolved.target_name as merged_into, resolved.source_id, resolved.target_id
)
select *
from deactivated
order by merged_into, merged_from;

commit;

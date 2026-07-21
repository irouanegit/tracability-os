-- Merges only confirmed same-unit duplicate raw-material product rows.
-- Run manually in Supabase SQL editor.
--
-- Included:
-- - MAIZENA -> Maizena canonical row
-- - SUCRE GLACE -> Sucre glace canonical row
-- - BELDI Ecorces d'orange duplicate -> shared Ecorces d'orange canonical row
--
-- Excluded on purpose:
-- - Creme Framboise, Gelatine feuille, Gelatine poudre, Puree citron
--   because the duplicate rows currently have unit conflicts.

begin;

do $$
declare
  v_missing_ids uuid[];
  v_unit_conflicts text[];
begin
  with merge_map(source_id, target_id, source_label, target_label) as (
    values
      ('93bb268f-bbe9-4e2e-a723-5ed07458e5c9'::uuid, '21f38df0-c606-48be-bb8a-25172eb88181'::uuid, 'MAIZENA', 'Maizena'),
      ('a61fe556-eb7f-4dd0-a492-3aca5b13c395'::uuid, '1b45cd65-9755-4ed6-b221-588360b066c9'::uuid, 'SUCRE GLACE', 'Sucre glace'),
      ('7e624d64-e9eb-44b8-870e-f1d76ce83ce2'::uuid, 'bcb54926-86e6-4ee4-8c3a-ac7b26ae3872'::uuid, 'BELDI Ecorces orange duplicate', 'Ecorces orange')
  )
  select array_agg(missing_id)
  into v_missing_ids
  from (
    select merge_map.source_id as missing_id
    from merge_map
    left join products source_product
      on source_product.id = merge_map.source_id
     and source_product.type = 'raw'
     and source_product.is_active = true
    where source_product.id is null
    union all
    select merge_map.target_id as missing_id
    from merge_map
    left join products target_product
      on target_product.id = merge_map.target_id
     and target_product.type = 'raw'
     and target_product.is_active = true
    where target_product.id is null
  ) missing;

  if coalesce(array_length(v_missing_ids, 1), 0) > 0 then
    raise exception 'Missing or inactive raw-material IDs. Aborting: %', v_missing_ids;
  end if;

  with merge_map(source_id, target_id, source_label, target_label) as (
    values
      ('93bb268f-bbe9-4e2e-a723-5ed07458e5c9'::uuid, '21f38df0-c606-48be-bb8a-25172eb88181'::uuid, 'MAIZENA', 'Maizena'),
      ('a61fe556-eb7f-4dd0-a492-3aca5b13c395'::uuid, '1b45cd65-9755-4ed6-b221-588360b066c9'::uuid, 'SUCRE GLACE', 'Sucre glace'),
      ('7e624d64-e9eb-44b8-870e-f1d76ce83ce2'::uuid, 'bcb54926-86e6-4ee4-8c3a-ac7b26ae3872'::uuid, 'BELDI Ecorces orange duplicate', 'Ecorces orange')
  )
  select array_agg(merge_map.source_label || ' -> ' || merge_map.target_label || ' (' || source_product.unit || ' vs ' || target_product.unit || ')')
  into v_unit_conflicts
  from merge_map
  join products source_product on source_product.id = merge_map.source_id
  join products target_product on target_product.id = merge_map.target_id
  where source_product.unit <> target_product.unit;

  if coalesce(array_length(v_unit_conflicts, 1), 0) > 0 then
    raise exception 'Unit conflict detected. Aborting: %', v_unit_conflicts;
  end if;
end $$;

-- Keep supplier availability on the canonical product before removing source links.
with merge_map(source_id, target_id) as (
  values
    ('93bb268f-bbe9-4e2e-a723-5ed07458e5c9'::uuid, '21f38df0-c606-48be-bb8a-25172eb88181'::uuid),
    ('a61fe556-eb7f-4dd0-a492-3aca5b13c395'::uuid, '1b45cd65-9755-4ed6-b221-588360b066c9'::uuid),
    ('7e624d64-e9eb-44b8-870e-f1d76ce83ce2'::uuid, 'bcb54926-86e6-4ee4-8c3a-ac7b26ae3872'::uuid)
)
insert into supplier_raw_materials (supplier_id, product_id)
select distinct supplier_raw_materials.supplier_id, merge_map.target_id
from supplier_raw_materials
join merge_map on merge_map.source_id = supplier_raw_materials.product_id
on conflict (supplier_id, product_id) do nothing;

with merge_map(source_id) as (
  values
    ('93bb268f-bbe9-4e2e-a723-5ed07458e5c9'::uuid),
    ('a61fe556-eb7f-4dd0-a492-3aca5b13c395'::uuid),
    ('7e624d64-e9eb-44b8-870e-f1d76ce83ce2'::uuid)
)
delete from supplier_raw_materials
using merge_map
where supplier_raw_materials.product_id = merge_map.source_id;

-- Merge schema components. If the target already exists in the same recipe,
-- remove the duplicate source row first.
with merge_map(source_id, target_id) as (
  values
    ('93bb268f-bbe9-4e2e-a723-5ed07458e5c9'::uuid, '21f38df0-c606-48be-bb8a-25172eb88181'::uuid),
    ('a61fe556-eb7f-4dd0-a492-3aca5b13c395'::uuid, '1b45cd65-9755-4ed6-b221-588360b066c9'::uuid),
    ('7e624d64-e9eb-44b8-870e-f1d76ce83ce2'::uuid, 'bcb54926-86e6-4ee4-8c3a-ac7b26ae3872'::uuid)
)
delete from recipe_components component
using merge_map
where component.component_product_id = merge_map.source_id
  and exists (
    select 1
    from recipe_components existing
    where existing.recipe_id = component.recipe_id
      and existing.component_product_id = merge_map.target_id
  );

with merge_map(source_id, target_id) as (
  values
    ('93bb268f-bbe9-4e2e-a723-5ed07458e5c9'::uuid, '21f38df0-c606-48be-bb8a-25172eb88181'::uuid),
    ('a61fe556-eb7f-4dd0-a492-3aca5b13c395'::uuid, '1b45cd65-9755-4ed6-b221-588360b066c9'::uuid),
    ('7e624d64-e9eb-44b8-870e-f1d76ce83ce2'::uuid, 'bcb54926-86e6-4ee4-8c3a-ac7b26ae3872'::uuid)
)
update recipe_components component
set component_product_id = merge_map.target_id
from merge_map
where component.component_product_id = merge_map.source_id;

-- Move lots and reception rows so existing lots are usable by the canonical component.
with merge_map(source_id, target_id) as (
  values
    ('93bb268f-bbe9-4e2e-a723-5ed07458e5c9'::uuid, '21f38df0-c606-48be-bb8a-25172eb88181'::uuid),
    ('a61fe556-eb7f-4dd0-a492-3aca5b13c395'::uuid, '1b45cd65-9755-4ed6-b221-588360b066c9'::uuid),
    ('7e624d64-e9eb-44b8-870e-f1d76ce83ce2'::uuid, 'bcb54926-86e6-4ee4-8c3a-ac7b26ae3872'::uuid)
)
update lots lot
set product_id = merge_map.target_id
from merge_map
where lot.product_id = merge_map.source_id;

with merge_map(source_id, target_id) as (
  values
    ('93bb268f-bbe9-4e2e-a723-5ed07458e5c9'::uuid, '21f38df0-c606-48be-bb8a-25172eb88181'::uuid),
    ('a61fe556-eb7f-4dd0-a492-3aca5b13c395'::uuid, '1b45cd65-9755-4ed6-b221-588360b066c9'::uuid),
    ('7e624d64-e9eb-44b8-870e-f1d76ce83ce2'::uuid, 'bcb54926-86e6-4ee4-8c3a-ac7b26ae3872'::uuid)
)
update raw_material_receptions reception
set product_id = merge_map.target_id
from merge_map
where reception.product_id = merge_map.source_id;

-- Update diagram node data so cards point at the canonical raw material.
with merge_map(source_id, target_id) as (
  values
    ('93bb268f-bbe9-4e2e-a723-5ed07458e5c9'::uuid, '21f38df0-c606-48be-bb8a-25172eb88181'::uuid),
    ('a61fe556-eb7f-4dd0-a492-3aca5b13c395'::uuid, '1b45cd65-9755-4ed6-b221-588360b066c9'::uuid),
    ('7e624d64-e9eb-44b8-870e-f1d76ce83ce2'::uuid, 'bcb54926-86e6-4ee4-8c3a-ac7b26ae3872'::uuid)
)
update recipes recipe
set diagram_nodes = (
  select jsonb_agg(
    case
      when merge_map.target_id is not null then
        jsonb_set(node_item.node, '{data,productId}', to_jsonb(merge_map.target_id::text), true)
      else node_item.node
    end
    order by node_item.ordinality
  )
  from jsonb_array_elements(recipe.diagram_nodes) with ordinality as node_item(node, ordinality)
  left join merge_map
    on node_item.node #>> '{data,productId}' = merge_map.source_id::text
)
where recipe.diagram_nodes is not null
  and exists (
    select 1
    from jsonb_array_elements(recipe.diagram_nodes) as node_item(node)
    join merge_map
      on node_item.node #>> '{data,productId}' = merge_map.source_id::text
  );

-- Hide merged source rows from active catalog.
with merge_map(source_id, target_id, source_label, target_label) as (
  values
    ('93bb268f-bbe9-4e2e-a723-5ed07458e5c9'::uuid, '21f38df0-c606-48be-bb8a-25172eb88181'::uuid, 'MAIZENA', 'Maizena'),
    ('a61fe556-eb7f-4dd0-a492-3aca5b13c395'::uuid, '1b45cd65-9755-4ed6-b221-588360b066c9'::uuid, 'SUCRE GLACE', 'Sucre glace'),
    ('7e624d64-e9eb-44b8-870e-f1d76ce83ce2'::uuid, 'bcb54926-86e6-4ee4-8c3a-ac7b26ae3872'::uuid, 'BELDI Ecorces orange duplicate', 'Ecorces orange')
),
deactivated as (
  update products source_product
  set
    is_active = false,
    updated_at = now()
  from merge_map
  where source_product.id = merge_map.source_id
  returning merge_map.source_label as merged_from, merge_map.target_label as merged_into, merge_map.source_id, merge_map.target_id
)
select *
from deactivated
order by merged_into, merged_from;

commit;

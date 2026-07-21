-- Verifies fix_safe_raw_material_duplicate_rows.sql.
-- Read-only. Run after the fix script.

with merge_map(source_id, target_id, source_label, target_label) as (
  values
    ('93bb268f-bbe9-4e2e-a723-5ed07458e5c9'::uuid, '21f38df0-c606-48be-bb8a-25172eb88181'::uuid, 'MAIZENA', 'Maizena'),
    ('a61fe556-eb7f-4dd0-a492-3aca5b13c395'::uuid, '1b45cd65-9755-4ed6-b221-588360b066c9'::uuid, 'SUCRE GLACE', 'Sucre glace'),
    ('7e624d64-e9eb-44b8-870e-f1d76ce83ce2'::uuid, 'bcb54926-86e6-4ee4-8c3a-ac7b26ae3872'::uuid, 'BELDI Ecorces orange duplicate', 'Ecorces orange')
),
source_counts as (
  select
    merge_map.source_id,
    merge_map.target_id,
    count(source_product.id) filter (where source_product.is_active = true) as source_active_count,
    count(distinct recipe_components.id) as source_schema_refs,
    count(distinct supplier_raw_materials.supplier_id) as source_supplier_links,
    count(distinct lots.id) as source_lots,
    count(distinct raw_material_receptions.id) as source_receptions
  from merge_map
  left join products source_product on source_product.id = merge_map.source_id
  left join recipe_components on recipe_components.component_product_id = merge_map.source_id
  left join supplier_raw_materials on supplier_raw_materials.product_id = merge_map.source_id
  left join lots on lots.product_id = merge_map.source_id
  left join raw_material_receptions on raw_material_receptions.product_id = merge_map.source_id
  group by merge_map.source_id, merge_map.target_id
),
target_counts as (
  select
    merge_map.target_id,
    count(target_product.id) filter (where target_product.is_active = true) as target_active_count,
    count(distinct recipe_components.id) as target_schema_refs,
    count(distinct supplier_raw_materials.supplier_id) as target_supplier_links,
    count(distinct lots.id) as target_lots,
    count(distinct raw_material_receptions.id) as target_receptions
  from merge_map
  left join products target_product on target_product.id = merge_map.target_id
  left join recipe_components on recipe_components.component_product_id = merge_map.target_id
  left join supplier_raw_materials on supplier_raw_materials.product_id = merge_map.target_id
  left join lots on lots.product_id = merge_map.target_id
  left join raw_material_receptions on raw_material_receptions.product_id = merge_map.target_id
  group by merge_map.target_id
),
source_diagram_refs as (
  select
    merge_map.source_id,
    count(*) as source_diagram_refs
  from merge_map
  join recipes on recipes.diagram_nodes is not null
  join jsonb_array_elements(recipes.diagram_nodes) as node_item(node)
    on node_item.node #>> '{data,productId}' = merge_map.source_id::text
  group by merge_map.source_id
),
target_diagram_refs as (
  select
    merge_map.target_id,
    count(*) as target_diagram_refs
  from merge_map
  join recipes on recipes.diagram_nodes is not null
  join jsonb_array_elements(recipes.diagram_nodes) as node_item(node)
    on node_item.node #>> '{data,productId}' = merge_map.target_id::text
  group by merge_map.target_id
)
select
  merge_map.source_label as merged_from,
  merge_map.target_label as merged_into,
  coalesce(source_counts.source_active_count, 0) as source_active_count,
  coalesce(target_counts.target_active_count, 0) as target_active_count,
  coalesce(source_counts.source_schema_refs, 0) as source_schema_refs,
  coalesce(target_counts.target_schema_refs, 0) as target_schema_refs,
  coalesce(source_diagram_refs.source_diagram_refs, 0) as source_diagram_refs,
  coalesce(target_diagram_refs.target_diagram_refs, 0) as target_diagram_refs,
  coalesce(source_counts.source_supplier_links, 0) as source_supplier_links,
  coalesce(target_counts.target_supplier_links, 0) as target_supplier_links,
  coalesce(source_counts.source_lots, 0) as source_lots,
  coalesce(target_counts.target_lots, 0) as target_lots,
  coalesce(source_counts.source_receptions, 0) as source_receptions,
  coalesce(target_counts.target_receptions, 0) as target_receptions,
  case
    when coalesce(target_counts.target_active_count, 0) <> 1 then 'CHECK_TARGET'
    when coalesce(source_counts.source_active_count, 0) <> 0 then 'SOURCE_STILL_ACTIVE'
    when coalesce(source_counts.source_schema_refs, 0) <> 0 then 'SOURCE_STILL_IN_SCHEMA'
    when coalesce(source_diagram_refs.source_diagram_refs, 0) <> 0 then 'SOURCE_STILL_IN_DIAGRAM'
    when coalesce(source_counts.source_supplier_links, 0) <> 0 then 'SOURCE_STILL_LINKED_TO_SUPPLIER'
    when coalesce(source_counts.source_lots, 0) <> 0 then 'SOURCE_STILL_HAS_LOTS'
    when coalesce(source_counts.source_receptions, 0) <> 0 then 'SOURCE_STILL_HAS_RECEPTIONS'
    else 'OK'
  end as status
from merge_map
left join source_counts
  on source_counts.source_id = merge_map.source_id
left join target_counts
  on target_counts.target_id = merge_map.target_id
left join source_diagram_refs
  on source_diagram_refs.source_id = merge_map.source_id
left join target_diagram_refs
  on target_diagram_refs.target_id = merge_map.target_id
order by merge_map.target_label, merge_map.source_label;

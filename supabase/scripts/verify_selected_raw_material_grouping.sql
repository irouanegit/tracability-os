-- Verifies only the approved raw-material groupings.
-- Run this in the Supabase SQL editor after group_selected_raw_materials.sql.

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
source_products as (
  select
    mapping.source_name,
    mapping.target_name,
    product.id,
    product.is_active
  from raw_material_grouping mapping
  left join products product
    on product.type = 'raw'
   and lower(trim(product.name)) = lower(trim(mapping.source_name))
),
target_products as (
  select
    mapping.source_name,
    mapping.target_name,
    product.id,
    product.is_active
  from raw_material_grouping mapping
  left join products product
    on product.type = 'raw'
   and lower(trim(product.name)) = lower(trim(mapping.target_name))
),
source_counts as (
  select
    source_name,
    target_name,
    count(id) filter (where id is not null) as source_total_count,
    count(id) filter (where is_active = true) as source_active_count,
    count(distinct recipe_components.id) as source_schema_refs,
    count(distinct supplier_raw_materials.supplier_id) as source_supplier_links,
    count(distinct lots.id) as source_lots,
    count(distinct raw_material_receptions.id) as source_receptions
  from source_products
  left join recipe_components on recipe_components.component_product_id = source_products.id
  left join supplier_raw_materials on supplier_raw_materials.product_id = source_products.id
  left join lots on lots.product_id = source_products.id
  left join raw_material_receptions on raw_material_receptions.product_id = source_products.id
  group by source_name, target_name
),
target_counts as (
  select
    source_name,
    target_name,
    count(id) filter (where id is not null) as target_total_count,
    count(id) filter (where is_active = true) as target_active_count,
    count(distinct recipe_components.id) as target_schema_refs,
    count(distinct supplier_raw_materials.supplier_id) as target_supplier_links,
    count(distinct lots.id) as target_lots,
    count(distinct raw_material_receptions.id) as target_receptions
  from target_products
  left join recipe_components on recipe_components.component_product_id = target_products.id
  left join supplier_raw_materials on supplier_raw_materials.product_id = target_products.id
  left join lots on lots.product_id = target_products.id
  left join raw_material_receptions on raw_material_receptions.product_id = target_products.id
  group by source_name, target_name
),
source_diagram_refs as (
  select
    source_products.source_name,
    source_products.target_name,
    count(*) as source_diagram_refs
  from source_products
  join recipes on recipes.diagram_nodes is not null
  join jsonb_array_elements(recipes.diagram_nodes) as node_item(node)
    on node_item.node #>> '{data,productId}' = source_products.id::text
  group by source_products.source_name, source_products.target_name
),
target_diagram_refs as (
  select
    target_products.source_name,
    target_products.target_name,
    count(*) as target_diagram_refs
  from target_products
  join recipes on recipes.diagram_nodes is not null
  join jsonb_array_elements(recipes.diagram_nodes) as node_item(node)
    on node_item.node #>> '{data,productId}' = target_products.id::text
  group by target_products.source_name, target_products.target_name
)
select
  grouping.source_name as merged_from,
  grouping.target_name as merged_into,
  coalesce(source_counts.source_total_count, 0) as source_total_count,
  coalesce(source_counts.source_active_count, 0) as source_active_count,
  coalesce(target_counts.target_total_count, 0) as target_total_count,
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
from raw_material_grouping grouping
left join source_counts
  on source_counts.source_name = grouping.source_name
 and source_counts.target_name = grouping.target_name
left join target_counts
  on target_counts.source_name = grouping.source_name
 and target_counts.target_name = grouping.target_name
left join source_diagram_refs
  on source_diagram_refs.source_name = grouping.source_name
 and source_diagram_refs.target_name = grouping.target_name
left join target_diagram_refs
  on target_diagram_refs.source_name = grouping.source_name
 and target_diagram_refs.target_name = grouping.target_name
order by grouping.merge_order;

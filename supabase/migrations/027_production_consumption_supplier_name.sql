-- Expose the consumed lot supplier name to production history previews.
-- Read-only view change: no production, lot, or reception data is modified.

drop view if exists production_consumption_details;

create or replace view production_consumption_details as
select
  pc.id,
  pc.production_batch_id,
  pc.component_node_key,
  pc.parent_component_node_key,
  pc.component_depth,
  pc.selected_component_product_id,
  coalesce(pc.expected_component_product_id, l.product_id) as expected_component_product_id,
  expected_product.code as expected_component_product_code,
  expected_product.name as expected_component_product_name,
  expected_product.type as expected_component_product_type,
  expected_product.category as expected_component_product_category,
  l.id as lot_id,
  l.lot_number,
  l.product_id as consumed_product_id,
  consumed_product.code as consumed_product_code,
  consumed_product.name as consumed_product_name,
  consumed_product.type as consumed_product_type,
  consumed_product.category as consumed_product_category,
  l.supplier_lot,
  l.source_type,
  l.created_at as lot_created_at,
  pc.created_at as linked_at,
  s.name as supplier_name
from production_consumptions pc
join lots l on l.id = pc.consumed_lot_id
join products consumed_product on consumed_product.id = l.product_id
join products expected_product on expected_product.id = coalesce(pc.expected_component_product_id, l.product_id)
left join suppliers s on s.id = l.supplier_id;

grant select on production_consumption_details to authenticated;

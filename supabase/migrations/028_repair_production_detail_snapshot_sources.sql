-- Repair confirmed production detail previews.
-- This script keeps production/reception data intact. It only:
-- 1) Recreates the read view used by the app with supplier_name exposed.
-- 2) Backfills supplierName inside existing production traceability snapshots.

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

grant select on production_consumption_details to anon, authenticated;

with lot_sources as (
  select
    pc.production_batch_id,
    pc.component_node_key,
    l.id::text as lot_id,
    s.name as supplier_name
  from production_consumptions pc
  join lots l on l.id = pc.consumed_lot_id
  left join suppliers s on s.id = l.supplier_id
  where s.name is not null
),
rebuilt_components as (
  select
    pb.id,
    jsonb_agg(
      case
        when component.value ? 'lots' then
          jsonb_set(
            component.value,
            '{lots}',
            coalesce(
              (
                select jsonb_agg(
                  case
                    when lot_sources.supplier_name is not null then
                      lot.value || jsonb_build_object('supplierName', lot_sources.supplier_name)
                    else lot.value
                  end
                  order by lot.ordinality
                )
                from jsonb_array_elements(component.value->'lots') with ordinality as lot(value, ordinality)
                left join lot_sources
                  on lot_sources.production_batch_id = pb.id
                 and lot_sources.component_node_key = component.value->>'nodeId'
                 and lot_sources.lot_id = lot.value->>'lotId'
              ),
              '[]'::jsonb
            ),
            true
          )
        else component.value
      end
      order by component.ordinality
    ) as components
  from production_batches pb
  cross join lateral jsonb_array_elements(coalesce(pb.traceability_snapshot->'components', '[]'::jsonb))
    with ordinality as component(value, ordinality)
  where pb.traceability_snapshot is not null
  group by pb.id
)
update production_batches pb
set traceability_snapshot = jsonb_set(pb.traceability_snapshot, '{components}', rebuilt_components.components, true)
from rebuilt_components
where pb.id = rebuilt_components.id;

select
  'production_consumption_details repaired and traceability snapshots hydrated' as status,
  count(*) filter (where traceability_snapshot is not null) as batches_with_snapshots
from production_batches;

alter table production_batches
  add column if not exists traceability_snapshot jsonb;

create or replace function build_production_traceability_snapshot(p_batch_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with recursive batch_context as (
    select
      pb.id,
      pb.product_id,
      pb.generated_lot,
      p.name as product_name,
      p.type as product_type,
      r.id as recipe_id,
      r.diagram_nodes,
      r.diagram_edges,
      r.diagram_viewport
    from production_batches pb
    join products p on p.id = pb.product_id
    left join lateral (
      select recipes.id, recipes.diagram_nodes, recipes.diagram_edges, recipes.diagram_viewport
      from recipes
      where recipes.product_id = pb.product_id
        and recipes.is_active = true
      order by recipes.version desc, recipes.created_at desc
      limit 1
    ) r on true
    where pb.id = p_batch_id
  ),
  schema_tree as (
    select
      bc.product_id as parent_product_id,
      rc.component_product_id,
      array[bc.product_id, rc.component_product_id]::uuid[] as product_path,
      1 as depth
    from batch_context bc
    join recipe_components rc on rc.recipe_id = bc.recipe_id

    union all

    select
      tree.component_product_id,
      child_rc.component_product_id,
      tree.product_path || child_rc.component_product_id,
      tree.depth + 1
    from schema_tree tree
    join recipes child_recipe on child_recipe.product_id = tree.component_product_id
      and child_recipe.is_active = true
    join recipe_components child_rc on child_rc.recipe_id = child_recipe.id
    where not child_rc.component_product_id = any(tree.product_path)
  ),
  component_nodes as (
    select
      array_to_string(tree.product_path, '__') as node_id,
      case
        when tree.depth = 1 then tree.product_path[1]::text
        else array_to_string(tree.product_path[1:cardinality(tree.product_path) - 1], '__')
      end as parent_node_id,
      tree.component_product_id as product_id,
      product.name as product_name,
      product.type as product_type,
      tree.depth,
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'lotId', lot.id,
            'lotNumber', lot.lot_number,
            'supplierLot', lot.supplier_lot,
            'sourceType', lot.source_type,
            'lotCreatedAt', lot.created_at
          )
          order by lot.created_at desc, lot.id
        )
        from production_consumptions consumption
        join lots lot on lot.id = consumption.consumed_lot_id
        where consumption.production_batch_id = p_batch_id
          and lot.product_id = tree.component_product_id
      ), '[]'::jsonb) as lots
    from schema_tree tree
    join products product on product.id = tree.component_product_id
  )
  select jsonb_build_object(
    'version', 1,
    'root', jsonb_build_object(
      'productId', bc.product_id,
      'productName', bc.product_name,
      'productType', bc.product_type,
      'lotNumber', bc.generated_lot
    ),
    'components', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'nodeId', node.node_id,
          'parentNodeId', node.parent_node_id,
          'productId', node.product_id,
          'productName', node.product_name,
          'productType', node.product_type,
          'depth', node.depth,
          'lots', node.lots
        )
        order by node.depth, node.node_id
      )
      from component_nodes node
    ), '[]'::jsonb),
    'diagram', jsonb_build_object(
      'nodes', coalesce(bc.diagram_nodes, '[]'::jsonb),
      'edges', coalesce(bc.diagram_edges, '[]'::jsonb),
      'viewport', bc.diagram_viewport
    )
  )
  from batch_context bc;
$$;

revoke all on function build_production_traceability_snapshot(uuid) from public;

create or replace function refresh_production_traceability_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update production_batches batch
  set traceability_snapshot = build_production_traceability_snapshot(batch.id)
  where batch.id in (
    select distinct inserted.production_batch_id
    from inserted_production_consumptions inserted
  );

  return null;
end;
$$;

revoke all on function refresh_production_traceability_snapshot() from public;

drop trigger if exists production_consumptions_refresh_traceability_snapshot on production_consumptions;
create trigger production_consumptions_refresh_traceability_snapshot
after insert on production_consumptions
referencing new table as inserted_production_consumptions
for each statement
execute function refresh_production_traceability_snapshot();

update production_batches batch
set traceability_snapshot = build_production_traceability_snapshot(batch.id)
where batch.traceability_snapshot is null;

create or replace view production_batch_history as
select
  pb.id,
  pb.production_date,
  pb.product_id,
  p.code as product_code,
  p.name as product_name,
  p.type as product_type,
  p.category as product_category,
  pb.generated_lot,
  pb.responsible_name,
  pb.operation,
  pb.status,
  pb.observations,
  count(pc.id)::integer as consumed_lot_count,
  pb.created_at,
  pb.traceability_snapshot
from production_batches pb
join products p on p.id = pb.product_id
left join production_consumptions pc on pc.production_batch_id = pb.id
group by
  pb.id,
  pb.production_date,
  pb.product_id,
  p.code,
  p.name,
  p.type,
  p.category,
  pb.generated_lot,
  pb.responsible_name,
  pb.operation,
  pb.status,
  pb.observations,
  pb.created_at,
  pb.traceability_snapshot
order by pb.created_at desc;

grant select on production_batch_history to authenticated;

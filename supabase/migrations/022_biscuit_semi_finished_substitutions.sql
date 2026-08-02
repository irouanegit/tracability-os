-- Allow operator-selected semi-finished biscuit substitutions during production confirmation.
-- The original blueprint component is preserved as the expected component, while the
-- selected component and row path are stored for audit, snapshots, history, and PDFs.

update products
set substitution_group = 'biscuit',
    updated_at = now()
where type = 'semi_finished'
  and is_active = true
  and lower(name) like '%biscuit%'
  and coalesce(substitution_group, '') <> 'biscuit';

create or replace function assign_biscuit_substitution_group()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.type = 'semi_finished' and new.is_active = true and lower(coalesce(new.name, '')) like '%biscuit%' then
    new.substitution_group = 'biscuit';
  end if;

  return new;
end;
$$;

drop trigger if exists products_assign_biscuit_substitution_group on products;
create trigger products_assign_biscuit_substitution_group
before insert or update of name, type, is_active on products
for each row execute function assign_biscuit_substitution_group();

alter table production_consumptions
  add column if not exists selected_component_product_id uuid references products(id),
  add column if not exists component_node_key text,
  add column if not exists parent_component_node_key text,
  add column if not exists component_depth integer;

update production_consumptions pc
set selected_component_product_id = coalesce(pc.selected_component_product_id, l.product_id),
    component_depth = coalesce(pc.component_depth, 1),
    component_node_key = coalesce(pc.component_node_key, coalesce(pc.expected_component_product_id, l.product_id)::text)
from lots l
where l.id = pc.consumed_lot_id
  and (
    pc.selected_component_product_id is null
    or pc.component_depth is null
    or pc.component_node_key is null
  );

create index if not exists production_consumptions_selected_component_idx
  on production_consumptions(selected_component_product_id);

create index if not exists production_consumptions_component_node_idx
  on production_consumptions(production_batch_id, component_node_key);

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
  pc.created_at as linked_at
from production_consumptions pc
join lots l on l.id = pc.consumed_lot_id
join products consumed_product on consumed_product.id = l.product_id
join products expected_product on expected_product.id = coalesce(pc.expected_component_product_id, l.product_id);

create or replace function build_production_traceability_snapshot(p_batch_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_has_effective_nodes boolean;
  v_snapshot jsonb;
begin
  select exists (
    select 1
    from production_consumptions pc
    where pc.production_batch_id = p_batch_id
      and pc.component_node_key is not null
  )
  into v_has_effective_nodes;

  if v_has_effective_nodes then
    with batch_context as (
      select
        pb.id,
        pb.product_id,
        pb.generated_lot,
        p.name as product_name,
        p.type as product_type,
        r.diagram_nodes,
        r.diagram_edges,
        r.diagram_viewport
      from production_batches pb
      join products p on p.id = pb.product_id
      left join lateral (
        select recipes.diagram_nodes, recipes.diagram_edges, recipes.diagram_viewport
        from recipes
        where recipes.product_id = pb.product_id
          and recipes.is_active = true
        order by recipes.version desc, recipes.created_at desc
        limit 1
      ) r on true
      where pb.id = p_batch_id
    ),
    base_component_nodes as (
      select
        coalesce(pc.component_node_key, coalesce(pc.expected_component_product_id, l.product_id)::text) as node_id,
        coalesce(pc.parent_component_node_key, bc.product_id::text) as parent_node_id,
        coalesce(pc.selected_component_product_id, l.product_id) as product_id,
        display_product.name as product_name,
        display_product.type as product_type,
        coalesce(pc.component_depth, 1) as depth,
        jsonb_agg(
          jsonb_build_object(
            'lotId', l.id,
            'lotNumber', l.lot_number,
            'supplierLot', l.supplier_lot,
            'sourceType', l.source_type,
            'lotCreatedAt', l.created_at,
            'productId', l.product_id,
            'productName', consumed_product.name,
            'productType', consumed_product.type,
            'productCategory', consumed_product.category,
            'expectedProductId', coalesce(pc.expected_component_product_id, l.product_id),
            'expectedProductName', expected_product.name
          )
          order by l.created_at desc, l.id
        ) as lots
      from batch_context bc
      join production_consumptions pc on pc.production_batch_id = bc.id
      join lots l on l.id = pc.consumed_lot_id
      join products consumed_product on consumed_product.id = l.product_id
      join products expected_product on expected_product.id = coalesce(pc.expected_component_product_id, l.product_id)
      join products display_product on display_product.id = coalesce(pc.selected_component_product_id, l.product_id)
      group by
        bc.product_id,
        coalesce(pc.component_node_key, coalesce(pc.expected_component_product_id, l.product_id)::text),
        coalesce(pc.parent_component_node_key, bc.product_id::text),
        coalesce(pc.selected_component_product_id, l.product_id),
        display_product.name,
        display_product.type,
        coalesce(pc.component_depth, 1)
    ),
    expanded_substitution_nodes as (
      select
        concat(
          coalesce(pc.component_node_key, coalesce(pc.expected_component_product_id, l.product_id)::text),
          '/lot:',
          l.id,
          '/',
          child_node.value->>'nodeId'
        ) as node_id,
        case
          when child_node.value->>'parentNodeId' = child_batch.product_id::text then
            coalesce(pc.component_node_key, coalesce(pc.expected_component_product_id, l.product_id)::text)
          else concat(
            coalesce(pc.component_node_key, coalesce(pc.expected_component_product_id, l.product_id)::text),
            '/lot:',
            l.id,
            '/',
            child_node.value->>'parentNodeId'
          )
        end as parent_node_id,
        nullif(child_node.value->>'productId', '')::uuid as product_id,
        child_node.value->>'productName' as product_name,
        nullif(child_node.value->>'productType', '')::product_type as product_type,
        coalesce(pc.component_depth, 1) + coalesce(nullif(child_node.value->>'depth', '')::integer, 1) as depth,
        coalesce(child_node.value->'lots', '[]'::jsonb) as lots
      from batch_context bc
      join production_consumptions pc on pc.production_batch_id = bc.id
      join lots l on l.id = pc.consumed_lot_id
      join products expected_product on expected_product.id = coalesce(pc.expected_component_product_id, l.product_id)
      join products selected_product on selected_product.id = coalesce(pc.selected_component_product_id, l.product_id)
      join production_batches child_batch on child_batch.id = l.source_id
      cross join lateral jsonb_array_elements(coalesce(child_batch.traceability_snapshot->'components', '[]'::jsonb)) as child_node(value)
      where l.source_type = 'fabrication'
        and selected_product.type = 'semi_finished'
        and coalesce(pc.selected_component_product_id, l.product_id) <> coalesce(pc.expected_component_product_id, l.product_id)
        and expected_product.substitution_group is not null
        and expected_product.substitution_group = selected_product.substitution_group
    ),
    component_nodes as (
      select * from base_component_nodes
      union all
      select * from expanded_substitution_nodes
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
    into v_snapshot
    from batch_context bc;

    return v_snapshot;
  end if;

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
            'lotCreatedAt', lot.created_at,
            'productId', lot_product.id,
            'productName', lot_product.name,
            'productType', lot_product.type,
            'productCategory', lot_product.category,
            'expectedProductId', tree.component_product_id,
            'expectedProductName', product.name
          )
          order by lot.created_at desc, lot.id
        )
        from production_consumptions consumption
        join lots lot on lot.id = consumption.consumed_lot_id
        join products lot_product on lot_product.id = lot.product_id
        where consumption.production_batch_id = p_batch_id
          and (
            consumption.expected_component_product_id = tree.component_product_id
            or (consumption.expected_component_product_id is null and lot.product_id = tree.component_product_id)
          )
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
  into v_snapshot
  from batch_context bc;

  return v_snapshot;
end;
$$;

create or replace function create_production_with_traceability_v2(
  p_production_date timestamptz,
  p_product_id uuid,
  p_generated_lot text,
  p_responsible_name text,
  p_operation text,
  p_observations text,
  p_consumed_lot_selections jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := ensure_traceability_profile();
  v_product products;
  v_recipe_id uuid;
  v_batch_id uuid;
  v_required_traceable_count integer;
  v_selected_count integer;
  v_missing_count integer;
  v_invalid_count integer;
  v_has_node_keys boolean;
begin
  select *
  into v_product
  from products
  where id = p_product_id
    and is_active = true
    and type in ('finished', 'semi_finished');

  if not found then
    raise exception 'Production product does not exist or is not manufactured.';
  end if;

  select id
  into v_recipe_id
  from recipes
  where product_id = p_product_id
    and is_active = true
  order by version desc, created_at desc
  limit 1;

  if v_recipe_id is null then
    raise exception 'Production product must have an active blueprint.';
  end if;

  if nullif(trim(coalesce(p_generated_lot, '')), '') is null then
    raise exception 'Generated lot is required.';
  end if;

  with selected_lots as (
    select
      nullif(coalesce(item.value->>'nodeKey', item.value->>'node_key', item.value->>'componentNodeKey', item.value->>'component_node_key'), '') as node_key
    from jsonb_array_elements(coalesce(p_consumed_lot_selections, '[]'::jsonb)) as item(value)
  )
  select exists(select 1 from selected_lots where node_key is not null)
  into v_has_node_keys;

  if v_has_node_keys then
    with selected_lots as (
      select distinct
        nullif(coalesce(item.value->>'nodeKey', item.value->>'node_key', item.value->>'componentNodeKey', item.value->>'component_node_key'), '') as node_key,
        nullif(coalesce(item.value->>'parentNodeKey', item.value->>'parent_node_key', item.value->>'parentComponentNodeKey', item.value->>'parent_component_node_key'), '') as parent_node_key,
        coalesce(nullif(coalesce(item.value->>'depth', item.value->>'componentDepth', item.value->>'component_depth'), '')::integer, 1) as depth,
        nullif(coalesce(item.value->>'expectedProductId', item.value->>'expected_product_id'), '')::uuid as expected_product_id,
        nullif(coalesce(item.value->>'selectedProductId', item.value->>'selected_product_id'), '')::uuid as selected_product_id,
        nullif(coalesce(item.value->>'consumedLotId', item.value->>'consumed_lot_id'), '')::uuid as consumed_lot_id
      from jsonb_array_elements(coalesce(p_consumed_lot_selections, '[]'::jsonb)) as item(value)
      where nullif(coalesce(item.value->>'expectedProductId', item.value->>'expected_product_id'), '') is not null
        and nullif(coalesce(item.value->>'consumedLotId', item.value->>'consumed_lot_id'), '') is not null
        and nullif(coalesce(item.value->>'nodeKey', item.value->>'node_key', item.value->>'componentNodeKey', item.value->>'component_node_key'), '') is not null
    )
    select count(*)
    into v_selected_count
    from selected_lots;

    if v_selected_count = 0 then
      raise exception 'At least one consumed lot is required.';
    end if;

    with selected_lots as (
      select distinct
        nullif(coalesce(item.value->>'nodeKey', item.value->>'node_key', item.value->>'componentNodeKey', item.value->>'component_node_key'), '') as node_key,
        nullif(coalesce(item.value->>'parentNodeKey', item.value->>'parent_node_key', item.value->>'parentComponentNodeKey', item.value->>'parent_component_node_key'), '') as parent_node_key,
        nullif(coalesce(item.value->>'expectedProductId', item.value->>'expected_product_id'), '')::uuid as expected_product_id,
        nullif(coalesce(item.value->>'selectedProductId', item.value->>'selected_product_id'), '')::uuid as selected_product_id,
        nullif(coalesce(item.value->>'consumedLotId', item.value->>'consumed_lot_id'), '')::uuid as consumed_lot_id
      from jsonb_array_elements(coalesce(p_consumed_lot_selections, '[]'::jsonb)) as item(value)
      where nullif(coalesce(item.value->>'expectedProductId', item.value->>'expected_product_id'), '') is not null
        and nullif(coalesce(item.value->>'consumedLotId', item.value->>'consumed_lot_id'), '') is not null
        and nullif(coalesce(item.value->>'nodeKey', item.value->>'node_key', item.value->>'componentNodeKey', item.value->>'component_node_key'), '') is not null
    ),
    root_required as (
      select rc.component_product_id
      from recipe_components rc
      join products p on p.id = rc.component_product_id
      where rc.recipe_id = v_recipe_id
        and not (p.type = 'raw' and lower(trim(p.name)) = 'eau')
    ),
    child_required as (
      select
        parent.node_key as parent_node_key,
        child_rc.component_product_id
      from selected_lots parent
      join products selected_product on selected_product.id = coalesce(parent.selected_product_id, parent.expected_product_id)
        and selected_product.type = 'semi_finished'
      join recipes child_recipe on child_recipe.product_id = selected_product.id
        and child_recipe.is_active = true
      join recipe_components child_rc on child_rc.recipe_id = child_recipe.id
      join products child_product on child_product.id = child_rc.component_product_id
      where not (child_product.type = 'raw' and lower(trim(child_product.name)) = 'eau')
        and selected_product.id = parent.expected_product_id
    ),
    missing as (
      select 'root' as scope
      from root_required required
      where not exists (
        select 1
        from selected_lots selected
        where selected.parent_node_key is null
          and selected.expected_product_id = required.component_product_id
      )
      union all
      select 'child' as scope
      from child_required required
      where not exists (
        select 1
        from selected_lots selected
        where selected.parent_node_key = required.parent_node_key
          and selected.expected_product_id = required.component_product_id
      )
    )
    select count(*)
    into v_missing_count
    from missing;

    if v_missing_count > 0 then
      raise exception 'Every blueprint component must have a confirmed lot.';
    end if;

    with selected_lots as (
      select distinct
        nullif(coalesce(item.value->>'nodeKey', item.value->>'node_key', item.value->>'componentNodeKey', item.value->>'component_node_key'), '') as node_key,
        nullif(coalesce(item.value->>'parentNodeKey', item.value->>'parent_node_key', item.value->>'parentComponentNodeKey', item.value->>'parent_component_node_key'), '') as parent_node_key,
        nullif(coalesce(item.value->>'expectedProductId', item.value->>'expected_product_id'), '')::uuid as expected_product_id,
        nullif(coalesce(item.value->>'selectedProductId', item.value->>'selected_product_id'), '')::uuid as selected_product_id,
        nullif(coalesce(item.value->>'consumedLotId', item.value->>'consumed_lot_id'), '')::uuid as consumed_lot_id
      from jsonb_array_elements(coalesce(p_consumed_lot_selections, '[]'::jsonb)) as item(value)
      where nullif(coalesce(item.value->>'expectedProductId', item.value->>'expected_product_id'), '') is not null
        and nullif(coalesce(item.value->>'consumedLotId', item.value->>'consumed_lot_id'), '') is not null
        and nullif(coalesce(item.value->>'nodeKey', item.value->>'node_key', item.value->>'componentNodeKey', item.value->>'component_node_key'), '') is not null
    ),
    selected_with_lots as (
      select
        selected.*,
        coalesce(selected.selected_product_id, l.product_id) as effective_selected_product_id,
        l.product_id as lot_product_id,
        expected_product.substitution_group as expected_group,
        selected_product.substitution_group as selected_group,
        selected_product.type as selected_product_type,
        exists (
          select 1
          from recipes selected_recipe
          where selected_recipe.product_id = selected_product.id
            and selected_recipe.is_active = true
        ) as selected_has_active_recipe
      from selected_lots selected
      left join lots l on l.id = selected.consumed_lot_id
        and l.lot_status = 'available'
        and l.quality_status = 'conforme'
      left join products expected_product on expected_product.id = selected.expected_product_id
        and expected_product.is_active = true
      left join products selected_product on selected_product.id = coalesce(selected.selected_product_id, l.product_id)
        and selected_product.is_active = true
    ),
    unexpected as (
      select selected.node_key
      from selected_lots selected
      where selected.parent_node_key is null
        and not exists (
          select 1
          from recipe_components rc
          where rc.recipe_id = v_recipe_id
            and rc.component_product_id = selected.expected_product_id
        )
      union all
      select selected.node_key
      from selected_lots selected
      join selected_lots parent on parent.node_key = selected.parent_node_key
      where selected.parent_node_key is not null
        and not exists (
          select 1
          from recipes parent_recipe
          join recipe_components rc on rc.recipe_id = parent_recipe.id
          where parent_recipe.product_id = coalesce(parent.selected_product_id, parent.expected_product_id)
            and parent_recipe.is_active = true
            and rc.component_product_id = selected.expected_product_id
        )
      union all
      select selected.node_key
      from selected_lots selected
      where selected.parent_node_key is not null
        and not exists (
          select 1
          from selected_lots parent
          where parent.node_key = selected.parent_node_key
        )
    ),
    invalid_lots as (
      select selected.node_key
      from selected_with_lots selected
      where selected.lot_product_id is null
         or selected.effective_selected_product_id is null
         or selected.expected_product_id is null
         or selected.lot_product_id <> selected.effective_selected_product_id
         or (
           selected.effective_selected_product_id <> selected.expected_product_id
           and not (
             selected.expected_group is not null
             and selected.expected_group = selected.selected_group
             and (
               selected.selected_product_type <> 'semi_finished'
               or selected.selected_has_active_recipe
             )
           )
         )
    ),
    invalid as (
      select node_key from unexpected
      union all
      select node_key from invalid_lots
    )
    select count(*)
    into v_invalid_count
    from invalid;

    if v_invalid_count > 0 then
      raise exception 'Selected lots must be available lots for the active blueprint components or an allowed substitution group.';
    end if;
  else
    with recursive required_components(component_product_id) as (
      select rc.component_product_id
      from recipe_components rc
      where rc.recipe_id = v_recipe_id
      union
      select child_rc.component_product_id
      from required_components parent
      join recipes child_recipe on child_recipe.product_id = parent.component_product_id
        and child_recipe.is_active = true
      join recipe_components child_rc on child_rc.recipe_id = child_recipe.id
    )
    select count(*)
    into v_required_traceable_count
    from required_components rc
    join products p on p.id = rc.component_product_id
    where not (p.type = 'raw' and lower(trim(p.name)) = 'eau');

    with selected_lots as (
      select distinct
        nullif(coalesce(selected.value->>'expectedProductId', selected.value->>'expected_product_id'), '')::uuid as expected_product_id,
        nullif(coalesce(selected.value->>'consumedLotId', selected.value->>'consumed_lot_id'), '')::uuid as consumed_lot_id
      from jsonb_array_elements(coalesce(p_consumed_lot_selections, '[]'::jsonb)) as selected(value)
      where nullif(coalesce(selected.value->>'expectedProductId', selected.value->>'expected_product_id'), '') is not null
        and nullif(coalesce(selected.value->>'consumedLotId', selected.value->>'consumed_lot_id'), '') is not null
    )
    select count(*)
    into v_selected_count
    from selected_lots;

    if v_selected_count = 0 and v_required_traceable_count > 0 then
      raise exception 'At least one consumed lot is required.';
    end if;

    with recursive required_components(component_product_id) as (
      select rc.component_product_id
      from recipe_components rc
      where rc.recipe_id = v_recipe_id
      union
      select child_rc.component_product_id
      from required_components parent
      join recipes child_recipe on child_recipe.product_id = parent.component_product_id
        and child_recipe.is_active = true
      join recipe_components child_rc on child_rc.recipe_id = child_recipe.id
    ),
    selected_lots as (
      select distinct
        nullif(coalesce(selected.value->>'expectedProductId', selected.value->>'expected_product_id'), '')::uuid as expected_product_id,
        nullif(coalesce(selected.value->>'consumedLotId', selected.value->>'consumed_lot_id'), '')::uuid as consumed_lot_id
      from jsonb_array_elements(coalesce(p_consumed_lot_selections, '[]'::jsonb)) as selected(value)
      where nullif(coalesce(selected.value->>'expectedProductId', selected.value->>'expected_product_id'), '') is not null
        and nullif(coalesce(selected.value->>'consumedLotId', selected.value->>'consumed_lot_id'), '') is not null
    )
    select count(*)
    into v_missing_count
    from required_components rc
    join products p on p.id = rc.component_product_id
    where not (p.type = 'raw' and lower(trim(p.name)) = 'eau')
      and not exists (
        select 1
        from selected_lots sl
        where sl.expected_product_id = rc.component_product_id
      );

    if v_missing_count > 0 then
      raise exception 'Every blueprint component must have a confirmed lot.';
    end if;

    with recursive required_components(component_product_id) as (
      select rc.component_product_id
      from recipe_components rc
      where rc.recipe_id = v_recipe_id
      union
      select child_rc.component_product_id
      from required_components parent
      join recipes child_recipe on child_recipe.product_id = parent.component_product_id
        and child_recipe.is_active = true
      join recipe_components child_rc on child_rc.recipe_id = child_recipe.id
    ),
    selected_lots as (
      select distinct
        nullif(coalesce(selected.value->>'expectedProductId', selected.value->>'expected_product_id'), '')::uuid as expected_product_id,
        nullif(coalesce(selected.value->>'consumedLotId', selected.value->>'consumed_lot_id'), '')::uuid as consumed_lot_id
      from jsonb_array_elements(coalesce(p_consumed_lot_selections, '[]'::jsonb)) as selected(value)
      where nullif(coalesce(selected.value->>'expectedProductId', selected.value->>'expected_product_id'), '') is not null
        and nullif(coalesce(selected.value->>'consumedLotId', selected.value->>'consumed_lot_id'), '') is not null
    ),
    validated_lots as (
      select
        sl.expected_product_id,
        sl.consumed_lot_id,
        expected_product.substitution_group as expected_group,
        consumed_product.substitution_group as consumed_group,
        l.product_id as consumed_product_id
      from selected_lots sl
      left join required_components rc on rc.component_product_id = sl.expected_product_id
      left join products expected_product on expected_product.id = sl.expected_product_id
        and expected_product.is_active = true
      left join lots l on l.id = sl.consumed_lot_id
        and l.lot_status = 'available'
        and l.quality_status = 'conforme'
      left join products consumed_product on consumed_product.id = l.product_id
        and consumed_product.is_active = true
      where rc.component_product_id is null
         or l.id is null
         or expected_product.id is null
         or consumed_product.id is null
         or (
           l.product_id <> sl.expected_product_id
           and not (
             expected_product.substitution_group is not null
             and expected_product.substitution_group = consumed_product.substitution_group
           )
         )
    )
    select count(*)
    into v_invalid_count
    from validated_lots;

    if v_invalid_count > 0 then
      raise exception 'Selected lots must be available lots for the active blueprint components or an allowed substitution group.';
    end if;
  end if;

  insert into production_batches (
    production_date,
    product_id,
    generated_lot,
    quantity_produced,
    unit,
    responsible_name,
    operation,
    observations,
    status,
    confirmed_by,
    confirmed_at,
    created_by,
    updated_by,
    updated_at
  )
  values (
    coalesce(p_production_date, now()),
    p_product_id,
    trim(p_generated_lot),
    null,
    null,
    nullif(trim(coalesce(p_responsible_name, '')), ''),
    nullif(trim(coalesce(p_operation, '')), ''),
    nullif(trim(coalesce(p_observations, '')), ''),
    'validated',
    v_actor_id,
    now(),
    v_actor_id,
    v_actor_id,
    now()
  )
  returning id into v_batch_id;

  insert into lots (
    product_id,
    lot_number,
    quantity_initial,
    quantity_available,
    unit,
    quality_status,
    lot_status,
    source_type,
    source_id,
    created_by,
    updated_by,
    updated_at
  )
  values (
    p_product_id,
    trim(p_generated_lot),
    0,
    0,
    v_product.unit,
    'conforme',
    'available',
    'fabrication',
    v_batch_id,
    v_actor_id,
    v_actor_id,
    now()
  );

  insert into production_consumptions (
    production_batch_id,
    expected_component_product_id,
    selected_component_product_id,
    component_node_key,
    parent_component_node_key,
    component_depth,
    consumed_lot_id,
    quantity_used,
    unit,
    created_by,
    updated_by,
    updated_at
  )
  select distinct
    v_batch_id,
    selected.expected_product_id,
    coalesce(selected.selected_product_id, l.product_id),
    selected.node_key,
    selected.parent_node_key,
    selected.depth,
    selected.consumed_lot_id,
    null::numeric,
    null::text,
    v_actor_id,
    v_actor_id,
    now()
  from (
    select
      nullif(coalesce(item.value->>'nodeKey', item.value->>'node_key', item.value->>'componentNodeKey', item.value->>'component_node_key'), '') as node_key,
      nullif(coalesce(item.value->>'parentNodeKey', item.value->>'parent_node_key', item.value->>'parentComponentNodeKey', item.value->>'parent_component_node_key'), '') as parent_node_key,
      coalesce(nullif(coalesce(item.value->>'depth', item.value->>'componentDepth', item.value->>'component_depth'), '')::integer, 1) as depth,
      nullif(coalesce(item.value->>'expectedProductId', item.value->>'expected_product_id'), '')::uuid as expected_product_id,
      nullif(coalesce(item.value->>'selectedProductId', item.value->>'selected_product_id'), '')::uuid as selected_product_id,
      nullif(coalesce(item.value->>'consumedLotId', item.value->>'consumed_lot_id'), '')::uuid as consumed_lot_id
    from jsonb_array_elements(coalesce(p_consumed_lot_selections, '[]'::jsonb)) as item(value)
    where nullif(coalesce(item.value->>'expectedProductId', item.value->>'expected_product_id'), '') is not null
      and nullif(coalesce(item.value->>'consumedLotId', item.value->>'consumed_lot_id'), '') is not null
  ) selected
  join lots l on l.id = selected.consumed_lot_id;

  perform log_traceability_event(
    'production_lots.confirmed',
    'production_batch',
    v_batch_id,
    jsonb_build_object(
      'productId', p_product_id,
      'productName', v_product.name,
      'generatedLot', trim(p_generated_lot),
      'consumedLotCount', v_selected_count,
      'supportsSubstitutions', true,
      'supportsEffectiveComponentTree', v_has_node_keys
    )
  );

  return v_batch_id;
end;
$$;

revoke all on function build_production_traceability_snapshot(uuid) from public;
grant execute on function build_production_traceability_snapshot(uuid) to authenticated;

revoke all on function create_production_with_traceability_v2(timestamptz, uuid, text, text, text, text, jsonb) from public;
grant execute on function create_production_with_traceability_v2(timestamptz, uuid, text, text, text, text, jsonb) to authenticated;

grant select on production_consumption_details to authenticated;

notify pgrst, 'reload schema';

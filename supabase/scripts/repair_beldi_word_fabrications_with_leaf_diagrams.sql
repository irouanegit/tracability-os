-- Repairs Beldi fabrication rows found by verify_beldi_word_fabrications_readonly.sql.
-- This script is intentionally targeted: it fixes the reported missing/mismatched
-- schemas and refreshes their diagram data using the same leaf-slot tree pattern
-- used by the modern production import scripts.
--
-- Important behavior:
-- - Existing products keep their saved type/category/unit.
-- - Missing products are created only when no active product with that name exists.
-- - Target recipes listed below are rewritten to match the verified Word source.
-- - Diagram nodes/edges are regenerated from active recipes after repair.

do $$
begin
  if to_regclass('public.products') is null
    or to_regclass('public.recipes') is null
    or to_regclass('public.recipe_components') is null then
    raise exception 'Traceability schema is missing. products, recipes, and recipe_components are required.';
  end if;
end $$;

create temp table beldi_repair_product_input (
  name text not null,
  product_type product_type not null,
  category text not null,
  unit text not null
) on commit drop;

create temp table beldi_repair_schema_input (
  target_name text not null,
  component_name text not null,
  component_order integer not null
) on commit drop;

create temp table beldi_repair_name_alias (
  source_name text primary key,
  canonical_name text not null
) on commit drop;

insert into beldi_repair_name_alias (source_name, canonical_name)
values
  ('Amand noire/ noix', 'Amande noire'),
  ('Amande Haché', 'Amande hachée'),
  ('Amande haché', 'Amande hachée'),
  ('Amande noir', 'Amande noire'),
  ('Beurre spéciale', 'Beurre'),
  ('Beurre spécial', 'Beurre'),
  ('Chocolat blanc', 'Gala blanc'),
  ('Eau florale', 'Eau de fleur'),
  ('Farine', 'Farine lux'),
  ('farine', 'Farine lux'),
  ('Huile végétale', 'Huile'),
  ('Kunafa', 'Konafa'),
  ('levure', 'Levure'),
  ('Nappage', 'Nappage normal'),
  ('PATE Raffaelo', 'PATE Raffaelo coco'),
  ('Pâte sablée', 'PATE Sablée'),
  ('Pate amande', 'PATE AMANDE'),
  ('Pate Baklava', 'Pate baklava'),
  ('Pate corn gazelle', 'Pate corne gazelle'),
  ('PATE Ghraiba effilée', 'Pate ghraiba effilée'),
  ('Pate ghraiba effilée café', 'Pate ghraiba effilée'),
  ('PATE Ghraiba effilée café', 'Pate ghraiba effilée'),
  ('Poudre de coco', 'Poudre cacao'),
  ('Praliné Amande', 'Praline amande'),
  ('Praliné Pistache', 'Praline pistache'),
  ('sel', 'Sel'),
  ('Sésame blanc', 'Sésame'),
  ('Sucre glace', 'Sucre glacé'),
  ('Vanille', 'Poudre vanille'),
  ('vanille', 'Poudre vanille'),
  ('Œuf', 'Œufs');

insert into beldi_repair_product_input (name, product_type, category, unit)
values
  ('Behla prestige', 'finished', 'beldi', 'unites'),
  ('Ganache (selon stock)', 'semi_finished', 'beldi', 'kg'),
  ('Garga3a', 'semi_finished', 'beldi', 'kg'),
  ('Praline amande', 'semi_finished', 'beldi', 'kg'),
  ('Praline pistache', 'semi_finished', 'beldi', 'kg');

insert into beldi_repair_schema_input (target_name, component_name, component_order)
values
  ('Behla prestige', 'Amande hachée', 1),
  ('Behla prestige', 'Cannelle', 2),
  ('Behla prestige', 'Colorant', 3),
  ('Behla prestige', 'Farine', 4),
  ('Behla prestige', 'Fenouil', 5),
  ('Behla prestige', 'Huile', 6),
  ('Behla prestige', 'Levure', 7),
  ('Behla prestige', 'Sel', 8),
  ('Behla prestige', 'Sésame', 9),
  ('Behla prestige', 'Sucre glacé', 10),

  ('Cookies drops', 'Beurre', 1),
  ('Cookies drops', 'Drops', 2),
  ('Cookies drops', 'Farine', 3),
  ('Cookies drops', 'Levure', 4),
  ('Cookies drops', 'Pistache', 5),
  ('Cookies drops', 'Sucre glacé', 6),
  ('Cookies drops', 'Œufs', 7),
  ('Cookies drops', 'Vanille', 8),

  ('Diamantine', 'PATE Sablée', 1),
  ('Diamantine', 'Praline amande', 2),
  ('Diamantine', 'Ganache Caramel', 3),
  ('Diamantine', 'Nougat sésame', 4),

  ('Garga3a', 'Ganache (selon stock)', 1),
  ('Garga3a', 'Noix', 2),
  ('Garga3a', 'PATE Sablée', 3),

  ('Ghraiba effilée', 'Pate ghraiba effilée', 1),
  ('Ghraiba effilée', 'Amande effilée', 2),
  ('Ghraiba effilée', 'Nappage normal', 3),

  ('Ghraiba effilée café', 'Pate ghraiba effilée café', 1),
  ('Ghraiba effilée café', 'Amande effilée', 2),
  ('Ghraiba effilée café', 'Amande noire', 3),
  ('Ghraiba effilée café', 'Nappage normal', 4),

  ('Ghraiba effilée Noix', 'PATE Noix', 1),
  ('Ghraiba effilée Noix', 'Amande effilée', 2),
  ('Ghraiba effilée Noix', 'Noix', 3),
  ('Ghraiba effilée Noix', 'Nappage normal', 4),

  ('Nougat sésame', 'Beurre', 1),
  ('Nougat sésame', 'Gala blanc', 2),
  ('Nougat sésame', 'Glucose', 3),
  ('Nougat sésame', 'Sésame', 4),
  ('Nougat sésame', 'Sucre semoule', 5),

  ('PATE AMANDE', 'Amande noire', 1),
  ('PATE AMANDE', 'Beurre', 2),
  ('PATE AMANDE', 'Colorant', 3),
  ('PATE AMANDE', 'Confiture Zakia', 4),
  ('PATE AMANDE', 'Eau de fleur', 5),
  ('PATE AMANDE', 'Sucre semoule', 6),

  ('Pate baklava', 'Beurre', 1),
  ('Pate baklava', 'Colorant', 2),
  ('Pate baklava', 'Eau de fleur', 3),
  ('Pate baklava', 'Farine', 4),
  ('Pate baklava', 'Sel', 5),
  ('Pate baklava', 'Sucre glacé', 6),

  ('Pate corne gazelle', 'Beurre', 1),
  ('Pate corne gazelle', 'Colorant', 2),
  ('Pate corne gazelle', 'Eau florale', 3),
  ('Pate corne gazelle', 'Farine', 4),
  ('Pate corne gazelle', 'Huile', 5),
  ('Pate corne gazelle', 'Miel', 6),

  ('Praline amande', 'Amande noire', 1),
  ('Praline amande', 'Huile', 2),
  ('Praline amande', 'Sucre glacé', 3),

  ('Praline pistache', 'Huile', 1),
  ('Praline pistache', 'Pistache', 2),
  ('Praline pistache', 'Sucre glacé', 3),

  ('Raffaelo Coco', 'PATE Raffaelo coco', 1),
  ('Raffaelo Coco', 'Gala blanc', 2),
  ('Raffaelo Coco', 'Poudre cacao', 3),

  ('Raffaelo Kunafa', 'PATE Raffaelo kunafa', 1),
  ('Raffaelo Kunafa', 'Gala blanc', 2),
  ('Raffaelo Kunafa', 'Kunafa', 3);

create or replace function pg_temp.beldi_repair_canonical_name(p_name text)
returns text
language sql
stable
as $fn$
  select coalesce(
    (
      select canonical_name
      from beldi_repair_name_alias
      where lower(trim(source_name)) = lower(trim(p_name))
      limit 1
    ),
    trim(p_name)
  )
$fn$;

create or replace function pg_temp.beldi_repair_refresh_leaf_diagram(p_target_id uuid)
returns void
language plpgsql
as $fn$
declare
  v_recipe_id uuid;
  v_diagram_nodes jsonb;
  v_diagram_edges jsonb;
begin
  select id
  into v_recipe_id
  from recipes
  where product_id = p_target_id
    and is_active = true
  order by version desc
  limit 1;

  if v_recipe_id is null then
    return;
  end if;

  with recursive diagram_tree as (
    select
      child.component_product_id as product_id,
      p_target_id::text as parent_node_id,
      p_target_id::text || '__' || child.component_product_id::text as node_id,
      1 as depth,
      child.component_order,
      lpad(child.component_order::text, 4, '0') as path_sort,
      array[p_target_id, child.component_product_id] as path
    from (
      select
        rc.component_product_id,
        row_number() over (order by rc.created_at, component.name, rc.component_product_id::text)::integer as component_order
      from recipe_components rc
      join products component on component.id = rc.component_product_id
      where rc.recipe_id = v_recipe_id
    ) child
    union all
    select
      child.component_product_id,
      diagram_tree.node_id as parent_node_id,
      diagram_tree.node_id || '__' || child.component_product_id::text as node_id,
      diagram_tree.depth + 1 as depth,
      child.component_order,
      diagram_tree.path_sort || '.' || lpad(child.component_order::text, 4, '0') as path_sort,
      diagram_tree.path || child.component_product_id
    from diagram_tree
    join products parent_product
      on parent_product.id = diagram_tree.product_id
     and parent_product.type = 'semi_finished'
     and parent_product.is_active = true
    join recipes child_recipe
      on child_recipe.product_id = parent_product.id
     and child_recipe.is_active = true
    join lateral (
      select
        rc.component_product_id,
        row_number() over (order by rc.created_at, component.name, rc.component_product_id::text)::integer as component_order
      from recipe_components rc
      join products component on component.id = rc.component_product_id
      where rc.recipe_id = child_recipe.id
    ) child on not child.component_product_id = any(diagram_tree.path)
  ),
  tree_leaves as (
    select
      leaf.node_id,
      leaf.path_sort,
      row_number() over (order by leaf.path_sort, leaf.product_id::text) as leaf_index
    from diagram_tree leaf
    where not exists (
      select 1
      from diagram_tree child
      where child.parent_node_id = leaf.node_id
    )
  ),
  leaf_totals as (
    select greatest(count(*)::numeric, 1) as total_leaf_slots
    from tree_leaves
  ),
  layout_nodes as (
    select
      diagram_tree.product_id,
      diagram_tree.parent_node_id,
      diagram_tree.node_id,
      diagram_tree.depth,
      diagram_tree.path_sort,
      min(tree_leaves.leaf_index)::numeric as first_leaf_index,
      max(tree_leaves.leaf_index)::numeric as last_leaf_index
    from diagram_tree
    join tree_leaves
      on tree_leaves.path_sort = diagram_tree.path_sort
      or tree_leaves.path_sort like diagram_tree.path_sort || '.%'
    group by
      diagram_tree.product_id,
      diagram_tree.parent_node_id,
      diagram_tree.node_id,
      diagram_tree.depth,
      diagram_tree.path_sort
  ),
  ordered_nodes as (
    select
      layout_nodes.product_id,
      layout_nodes.parent_node_id,
      layout_nodes.node_id,
      layout_nodes.depth,
      layout_nodes.path_sort,
      row_number() over (order by layout_nodes.path_sort, layout_nodes.product_id::text) as row_index,
      (((layout_nodes.first_leaf_index + layout_nodes.last_leaf_index) / 2) - ((leaf_totals.total_leaf_slots + 1) / 2)) * 230 as node_y
    from layout_nodes
    cross join leaf_totals
  )
  select
    jsonb_build_array(
      jsonb_build_object(
        'id', p_target_id::text,
        'type', 'product',
        'position', jsonb_build_object('x', -420, 'y', 0),
        'data', jsonb_build_object('productId', p_target_id::text, 'isTarget', true)
      )
    ) || coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', node_id,
          'type', 'product',
          'position', jsonb_build_object(
            'x', (-420 + (depth * 420) + (((depth - 1) * depth / 2) * 70)),
            'y', node_y::integer
          ),
          'data', jsonb_build_object('productId', product_id::text, 'isTarget', false)
        )
        order by row_index
      ),
      '[]'::jsonb
    ),
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', parent_node_id || '->' || node_id,
          'source', parent_node_id,
          'target', node_id,
          'type', 'smoothstep'
        )
        order by row_index
      ),
      '[]'::jsonb
    )
  into v_diagram_nodes, v_diagram_edges
  from ordered_nodes;

  update recipes
  set diagram_nodes = v_diagram_nodes,
      diagram_edges = v_diagram_edges,
      diagram_viewport = jsonb_build_object('x', 0, 'y', 0, 'zoom', 0.9)
  where id = v_recipe_id;
end
$fn$;

do $$
declare
  v_missing_components text[];
  v_missing_targets text[];
  v_ambiguous_components text[];
  v_ambiguous_targets text[];
  v_schema record;
  v_target_id uuid;
  v_recipe_id uuid;
  v_component_ids uuid[];
  v_empty_schema_product_id uuid;
begin
  insert into products (code, name, type, category, unit)
  select
    case input.product_type
      when 'finished' then 'PF-BELDI-' || upper(substr(md5(input.name), 1, 12))
      when 'semi_finished' then 'SF-BELDI-' || upper(substr(md5(input.name), 1, 12))
      else 'MP-BELDI-' || upper(substr(md5(input.name), 1, 12))
    end,
    input.name,
    input.product_type::product_type,
    input.category,
    input.unit
  from beldi_repair_product_input input
  where not exists (
    select 1
    from products existing
    where existing.is_active = true
      and lower(trim(existing.name)) = lower(trim(input.name))
  )
  on conflict (code) do nothing;

  select array_agg(target_name order by target_name)
  into v_missing_targets
  from (
    select distinct target_name
    from beldi_repair_schema_input
  ) input
  where not exists (
    select 1
    from products target
    where target.is_active = true
      and lower(trim(target.name)) = lower(trim(pg_temp.beldi_repair_canonical_name(input.target_name)))
  );

  if coalesce(array_length(v_missing_targets, 1), 0) > 0 then
    raise exception 'Missing target products after repair insert: %', v_missing_targets;
  end if;

  select array_agg(component_name order by component_name)
  into v_missing_components
  from (
    select distinct pg_temp.beldi_repair_canonical_name(component_name) as component_name
    from beldi_repair_schema_input
  ) input
  where not exists (
    select 1
    from products component
    where component.is_active = true
      and component.type in ('raw', 'semi_finished')
      and lower(trim(component.name)) = lower(trim(input.component_name))
  );

  if coalesce(array_length(v_missing_components, 1), 0) > 0 then
    raise exception 'Missing component products. Add/link these products before running repair: %', v_missing_components;
  end if;

  select array_agg(target_name || ' (' || match_count || ' matches)' order by target_name)
  into v_ambiguous_targets
  from (
    select input.target_name, count(target.id) as match_count
    from (
      select distinct target_name
      from beldi_repair_schema_input
    ) input
    join products target
      on target.is_active = true
     and lower(trim(target.name)) = lower(trim(pg_temp.beldi_repair_canonical_name(input.target_name)))
    group by input.target_name
    having count(target.id) > 1
  ) ambiguous;

  if coalesce(array_length(v_ambiguous_targets, 1), 0) > 0 then
    raise exception 'Ambiguous target products: %', v_ambiguous_targets;
  end if;

  select array_agg(component_name || ' (' || match_count || ' matches)' order by component_name)
  into v_ambiguous_components
  from (
    select input.component_name, count(component.id) as match_count
    from (
      select distinct pg_temp.beldi_repair_canonical_name(component_name) as component_name
      from beldi_repair_schema_input
    ) input
    join products component
      on component.is_active = true
     and component.type in ('raw', 'semi_finished')
     and lower(trim(component.name)) = lower(trim(input.component_name))
    group by input.component_name
    having count(component.id) > 1
  ) ambiguous;

  if coalesce(array_length(v_ambiguous_components, 1), 0) > 0 then
    raise exception 'Ambiguous component products: %', v_ambiguous_components;
  end if;

  -- Give Ganache (selon stock) a valid empty schema so it has a diagram card/status.
  select id
  into v_empty_schema_product_id
  from products
  where is_active = true
    and lower(trim(name)) = lower('Ganache (selon stock)')
  limit 1;

  if v_empty_schema_product_id is not null then
    select id
    into v_recipe_id
    from recipes
    where product_id = v_empty_schema_product_id
      and is_active = true
    order by version desc
    limit 1;

    if v_recipe_id is null then
      insert into recipes (product_id, version, is_active, notes, diagram_nodes, diagram_edges, diagram_viewport)
      values (
        v_empty_schema_product_id,
        coalesce((select max(version) from recipes where product_id = v_empty_schema_product_id), 0) + 1,
        true,
        'Beldi Word repair: empty stock-choice schema',
        jsonb_build_array(jsonb_build_object(
          'id', v_empty_schema_product_id::text,
          'type', 'product',
          'position', jsonb_build_object('x', -420, 'y', 0),
          'data', jsonb_build_object('productId', v_empty_schema_product_id::text, 'isTarget', true)
        )),
        '[]'::jsonb,
        jsonb_build_object('x', 0, 'y', 0, 'zoom', 0.9)
      );
    else
      update recipes
      set notes = 'Beldi Word repair: empty stock-choice schema',
          diagram_nodes = jsonb_build_array(jsonb_build_object(
            'id', v_empty_schema_product_id::text,
            'type', 'product',
            'position', jsonb_build_object('x', -420, 'y', 0),
            'data', jsonb_build_object('productId', v_empty_schema_product_id::text, 'isTarget', true)
          )),
          diagram_edges = '[]'::jsonb,
          diagram_viewport = jsonb_build_object('x', 0, 'y', 0, 'zoom', 0.9)
      where id = v_recipe_id;
    end if;
  end if;

  for v_schema in
    select distinct target_name
    from beldi_repair_schema_input
    order by target_name
  loop
    select id
    into v_target_id
    from products
    where is_active = true
      and lower(trim(name)) = lower(trim(pg_temp.beldi_repair_canonical_name(v_schema.target_name)))
    limit 1;

    select array_agg(product_id order by component_order)
    into v_component_ids
    from (
      select distinct on (lower(trim(component.name)))
        input.component_order,
        component.id as product_id
      from beldi_repair_schema_input input
      join products component
        on component.is_active = true
       and component.type in ('raw', 'semi_finished')
       and lower(trim(component.name)) = lower(trim(pg_temp.beldi_repair_canonical_name(input.component_name)))
      where lower(trim(input.target_name)) = lower(trim(v_schema.target_name))
      order by lower(trim(component.name)), input.component_order
    ) resolved;

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
        'Beldi Word repair with leaf-slot diagram'
      )
      returning id into v_recipe_id;
    else
      update recipes
      set notes = 'Beldi Word repair with leaf-slot diagram'
      where id = v_recipe_id;
    end if;

    update recipes
    set is_active = false
    where product_id = v_target_id
      and id <> v_recipe_id
      and is_active = true;

    delete from recipe_components
    where recipe_id = v_recipe_id;

    insert into recipe_components (recipe_id, component_product_id, quantity, unit, created_at)
    select
      v_recipe_id,
      component_id,
      null,
      null,
      clock_timestamp() + (ordinality::text || ' milliseconds')::interval
    from unnest(v_component_ids) with ordinality as ordered_components(component_id, ordinality);

    perform pg_temp.beldi_repair_refresh_leaf_diagram(v_target_id);

    update products
    set updated_at = now()
    where id = v_target_id;
  end loop;
end $$;

with repaired_targets as (
  select distinct pg_temp.beldi_repair_canonical_name(target_name) as target_name
  from beldi_repair_schema_input
),
active_repaired_recipes as (
  select
    target.name as target_name,
    recipes.id as recipe_id,
    jsonb_array_length(coalesce(recipes.diagram_nodes, '[]'::jsonb)) as diagram_node_count,
    count(recipe_components.id)::integer as component_count
  from recipes
  join products target on target.id = recipes.product_id
  left join recipe_components on recipe_components.recipe_id = recipes.id
  join repaired_targets on lower(trim(repaired_targets.target_name)) = lower(trim(target.name))
  where recipes.is_active = true
  group by target.name, recipes.id, recipes.diagram_nodes
)
select
  count(*)::integer as repaired_schema_count,
  coalesce(sum(component_count), 0)::integer as repaired_component_link_count,
  coalesce(jsonb_agg(
    jsonb_build_object(
      'product', target_name,
      'components', component_count,
      'diagram_nodes', diagram_node_count
    )
    order by target_name
  ), '[]'::jsonb) as repaired_schemas
from active_repaired_recipes;

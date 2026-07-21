-- Import boulangerie products and fabrication schemas from C:\Users\user\Downloads\fiche trac boulangerie.docx.
-- Run after the unified raw-material import/update scripts have populated the required raw materials.
-- Safe to rerun: existing products and active recipes are updated, recipe components are replaced, not duplicated.

begin;

do $import$
declare
  v_products jsonb := $products$[{"name":"Levure Traditionnelle","product_type":"semi_finished","category":"boulangerie","official_code":"LT","unit":"kg"},{"name":"PATE SPECIAL","product_type":"semi_finished","category":"boulangerie","official_code":"PSP","unit":"kg"},{"name":"Baguette ancienne","product_type":"finished","category":"boulangerie","official_code":"01","unit":"unites"},{"name":"Baguette cereale","product_type":"finished","category":"boulangerie","official_code":"02","unit":"unites"},{"name":"Baguette normal","product_type":"finished","category":"boulangerie","official_code":"04","unit":"unites"},{"name":"Baguette pavot","product_type":"finished","category":"boulangerie","official_code":"06","unit":"unites"},{"name":"Baguette sesame","product_type":"finished","category":"boulangerie","official_code":"08","unit":"unites"},{"name":"Pain au lait","product_type":"finished","category":"boulangerie","official_code":"10","unit":"unites"},{"name":"Pain au lait chocolat","product_type":"finished","category":"boulangerie","official_code":"11","unit":"unites"},{"name":"Pain complet","product_type":"finished","category":"boulangerie","official_code":"13","unit":"unites"},{"name":"Pain d'Orge","product_type":"finished","category":"boulangerie","official_code":"16","unit":"unites"},{"name":"Pain semoule","product_type":"finished","category":"boulangerie","official_code":"18","unit":"unites"}]$products$::jsonb;
  v_links jsonb := $links$[{"target_name":"Baguette ancienne","target_type":"finished","target_category":"boulangerie","component_name":"PATE SPECIAL","component_order":1},{"target_name":"Baguette ancienne","target_type":"finished","target_category":"boulangerie","component_name":"Farine boulangerie","component_order":2},{"target_name":"Baguette cereale","target_type":"finished","target_category":"boulangerie","component_name":"PATE SPECIAL","component_order":1},{"target_name":"Baguette cereale","target_type":"finished","target_category":"boulangerie","component_name":"Cereal","component_order":2},{"target_name":"Baguette normal","target_type":"finished","target_category":"boulangerie","component_name":"Farine boulangerie","component_order":1},{"target_name":"Baguette normal","target_type":"finished","target_category":"boulangerie","component_name":"Sucre semoule","component_order":2},{"target_name":"Baguette normal","target_type":"finished","target_category":"boulangerie","component_name":"Sel","component_order":3},{"target_name":"Baguette normal","target_type":"finished","target_category":"boulangerie","component_name":"Améliorant de Panification IBIS","component_order":4},{"target_name":"Baguette normal","target_type":"finished","target_category":"boulangerie","component_name":"Levure Jaouda","component_order":5},{"target_name":"Baguette pavot","target_type":"finished","target_category":"boulangerie","component_name":"PATE SPECIAL","component_order":1},{"target_name":"Baguette pavot","target_type":"finished","target_category":"boulangerie","component_name":"Pavot","component_order":2},{"target_name":"Baguette sesame","target_type":"finished","target_category":"boulangerie","component_name":"PATE SPECIAL","component_order":1},{"target_name":"Baguette sesame","target_type":"finished","target_category":"boulangerie","component_name":"SESAME BLANC","component_order":2},{"target_name":"Levure Traditionnelle","target_type":"semi_finished","target_category":"boulangerie","component_name":"Eau","component_order":1},{"target_name":"Levure Traditionnelle","target_type":"semi_finished","target_category":"boulangerie","component_name":"Miel","component_order":2},{"target_name":"Levure Traditionnelle","target_type":"semi_finished","target_category":"boulangerie","component_name":"Seigle","component_order":3},{"target_name":"Levure Traditionnelle","target_type":"semi_finished","target_category":"boulangerie","component_name":"Grand Chef","component_order":4},{"target_name":"Levure Traditionnelle","target_type":"semi_finished","target_category":"boulangerie","component_name":"Farine traditionel","component_order":5},{"target_name":"Levure Traditionnelle","target_type":"semi_finished","target_category":"boulangerie","component_name":"Raisin","component_order":6},{"target_name":"Levure Traditionnelle","target_type":"semi_finished","target_category":"boulangerie","component_name":"Pomme","component_order":7},{"target_name":"Pain au lait","target_type":"finished","target_category":"boulangerie","component_name":"Farine viennoiserie","component_order":1},{"target_name":"Pain au lait","target_type":"finished","target_category":"boulangerie","component_name":"Œufs","component_order":2},{"target_name":"Pain au lait","target_type":"finished","target_category":"boulangerie","component_name":"Améliorant de Panification IBIS","component_order":3},{"target_name":"Pain au lait","target_type":"finished","target_category":"boulangerie","component_name":"Levure Jaouda","component_order":4},{"target_name":"Pain au lait","target_type":"finished","target_category":"boulangerie","component_name":"Beurre","component_order":5},{"target_name":"Pain au lait","target_type":"finished","target_category":"boulangerie","component_name":"Lait","component_order":6},{"target_name":"Pain au lait","target_type":"finished","target_category":"boulangerie","component_name":"Sucre semoule","component_order":7},{"target_name":"Pain au lait","target_type":"finished","target_category":"boulangerie","component_name":"Sel","component_order":8},{"target_name":"Pain au lait","target_type":"finished","target_category":"boulangerie","component_name":"Eau","component_order":9},{"target_name":"Pain au lait","target_type":"finished","target_category":"boulangerie","component_name":"SESAME BLANC","component_order":10},{"target_name":"Pain au lait chocolat","target_type":"finished","target_category":"boulangerie","component_name":"Farine viennoiserie","component_order":1},{"target_name":"Pain au lait chocolat","target_type":"finished","target_category":"boulangerie","component_name":"Œufs","component_order":2},{"target_name":"Pain au lait chocolat","target_type":"finished","target_category":"boulangerie","component_name":"Améliorant de Panification IBIS","component_order":3},{"target_name":"Pain au lait chocolat","target_type":"finished","target_category":"boulangerie","component_name":"Levure Jaouda","component_order":4},{"target_name":"Pain au lait chocolat","target_type":"finished","target_category":"boulangerie","component_name":"Beurre","component_order":5},{"target_name":"Pain au lait chocolat","target_type":"finished","target_category":"boulangerie","component_name":"Sucre semoule","component_order":6},{"target_name":"Pain au lait chocolat","target_type":"finished","target_category":"boulangerie","component_name":"Lait","component_order":7},{"target_name":"Pain au lait chocolat","target_type":"finished","target_category":"boulangerie","component_name":"Sel","component_order":8},{"target_name":"Pain au lait chocolat","target_type":"finished","target_category":"boulangerie","component_name":"Eau","component_order":9},{"target_name":"Pain au lait chocolat","target_type":"finished","target_category":"boulangerie","component_name":"Drops","component_order":10},{"target_name":"Pain complet","target_type":"finished","target_category":"boulangerie","component_name":"Farine complet","component_order":1},{"target_name":"Pain complet","target_type":"finished","target_category":"boulangerie","component_name":"Sel","component_order":2},{"target_name":"Pain complet","target_type":"finished","target_category":"boulangerie","component_name":"Améliorant de Panification IBIS","component_order":3},{"target_name":"Pain complet","target_type":"finished","target_category":"boulangerie","component_name":"Levure Jaouda","component_order":4},{"target_name":"Pain d'Orge","target_type":"finished","target_category":"boulangerie","component_name":"Farine complet","component_order":1},{"target_name":"Pain d'Orge","target_type":"finished","target_category":"boulangerie","component_name":"Farine d'orge","component_order":2},{"target_name":"Pain d'Orge","target_type":"finished","target_category":"boulangerie","component_name":"Semoule d'orge","component_order":3},{"target_name":"Pain d'Orge","target_type":"finished","target_category":"boulangerie","component_name":"Poudre maltorge","component_order":4},{"target_name":"Pain d'Orge","target_type":"finished","target_category":"boulangerie","component_name":"Sel","component_order":5},{"target_name":"Pain d'Orge","target_type":"finished","target_category":"boulangerie","component_name":"Améliorant de Panification IBIS","component_order":6},{"target_name":"Pain d'Orge","target_type":"finished","target_category":"boulangerie","component_name":"Levure Jaouda","component_order":7},{"target_name":"Pain semoule","target_type":"finished","target_category":"boulangerie","component_name":"Semoule","component_order":1},{"target_name":"Pain semoule","target_type":"finished","target_category":"boulangerie","component_name":"Sel","component_order":2},{"target_name":"Pain semoule","target_type":"finished","target_category":"boulangerie","component_name":"Améliorant de Panification IBIS","component_order":3},{"target_name":"Pain semoule","target_type":"finished","target_category":"boulangerie","component_name":"Sucre semoule","component_order":4},{"target_name":"Pain semoule","target_type":"finished","target_category":"boulangerie","component_name":"Levure Jaouda","component_order":5},{"target_name":"PATE SPECIAL","target_type":"semi_finished","target_category":"boulangerie","component_name":"Farine boulangerie","component_order":1},{"target_name":"PATE SPECIAL","target_type":"semi_finished","target_category":"boulangerie","component_name":"Farine traditionel","component_order":2},{"target_name":"PATE SPECIAL","target_type":"semi_finished","target_category":"boulangerie","component_name":"Levure Traditionnelle","component_order":3},{"target_name":"PATE SPECIAL","target_type":"semi_finished","target_category":"boulangerie","component_name":"Grand Chef","component_order":4},{"target_name":"PATE SPECIAL","target_type":"semi_finished","target_category":"boulangerie","component_name":"Levure Jaouda","component_order":5},{"target_name":"PATE SPECIAL","target_type":"semi_finished","target_category":"boulangerie","component_name":"Seigle","component_order":6},{"target_name":"PATE SPECIAL","target_type":"semi_finished","target_category":"boulangerie","component_name":"Sel","component_order":7},{"target_name":"PATE SPECIAL","target_type":"semi_finished","target_category":"boulangerie","component_name":"Eau","component_order":8}]$links$::jsonb;
  missing_components text[];
  ambiguous_products text[];
  schema_record record;
  target_id uuid;
  component_ids uuid[];
  v_diagram_nodes jsonb;
  v_diagram_edges jsonb;
  v_recipe_id uuid;
begin
  select array_agg(distinct input.component_name order by input.component_name)
  into missing_components
  from jsonb_to_recordset(v_links) as input(
    target_name text, target_type text, target_category text, component_name text, component_order integer
  )
  where not exists (
    select 1 from products
    where is_active = true
      and type in ('raw', 'semi_finished')
      and lower(trim(products.name)) = lower(trim(input.component_name))
  )
  and not exists (
    select 1
    from jsonb_to_recordset(v_products) as product_input(
      name text, product_type text, category text, official_code text, unit text
    )
    where product_input.product_type = 'semi_finished'
      and lower(trim(product_input.name)) = lower(trim(input.component_name))
  );

  if coalesce(array_length(missing_components, 1), 0) > 0 then
    raise exception 'Missing boulangerie components. Add/link raw materials first: %', missing_components;
  end if;

  update products
  set type = input.product_type::product_type,
      category = input.category,
      unit = input.unit,
      lot_zone = 'PBC01',
      lot_code = input.official_code,
      code = (case when input.product_type = 'finished' then 'PF-' else 'SF-' end)
        || upper(input.category) || '-'
        || case
          when nullif(regexp_replace(input.official_code, '[^A-Za-z0-9-]+', '', 'g'), '') is not null
            then 'CODE-' || regexp_replace(input.official_code, '[^A-Za-z0-9-]+', '', 'g')
          else 'AUTO-' || upper(substr(md5(input.name), 1, 8))
        end
        || '-' || upper(substr(md5(input.name), 1, 6)),
      updated_at = now()
  from jsonb_to_recordset(v_products) as input(
    name text, product_type text, category text, official_code text, unit text
  )
  where products.type = 'raw'
    and lower(trim(products.name)) = lower(trim(input.name))
    and not exists (
      select 1 from products manufactured
      where manufactured.type = input.product_type::product_type
        and manufactured.category = input.category
        and lower(trim(manufactured.name)) = lower(trim(input.name))
    );

  update products
  set unit = input.unit,
      lot_zone = 'PBC01',
      lot_code = input.official_code,
      is_active = true,
      updated_at = now()
  from jsonb_to_recordset(v_products) as input(
    name text, product_type text, category text, official_code text, unit text
  )
  where products.type = input.product_type::product_type
    and products.category = input.category
    and lower(trim(products.name)) = lower(trim(input.name));

  insert into products (code, name, type, category, unit, lot_zone, lot_code)
  select
    (case when input.product_type = 'finished' then 'PF-' else 'SF-' end)
      || upper(input.category) || '-'
      || case
        when nullif(regexp_replace(input.official_code, '[^A-Za-z0-9-]+', '', 'g'), '') is not null
          then 'CODE-' || regexp_replace(input.official_code, '[^A-Za-z0-9-]+', '', 'g')
        else 'AUTO-' || upper(substr(md5(input.name), 1, 8))
      end
      || '-' || upper(substr(md5(input.name), 1, 6)),
    input.name,
    input.product_type::product_type,
    input.category,
    input.unit,
    'PBC01',
    input.official_code
  from jsonb_to_recordset(v_products) as input(
    name text, product_type text, category text, official_code text, unit text
  )
  where not exists (
    select 1 from products
    where products.type = input.product_type::product_type
      and products.category = input.category
      and lower(trim(products.name)) = lower(trim(input.name))
  )
  on conflict (code) do nothing;

  select array_agg(name || ' (' || matches || ' matches)' order by name)
  into ambiguous_products
  from (
    select input.name, input.product_type, input.category, count(products.id) as matches
    from jsonb_to_recordset(v_products) as input(
      name text, product_type text, category text, official_code text, unit text
    )
    left join products on products.type = input.product_type::product_type
      and products.category = input.category
      and lower(trim(products.name)) = lower(trim(input.name))
    group by input.name, input.product_type, input.category
    having count(products.id) <> 1
  ) problems;

  if coalesce(array_length(ambiguous_products, 1), 0) > 0 then
    raise exception 'Missing or ambiguous boulangerie products: %', ambiguous_products;
  end if;

  select array_agg(target_name || ' -> ' || component_name order by target_name, component_name)
  into ambiguous_products
  from (
    select distinct input.target_name, input.target_type, input.target_category, input.component_name
    from jsonb_to_recordset(v_links) as input(
      target_name text, target_type text, target_category text, component_name text, component_order integer
    )
    where not exists (
      select 1 from products
      where products.is_active = true
        and lower(trim(products.name)) = lower(trim(input.component_name))
        and (
          products.type = 'raw'
          or (products.type = 'semi_finished' and products.category = input.target_category)
          or (
            products.type = 'semi_finished'
            and 1 = (
              select count(*) from products candidate
              where candidate.type = 'semi_finished'
                and candidate.is_active = true
                and lower(trim(candidate.name)) = lower(trim(input.component_name))
            )
          )
        )
    )
  ) problems;

  if coalesce(array_length(ambiguous_products, 1), 0) > 0 then
    raise exception 'Missing or ambiguous boulangerie schema components: %', ambiguous_products;
  end if;

  for schema_record in
    select input.target_name, input.target_type, input.target_category
    from jsonb_to_recordset(v_links) as input(
      target_name text, target_type text, target_category text, component_name text, component_order integer
    )
    group by input.target_name, input.target_type, input.target_category
    order by case when input.target_type = 'semi_finished' then 0 else 1 end, input.target_name
  loop
    select id into target_id
    from products
    where type = schema_record.target_type::product_type
      and category = schema_record.target_category
      and lower(trim(name)) = lower(trim(schema_record.target_name));

    select array_agg(product_id order by component_order)
    into component_ids
    from (
      select distinct on (lower(trim(input.component_name)))
        input.component_order,
        resolved_product.id as product_id
      from jsonb_to_recordset(v_links) as input(
        target_name text, target_type text, target_category text, component_name text, component_order integer
      )
      join lateral (
        select candidate.id
        from products candidate
        where candidate.type in ('raw', 'semi_finished')
          and candidate.is_active = true
          and lower(trim(candidate.name)) = lower(trim(input.component_name))
          and (
            candidate.type = 'raw'
            or (candidate.type = 'semi_finished' and candidate.category = schema_record.target_category)
            or (
              candidate.type = 'semi_finished'
              and 1 = (
                select count(*) from products same_name
                where same_name.type = 'semi_finished'
                  and same_name.is_active = true
                  and lower(trim(same_name.name)) = lower(trim(input.component_name))
              )
            )
          )
        order by
          case
            when candidate.type = 'semi_finished' and candidate.category = schema_record.target_category then 0
            when candidate.type = 'raw' then 1
            else 2
          end,
          candidate.created_at
        limit 1
      ) resolved_product on true
      where lower(trim(input.target_name)) = lower(trim(schema_record.target_name))
        and input.target_type = schema_record.target_type
        and input.target_category = schema_record.target_category
      order by lower(trim(input.component_name)), input.component_order
    ) resolved;

    with recursive diagram_tree as (
      select
        component_id as product_id,
        target_id::text as parent_node_id,
        target_id::text || '__' || component_id::text as node_id,
        1 as depth,
        ordinality::integer as component_order,
        lpad(ordinality::text, 4, '0') as path_sort,
        array[target_id, component_id] as path
      from unnest(component_ids) with ordinality as components(component_id, ordinality)
      union all
      select
        resolved_product.id as product_id,
        diagram_tree.node_id as parent_node_id,
        diagram_tree.node_id || '__' || resolved_product.id::text as node_id,
        diagram_tree.depth + 1 as depth,
        child_input.component_order,
        diagram_tree.path_sort || '.' || lpad(child_input.component_order::text, 4, '0') as path_sort,
        diagram_tree.path || resolved_product.id
      from diagram_tree
      join products parent_product on parent_product.id = diagram_tree.product_id
        and parent_product.type = 'semi_finished'
        and parent_product.is_active = true
      join jsonb_to_recordset(v_links) as child_input(
        target_name text, target_type text, target_category text, component_name text, component_order integer
      ) on lower(trim(child_input.target_name)) = lower(trim(parent_product.name))
        and child_input.target_type = parent_product.type::text
        and child_input.target_category = parent_product.category
      join lateral (
        select candidate.id
        from products candidate
        where candidate.type in ('raw', 'semi_finished')
          and candidate.is_active = true
          and lower(trim(candidate.name)) = lower(trim(child_input.component_name))
        order by
          case
            when candidate.type = 'semi_finished' and candidate.category = parent_product.category then 0
            when candidate.type = 'raw' then 1
            else 2
          end,
          candidate.created_at
        limit 1
      ) resolved_product on not resolved_product.id = any(diagram_tree.path)
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
      select count(*)::numeric as total_leaf_slots
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
          'id', target_id::text,
          'type', 'product',
          'position', jsonb_build_object('x', -420, 'y', 0),
          'data', jsonb_build_object('productId', target_id::text, 'isTarget', true)
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

    select id into v_recipe_id
    from recipes
    where product_id = target_id and is_active = true
    order by version desc
    limit 1;

    if v_recipe_id is null then
      insert into recipes (product_id, version, is_active, notes, diagram_nodes, diagram_edges, diagram_viewport)
      values (
        target_id,
        coalesce((select max(version) from recipes where product_id = target_id), 0) + 1,
        true,
        'Boulangerie recipe document import',
        v_diagram_nodes,
        v_diagram_edges,
        jsonb_build_object('x', 0, 'y', 0, 'zoom', 0.9)
      )
      returning id into v_recipe_id;
    else
      update recipes
      set notes = 'Boulangerie recipe document import',
          diagram_nodes = v_diagram_nodes,
          diagram_edges = v_diagram_edges,
          diagram_viewport = jsonb_build_object('x', 0, 'y', 0, 'zoom', 0.9)
      where id = v_recipe_id;
    end if;

    update recipes set is_active = false
    where product_id = target_id and id <> v_recipe_id and is_active = true;

    delete from recipe_components where recipe_components.recipe_id = v_recipe_id;

    insert into recipe_components (recipe_id, component_product_id, quantity, unit)
    select v_recipe_id, component_id, null, null
    from unnest(component_ids) component_id;

    update products set updated_at = now() where id = target_id;
  end loop;

  raise notice 'Imported/updated % boulangerie products, % schemas, % component links.',
    jsonb_array_length(v_products),
    (select count(*) from (
      select distinct target_name, target_type, target_category
      from jsonb_to_recordset(v_links) as input(
        target_name text, target_type text, target_category text, component_name text, component_order integer
      )
    ) schemas),
    jsonb_array_length(v_links);
end
$import$;

commit;

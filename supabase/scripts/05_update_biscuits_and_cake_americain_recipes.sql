-- Targeted update for:
-- - missing biscuit semi-finished recipes from C:\Users\user\Downloads\les biscuits.docx
-- - updated Cake Americain recipes from C:\Users\user\Downloads\cake americain.docx
--
-- Run after:
--   01_insert_unified_suppliers_and_raw_materials.sql
--   02_insert_clean_production_products_and_schemas.sql

begin;

do $update$
declare
  v_products jsonb := $products$[
    {"name":"Biscuit cake Amr carotte","product_type":"semi_finished","category":"patisserie","official_code":"BCAC","unit":"kg"},
    {"name":"Biscuit Joconde noire","product_type":"semi_finished","category":"patisserie","official_code":"BJN","unit":"kg"},
    {"name":"Biscuit Joconde blanc","product_type":"semi_finished","category":"patisserie","official_code":"BJB","unit":"kg"},
    {"name":"Biscuit cookies","product_type":"semi_finished","category":"patisserie","official_code":"BICO","unit":"kg"},
    {"name":"Biscuit café","product_type":"semi_finished","category":"patisserie","official_code":"BCF","unit":"kg"},
    {"name":"Biscuit pavot","product_type":"semi_finished","category":"patisserie","official_code":"BIP","unit":"kg"},
    {"name":"Biscuit 3chocolat","product_type":"semi_finished","category":"patisserie","official_code":"B3C","unit":"kg"},
    {"name":"Biscuit sans farine","product_type":"semi_finished","category":"patisserie","official_code":"BSF","unit":"kg"},
    {"name":"Biscuit Tropical","product_type":"semi_finished","category":"patisserie","official_code":"BTR","unit":"kg"},
    {"name":"Biscuit Joconde pistache","product_type":"semi_finished","category":"patisserie","official_code":null,"unit":"kg"},
    {"name":"Biscuit noire","product_type":"semi_finished","category":"patisserie","official_code":null,"unit":"kg"},
    {"name":"Biscuit Cake Américain","product_type":"semi_finished","category":"cake","official_code":"BCA","unit":"kg"},
    {"name":"Cake AMR Ferrero","product_type":"finished","category":"cake","official_code":"23","unit":"unites"},
    {"name":"Cake AMR nougat","product_type":"finished","category":"cake","official_code":"23","unit":"unites"},
    {"name":"Cake AMR Nutella","product_type":"finished","category":"cake","official_code":"23","unit":"unites"},
    {"name":"Cake AMR carotte","product_type":"finished","category":"cake","official_code":"25","unit":"unites"},
    {"name":"Entremet cake American Ferrero","product_type":"semi_finished","category":"cake","official_code":"23-1-SF","unit":"kg"},
    {"name":"Entremet cake American NOUGA","product_type":"semi_finished","category":"cake","official_code":"23-3-SF","unit":"kg"},
    {"name":"Entremet cake American Nutella","product_type":"semi_finished","category":"cake","official_code":"23-2-SF","unit":"kg"},
    {"name":"Entremet cake American carotte","product_type":"semi_finished","category":"cake","official_code":"25SF","unit":"kg"},
    {"name":"entremet Ferrero","product_type":"finished","category":"cake","official_code":"23","unit":"unites"}
  ]$products$::jsonb;
  v_links jsonb := $links$[
    {"target_name":"Biscuit cake Amr carotte","target_type":"semi_finished","target_category":"patisserie","component_name":"Cannelle","component_order":1},
    {"target_name":"Biscuit cake Amr carotte","target_type":"semi_finished","target_category":"patisserie","component_name":"Levure chimique","component_order":2},
    {"target_name":"Biscuit cake Amr carotte","target_type":"semi_finished","target_category":"patisserie","component_name":"Sucre semoule","component_order":3},
    {"target_name":"Biscuit cake Amr carotte","target_type":"semi_finished","target_category":"patisserie","component_name":"Farine force","component_order":4},
    {"target_name":"Biscuit cake Amr carotte","target_type":"semi_finished","target_category":"patisserie","component_name":"Œufs","component_order":5},
    {"target_name":"Biscuit cake Amr carotte","target_type":"semi_finished","target_category":"patisserie","component_name":"Noix","component_order":6},

    {"target_name":"Biscuit Joconde noire","target_type":"semi_finished","target_category":"patisserie","component_name":"Blanc d'œuf","component_order":1},
    {"target_name":"Biscuit Joconde noire","target_type":"semi_finished","target_category":"patisserie","component_name":"Sucre semoule","component_order":2},
    {"target_name":"Biscuit Joconde noire","target_type":"semi_finished","target_category":"patisserie","component_name":"Œufs","component_order":3},
    {"target_name":"Biscuit Joconde noire","target_type":"semi_finished","target_category":"patisserie","component_name":"Farine force","component_order":4},
    {"target_name":"Biscuit Joconde noire","target_type":"semi_finished","target_category":"patisserie","component_name":"Sucre glacé","component_order":5},
    {"target_name":"Biscuit Joconde noire","target_type":"semi_finished","target_category":"patisserie","component_name":"Poudre cacao","component_order":6},
    {"target_name":"Biscuit Joconde noire","target_type":"semi_finished","target_category":"patisserie","component_name":"Amande poudre","component_order":7},

    {"target_name":"Biscuit Joconde blanc","target_type":"semi_finished","target_category":"patisserie","component_name":"Blanc d'œuf","component_order":1},
    {"target_name":"Biscuit Joconde blanc","target_type":"semi_finished","target_category":"patisserie","component_name":"Sucre glacé","component_order":2},
    {"target_name":"Biscuit Joconde blanc","target_type":"semi_finished","target_category":"patisserie","component_name":"Œufs","component_order":3},
    {"target_name":"Biscuit Joconde blanc","target_type":"semi_finished","target_category":"patisserie","component_name":"Farine force","component_order":4},
    {"target_name":"Biscuit Joconde blanc","target_type":"semi_finished","target_category":"patisserie","component_name":"Amande poudre","component_order":5},
    {"target_name":"Biscuit Joconde blanc","target_type":"semi_finished","target_category":"patisserie","component_name":"Sucre semoule","component_order":6},

    {"target_name":"Biscuit cookies","target_type":"semi_finished","target_category":"patisserie","component_name":"Beurre","component_order":1},
    {"target_name":"Biscuit cookies","target_type":"semi_finished","target_category":"patisserie","component_name":"Sucre semoule","component_order":2},
    {"target_name":"Biscuit cookies","target_type":"semi_finished","target_category":"patisserie","component_name":"Œufs","component_order":3},
    {"target_name":"Biscuit cookies","target_type":"semi_finished","target_category":"patisserie","component_name":"Farine","component_order":4},
    {"target_name":"Biscuit cookies","target_type":"semi_finished","target_category":"patisserie","component_name":"Sel","component_order":5},
    {"target_name":"Biscuit cookies","target_type":"semi_finished","target_category":"patisserie","component_name":"Levure","component_order":6},
    {"target_name":"Biscuit cookies","target_type":"semi_finished","target_category":"patisserie","component_name":"Drops","component_order":7},

    {"target_name":"Biscuit café","target_type":"semi_finished","target_category":"patisserie","component_name":"Œufs","component_order":1},
    {"target_name":"Biscuit café","target_type":"semi_finished","target_category":"patisserie","component_name":"Poudre cacao","component_order":2},
    {"target_name":"Biscuit café","target_type":"semi_finished","target_category":"patisserie","component_name":"Sucre semoule","component_order":3},
    {"target_name":"Biscuit café","target_type":"semi_finished","target_category":"patisserie","component_name":"Blanc d'œuf","component_order":4},
    {"target_name":"Biscuit café","target_type":"semi_finished","target_category":"patisserie","component_name":"Farine force","component_order":5},
    {"target_name":"Biscuit café","target_type":"semi_finished","target_category":"patisserie","component_name":"Sucre glacé","component_order":6},
    {"target_name":"Biscuit café","target_type":"semi_finished","target_category":"patisserie","component_name":"Amande poudre","component_order":7},
    {"target_name":"Biscuit café","target_type":"semi_finished","target_category":"patisserie","component_name":"Extrait liquide café","component_order":8},

    {"target_name":"Biscuit pavot","target_type":"semi_finished","target_category":"patisserie","component_name":"Miel","component_order":1},
    {"target_name":"Biscuit pavot","target_type":"semi_finished","target_category":"patisserie","component_name":"Beurre","component_order":2},
    {"target_name":"Biscuit pavot","target_type":"semi_finished","target_category":"patisserie","component_name":"Poudre vanille","component_order":3},
    {"target_name":"Biscuit pavot","target_type":"semi_finished","target_category":"patisserie","component_name":"Jaune d'œuf","component_order":4},
    {"target_name":"Biscuit pavot","target_type":"semi_finished","target_category":"patisserie","component_name":"Farine","component_order":5},
    {"target_name":"Biscuit pavot","target_type":"semi_finished","target_category":"patisserie","component_name":"Œufs","component_order":6},
    {"target_name":"Biscuit pavot","target_type":"semi_finished","target_category":"patisserie","component_name":"Lait","component_order":7},
    {"target_name":"Biscuit pavot","target_type":"semi_finished","target_category":"patisserie","component_name":"Pavot","component_order":8},
    {"target_name":"Biscuit pavot","target_type":"semi_finished","target_category":"patisserie","component_name":"Sucre semoule","component_order":9},
    {"target_name":"Biscuit pavot","target_type":"semi_finished","target_category":"patisserie","component_name":"Blanc d'œuf","component_order":10},

    {"target_name":"Biscuit 3chocolat","target_type":"semi_finished","target_category":"patisserie","component_name":"Farine","component_order":1},
    {"target_name":"Biscuit 3chocolat","target_type":"semi_finished","target_category":"patisserie","component_name":"Poudre cacao","component_order":2},
    {"target_name":"Biscuit 3chocolat","target_type":"semi_finished","target_category":"patisserie","component_name":"Chocolat noir Callebaut","component_order":3},
    {"target_name":"Biscuit 3chocolat","target_type":"semi_finished","target_category":"patisserie","component_name":"Beurre","component_order":4},
    {"target_name":"Biscuit 3chocolat","target_type":"semi_finished","target_category":"patisserie","component_name":"Blanc d'œuf","component_order":5},
    {"target_name":"Biscuit 3chocolat","target_type":"semi_finished","target_category":"patisserie","component_name":"Sucre semoule","component_order":6},
    {"target_name":"Biscuit 3chocolat","target_type":"semi_finished","target_category":"patisserie","component_name":"Amande poudre","component_order":7},

    {"target_name":"Biscuit sans farine","target_type":"semi_finished","target_category":"patisserie","component_name":"Farine","component_order":1},
    {"target_name":"Biscuit sans farine","target_type":"semi_finished","target_category":"patisserie","component_name":"Blanc d'œuf","component_order":2},
    {"target_name":"Biscuit sans farine","target_type":"semi_finished","target_category":"patisserie","component_name":"Jaune d'œuf","component_order":3},
    {"target_name":"Biscuit sans farine","target_type":"semi_finished","target_category":"patisserie","component_name":"Sucre semoule","component_order":4},
    {"target_name":"Biscuit sans farine","target_type":"semi_finished","target_category":"patisserie","component_name":"Poudre cacao","component_order":5},

    {"target_name":"Biscuit Tropical","target_type":"semi_finished","target_category":"patisserie","component_name":"Beurre","component_order":1},
    {"target_name":"Biscuit Tropical","target_type":"semi_finished","target_category":"patisserie","component_name":"Sucre semoule","component_order":2},
    {"target_name":"Biscuit Tropical","target_type":"semi_finished","target_category":"patisserie","component_name":"Amande poudre","component_order":3},
    {"target_name":"Biscuit Tropical","target_type":"semi_finished","target_category":"patisserie","component_name":"Farine","component_order":4},
    {"target_name":"Biscuit Tropical","target_type":"semi_finished","target_category":"patisserie","component_name":"Blanc d'œuf","component_order":5},
    {"target_name":"Biscuit Tropical","target_type":"semi_finished","target_category":"patisserie","component_name":"Trimoline","component_order":6},
    {"target_name":"Biscuit Tropical","target_type":"semi_finished","target_category":"patisserie","component_name":"Pate pistache","component_order":7},
    {"target_name":"Biscuit Tropical","target_type":"semi_finished","target_category":"patisserie","component_name":"Levure chimique","component_order":8},

    {"target_name":"Biscuit Joconde pistache","target_type":"semi_finished","target_category":"patisserie","component_name":"Blanc d'œuf","component_order":1},
    {"target_name":"Biscuit Joconde pistache","target_type":"semi_finished","target_category":"patisserie","component_name":"Sucre glacé","component_order":2},
    {"target_name":"Biscuit Joconde pistache","target_type":"semi_finished","target_category":"patisserie","component_name":"Œufs","component_order":3},
    {"target_name":"Biscuit Joconde pistache","target_type":"semi_finished","target_category":"patisserie","component_name":"Farine force","component_order":4},
    {"target_name":"Biscuit Joconde pistache","target_type":"semi_finished","target_category":"patisserie","component_name":"Amande poudre","component_order":5},
    {"target_name":"Biscuit Joconde pistache","target_type":"semi_finished","target_category":"patisserie","component_name":"Colorant vert","component_order":6},
    {"target_name":"Biscuit Joconde pistache","target_type":"semi_finished","target_category":"patisserie","component_name":"Sucre semoule","component_order":7},

    {"target_name":"Biscuit noire","target_type":"semi_finished","target_category":"patisserie","component_name":"Trimoline","component_order":1},
    {"target_name":"Biscuit noire","target_type":"semi_finished","target_category":"patisserie","component_name":"Beurre","component_order":2},
    {"target_name":"Biscuit noire","target_type":"semi_finished","target_category":"patisserie","component_name":"Crème fraîche","component_order":3},
    {"target_name":"Biscuit noire","target_type":"semi_finished","target_category":"patisserie","component_name":"Chocolat noir Callebaut","component_order":4},
    {"target_name":"Biscuit noire","target_type":"semi_finished","target_category":"patisserie","component_name":"Sucre glacé","component_order":5},
    {"target_name":"Biscuit noire","target_type":"semi_finished","target_category":"patisserie","component_name":"Œufs","component_order":6},
    {"target_name":"Biscuit noire","target_type":"semi_finished","target_category":"patisserie","component_name":"Farine force","component_order":7},
    {"target_name":"Biscuit noire","target_type":"semi_finished","target_category":"patisserie","component_name":"Amande poudre","component_order":8},
    {"target_name":"Biscuit noire","target_type":"semi_finished","target_category":"patisserie","component_name":"Levure chimique","component_order":9},
    {"target_name":"Biscuit noire","target_type":"semi_finished","target_category":"patisserie","component_name":"Poudre cacao","component_order":10},
    {"target_name":"Biscuit noire","target_type":"semi_finished","target_category":"patisserie","component_name":"Sucre semoule","component_order":11},

    {"target_name":"Biscuit Cake Américain","target_type":"semi_finished","target_category":"cake","component_name":"Beurre","component_order":1},
    {"target_name":"Biscuit Cake Américain","target_type":"semi_finished","target_category":"cake","component_name":"Huile","component_order":2},
    {"target_name":"Biscuit Cake Américain","target_type":"semi_finished","target_category":"cake","component_name":"Levure chimique","component_order":3},
    {"target_name":"Biscuit Cake Américain","target_type":"semi_finished","target_category":"cake","component_name":"Amande poudre","component_order":4},
    {"target_name":"Biscuit Cake Américain","target_type":"semi_finished","target_category":"cake","component_name":"Sucre glacé","component_order":5},
    {"target_name":"Biscuit Cake Américain","target_type":"semi_finished","target_category":"cake","component_name":"Poudre cacao","component_order":6},
    {"target_name":"Biscuit Cake Américain","target_type":"semi_finished","target_category":"cake","component_name":"Trimoline","component_order":7},
    {"target_name":"Biscuit Cake Américain","target_type":"semi_finished","target_category":"cake","component_name":"Farine","component_order":8},
    {"target_name":"Biscuit Cake Américain","target_type":"semi_finished","target_category":"cake","component_name":"Œufs","component_order":9},

    {"target_name":"Cake AMR Ferrero","target_type":"finished","target_category":"cake","component_name":"Entremet cake American Ferrero","component_order":1},
    {"target_name":"Cake AMR Ferrero","target_type":"finished","target_category":"cake","component_name":"Chocolat rochée noire","component_order":2},
    {"target_name":"Cake AMR Ferrero","target_type":"finished","target_category":"cake","component_name":"GANACHE CHOCOLAT","component_order":3},
    {"target_name":"Cake AMR Ferrero","target_type":"finished","target_category":"cake","component_name":"Crème au beurre","component_order":4},
    {"target_name":"Cake AMR Ferrero","target_type":"finished","target_category":"cake","component_name":"Ferrero","component_order":5},

    {"target_name":"Cake AMR nougat","target_type":"finished","target_category":"cake","component_name":"Entremet cake American NOUGA","component_order":1},
    {"target_name":"Cake AMR nougat","target_type":"finished","target_category":"cake","component_name":"Praline","component_order":2},
    {"target_name":"Cake AMR nougat","target_type":"finished","target_category":"cake","component_name":"NOUGA","component_order":3},
    {"target_name":"Cake AMR nougat","target_type":"finished","target_category":"cake","component_name":"Crème au beurre","component_order":4},
    {"target_name":"Cake AMR nougat","target_type":"finished","target_category":"cake","component_name":"Chocolat noir Callebaut","component_order":5},

    {"target_name":"Cake AMR Nutella","target_type":"finished","target_category":"cake","component_name":"Entremet cake American Nutella","component_order":1},
    {"target_name":"Cake AMR Nutella","target_type":"finished","target_category":"cake","component_name":"GANACHE CHOCOLAT","component_order":2},
    {"target_name":"Cake AMR Nutella","target_type":"finished","target_category":"cake","component_name":"Kitkat","component_order":3},
    {"target_name":"Cake AMR Nutella","target_type":"finished","target_category":"cake","component_name":"Crème au beurre","component_order":4},
    {"target_name":"Cake AMR Nutella","target_type":"finished","target_category":"cake","component_name":"Chocolat noir Callebaut","component_order":5},

    {"target_name":"Entremet cake American Ferrero","target_type":"semi_finished","target_category":"cake","component_name":"Biscuit Cake Américain","component_order":1},
    {"target_name":"Entremet cake American Ferrero","target_type":"semi_finished","target_category":"cake","component_name":"Crème au beurre","component_order":2},
    {"target_name":"Entremet cake American Ferrero","target_type":"semi_finished","target_category":"cake","component_name":"Croquant","component_order":3},
    {"target_name":"Entremet cake American Ferrero","target_type":"semi_finished","target_category":"cake","component_name":"Praline noisette","component_order":4},

    {"target_name":"Entremet cake American NOUGA","target_type":"semi_finished","target_category":"cake","component_name":"Biscuit Cake Américain","component_order":1},
    {"target_name":"Entremet cake American NOUGA","target_type":"semi_finished","target_category":"cake","component_name":"Crème au beurre","component_order":2},
    {"target_name":"Entremet cake American NOUGA","target_type":"semi_finished","target_category":"cake","component_name":"NOUGA","component_order":3},
    {"target_name":"Entremet cake American NOUGA","target_type":"semi_finished","target_category":"cake","component_name":"GANACHE CHOCOLAT","component_order":4},
    {"target_name":"Entremet cake American NOUGA","target_type":"semi_finished","target_category":"cake","component_name":"Praline noisette","component_order":5},

    {"target_name":"Entremet cake American Nutella","target_type":"semi_finished","target_category":"cake","component_name":"Biscuit Cake Américain","component_order":1},
    {"target_name":"Entremet cake American Nutella","target_type":"semi_finished","target_category":"cake","component_name":"Crème au beurre","component_order":2},
    {"target_name":"Entremet cake American Nutella","target_type":"semi_finished","target_category":"cake","component_name":"Fromage blanc","component_order":3},
    {"target_name":"Entremet cake American Nutella","target_type":"semi_finished","target_category":"cake","component_name":"GANACHE CHOCOLAT","component_order":4},
    {"target_name":"Entremet cake American Nutella","target_type":"semi_finished","target_category":"cake","component_name":"Nutella","component_order":5},

    {"target_name":"Entremet cake American carotte","target_type":"semi_finished","target_category":"cake","component_name":"Biscuit cake Amr carotte","component_order":1},
    {"target_name":"Entremet cake American carotte","target_type":"semi_finished","target_category":"cake","component_name":"Crème au beurre","component_order":2},
    {"target_name":"Entremet cake American carotte","target_type":"semi_finished","target_category":"cake","component_name":"Fromage blanc","component_order":3},
    {"target_name":"Entremet cake American carotte","target_type":"semi_finished","target_category":"cake","component_name":"Crème fraîche","component_order":4},

    {"target_name":"entremet Ferrero","target_type":"finished","target_category":"cake","component_name":"Entremet cake American Ferrero","component_order":1},
    {"target_name":"entremet Ferrero","target_type":"finished","target_category":"cake","component_name":"Chocolat rochée noire","component_order":2},
    {"target_name":"entremet Ferrero","target_type":"finished","target_category":"cake","component_name":"GANACHE CHOCOLAT","component_order":3},
    {"target_name":"entremet Ferrero","target_type":"finished","target_category":"cake","component_name":"Crème au beurre","component_order":4},
    {"target_name":"entremet Ferrero","target_type":"finished","target_category":"cake","component_name":"Ferrero","component_order":5},

    {"target_name":"Cake AMR carotte","target_type":"finished","target_category":"cake","component_name":"Entremet cake American carotte","component_order":1},
    {"target_name":"Cake AMR carotte","target_type":"finished","target_category":"cake","component_name":"Crème au beurre","component_order":2},
    {"target_name":"Cake AMR carotte","target_type":"finished","target_category":"cake","component_name":"Biscuit cake Amr carotte","component_order":3}
  ]$links$::jsonb;
  v_supplier_id uuid;
  v_pavot_id uuid;
  missing_components text[];
  ambiguous_products text[];
  schema_record record;
  target_id uuid;
  component_ids uuid[];
  v_diagram_nodes jsonb;
  v_diagram_edges jsonb;
  v_recipe_id uuid;
begin
  insert into suppliers (name, is_active)
  values ('DIVERS', true)
  on conflict (name) do update set is_active = true
  returning id into v_supplier_id;

  if v_supplier_id is null then
    select id into v_supplier_id from suppliers where lower(trim(name)) = lower('DIVERS') limit 1;
  end if;

  insert into products (code, name, type, unit, is_active)
  select 'MP-' || upper(substr(md5('Pavot'), 1, 12)), 'Pavot', 'raw'::product_type, 'kg', true
  where not exists (
    select 1
    from products
    where type = 'raw'
      and lower(trim(name)) = lower('Pavot')
  )
  on conflict (code) do nothing;

  update products
  set unit = 'kg',
      is_active = true,
      updated_at = now()
  where type = 'raw'
    and lower(trim(name)) = lower('Pavot');

  select id into v_pavot_id
  from products
  where type = 'raw'
    and is_active = true
    and lower(trim(name)) = lower('Pavot')
  order by created_at
  limit 1;

  insert into supplier_raw_materials (supplier_id, product_id)
  select v_supplier_id, v_pavot_id
  where v_supplier_id is not null and v_pavot_id is not null
  on conflict (supplier_id, product_id) do nothing;

  update products
  set unit = input.unit,
      is_active = true,
      updated_at = now()
  from jsonb_to_recordset(v_products) as input(
    name text, product_type text, category text, official_code text, unit text
  )
  where products.type = input.product_type::product_type
    and products.category = input.category
    and lower(trim(products.name)) = lower(trim(input.name));

  insert into products (code, name, type, category, unit)
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
    input.unit
  from jsonb_to_recordset(v_products) as input(
    name text, product_type text, category text, official_code text, unit text
  )
  where not exists (
    select 1
    from products
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
      and products.is_active = true
    group by input.name, input.product_type, input.category
    having count(products.id) <> 1
  ) problems;

  if coalesce(array_length(ambiguous_products, 1), 0) > 0 then
    raise exception 'Missing or ambiguous updated products: %', ambiguous_products;
  end if;

  select array_agg(input.target_name || ' -> ' || input.component_name order by input.target_name, input.component_name)
  into missing_components
  from jsonb_to_recordset(v_links) as input(
    target_name text, target_type text, target_category text, component_name text, component_order integer
  )
  where not exists (
    select 1
    from products candidate
    where candidate.is_active = true
      and lower(trim(candidate.name)) = lower(trim(input.component_name))
      and (
        candidate.type = 'raw'
        or candidate.type = 'semi_finished'
      )
  );

  if coalesce(array_length(missing_components, 1), 0) > 0 then
    raise exception 'Missing updated recipe components: %', missing_components;
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
    where is_active = true
      and type = schema_record.target_type::product_type
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
        'Targeted biscuit and Cake Americain recipe update',
        v_diagram_nodes,
        v_diagram_edges,
        jsonb_build_object('x', 0, 'y', 0, 'zoom', 0.9)
      )
      returning id into v_recipe_id;
    else
      update recipes
      set notes = 'Targeted biscuit and Cake Americain recipe update',
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

  raise notice 'Updated % products, % recipes, % component links.',
    jsonb_array_length(v_products),
    (select count(*) from (
      select distinct target_name, target_type, target_category
      from jsonb_to_recordset(v_links) as input(
        target_name text, target_type text, target_category text, component_name text, component_order integer
      )
    ) schemas),
    jsonb_array_length(v_links);
end
$update$;

commit;

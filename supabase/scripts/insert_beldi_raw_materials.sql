with material_input(name, unit) as (
  values
    ('Acajou', 'kg'),
    ('Amande', 'kg'),
    ('Amande effilée', 'kg'),
    ('Amande hachée', 'kg'),
    ('Amande noire', 'kg'),
    ('Amande noire concassée', 'kg'),
    ('Arôme café', 'kg'),
    ('Arôme citron', 'kg'),
    ('Arôme orange', 'kg'),
    ('Arôme pistache', 'kg'),
    ('Beurre Bonna', 'kg'),
    ('Beurre spécial', 'kg'),
    ('Cannelle', 'kg'),
    ('Chocolat blanc', 'kg'),
    ('Colorant', 'kg'),
    ('Confiture', 'kg'),
    ('Confiture Zakia', 'kg'),
    ('Cornflower', 'kg'),
    ('Drops', 'kg'),
    ('Eau de fleur', 'L'),
    ('Eau florale', 'L'),
    ('Écorces d’orange', 'kg'),
    ('Farine', 'kg'),
    ('Fenouil', 'kg'),
    ('Feuilletine', 'kg'),
    ('Gala blanc', 'kg'),
    ('Gala noir', 'kg'),
    ('Gingembre', 'kg'),
    ('Glucose', 'kg'),
    ('Huile', 'L'),
    ('Huile végétale', 'L'),
    ('Kunafa', 'kg'),
    ('Lait', 'L'),
    ('Levure', 'kg'),
    ('Maïzena', 'kg'),
    ('Miel', 'kg'),
    ('Mélange de graines', 'kg'),
    ('Nappage', 'kg'),
    ('Nestlé caramel', 'kg'),
    ('Noisette', 'kg'),
    ('Noix', 'kg'),
    ('Noix hachée', 'kg'),
    ('Pistache', 'kg'),
    ('Pistache hachée', 'kg'),
    ('Pétales de fleurs', 'kg'),
    ('Poudre de coco', 'kg'),
    ('Sel', 'kg'),
    ('Sésame', 'kg'),
    ('Sésame blanc', 'kg'),
    ('Sucre glacé', 'kg'),
    ('Sucre semoule', 'kg'),
    ('Tournesol', 'kg'),
    ('Trablit café', 'kg'),
    ('Œufs', 'piece'),
    ('Vanille', 'kg')
),
beldi_supplier as (
  select id, name
  from suppliers
  where lower(trim(name)) = lower('BELDI')
  limit 1
),
inserted_products as (
  insert into products (code, name, type, unit)
  select
    'MP-BELDI-' || upper(substr(md5(material_input.name), 1, 12)),
    material_input.name,
    'raw'::product_type,
    material_input.unit
  from material_input
  where exists (select 1 from beldi_supplier)
    and not exists (
      select 1
      from products
      where type = 'raw'
        and lower(trim(products.name)) = lower(trim(material_input.name))
    )
  on conflict (code) do nothing
  returning id, name
),
existing_products as (
  select products.id, products.name
  from products
  join material_input on lower(trim(products.name)) = lower(trim(material_input.name))
  where products.type = 'raw'
),
all_beldi_material_products as (
  select id, name from existing_products
  union
  select id, name from inserted_products
),
existing_links as (
  select supplier_raw_materials.product_id
  from supplier_raw_materials
  join beldi_supplier on beldi_supplier.id = supplier_raw_materials.supplier_id
  join all_beldi_material_products on all_beldi_material_products.id = supplier_raw_materials.product_id
),
inserted_links as (
  insert into supplier_raw_materials (supplier_id, product_id)
  select beldi_supplier.id, all_beldi_material_products.id
  from beldi_supplier
  cross join all_beldi_material_products
  where not exists (
    select 1
    from existing_links
    where existing_links.product_id = all_beldi_material_products.id
  )
  on conflict (supplier_id, product_id) do nothing
  returning product_id
)
select
  case
    when exists (select 1 from beldi_supplier) then 'BELDI supplier found'
    else 'BELDI supplier not found'
  end as supplier_status,
  (select count(*) from material_input) as requested_raw_materials,
  (select count(*) from inserted_products) as newly_created_products,
  (select count(*) from inserted_links) as newly_linked_materials,
  ((select count(*) from existing_links) + (select count(*) from inserted_links)) as total_materials_linked_to_beldi;

-- Self-contained and safe to run more than once.
with material_input(name, unit) as (
  values
  ('Agar-agar', 'kg'),
  ('Amande', 'kg'),
  ('Amande effilée', 'kg'),
  ('Amande hachée', 'kg'),
  ('Amande noire', 'kg'),
  ('Amande poudre', 'kg'),
  ('Ananas', 'kg'),
  ('Ananas conserve', 'kg'),
  ('arachide', 'kg'),
  ('Arôme citron', 'kg'),
  ('Arôme pistache', 'kg'),
  ('Banane', 'kg'),
  ('Beurre', 'kg'),
  ('Beurre Bonna', 'kg'),
  ('Beurre de cacao', 'kg'),
  ('Beurre rigale', 'kg'),
  ('Beurre spécial', 'kg'),
  ('Bicarbonate', 'kg'),
  ('Bicarbonate de soude', 'kg'),
  ('Blanc d’œuf', 'piece'),
  ('Cannelle', 'kg'),
  ('Cerises Amarena', 'kg'),
  ('Chocolat au lait', 'kg'),
  ('Chocolat blanc', 'kg'),
  ('Chocolat blanc spécial', 'kg'),
  ('Chocolat caramel', 'kg'),
  ('Chocolat lait spécial', 'kg'),
  ('Chocolat noir', 'kg'),
  ('Chocolat noir spécial', 'kg'),
  ('Citron', 'kg'),
  ('Colorant', 'kg'),
  ('Colorant jaune', 'kg'),
  ('Colorant noir', 'kg'),
  ('Colorant rouge', 'kg'),
  ('Colorant vert', 'kg'),
  ('Confiture', 'kg'),
  ('conserve pèche', 'kg'),
  ('Crème fraîche', 'kg'),
  ('Danone perle', 'kg'),
  ('Dattes', 'kg'),
  ('Drops', 'kg'),
  ('Eau', 'L'),
  ('Ecorces d’orange', 'kg'),
  ('Extrait liquide café', 'kg'),
  ('Farine', 'kg'),
  ('Farine force', 'kg'),
  ('Farine viennoiserie', 'kg'),
  ('Ferrero', 'kg'),
  ('Feuilletine', 'kg'),
  ('Fondant', 'kg'),
  ('Framboise', 'kg'),
  ('Fromage blanc', 'kg'),
  ('Glucose', 'kg'),
  ('Gousse de vanille', 'kg'),
  ('Gélatine', 'kg'),
  ('Gélatine feuille', 'kg'),
  ('Huile', 'L'),
  ('Huile végétale', 'L'),
  ('Jaune d’œuf', 'piece'),
  ('Jus de citron', 'L'),
  ('Kitkat', 'kg'),
  ('Konafa', 'kg'),
  ('Lait', 'L'),
  ('Lait liquide', 'L'),
  ('Levure', 'kg'),
  ('Levure chimique', 'kg'),
  ('Mangue', 'kg'),
  ('Masse gélatine', 'kg'),
  ('Maïzena', 'kg'),
  ('Miel', 'kg'),
  ('Nappage', 'kg'),
  ('Nappage neutre', 'kg'),
  ('Nappage normal', 'kg'),
  ('Nestlé', 'kg'),
  ('Nkhaala', 'kg'),
  ('Noisette', 'kg'),
  ('Noix', 'kg'),
  ('Nutella', 'kg'),
  ('Pate noisette', 'kg'),
  ('Pate pistache', 'kg'),
  ('Pectine', 'kg'),
  ('Pectine NH', 'kg'),
  ('Philadelphia', 'kg'),
  ('Pistache', 'kg'),
  ('Pomme', 'kg'),
  ('Poudre cacao', 'kg'),
  ('Poudre pâtissière', 'kg'),
  ('Poudre vanille', 'kg'),
  ('Purée abricot', 'kg'),
  ('Purée ananas', 'kg'),
  ('Purée banane', 'kg'),
  ('Purée citron', 'kg'),
  ('Purée coco', 'kg'),
  ('Purée framboise', 'kg'),
  ('Purée fruit', 'kg'),
  ('Purée mangue', 'kg'),
  ('Purée myrtille', 'kg'),
  ('Purée passion', 'kg'),
  ('Raisins', 'kg'),
  ('Royal tine', 'kg'),
  ('Sel', 'kg'),
  ('Sucre cassonade', 'kg'),
  ('Sucre glace spécial', 'kg'),
  ('Sucre glacé', 'kg'),
  ('Sucre semoule', 'kg'),
  ('Trablit café', 'kg'),
  ('Trimoline', 'kg'),
  ('Vanille', 'kg'),
  ('Vanille poudre', 'kg'),
  ('Vermicelle noire', 'kg'),
  ('Vinaigre', 'kg'),
  ('Xanthane', 'kg'),
  ('Yaourt poudre', 'kg'),
  ('Œufs', 'piece')
),
inserted_supplier as (
  insert into suppliers (name, is_active)
  select 'DIVERS', true
  where not exists (select 1 from suppliers where lower(trim(name)) = lower('DIVERS'))
  returning id
),
divers_supplier as (
  select id from inserted_supplier
  union all
  select id from suppliers
  where lower(trim(name)) = lower('DIVERS')
    and not exists (select 1 from inserted_supplier)
  order by id
  limit 1
),
inserted_products as (
  insert into products (code, name, type, unit)
  select
    'MP-DIVERS-' || upper(substr(md5(input.name), 1, 12)),
    input.name,
    'raw'::product_type,
    input.unit
  from material_input input
  where not exists (
    select 1 from products
    where type = 'raw' and lower(trim(products.name)) = lower(trim(input.name))
  )
  on conflict (code) do nothing
  returning id, name
),
all_materials as (
  select inserted_products.id, inserted_products.name
  from inserted_products
  union all
  select products.id, products.name
  from products
  join material_input input on lower(trim(input.name)) = lower(trim(products.name))
  where products.type = 'raw' and products.is_active = true
    and not exists (
      select 1 from inserted_products
      where lower(trim(inserted_products.name)) = lower(trim(products.name))
    )
),
inserted_links as (
  insert into supplier_raw_materials (supplier_id, product_id)
  select divers_supplier.id, all_materials.id
  from divers_supplier cross join all_materials
  on conflict (supplier_id, product_id) do nothing
  returning product_id
)
select
  (select count(*) from material_input) as requested_raw_materials,
  (select count(*) from inserted_products) as newly_created_raw_materials,
  (select count(*) from inserted_links) as newly_linked_to_divers,
  (select count(*) from all_materials) as total_import_materials,
  (select jsonb_agg(jsonb_build_object('name', name, 'unit', unit) order by name) from material_input) as raw_materials;

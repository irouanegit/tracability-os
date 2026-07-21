-- Reviews raw-material split/duplicate groups per existing supplier.
-- Read-only. Run in Supabase SQL editor.

with raw_material_family(family, material_name, severity) as (
  values
    ('Amande family', 'Amande', 'high'),
    ('Amande family', 'Amande noire', 'high'),
    ('Amande family', 'Amande effilée', 'high'),
    ('Amande family', 'Amande hachée', 'high'),
    ('Amande family', 'Amande noire concassée', 'high'),
    ('Amande family', 'Amande poudre', 'high'),

    ('Huile family', 'Huile', 'high'),
    ('Huile family', 'Huile végétale', 'high'),

    ('Lait family', 'Lait', 'high'),
    ('Lait family', 'Lait liquide', 'high'),

    ('Nappage family', 'Nappage', 'high'),
    ('Nappage family', 'Nappage normal', 'high'),
    ('Nappage family', 'Nappage neutre', 'review'),
    ('Nappage family', 'Nappage simple', 'high'),

    ('Vanille family', 'Vanille', 'high'),
    ('Vanille family', 'Vanille poudre', 'high'),
    ('Vanille family', 'Poudre vanille', 'high'),
    ('Vanille family', 'Gousse de vanille', 'review'),

    ('Confiture family', 'Confiture', 'high'),
    ('Confiture family', 'Confiture Zakia', 'high'),

    ('Bicarbonate family', 'Bicarbonate', 'high'),
    ('Bicarbonate family', 'Bicarbonate de soude', 'high'),

    ('Noix family', 'Noix', 'high'),
    ('Noix family', 'Noix hachée', 'high'),

    ('Pistache family', 'Pistache', 'high'),
    ('Pistache family', 'Pistache hachée', 'high'),
    ('Pistache family', 'Pate pistache', 'review'),

    ('Sésame family', 'Sésame', 'high'),
    ('Sésame family', 'Sésame blanc', 'high'),

    ('Eau florale family', 'Eau de fleur', 'high'),
    ('Eau florale family', 'Eau florale', 'high'),

    ('Écorces orange spelling', 'Ecorces d’orange', 'high'),
    ('Écorces orange spelling', 'Écorces d’orange', 'high'),

    ('Beurre family', 'Beurre', 'review'),
    ('Beurre family', 'Beurre spécial', 'review'),
    ('Beurre family', 'Beurre Bonna', 'review'),
    ('Beurre family', 'Beurre rigale', 'review'),
    ('Beurre family', 'Beurre de cacao', 'review'),

    ('Farine family', 'Farine', 'review'),
    ('Farine family', 'Farine force', 'review'),
    ('Farine family', 'Farine viennoiserie', 'review'),

    ('Gélatine family', 'Gélatine', 'review'),
    ('Gélatine family', 'Gélatine poudre', 'review'),
    ('Gélatine family', 'Gélatine feuille', 'review'),
    ('Gélatine family', 'Masse gélatine', 'review'),

    ('Pectine family', 'Pectine', 'review'),
    ('Pectine family', 'Pectine NH', 'review'),

    ('Levure family', 'Levure', 'review'),
    ('Levure family', 'Levure ideal', 'review'),
    ('Levure family', 'Levure chimique', 'review')
),
supplier_materials as (
  select
    suppliers.id as supplier_id,
    suppliers.name as supplier_name,
    products.id as product_id,
    products.name as material_name,
    products.unit
  from suppliers
  join supplier_raw_materials on supplier_raw_materials.supplier_id = suppliers.id
  join products on products.id = supplier_raw_materials.product_id
  where suppliers.is_active = true
    and products.type = 'raw'
    and products.is_active = true
),
family_matches as (
  select
    supplier_materials.supplier_id,
    supplier_materials.supplier_name,
    raw_material_family.family,
    max(raw_material_family.severity) as severity,
    supplier_materials.product_id,
    supplier_materials.material_name,
    supplier_materials.unit
  from supplier_materials
  join raw_material_family
    on lower(trim(raw_material_family.material_name)) = lower(trim(supplier_materials.material_name))
  group by
    supplier_materials.supplier_id,
    supplier_materials.supplier_name,
    raw_material_family.family,
    supplier_materials.product_id,
    supplier_materials.material_name,
    supplier_materials.unit
),
duplicate_families as (
  select
    supplier_id,
    supplier_name,
    family,
    case when bool_or(severity = 'high') then 'high' else 'review' end as severity,
    count(distinct product_id) as variant_count,
    array_agg(distinct material_name order by material_name) as variants,
    array_agg(distinct unit order by unit) as units
  from family_matches
  group by supplier_id, supplier_name, family
  having count(distinct product_id) > 1
),
exact_name_duplicates as (
  select
    supplier_id,
    supplier_name,
    'Exact duplicate name' as family,
    'high' as severity,
    count(distinct product_id) as variant_count,
    array_agg(distinct material_name order by material_name) as variants,
    array_agg(distinct unit order by unit) as units
  from supplier_materials
  group by supplier_id, supplier_name, lower(trim(material_name))
  having count(distinct product_id) > 1
)
select *
from duplicate_families
union all
select *
from exact_name_duplicates
order by supplier_name, severity, family;

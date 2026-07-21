-- Comprehensive raw-material duplicate/split review.
-- Read-only. Run in Supabase SQL editor.
--
-- This extracts:
-- 1. Active raw products with the same normalized name.
-- 2. Same normalized material linked to multiple suppliers.
-- 3. Same normalized material using multiple units.
-- 4. Possible split families based on shared first material word.
--
-- Notes:
-- - Cross-supplier rows are not automatically wrong. They mean the same material
--   name is available from multiple suppliers, or duplicate product rows exist.
-- - Use recipe_targets to see which product blueprints are impacted.
-- - Do not merge/delete from this report directly; decide canonical material and
--   preferred supplier first.

with raw_products as (
  select
    p.id,
    p.code,
    p.name,
    p.unit,
    p.is_active,
    regexp_replace(
      regexp_replace(
        translate(
          lower(trim(p.name)),
          'àáâãäåāçćčèéêëēėęîïíīįìñôöòóœøōõùúûüūÿýžźż’''`´',
          'aaaaaaaccceeeeeeeiiiiinoooooooouuuuuyyzzz     '
        ),
        '[^a-z0-9]+',
        ' ',
        'g'
      ),
      '\s+',
      ' ',
      'g'
    ) as norm_name
  from products p
  where p.type = 'raw'
    and p.is_active = true
),
raw_with_keys as (
  select
    raw_products.*,
    replace(raw_products.norm_name, ' ', '') as compact_name,
    split_part(raw_products.norm_name, ' ', 1) as root_word
  from raw_products
),
supplier_links as (
  select
    r.id as product_id,
    coalesce(
      jsonb_agg(
        distinct jsonb_build_object(
          'supplier_id', s.id,
          'supplier_name', s.name
        )
      ) filter (where s.id is not null),
      '[]'::jsonb
    ) as suppliers,
    count(distinct s.id) filter (where s.id is not null) as supplier_count
  from raw_with_keys r
  left join supplier_raw_materials srm on srm.product_id = r.id
  left join suppliers s on s.id = srm.supplier_id and s.is_active = true
  group by r.id
),
recipe_usage as (
  select
    r.id as product_id,
    coalesce(
      jsonb_agg(
        distinct jsonb_build_object(
          'recipe_product_id', target.id,
          'recipe_product_name', target.name,
          'recipe_product_type', target.type,
          'recipe_category', target.category
        )
      ) filter (where target.id is not null),
      '[]'::jsonb
    ) as recipe_targets,
    count(distinct target.id) filter (where target.id is not null) as recipe_target_count
  from raw_with_keys r
  left join recipe_components rc on rc.component_product_id = r.id
  left join recipes recipe on recipe.id = rc.recipe_id and recipe.is_active = true
  left join products target on target.id = recipe.product_id and target.is_active = true
  group by r.id
),
material_rows as (
  select
    r.id,
    r.code,
    r.name,
    r.unit,
    r.norm_name,
    r.compact_name,
    r.root_word,
    sl.suppliers,
    sl.supplier_count,
    ru.recipe_targets,
    ru.recipe_target_count
  from raw_with_keys r
  join supplier_links sl on sl.product_id = r.id
  join recipe_usage ru on ru.product_id = r.id
),
exact_name_products as (
  select
    '01_exact_same_material_name_multiple_product_rows' as section,
    'high' as severity,
    norm_name as duplicate_key,
    count(distinct id) as product_count,
    count(distinct unit) as unit_count,
    sum(supplier_count)::int as supplier_link_count,
    sum(recipe_target_count)::int as recipe_target_count,
    jsonb_agg(
      jsonb_build_object(
        'product_id', id,
        'code', code,
        'name', name,
        'unit', unit,
        'suppliers', suppliers,
        'recipe_targets', recipe_targets
      )
      order by name, code
    ) as details,
    'Same normalized raw-material name has multiple active product rows. Usually merge these product IDs after choosing the correct unit and supplier links.' as recommendation
  from material_rows
  group by norm_name
  having count(distinct id) > 1
),
cross_supplier_same_name as (
  select
    '02_same_material_name_linked_to_multiple_suppliers' as section,
    'review' as severity,
    norm_name as duplicate_key,
    count(distinct id) as product_count,
    count(distinct unit) as unit_count,
    count(distinct (supplier_item->>'supplier_id')) as supplier_link_count,
    sum(recipe_target_count)::int as recipe_target_count,
    jsonb_agg(
      distinct jsonb_build_object(
        'product_id', id,
        'code', code,
        'name', name,
        'unit', unit,
        'suppliers', suppliers,
        'recipe_targets', recipe_targets
      )
    ) as details,
    'Same material name appears under more than one supplier. Keep only if the material is genuinely purchased from all listed suppliers; otherwise detach wrong supplier links or remap affected recipes/lots.' as recommendation
  from material_rows
  cross join lateral jsonb_array_elements(material_rows.suppliers) supplier_item
  group by norm_name
  having count(distinct (supplier_item->>'supplier_id')) > 1
),
same_name_different_unit as (
  select
    '03_same_material_name_different_units' as section,
    'high' as severity,
    norm_name as duplicate_key,
    count(distinct id) as product_count,
    count(distinct unit) as unit_count,
    sum(supplier_count)::int as supplier_link_count,
    sum(recipe_target_count)::int as recipe_target_count,
    jsonb_agg(
      jsonb_build_object(
        'product_id', id,
        'code', code,
        'name', name,
        'unit', unit,
        'suppliers', suppliers,
        'recipe_targets', recipe_targets
      )
      order by name, unit
    ) as details,
    'Same material name exists with different units. Review before any merge because quantities/lots may need conversion.' as recommendation
  from material_rows
  group by norm_name
  having count(distinct unit) > 1
),
compact_spelling_variants as (
  select
    '04_spacing_punctuation_accent_variants' as section,
    'review' as severity,
    compact_name as duplicate_key,
    count(distinct id) as product_count,
    count(distinct unit) as unit_count,
    sum(supplier_count)::int as supplier_link_count,
    sum(recipe_target_count)::int as recipe_target_count,
    jsonb_agg(
      jsonb_build_object(
        'product_id', id,
        'code', code,
        'name', name,
        'unit', unit,
        'suppliers', suppliers,
        'recipe_targets', recipe_targets
      )
      order by name, unit
    ) as details,
    'Names collapse to the same spelling after removing spaces/punctuation/accents. Review for typo-style duplicates.' as recommendation
  from material_rows
  group by compact_name
  having count(distinct norm_name) > 1
),
family_variants_by_supplier as (
  select
    '05_possible_split_family_inside_supplier' as section,
    'review' as severity,
    concat(supplier_item->>'supplier_name', ' / ', root_word) as duplicate_key,
    count(distinct id) as product_count,
    count(distinct unit) as unit_count,
    count(distinct (supplier_item->>'supplier_id')) as supplier_link_count,
    sum(recipe_target_count)::int as recipe_target_count,
    jsonb_agg(
      distinct jsonb_build_object(
        'product_id', id,
        'code', code,
        'name', name,
        'unit', unit,
        'supplier', supplier_item->>'supplier_name',
        'recipe_targets', recipe_targets
      )
    ) as details,
    'Multiple raw materials share the same first word for this supplier. This catches families like amande/noix/pistache/nappage, but also valid distinct products. Review manually.' as recommendation
  from material_rows
  cross join lateral jsonb_array_elements(material_rows.suppliers) supplier_item
  where length(root_word) >= 4
    and root_word not in (
      'eau',
      'lait',
      'jus'
    )
  group by supplier_item->>'supplier_name', root_word
  having count(distinct id) > 1
),
family_variants_global as (
  select
    '06_possible_split_family_global' as section,
    'review' as severity,
    root_word as duplicate_key,
    count(distinct id) as product_count,
    count(distinct unit) as unit_count,
    sum(supplier_count)::int as supplier_link_count,
    sum(recipe_target_count)::int as recipe_target_count,
    jsonb_agg(
      jsonb_build_object(
        'product_id', id,
        'code', code,
        'name', name,
        'unit', unit,
        'suppliers', suppliers,
        'recipe_targets', recipe_targets
      )
      order by name, unit
    ) as details,
    'Global family candidate by first word. Use this as a hunting list, not an automatic merge list.' as recommendation
  from material_rows
  where length(root_word) >= 4
    and root_word not in (
      'eau',
      'lait',
      'jus'
    )
  group by root_word
  having count(distinct id) > 1
)
select *
from exact_name_products
union all
select *
from cross_supplier_same_name
union all
select *
from same_name_different_unit
union all
select *
from compact_spelling_variants
union all
select *
from family_variants_by_supplier
union all
select *
from family_variants_global
order by
  section,
  severity,
  duplicate_key;

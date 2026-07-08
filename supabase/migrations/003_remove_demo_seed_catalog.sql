delete from recipe_components rc
using recipes r
join products rp on rp.id = r.product_id
where rc.recipe_id = r.id
  and rp.code in ('SF-PFER', 'SF-BGTR-PATE', 'PF-BGTR')
  and not exists (
    select 1 from production_batches pb where pb.product_id = rp.id
  );

delete from recipe_components rc
using products cp
where rc.component_product_id = cp.id
  and cp.code in (
    'MP-FAR-T65',
    'MP-EAU',
    'MP-LEV',
    'MP-BTR',
    'MP-SEL',
    'SF-PFER',
    'SF-BGTR-PATE',
    'SF-CRPAT',
    'PF-BGTR',
    'PF-CRPB'
  )
  and not exists (
    select 1 from production_consumptions pc
    join lots l on l.id = pc.consumed_lot_id
    where l.product_id = cp.id
  );

delete from recipes r
using products p
where r.product_id = p.id
  and p.code in ('SF-PFER', 'SF-BGTR-PATE', 'PF-BGTR')
  and r.notes = 'Recette initiale prototype'
  and not exists (
    select 1 from production_batches pb where pb.product_id = p.id
  );

delete from products p
where p.code in (
    'MP-FAR-T65',
    'MP-EAU',
    'MP-LEV',
    'MP-BTR',
    'MP-SEL',
    'SF-PFER',
    'SF-BGTR-PATE',
    'SF-CRPAT',
    'PF-BGTR',
    'PF-CRPB'
  )
  and not exists (select 1 from lots l where l.product_id = p.id)
  and not exists (select 1 from raw_material_receptions r where r.product_id = p.id)
  and not exists (select 1 from production_batches pb where pb.product_id = p.id)
  and not exists (select 1 from recipe_components rc where rc.component_product_id = p.id);

delete from suppliers s
where s.name in ('Grands Moulins', 'Laiterie Centrale', 'BioYeast', 'Salines Pro')
  and not exists (select 1 from lots l where l.supplier_id = s.id)
  and not exists (select 1 from raw_material_receptions r where r.supplier_id = s.id);

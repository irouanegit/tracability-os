-- ==============================================================================
-- 09_update_cacahuete_recipe_and_schemas.sql
-- Fiche Technique & Schéma de Fabrication pour : Produit Cacahuète (Trompe l'œil)
-- ==============================================================================

begin;

do $cacahuete_recipe$
declare
  v_prod_cacahuete_id uuid;
  v_mousse_blanc_id uuid;
  v_caramel_sale_id uuid;
  v_biscuit_joconde_id uuid;
  v_pistolet_caramel_id uuid;
  v_praline_cacahuete_id uuid;

  -- Raw materials IDs
  v_lait_id uuid;
  v_creme_fraiche_id uuid;
  v_jaune_oeuf_id uuid;
  v_gousse_vanille_id uuid;
  v_sucre_semoule_id uuid;
  v_chocolat_blanc_id uuid;
  v_gelatine_id uuid;
  v_beurre_special_id uuid;
  v_sel_id uuid;
  v_pectine_nh_id uuid;
  v_glucose_id uuid;
  v_arachide_id uuid;
  v_huile_id uuid;
  v_chocolat_caramel_id uuid;
  v_beurre_cacao_id uuid;

  v_recipe_id uuid;
begin
  -- 1. Get or Create Raw Materials
  -- ----------------------------------------------------------------------------
  select id into v_lait_id from products where type = 'raw' and lower(name) in ('lait') limit 1;
  select id into v_creme_fraiche_id from products where type = 'raw' and lower(name) in ('crème fraîche', 'creme fraiche') limit 1;
  select id into v_jaune_oeuf_id from products where type = 'raw' and lower(name) in ('jaune d''œuf', 'jaune d''oeuf', 'jaune doeuf') limit 1;
  select id into v_gousse_vanille_id from products where type = 'raw' and lower(name) in ('gousse de vanille', 'gousse vanille') limit 1;
  select id into v_sucre_semoule_id from products where type = 'raw' and lower(name) in ('sucre semoule') limit 1;
  select id into v_chocolat_blanc_id from products where type = 'raw' and lower(name) in ('chocolat blanc callebaut', 'chocolat blanc') limit 1;
  select id into v_gelatine_id from products where type = 'raw' and lower(name) in ('masse gélatine', 'masse gelatine', 'gélatine feuille', 'gélatine poudre') limit 1;
  select id into v_beurre_special_id from products where type = 'raw' and lower(name) in ('beurre spécial', 'beurre special', 'beurre bonna', 'beurre') limit 1;
  select id into v_sel_id from products where type = 'raw' and lower(name) in ('sel') limit 1;
  select id into v_pectine_nh_id from products where type = 'raw' and lower(name) in ('pectine nh', 'pectine') limit 1;
  select id into v_glucose_id from products where type = 'raw' and lower(name) in ('glucose') limit 1;
  select id into v_arachide_id from products where type = 'raw' and lower(name) in ('arachide', 'cacahuète', 'cacahuete') limit 1;
  select id into v_huile_id from products where type = 'raw' and lower(name) in ('huile') limit 1;
  select id into v_chocolat_caramel_id from products where type = 'raw' and lower(name) in ('chocolat caramel') limit 1;
  select id into v_beurre_cacao_id from products where type = 'raw' and lower(name) in ('beurre de cacao', 'beurre cacao') limit 1;

  -- Ensure missing raw materials are inserted safely if not found
  if v_lait_id is null then
    insert into products (code, name, type, unit, is_active) values ('MP-LAIT', 'Lait', 'raw', 'L', true) returning id into v_lait_id;
  end if;
  if v_creme_fraiche_id is null then
    insert into products (code, name, type, unit, is_active) values ('MP-CF', 'Crème fraîche', 'raw', 'kg', true) returning id into v_creme_fraiche_id;
  end if;
  if v_jaune_oeuf_id is null then
    insert into products (code, name, type, unit, is_active) values ('MP-JO', 'Jaune d''œuf', 'raw', 'kg', true) returning id into v_jaune_oeuf_id;
  end if;
  if v_gousse_vanille_id is null then
    insert into products (code, name, type, unit, is_active) values ('MP-GV', 'Gousse de vanille', 'raw', 'kg', true) returning id into v_gousse_vanille_id;
  end if;
  if v_sucre_semoule_id is null then
    insert into products (code, name, type, unit, is_active) values ('MP-SS', 'Sucre semoule', 'raw', 'kg', true) returning id into v_sucre_semoule_id;
  end if;
  if v_chocolat_blanc_id is null then
    insert into products (code, name, type, unit, is_active) values ('MP-CBC', 'Chocolat blanc Callebaut', 'raw', 'kg', true) returning id into v_chocolat_blanc_id;
  end if;
  if v_gelatine_id is null then
    insert into products (code, name, type, unit, is_active) values ('MP-MG', 'Masse gélatine', 'raw', 'kg', true) returning id into v_gelatine_id;
  end if;
  if v_beurre_special_id is null then
    insert into products (code, name, type, unit, is_active) values ('MP-BS', 'Beurre spécial', 'raw', 'kg', true) returning id into v_beurre_special_id;
  end if;
  if v_sel_id is null then
    insert into products (code, name, type, unit, is_active) values ('MP-SEL', 'Sel', 'raw', 'kg', true) returning id into v_sel_id;
  end if;
  if v_pectine_nh_id is null then
    insert into products (code, name, type, unit, is_active) values ('MP-PNH', 'Pectine NH', 'raw', 'kg', true) returning id into v_pectine_nh_id;
  end if;
  if v_glucose_id is null then
    insert into products (code, name, type, unit, is_active) values ('MP-GLU', 'Glucose', 'raw', 'kg', true) returning id into v_glucose_id;
  end if;
  if v_arachide_id is null then
    insert into products (code, name, type, unit, is_active) values ('MP-ARACH', 'Arachide', 'raw', 'kg', true) returning id into v_arachide_id;
  end if;
  if v_huile_id is null then
    insert into products (code, name, type, unit, is_active) values ('MP-HUILE', 'Huile', 'raw', 'L', true) returning id into v_huile_id;
  end if;
  if v_chocolat_caramel_id is null then
    insert into products (code, name, type, unit, is_active) values ('MP-CHCAR', 'Chocolat caramel', 'raw', 'kg', true) returning id into v_chocolat_caramel_id;
  end if;
  if v_beurre_cacao_id is null then
    insert into products (code, name, type, unit, is_active) values ('MP-BCAC', 'Beurre de cacao', 'raw', 'kg', true) returning id into v_beurre_cacao_id;
  end if;


  -- 2. Semi-Finished Products
  -- ----------------------------------------------------------------------------
  -- Mousse blanc
  select id into v_mousse_blanc_id from products where type = 'semi_finished' and lower(name) in ('mousse blanc', 'mousse blanche') limit 1;
  if v_mousse_blanc_id is null then
    insert into products (code, name, type, category, unit, is_active)
    values ('MB', 'Mousse BLANC', 'semi_finished', 'patisserie', 'kg', true)
    returning id into v_mousse_blanc_id;
  end if;

  -- Caramel au beurre salé
  select id into v_caramel_sale_id from products where type = 'semi_finished' and lower(name) in ('caramel au beurre salé', 'caramel au beurre sale', 'caramel beurre sale') limit 1;
  if v_caramel_sale_id is null then
    insert into products (code, name, type, category, unit, is_active)
    values ('CBS', 'Caramel au beurre salé', 'semi_finished', 'patisserie', 'kg', true)
    returning id into v_caramel_sale_id;
  end if;

  -- Praliné cacahuète / Praline arachide
  select id into v_praline_cacahuete_id from products where type = 'semi_finished' and lower(name) in ('praliné cacahuète', 'praline cacahuete', 'praline arachide', 'praliné arachide') limit 1;
  if v_praline_cacahuete_id is null then
    insert into products (code, name, type, category, unit, is_active)
    values ('PRAR', 'Praline arachide', 'semi_finished', 'patisserie', 'kg', true)
    returning id into v_praline_cacahuete_id;
  end if;

  -- Biscuit Joconde blanc
  select id into v_biscuit_joconde_id from products where type = 'semi_finished' and lower(name) in ('biscuit joconde blanc') limit 1;
  if v_biscuit_joconde_id is null then
    insert into products (code, name, type, category, unit, is_active)
    values ('BJB', 'Biscuit Joconde blanc', 'semi_finished', 'patisserie', 'kg', true)
    returning id into v_biscuit_joconde_id;
  end if;

  -- Pistolet caramel
  select id into v_pistolet_caramel_id from products where type = 'semi_finished' and lower(name) in ('pistolet caramel', 'pistolet caramele') limit 1;
  if v_pistolet_caramel_id is null then
    insert into products (code, name, type, category, unit, is_active)
    values ('PCR', 'Pistolet caramel', 'semi_finished', 'patisserie', 'kg', true)
    returning id into v_pistolet_caramel_id;
  end if;


  -- 3. Finished Product: Cacahuète / Trompe l'œil cacahuète
  -- ----------------------------------------------------------------------------
  select id into v_prod_cacahuete_id from products where type = 'finished' and lower(name) in ('cacahuète', 'cacahuete', 'trompe l’œil cacahuète', 'trompe l''oeil cacahuete') limit 1;
  if v_prod_cacahuete_id is null then
    insert into products (code, name, type, category, unit, is_active)
    values ('42', 'Cacahuète', 'finished', 'patisserie', 'unites', true)
    returning id into v_prod_cacahuete_id;
  else
    update products set category = 'patisserie', unit = 'unites', is_active = true where id = v_prod_cacahuete_id;
  end if;


  -- 4. Recipes and Recipe Components
  -- ----------------------------------------------------------------------------

  -- (A) Recipe for Praliné cacahuète (Arachide: 5 kg, Huile: 0.2 kg)
  insert into recipes (product_id, version, is_active, notes)
  values (v_praline_cacahuete_id, coalesce((select max(version) from recipes where product_id = v_praline_cacahuete_id), 0) + 1, true, 'Recette Praliné Cacahuète')
  returning id into v_recipe_id;
  update recipes set is_active = false where product_id = v_praline_cacahuete_id and id <> v_recipe_id;
  delete from recipe_components where recipe_id = v_recipe_id;
  insert into recipe_components (recipe_id, component_product_id, quantity, unit) values
    (v_recipe_id, v_arachide_id, 5.0, 'kg'),
    (v_recipe_id, v_huile_id, 0.2, 'kg');

  -- (B) Recipe for Mousse blanc (Tournée 9.515 kg / 43g par pièce)
  insert into recipes (product_id, version, is_active, notes)
  values (v_mousse_blanc_id, coalesce((select max(version) from recipes where product_id = v_mousse_blanc_id), 0) + 1, true, 'Recette Mousse blanc')
  returning id into v_recipe_id;
  update recipes set is_active = false where product_id = v_mousse_blanc_id and id <> v_recipe_id;
  delete from recipe_components where recipe_id = v_recipe_id;
  insert into recipe_components (recipe_id, component_product_id, quantity, unit) values
    (v_recipe_id, v_lait_id, 0.750, 'kg'),
    (v_recipe_id, v_creme_fraiche_id, 3.650, 'kg'), -- 650g + 3000g
    (v_recipe_id, v_jaune_oeuf_id, 0.550, 'kg'),
    (v_recipe_id, v_gousse_vanille_id, 0.015, 'kg'),
    (v_recipe_id, v_sucre_semoule_id, 0.300, 'kg'),
    (v_recipe_id, v_chocolat_blanc_id, 1.750, 'kg'),
    (v_recipe_id, v_gelatine_id, 0.500, 'kg');

  -- (C) Recipe for Caramel au beurre salé (Tournée 4.965 kg / 52g par pièce)
  insert into recipes (product_id, version, is_active, notes)
  values (v_caramel_sale_id, coalesce((select max(version) from recipes where product_id = v_caramel_sale_id), 0) + 1, true, 'Recette Caramel au beurre salé')
  returning id into v_recipe_id;
  update recipes set is_active = false where product_id = v_caramel_sale_id and id <> v_recipe_id;
  delete from recipe_components where recipe_id = v_recipe_id;
  insert into recipe_components (recipe_id, component_product_id, quantity, unit) values
    (v_recipe_id, v_gousse_vanille_id, 0.015, 'kg'),
    (v_recipe_id, v_beurre_special_id, 0.570, 'kg'),
    (v_recipe_id, v_sel_id, 0.018, 'kg'),
    (v_recipe_id, v_creme_fraiche_id, 1.890, 'kg'),
    (v_recipe_id, v_pectine_nh_id, 0.012, 'kg'),
    (v_recipe_id, v_glucose_id, 0.060, 'kg'),
    (v_recipe_id, v_sucre_semoule_id, 1.200, 'kg'),
    (v_recipe_id, v_praline_cacahuete_id, 1.000, 'kg');

  -- (D) Recipe for Pistolet caramel (Tournée 0.900 kg / 27g par pièce)
  insert into recipes (product_id, version, is_active, notes)
  values (v_pistolet_caramel_id, coalesce((select max(version) from recipes where product_id = v_pistolet_caramel_id), 0) + 1, true, 'Recette Pistolet caramel')
  returning id into v_recipe_id;
  update recipes set is_active = false where product_id = v_pistolet_caramel_id and id <> v_recipe_id;
  delete from recipe_components where recipe_id = v_recipe_id;
  insert into recipe_components (recipe_id, component_product_id, quantity, unit) values
    (v_recipe_id, v_chocolat_caramel_id, 0.500, 'kg'),
    (v_recipe_id, v_beurre_cacao_id, 0.400, 'kg');

  -- (E) Recipe for Finished Product: Cacahuète
  -- 4 Semi-fini components with exact usage per unit:
  -- - Mousse blanc : 0.043 kg (43g)
  -- - Caramel au beurre salé : 0.052 kg (52g)
  -- - Biscuit Joconde blanc : 0.005 kg (5g)
  -- - Pistolet caramel : 0.027 kg (27g)
  insert into recipes (product_id, version, is_active, notes)
  values (v_prod_cacahuete_id, coalesce((select max(version) from recipes where product_id = v_prod_cacahuete_id), 0) + 1, true, 'Assemblage Cacahuète (Poids unitaire : 127g)')
  returning id into v_recipe_id;
  update recipes set is_active = false where product_id = v_prod_cacahuete_id and id <> v_recipe_id;
  delete from recipe_components where recipe_id = v_recipe_id;
  insert into recipe_components (recipe_id, component_product_id, quantity, unit) values
    (v_recipe_id, v_mousse_blanc_id, 0.043, 'kg'),
    (v_recipe_id, v_caramel_sale_id, 0.052, 'kg'),
    (v_recipe_id, v_biscuit_joconde_id, 0.005, 'kg'),
    (v_recipe_id, v_pistolet_caramel_id, 0.027, 'kg');

  raise notice 'Configuration Cacahuète terminée avec succès.';
end
$cacahuete_recipe$;

commit;

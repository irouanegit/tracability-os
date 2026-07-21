-- Controlled destructive reset for traceability business data only.
-- Keeps schema, functions, views, policies, enum types, and Supabase Auth intact.
-- Run this before the clean import scripts when you want a fresh dataset.

begin;

truncate table
  production_consumptions,
  production_batches,
  raw_material_receptions,
  reception_batches,
  supplier_raw_materials,
  recipe_components,
  recipes,
  lots,
  suppliers,
  products
restart identity cascade;

alter sequence if exists raw_material_lot_sequence restart with 1024;
alter sequence if exists reception_batch_sequence restart with 1001;

commit;

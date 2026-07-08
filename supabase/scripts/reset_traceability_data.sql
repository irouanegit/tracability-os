-- Destructive reset for the traceability app data only.
-- Keeps database schema, views, functions, policies, auth users, and storage intact.
-- Run this in the Supabase SQL editor only when you want a completely fresh app dataset.

begin;

truncate table
  production_consumptions,
  production_batches,
  recipe_components,
  recipes,
  lots,
  raw_material_receptions,
  reception_batches,
  supplier_raw_materials,
  suppliers,
  products
restart identity cascade;

alter sequence if exists raw_material_lot_sequence restart with 1024;
alter sequence if exists reception_batch_sequence restart with 1001;

commit;

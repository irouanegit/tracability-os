-- Destructive schema reset for the traceability app.
-- This drops app tables, views, functions, policies, sequences, and enum types.
-- It keeps Supabase Auth users, storage, and Supabase-managed schemas intact.
-- After running this, rerun migrations 001 through 011 in order.

begin;

drop view if exists
  production_consumption_details,
  production_batch_history,
  reception_batch_lines,
  reception_batch_history,
  supplier_raw_material_catalog,
  product_lot_stock,
  product_schema_components,
  recent_raw_material_receptions,
  product_catalog
cascade;

drop function if exists create_production_with_traceability(timestamptz, uuid, text, text, text, text, uuid[]) cascade;
drop function if exists update_raw_material_reception_batch(uuid, uuid[], uuid, timestamptz, text, jsonb) cascade;
drop function if exists create_raw_material_reception_batch(uuid, timestamptz, text, jsonb) cascade;
drop function if exists save_product_schema(uuid, uuid[], jsonb, jsonb, jsonb) cascade;
drop function if exists save_product_schema(uuid, uuid[]) cascade;
drop function if exists create_raw_material_reception(
  timestamptz,
  uuid,
  uuid,
  text,
  numeric,
  text,
  date,
  numeric,
  quality_status,
  quality_status,
  text,
  text,
  text
) cascade;
drop function if exists enforce_supplier_raw_material_product_type() cascade;

drop table if exists
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
cascade;

drop sequence if exists reception_batch_sequence cascade;
drop sequence if exists raw_material_lot_sequence cascade;

drop type if exists lot_status cascade;
drop type if exists quality_status cascade;
drop type if exists recipe_status cascade;
drop type if exists product_type cascade;

commit;

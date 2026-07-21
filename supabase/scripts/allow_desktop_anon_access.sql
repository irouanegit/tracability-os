-- Allow the current desktop app to sync with Supabase using the public anon key.
--
-- Run this after the hardening script if the app does not yet perform a real
-- Supabase Auth sign-in. The UI user badge is local app state; without Auth,
-- Supabase receives requests as the `anon` role.

grant usage on schema public to anon;

grant select, insert, update on public.products to anon;
grant select, insert, update on public.suppliers to anon;
grant select, insert, update on public.lots to anon;
grant select, insert, update on public.raw_material_receptions to anon;
grant select, insert, update on public.production_batches to anon;
grant select, insert, update on public.production_consumptions to anon;
grant select on public.recipes to anon;
grant select on public.recipe_components to anon;

do $$
begin
  if to_regclass('public.supplier_raw_materials') is not null then
    grant select, insert, update, delete on public.supplier_raw_materials to anon;
  end if;

  if to_regclass('public.reception_batches') is not null then
    grant select, insert, update on public.reception_batches to anon;
  end if;
end $$;

do $$
declare
  relation_name text;
begin
  foreach relation_name in array array[
    'product_catalog',
    'recent_raw_material_receptions',
    'product_schema_components',
    'product_lot_stock',
    'supplier_raw_material_catalog',
    'reception_batch_history',
    'reception_batch_lines',
    'production_batch_history',
    'production_consumption_details'
  ]
  loop
    if to_regclass('public.' || relation_name) is not null then
      execute format('grant select on public.%I to anon', relation_name);
    end if;
  end loop;
end $$;

do $$
declare
  sequence_name text;
begin
  foreach sequence_name in array array[
    'raw_material_lot_sequence',
    'reception_batch_sequence'
  ]
  loop
    if to_regclass('public.' || sequence_name) is not null then
      execute format('grant usage, select on sequence public.%I to anon', sequence_name);
    end if;
  end loop;
end $$;

do $$
begin
  create policy "desktop_anon_products_read_write" on public.products
    for all to anon using (true) with check (true);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "desktop_anon_suppliers_read_write" on public.suppliers
    for all to anon using (true) with check (true);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "desktop_anon_recipes_read" on public.recipes
    for select to anon using (true);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "desktop_anon_recipe_components_read" on public.recipe_components
    for select to anon using (true);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "desktop_anon_lots_read_write" on public.lots
    for all to anon using (true) with check (true);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "desktop_anon_receptions_read_write" on public.raw_material_receptions
    for all to anon using (true) with check (true);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "desktop_anon_production_batches_read_write" on public.production_batches
    for all to anon using (true) with check (true);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "desktop_anon_production_consumptions_read_write" on public.production_consumptions
    for all to anon using (true) with check (true);
exception when duplicate_object then null;
end $$;

do $$
begin
  if to_regclass('public.supplier_raw_materials') is not null then
    create policy "desktop_anon_supplier_raw_materials_read_write" on public.supplier_raw_materials
      for all to anon using (true) with check (true);
  end if;
exception when duplicate_object then null;
end $$;

do $$
begin
  if to_regclass('public.reception_batches') is not null then
    create policy "desktop_anon_reception_batches_read_write" on public.reception_batches
      for all to anon using (true) with check (true);
  end if;
exception when duplicate_object then null;
end $$;

do $$
begin
  grant execute on function public.create_raw_material_reception(
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
  ) to anon;
exception when undefined_function then null;
end $$;

do $$
begin
  grant execute on function public.save_product_schema(uuid, uuid[], jsonb, jsonb, jsonb) to anon;
exception when undefined_function then null;
end $$;

do $$
begin
  grant execute on function public.create_raw_material_reception_batch(uuid, timestamptz, text, jsonb) to anon;
exception when undefined_function then null;
end $$;

do $$
begin
  grant execute on function public.update_raw_material_reception_batch(uuid, uuid[], uuid, timestamptz, text, jsonb) to anon;
exception when undefined_function then null;
end $$;

do $$
begin
  grant execute on function public.create_production_with_traceability(timestamptz, uuid, text, text, text, text, uuid[]) to anon;
exception when undefined_function then null;
end $$;

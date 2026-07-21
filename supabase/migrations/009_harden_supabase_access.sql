-- Harden prototype access: the desktop app now requires Supabase Auth.
-- The public anon key may still be used to sign in, but it must not read or
-- mutate bakery traceability data directly.

do $$ begin
  if to_regclass('public.products') is null then
    raise exception 'Traceability base schema is missing. Run migrations 001 through 008 before 009_harden_supabase_access.sql.';
  end if;
end $$;

revoke all on schema public from anon;
revoke all privileges on all tables in schema public from anon;
revoke all privileges on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon;

grant usage on schema public to authenticated;

drop policy if exists "prototype_products_read_write" on products;
drop policy if exists "prototype_suppliers_read_write" on suppliers;
drop policy if exists "prototype_recipes_read" on recipes;
drop policy if exists "prototype_recipe_components_read" on recipe_components;
drop policy if exists "prototype_lots_read_write" on lots;
drop policy if exists "prototype_receptions_read_write" on raw_material_receptions;
drop policy if exists "prototype_batches_read_write" on production_batches;
drop policy if exists "prototype_consumptions_read_write" on production_consumptions;

do $$ begin
  if to_regclass('public.supplier_raw_materials') is not null then
    drop policy if exists "prototype_supplier_raw_materials_read_write" on supplier_raw_materials;
  end if;

  if to_regclass('public.reception_batches') is not null then
    drop policy if exists "prototype_reception_batches_read_write" on reception_batches;
  end if;
end $$;

do $$ begin
  create policy "authenticated_products_read_write" on products
    for all to authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "authenticated_suppliers_read_write" on suppliers
    for all to authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "authenticated_recipes_read" on recipes
    for select to authenticated using (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "authenticated_recipe_components_read" on recipe_components
    for select to authenticated using (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "authenticated_lots_read_write" on lots
    for all to authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "authenticated_receptions_read_write" on raw_material_receptions
    for all to authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "authenticated_batches_read_write" on production_batches
    for all to authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "authenticated_consumptions_read_write" on production_consumptions
    for all to authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  if to_regclass('public.supplier_raw_materials') is not null then
    create policy "authenticated_supplier_raw_materials_read_write" on supplier_raw_materials
      for all to authenticated using (true) with check (true);
  end if;
exception when duplicate_object then null;
end $$;

do $$ begin
  if to_regclass('public.reception_batches') is not null then
    create policy "authenticated_reception_batches_read_write" on reception_batches
      for all to authenticated using (true) with check (true);
  end if;
exception when duplicate_object then null;
end $$;

grant select, insert, update on products, suppliers to authenticated;
grant select on recipes, recipe_components to authenticated;
grant select, insert, update on lots, raw_material_receptions, production_batches, production_consumptions to authenticated;

do $$ begin
  if to_regclass('public.supplier_raw_materials') is not null then
    grant select, insert, update, delete on supplier_raw_materials to authenticated;
  end if;

  if to_regclass('public.reception_batches') is not null then
    grant select, insert, update on reception_batches to authenticated;
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
      execute format('grant select on public.%I to authenticated', relation_name);
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
      execute format('grant usage, select on sequence public.%I to authenticated', sequence_name);
    end if;
  end loop;
end $$;

do $$ begin
  grant execute on function create_raw_material_reception(
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
  ) to authenticated;
exception when undefined_function then null;
end $$;

do $$ begin
  grant execute on function save_product_schema(uuid, uuid[], jsonb, jsonb, jsonb) to authenticated;
exception when undefined_function then null;
end $$;

do $$ begin
  grant execute on function create_raw_material_reception_batch(uuid, timestamptz, text, jsonb) to authenticated;
exception when undefined_function then null;
end $$;

do $$ begin
  grant execute on function update_raw_material_reception_batch(uuid, uuid[], uuid, timestamptz, text, jsonb) to authenticated;
exception when undefined_function then null;
end $$;

do $$ begin
  grant execute on function create_production_with_traceability(timestamptz, uuid, text, text, text, text, uuid[]) to authenticated;
exception when undefined_function then null;
end $$;

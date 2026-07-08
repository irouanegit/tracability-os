drop policy if exists "prototype_products_read" on products;
drop policy if exists "prototype_suppliers_read" on suppliers;

do $$ begin
  create policy "prototype_products_read_write" on products for all to anon, authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "prototype_suppliers_read_write" on suppliers for all to anon, authenticated using (true) with check (true);
exception when duplicate_object then null;
end $$;

grant select, insert, update on products, suppliers to anon, authenticated;

-- Allow operator-selected substitutions between raw materials whose name contains "farine".

alter table products
  add column if not exists substitution_group text;

update products
set substitution_group = 'farine',
    updated_at = now()
where type = 'raw'
  and is_active = true
  and lower(coalesce(name, '')) like '%farine%'
  and coalesce(substitution_group, '') <> 'farine';

notify pgrst, 'reload schema';

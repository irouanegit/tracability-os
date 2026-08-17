alter table products
  add column if not exists substitution_group text;

update products
set substitution_group = 'chocolate'
where type = 'raw'
  and is_active = true
  and lower(trim(name)) = lower(trim('Chocolat aiguebelle 72%'));


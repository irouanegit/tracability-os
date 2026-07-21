with semi_finished_input(name, unit) as (
  values
    ('Farce baklava', 'kg'),
    ('Ganache Caramel', 'kg'),
    ('Ganache choco café', 'kg'),
    ('Ganache Citron', 'kg'),
    ('Ganache Pistache', 'kg'),
    ('Nougat haché', 'kg'),
    ('Nougat sésame', 'kg'),
    ('Nougat Tournesol', 'kg'),
    ('PATE AMANDE', 'kg'),
    ('Pate baklava', 'kg'),
    ('Pate Chahda', 'kg'),
    ('Pate corne gazelle', 'kg'),
    ('Pate ghraiba effilée', 'kg'),
    ('Pâte Mhencha', 'kg'),
    ('PATE Mhencha Pistache', 'kg'),
    ('Pate Noix', 'kg'),
    ('PATE Raffaelo', 'kg'),
    ('PATE Richbond', 'kg'),
    ('PATE Sablée', 'kg'),
    ('PATE Sebbani', 'kg'),
    ('Praliné Amande', 'kg'),
    ('Praliné Pistache', 'kg')
),
inserted_products as (
  insert into products (code, name, type, category, unit)
  select
    'SF-BELDI-' || upper(substr(md5(semi_finished_input.name), 1, 12)),
    semi_finished_input.name,
    'semi_finished'::product_type,
    'beldi',
    semi_finished_input.unit
  from semi_finished_input
  where not exists (
    select 1
    from products
    where type = 'semi_finished'
      and lower(trim(products.name)) = lower(trim(semi_finished_input.name))
  )
  on conflict (code) do nothing
  returning id, name
),
all_beldi_semi_finished_products as (
  select products.id, products.name
  from products
  join semi_finished_input on lower(trim(products.name)) = lower(trim(semi_finished_input.name))
  where products.type = 'semi_finished'
)
select
  (select count(*) from semi_finished_input) as requested_semi_finished_products,
  (select count(*) from inserted_products) as newly_created_products,
  (select count(*) from all_beldi_semi_finished_products) as total_beldi_semi_finished_products_found;

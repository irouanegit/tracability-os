with expected(name) as (
  values
    ('Farce baklava'),
    ('Ganache Caramel'),
    ('Ganache choco café'),
    ('Ganache Citron'),
    ('Ganache Pistache'),
    ('Nougat haché'),
    ('Nougat sésame'),
    ('Nougat Tournesol'),
    ('PATE AMANDE'),
    ('Pate baklava'),
    ('Pate Chahda'),
    ('Pate corne gazelle'),
    ('Pate ghraiba effilée'),
    ('Pâte Mhencha'),
    ('PATE Mhencha Pistache'),
    ('Pate Noix'),
    ('PATE Raffaelo'),
    ('PATE Richbond'),
    ('PATE Sablée'),
    ('PATE Sebbani'),
    ('Praliné Amande'),
    ('Praliné Pistache')
),
matched as (
  select expected.name
  from expected
  join products
    on lower(trim(products.name)) = lower(trim(expected.name))
   and products.type = 'semi_finished'
   and products.category = 'beldi'
)
select
  (select count(*) from expected) as expected_count,
  (select count(*) from matched) as found_count,
  array(
    select expected.name
    from expected
    where not exists (
      select 1
      from matched
      where matched.name = expected.name
    )
    order by expected.name
  ) as missing_products;

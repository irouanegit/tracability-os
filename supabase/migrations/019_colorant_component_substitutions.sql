alter table products
  add column if not exists substitution_group text;

with colorant_materials(name) as (
  values
    ('Colorant'),
    ('Colorant blanc'),
    ('Colorant jaune'),
    ('Colorant noir'),
    ('Colorant orange'),
    ('Colorant pistache'),
    ('Colorant rouge'),
    ('Colorant rouge Tarabco'),
    ('Colorant vert')
)
update products p
set substitution_group = 'colorant'
from colorant_materials c
where p.type = 'raw'
  and p.is_active = true
  and lower(trim(p.name)) = lower(trim(c.name));

do $$
declare
  v_missing text[];
  v_duplicates text[];
begin
  with colorant_materials(name) as (
    values
      ('Colorant'),
      ('Colorant blanc'),
      ('Colorant jaune'),
      ('Colorant noir'),
      ('Colorant orange'),
      ('Colorant pistache'),
      ('Colorant rouge'),
      ('Colorant rouge Tarabco'),
      ('Colorant vert')
  )
  select coalesce(array_agg(c.name order by c.name), array[]::text[])
  into v_missing
  from colorant_materials c
  where not exists (
    select 1
    from products p
    where p.type = 'raw'
      and p.is_active = true
      and lower(trim(p.name)) = lower(trim(c.name))
  );

  with colorant_materials(name) as (
    values
      ('Colorant'),
      ('Colorant blanc'),
      ('Colorant jaune'),
      ('Colorant noir'),
      ('Colorant orange'),
      ('Colorant pistache'),
      ('Colorant rouge'),
      ('Colorant rouge Tarabco'),
      ('Colorant vert')
  ),
  counts as (
    select c.name, count(p.id) as product_count
    from colorant_materials c
    left join products p on p.type = 'raw'
      and p.is_active = true
      and lower(trim(p.name)) = lower(trim(c.name))
    group by c.name
  )
  select coalesce(array_agg(name order by name), array[]::text[])
  into v_duplicates
  from counts
  where product_count > 1;

  if cardinality(v_missing) > 0 then
    raise exception 'Missing colorant substitution raw materials: %', v_missing;
  end if;

  if cardinality(v_duplicates) > 0 then
    raise exception 'Duplicate colorant substitution raw materials must be merged first: %', v_duplicates;
  end if;
end;
$$;

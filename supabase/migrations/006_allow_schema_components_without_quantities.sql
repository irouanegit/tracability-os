alter table recipe_components alter column quantity drop not null;
alter table recipe_components alter column unit drop not null;

alter table recipe_components drop constraint if exists recipe_components_quantity_check;
alter table recipe_components drop constraint if exists recipe_components_quantity_positive;

alter table recipe_components add constraint recipe_components_quantity_positive
  check (quantity is null or quantity > 0);

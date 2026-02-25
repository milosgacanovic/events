create table if not exists ui_labels (
  key text primary key,
  value text not null
);

insert into ui_labels (key, value)
values
  ('category_singular', 'Dance Practice'),
  ('category_plural', 'Dance Practices')
on conflict (key) do nothing;

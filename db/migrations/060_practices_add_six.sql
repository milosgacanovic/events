-- Add six new top-level dance practice categories.
-- Sort_order is collapsed to 0 for everything except 'other', which is pinned
-- last; the meta query orders by (level, sort_order, label), so the label
-- tiebreak gives alphabetical ordering for the active set.

insert into practices (id, parent_id, level, key, label, sort_order, is_active)
values
  (gen_random_uuid(), null, 1, 'azul',               'Azul',               0, true),
  (gen_random_uuid(), null, 1, 'journeydance',       'JourneyDance',       0, true),
  (gen_random_uuid(), null, 1, 'qoya',               'Qoya',               0, true),
  (gen_random_uuid(), null, 1, 'dancing-freedom',    'Dancing Freedom',    0, true),
  (gen_random_uuid(), null, 1, 'no-lights-no-lycra', 'No Lights No Lycra', 0, true),
  (gen_random_uuid(), null, 1, 'dance-church',       'Dance Church',       0, true)
on conflict (key) do nothing;

update practices set sort_order = 0   where level = 1 and key <> 'other';
update practices set sort_order = 100 where level = 1 and key = 'other';

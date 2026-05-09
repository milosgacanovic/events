-- Add "Medicine Dance" as a top-level dance practice category.
-- Sort_order stays 0 so the meta query (ordered by level, sort_order, label)
-- alphabetizes it with the rest of the active set; 'other' remains pinned last.

insert into practices (id, parent_id, level, key, label, sort_order, is_active)
values
  (gen_random_uuid(), null, 1, 'medicine-dance', 'Medicine Dance', 0, true)
on conflict (key) do nothing;

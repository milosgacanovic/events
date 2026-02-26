do $$
begin
  if exists (
    select 1
    from events e
    where e.practice_category_id is not null
       or e.practice_subcategory_id is not null
  ) then
    raise exception
      'Cannot reset practices taxonomy: events reference practices. Clean up/rebind events, then rerun migration 004_practices_canonical_reset.sql.';
  end if;
end $$;

delete from practices;

insert into practices (id, parent_id, level, key, label, sort_order, is_active)
values
  (gen_random_uuid(), null, 1, '5rhythms', '5Rhythms', 1, true),
  (gen_random_uuid(), null, 1, 'authentic-movement', 'Authentic Movement', 2, true),
  (gen_random_uuid(), null, 1, 'biodanza', 'Biodanza', 3, true),
  (gen_random_uuid(), null, 1, 'chakradance', 'Chakradance', 4, true),
  (gen_random_uuid(), null, 1, 'contact-improvisation', 'Contact Improvisation', 5, true),
  (gen_random_uuid(), null, 1, 'dance-meditation', 'Dance Meditation', 6, true),
  (gen_random_uuid(), null, 1, 'ecstatic-dance', 'Ecstatic Dance', 7, true),
  (gen_random_uuid(), null, 1, 'freedomdance', 'freedomDANCE', 8, true),
  (gen_random_uuid(), null, 1, 'heart-in-motion', 'Heart in Motion', 9, true),
  (gen_random_uuid(), null, 1, 'innermotion', 'InnerMotion', 10, true),
  (gen_random_uuid(), null, 1, 'integral-dance', 'Integral Dance', 11, true),
  (gen_random_uuid(), null, 1, 'movement-medicine', 'Movement Medicine', 12, true),
  (gen_random_uuid(), null, 1, 'nia', 'Nia (Movement Practice)', 13, true),
  (gen_random_uuid(), null, 1, 'open-floor', 'Open Floor', 14, true),
  (gen_random_uuid(), null, 1, 'somatic-movement', 'Somatic Movement', 15, true),
  (gen_random_uuid(), null, 1, 'soul-motion', 'Soul Motion', 16, true),
  (gen_random_uuid(), null, 1, 'other', 'Other dance practices', 17, true);

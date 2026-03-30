ALTER TABLE tags ADD COLUMN IF NOT EXISTS display TEXT;

UPDATE tags SET display = CASE tag
  WHEN 'live music' THEN 'Live Music'
  WHEN 'dj set' THEN 'DJ Set'
  WHEN 'sound healing' THEN 'Sound Healing'
  WHEN 'silent / no music' THEN 'Silent / No Music'
  WHEN 'ceremony' THEN 'Ceremony'
  WHEN 'cacao' THEN 'Cacao'
  WHEN 'full moon' THEN 'Full Moon'
  WHEN 'new moon' THEN 'New Moon'
  WHEN 'meditation' THEN 'Meditation'
  WHEN 'breathwork' THEN 'Breathwork'
  WHEN 'somatic' THEN 'Somatic'
  WHEN 'dance & yoga' THEN 'Dance & Yoga'
  WHEN 'integration circle' THEN 'Integration Circle'
  WHEN 'women''s circle' THEN 'Women''s Circle'
  WHEN 'men''s circle' THEN 'Men''s Circle'
  WHEN 'lgbtq+ friendly' THEN 'LGBTQ+ Friendly'
  WHEN 'partner work' THEN 'Partner Work'
  WHEN 'community gathering' THEN 'Community Gathering'
  WHEN 'beginner friendly' THEN 'Beginner Friendly'
  WHEN 'family friendly' THEN 'Family Friendly'
  WHEN 'gentle / low intensity' THEN 'Gentle / Low Intensity'
  WHEN 'trauma informed' THEN 'Trauma Informed'
  WHEN 'wheelchair friendly' THEN 'Wheelchair Friendly'
  WHEN 'donation based' THEN 'Donation Based'
  WHEN 'substance free' THEN 'Substance Free'
  WHEN 'outdoor / nature' THEN 'Outdoor / Nature'
  WHEN 'teacher training' THEN 'Teacher Training'
END
WHERE display IS NULL;

DELETE FROM tags WHERE tag = 'testing';

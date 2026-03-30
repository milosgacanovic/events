-- Canonical tags reference table for autocomplete
CREATE TABLE IF NOT EXISTS tags (
  tag TEXT PRIMARY KEY,
  sort_order INT NOT NULL DEFAULT 0
);

-- Rename existing tags on events
UPDATE events SET tags = array_replace(tags, 'guided meditation', 'meditation');
UPDATE events SET tags = array_replace(tags, 'somatic practice', 'somatic');

-- Seed canonical tags (sort_order determines default display order)
INSERT INTO tags (tag, sort_order) VALUES
  ('beginner friendly', 1),
  ('ceremony', 2),
  ('cacao', 3),
  ('sound healing', 4),
  ('live music', 5),
  ('live percussion', 6),
  ('trauma informed', 7),
  ('meditation', 8),
  ('somatic', 9),
  ('teacher training', 10),
  ('breathwork', 11),
  ('outdoor / nature', 12),
  ('community gathering', 13),
  ('dj set', 14),
  ('women''s circle', 15),
  ('men''s circle', 16),
  ('family friendly', 17),
  ('donation based', 18),
  ('full moon', 19),
  ('new moon', 20),
  ('partner work', 21),
  ('silent / no music', 22),
  ('gentle / low intensity', 23),
  ('integration circle', 24),
  ('dance & yoga', 25)
ON CONFLICT (tag) DO UPDATE SET sort_order = EXCLUDED.sort_order;

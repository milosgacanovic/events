-- Fix idx_rsvps_unique collision.
--
-- The original FK on event_rsvps.occurrence_id was ON DELETE SET NULL. When an
-- event's occurrences were regenerated (e.g. importer PATCH), SET NULL would
-- collapse occurrence-scoped RSVPs to (user_id, event_id, NULL). If the user
-- already had a NULL-occurrence row — or multiple occurrence RSVPs on the same
-- event — this collided on idx_rsvps_unique and the PATCH failed with 500.
--
-- Fix: dedupe any pre-existing collisions, then switch the FK to CASCADE so a
-- deleted occurrence removes its RSVP instead of orphaning it as NULL. The
-- application layer (replaceOccurrencesInWindow) snapshots + re-attaches RSVPs
-- by starts_at_utc so regeneration preserves them when the time matches.

BEGIN;

-- Keep the occurrence-scoped row when a user has both NULL and occurrence-scoped
-- RSVPs for the same event.
DELETE FROM event_rsvps r
WHERE r.occurrence_id IS NULL
  AND EXISTS (
    SELECT 1 FROM event_rsvps r2
    WHERE r2.user_id = r.user_id
      AND r2.event_id = r.event_id
      AND r2.occurrence_id IS NOT NULL
  );

ALTER TABLE event_rsvps
  DROP CONSTRAINT event_rsvps_occurrence_id_fkey,
  ADD CONSTRAINT event_rsvps_occurrence_id_fkey
    FOREIGN KEY (occurrence_id)
    REFERENCES event_occurrences(id)
    ON DELETE CASCADE;

COMMIT;

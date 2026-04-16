-- Allow reporting comments in addition to events and organizers
ALTER TABLE reports DROP CONSTRAINT reports_target_type_check;
ALTER TABLE reports ADD CONSTRAINT reports_target_type_check
  CHECK (target_type IN ('event', 'organizer', 'comment'));

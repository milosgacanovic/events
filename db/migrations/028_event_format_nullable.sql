-- Allow event_format_id to be NULL (format is optional when creating events)
alter table events
  alter column event_format_id drop not null;

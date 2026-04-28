-- Allow 'user_deleted' status in moderation_queue for comments deleted by the author
alter table moderation_queue drop constraint moderation_queue_status_check;
alter table moderation_queue add constraint moderation_queue_status_check
  check (status in ('pending', 'approved', 'rejected', 'actioned', 'user_deleted'));

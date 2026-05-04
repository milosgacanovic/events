-- Snapshot user/target/content into moderation_queue so admin moderation views
-- still display meaningful info after the underlying comment row is deleted.
alter table moderation_queue add column if not exists snapshot_user_id        uuid;
alter table moderation_queue add column if not exists snapshot_user_name      text;
alter table moderation_queue add column if not exists snapshot_content        text;
alter table moderation_queue add column if not exists snapshot_target_type    text;
alter table moderation_queue add column if not exists snapshot_target_id      uuid;
alter table moderation_queue add column if not exists snapshot_target_label   text;

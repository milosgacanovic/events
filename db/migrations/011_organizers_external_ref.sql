alter table organizers
add column if not exists external_source text,
add column if not exists external_id text;

create unique index if not exists organizers_external_source_external_id_unique_idx
on organizers (external_source, external_id)
where external_id is not null;

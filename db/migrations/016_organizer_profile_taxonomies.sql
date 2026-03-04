create table if not exists organizer_profile_roles (
  organizer_id uuid not null references organizers(id) on delete cascade,
  role_id uuid not null references organizer_roles(id) on delete restrict,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (organizer_id, role_id)
);

create index if not exists organizer_profile_roles_organizer_idx
  on organizer_profile_roles (organizer_id, display_order);

create index if not exists organizer_profile_roles_role_idx
  on organizer_profile_roles (role_id);

create table if not exists organizer_practices (
  organizer_id uuid not null references organizers(id) on delete cascade,
  practice_id uuid not null references practices(id) on delete restrict,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (organizer_id, practice_id)
);

create index if not exists organizer_practices_organizer_idx
  on organizer_practices (organizer_id, display_order);

create index if not exists organizer_practices_practice_idx
  on organizer_practices (practice_id);

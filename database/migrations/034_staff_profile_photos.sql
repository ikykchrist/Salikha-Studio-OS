alter table public.staff_members
  add column if not exists profile_photo bytea
    check (octet_length(profile_photo) between 1 and 81920),
  add column if not exists profile_photo_updated_at timestamptz;

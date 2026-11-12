-- Adds the Unfit status for vehicles. Run once in Supabase > SQL Editor.
alter table public.vehicles add column if not exists is_unfit boolean not null default false;

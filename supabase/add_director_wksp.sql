-- Adds the Director Wksp role (same permissions as AD Wksp). Run once in Supabase > SQL Editor.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('dir_wksp','ad_wksp','am_wksp','mt_clerk','proc_clerk','ceo'));
create or replace function public.is_writer()
returns boolean language sql stable as $$ select coalesce(public.my_role() in ('dir_wksp','ad_wksp','am_wksp','mt_clerk'), false) $$;
create or replace function public.is_procurer()
returns boolean language sql stable as $$ select coalesce(public.my_role() in ('dir_wksp','ad_wksp','am_wksp','proc_clerk'), false) $$;
create or replace function public.is_wksp_admin()
returns boolean language sql stable as $$ select coalesce(public.my_role() in ('dir_wksp','ad_wksp','am_wksp'), false) $$;

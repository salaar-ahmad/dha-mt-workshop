-- Clears the "Unfit Vehs" section on vehicles already imported. Run once in Supabase > SQL Editor.
update public.vehicles set section = '' where section = 'Unfit Vehs';

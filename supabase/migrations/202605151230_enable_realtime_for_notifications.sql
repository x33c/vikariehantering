-- Enable Supabase Realtime for pass, messages and notifications.
-- Safe to run more than once.

alter table if exists public.vikariepass replica identity full;
alter table if exists public.passmeddelanden replica identity full;
alter table if exists public.notiser replica identity full;

do $$
begin
  begin
    alter publication supabase_realtime add table public.vikariepass;
  exception when duplicate_object then
    null;
  end;

  begin
    alter publication supabase_realtime add table public.passmeddelanden;
  exception when duplicate_object then
    null;
  end;

  begin
    alter publication supabase_realtime add table public.notiser;
  exception when duplicate_object then
    null;
  end;
end $$;

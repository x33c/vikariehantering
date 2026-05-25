alter table public.utskick_celler
  drop constraint if exists utskick_celler_typ_check;

alter table public.utskick_celler
  add constraint utskick_celler_typ_check
  check (typ in ('franvaro', 'vikarie', 'ovrigt', 'ingress', 'lankar', 'kontakt'));

notify pgrst, 'reload schema';

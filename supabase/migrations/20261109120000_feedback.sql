begin;
create table if not exists public.feedback (
  id uuid primary key,
  owner_id uuid not null references public.profiler(id) on delete cascade,
  author_name text not null,
  category text not null check (category in ('problem','forslag','ovrigt')),
  title text not null check (length(btrim(title)) between 3 and 120),
  description text not null check (length(btrim(description)) between 10 and 5000),
  status text not null default 'nytt' check (status in ('nytt','arbete','information','lost')),
  page text not null check (page in ('pass','mina-pass','tid','schema','notiser','profil','annat')),
  app_version text check (length(app_version) <= 64),
  browser text check (length(browser) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists feedback_owner_updated on public.feedback(owner_id, updated_at desc);
create index if not exists feedback_status_updated on public.feedback(status, updated_at desc);
create table if not exists public.feedback_messages (
  id uuid primary key,
  feedback_id uuid not null references public.feedback(id) on delete cascade,
  author_id uuid not null references public.profiler(id) on delete cascade,
  author_role text not null check (author_role in ('admin','vikarie')),
  body text not null check (length(btrim(body)) between 1 and 5000),
  created_at timestamptz not null default now()
);
create index if not exists feedback_messages_thread on public.feedback_messages(feedback_id, created_at);

create or replace function public.can_read_feedback(p_owner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiler p where p.id=auth.uid() and p.aktiv and
    (p.roll='admin' or (p.id=p_owner and p.roll='vikarie' and exists
      (select 1 from public.vikarier v where v.profil_id=p.id and v.aktiv))));
$$;
revoke all on function public.can_read_feedback(uuid) from public, anon;
grant execute on function public.can_read_feedback(uuid) to authenticated;
alter table public.feedback enable row level security;
alter table public.feedback_messages enable row level security;
revoke all on public.feedback, public.feedback_messages from anon, authenticated;
grant select on public.feedback, public.feedback_messages to authenticated;
drop policy if exists feedback_read on public.feedback;
create policy feedback_read on public.feedback for select to authenticated using (public.can_read_feedback(owner_id));
drop policy if exists feedback_messages_read on public.feedback_messages;
create policy feedback_messages_read on public.feedback_messages for select to authenticated using (
  exists (select 1 from public.feedback f where f.id=feedback_id and public.can_read_feedback(f.owner_id))
);

create or replace function public.submit_feedback(p_id uuid, p_category text, p_title text, p_description text, p_page text, p_version text default null, p_browser text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_name text;
begin
  select v.id, coalesce(p.namn, 'Vikarie') into v_id, v_name
  from public.vikarier v join public.profiler p on p.id=v.profil_id
  where p.id=auth.uid() and p.aktiv and p.roll='vikarie' and v.aktiv limit 1;
  if v_id is null then raise exception 'Du saknar behorighet.' using errcode='42501'; end if;
  -- Lock the profile so concurrent retries and rate checks are serialized.
  perform 1 from public.profiler where id=auth.uid() for update;
  if exists(select 1 from public.feedback where id=p_id and owner_id=auth.uid()) then return p_id; end if;
  if (select count(*) from public.feedback where owner_id=auth.uid() and created_at>now()-interval '24 hours') >= 10 then
    raise exception 'Du har skickat manga arenden. Forsok igen senare.';
  end if;
  insert into public.feedback(id,owner_id,author_name,category,title,description,page,app_version,browser)
    values(p_id,auth.uid(),v_name,p_category,btrim(p_title),btrim(p_description),p_page,p_version,p_browser);
  insert into public.notiser(vikarie_id,mottagare,kanal,status,ämne,innehåll,skickat_kl)
    values(v_id,'admin','push','skickat','Ny feedback',v_name || ' har skickat ett nytt ärende. Öppna Feedback i adminmenyn.',now());
  return p_id;
end;
$$;
revoke all on function public.submit_feedback(uuid,text,text,text,text,text,text) from public,anon;
grant execute on function public.submit_feedback(uuid,text,text,text,text,text,text) to authenticated;

create or replace function public.reply_feedback(p_id uuid, p_message_id uuid, p_body text, p_status text default null)
returns void language plpgsql security definer set search_path = public as $$
declare ticket public.feedback; actor_role text; v_id uuid;
begin
  select * into ticket from public.feedback where id=p_id for update;
  if not found or not public.can_read_feedback(ticket.owner_id) then
    raise exception 'Du saknar behorighet till arendet.' using errcode='42501';
  end if;
  select roll into actor_role from public.profiler where id=auth.uid();
  if p_status is not null and actor_role <> 'admin' then
    raise exception 'Endast admin far andra status.' using errcode='42501';
  end if;
  if exists(select 1 from public.feedback_messages where id=p_message_id and feedback_id=p_id and author_id=auth.uid()) then return; end if;
  if (select count(*) from public.feedback_messages where author_id=auth.uid() and created_at>now()-interval '1 hour') >= 60 then
    raise exception 'For manga svar. Forsok igen senare.';
  end if;
  insert into public.feedback_messages(id,feedback_id,author_id,author_role,body)
    values(p_message_id,p_id,auth.uid(),actor_role,btrim(p_body));
  update public.feedback set status=coalesce(p_status,status), updated_at=now() where id=p_id;
  select id into v_id from public.vikarier where profil_id=ticket.owner_id and aktiv limit 1;
  if actor_role='vikarie' or v_id is not null then
    insert into public.notiser(vikarie_id,mottagare,kanal,status,ämne,innehåll,skickat_kl)
      values(v_id,case when actor_role='admin' then 'vikarie' else 'admin' end,'push','skickat','Svar på feedback',
        case when actor_role='admin' then 'Du har fått svar på ditt ärende. Öppna Feedback under Profil.' else 'Ett feedbackärende har fått ett nytt svar. Öppna Feedback i adminmenyn.' end,now());
  end if;
end;
$$;
revoke all on function public.reply_feedback(uuid,uuid,text,text) from public,anon;
grant execute on function public.reply_feedback(uuid,uuid,text,text) to authenticated;
notify pgrst, 'reload schema';
commit;

-- Admins don't review their own contributions: what an admin submits is
-- approved on insert, through approve_contribution, so points, badges and the
-- editions table behave exactly as a manual approval. The row is public at
-- once (public_contributions), so the site shows it live without a rebuild.
-- Only the admin's own rows: facts an admin credits to someone else go
-- through admin_add_facts, which approves them itself.
create function public.autoapprove_admin() returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'pending' and new.user_id = auth.uid() and public.is_admin() then
    perform public.approve_contribution(new.id, false, null);
  end if;
  return null;
end
$$;

create trigger autoapprove_admin
  after insert on public.contributions
  for each row execute function public.autoapprove_admin();

-- admin_add_facts crediting the admin themself: the trigger has already
-- approved the row, so count its points instead of approving it twice.
create or replace function public.admin_add_facts(
  target uuid,
  p_festival text,
  p_year integer,
  facts jsonb
) returns integer
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  f jsonb;
  c public.contributions;
  total integer := 0;
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = 'P0001';
  end if;
  if p_festival is null or p_year is null then
    raise exception 'edition_required' using errcode = 'P0001';
  end if;
  if jsonb_typeof(facts) <> 'array' or jsonb_array_length(facts) < 1 or jsonb_array_length(facts) > 50 then
    raise exception 'invalid_value' using errcode = 'P0001';
  end if;

  for f in select value from jsonb_array_elements(facts) loop
    if jsonb_typeof(f) <> 'object' or coalesce(f ->> 'field', '') = '' then
      raise exception 'invalid_value' using errcode = 'P0001';
    end if;
    insert into public.contributions (user_id, type, festival, year, item_id, payload, status)
      values (target, 'fact', p_festival, p_year, null, f, 'pending')
      returning * into c;
    select * into c from public.contributions where id = c.id;
    if c.status = 'approved' then
      total := total + coalesce(c.points_awarded, 0);
    else
      total := total + public.approve_contribution(c.id, false, null);
    end if;
  end loop;
  return total;
end
$$;

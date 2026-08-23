-- Raise leaderboard_week row cap (default client requests up to 300).
create or replace function public.leaderboard_week(
  p_subject text    default null,
  p_limit   integer default 50
)
returns table (
  rank         bigint,
  display_name text,
  minutes      bigint,
  is_me        boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with totals as (
    select s.user_id, sum(s.minutes)::bigint as minutes
    from public.study_sessions s
    where s.started_at >= date_trunc('week', now())
      and (p_subject is null or s.subject = p_subject)
    group by s.user_id
  )
  select
    rank() over (order by t.minutes desc)        as rank,
    coalesce(p.display_name, 'student')          as display_name,
    t.minutes,
    (t.user_id = auth.uid())                     as is_me
  from totals t
  left join public.profiles p on p.id = t.user_id
  order by t.minutes desc, p.display_name asc
  limit greatest(1, least(coalesce(p_limit, 50), 500));
$$;

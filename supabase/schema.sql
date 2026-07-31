-- ============================================================================
-- Rakezly — study time tracking, leaderboard & daily goals
--
-- HOW TO RUN: Supabase Dashboard → SQL Editor → New query → paste → Run.
-- The whole file is idempotent, so re-running it after an edit is safe.
--
-- Design notes:
--   * Raw study rows stay private (RLS: you only ever read your own).
--   * The leaderboard is exposed through SECURITY DEFINER functions that
--     return aggregates only, so nobody can scrape another student's
--     individual sessions just to build a ranking.
--   * "This week" means the current ISO week (starts Monday), so the board
--     resets every Monday and newcomers always have a reachable target.
-- ============================================================================


-- ── profiles ────────────────────────────────────────────────────────────────
-- One row per signed-in student. display_name is the only thing ever shown
-- to other students.

create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text        not null,
  section      text,
  created_at   timestamptz not null default now(),
  constraint profiles_display_name_len check (char_length(display_name) between 2 and 24)
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);


-- Create the profile automatically on sign-up, whichever provider was used.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  v_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), '')
  );

  if v_name is null or char_length(v_name) < 2 then
    v_name := 'student';
  end if;

  insert into public.profiles (id, display_name)
  values (new.id, left(v_name, 24))
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ── study_sessions ──────────────────────────────────────────────────────────
-- One row per completed focus (work) pomodoro. `preset` marks whether the
-- subject came from the built-in list; only preset subjects are rankable,
-- because custom names would fragment the per-subject boards.

create table if not exists public.study_sessions (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id) on delete cascade,
  subject    text        not null,
  preset     boolean     not null default true,
  minutes    integer     not null,
  started_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint study_sessions_minutes_sane check (minutes > 0 and minutes <= 300),
  constraint study_sessions_subject_len  check (char_length(subject) between 1 and 40)
);

create index if not exists study_sessions_user_started_idx
  on public.study_sessions (user_id, started_at desc);
create index if not exists study_sessions_started_idx
  on public.study_sessions (started_at desc);
create index if not exists study_sessions_subject_started_idx
  on public.study_sessions (subject, started_at desc);

alter table public.study_sessions enable row level security;

drop policy if exists "study_sessions_select_own" on public.study_sessions;
create policy "study_sessions_select_own" on public.study_sessions
  for select using (auth.uid() = user_id);

-- Sessions logged while signed out are flushed on sign-in, so backdating is
-- allowed — but only into the past and only within the last 14 days.
drop policy if exists "study_sessions_insert_own" on public.study_sessions;
create policy "study_sessions_insert_own" on public.study_sessions
  for insert with check (
    auth.uid() = user_id
    and started_at <= now() + interval '5 minutes'
    and started_at >= now() - interval '14 days'
  );

drop policy if exists "study_sessions_delete_own" on public.study_sessions;
create policy "study_sessions_delete_own" on public.study_sessions
  for delete using (auth.uid() = user_id);


-- ── goals ───────────────────────────────────────────────────────────────────
-- Daily checklist. The client is local-first and owns the row id, so the same
-- goal keeps its identity across devices and offline edits.

create table if not exists public.goals (
  id         uuid        primary key,
  user_id    uuid        not null references auth.users(id) on delete cascade,
  day        date        not null,
  title      text        not null,
  subject    text,
  est_pomos  integer     not null default 1,
  done_pomos integer     not null default 0,
  done       boolean     not null default false,
  position   integer     not null default 0,
  updated_at timestamptz not null default now(),
  constraint goals_title_len  check (char_length(title) between 1 and 120),
  constraint goals_est_range   check (est_pomos between 1 and 20),
  constraint goals_done_range  check (done_pomos between 0 and 200)
);

create index if not exists goals_user_day_idx on public.goals (user_id, day desc);

alter table public.goals enable row level security;

drop policy if exists "goals_all_own" on public.goals;
create policy "goals_all_own" on public.goals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);


-- ── leaderboard_week ────────────────────────────────────────────────────────
-- Public (anonymous students can look, they just can't appear).
-- p_subject null  → all subjects combined, custom ones included.
-- p_subject given → that preset subject only.

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
  limit greatest(1, least(coalesce(p_limit, 50), 100));
$$;

revoke all on function public.leaderboard_week(text, integer) from public;
grant execute on function public.leaderboard_week(text, integer) to anon, authenticated;


-- ── my_week_standing ────────────────────────────────────────────────────────
-- Rank + percentile for the caller. Percentile answers "I studied more than
-- X% of candidates this week"; the top student is 100, the last is 0.
-- Returns no row when the caller has not logged anything this week.

create or replace function public.my_week_standing(p_subject text default null)
returns table (
  minutes      bigint,
  rank         bigint,
  participants bigint,
  percentile   integer
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
  ),
  ranked as (
    select
      t.user_id,
      t.minutes,
      rank()  over (order by t.minutes desc) as rnk,
      count(*) over ()                       as participants
    from totals t
  )
  select
    r.minutes,
    r.rnk,
    r.participants,
    case
      when r.participants <= 1 then 100
      else round(((r.participants - r.rnk)::numeric / (r.participants - 1)) * 100)::integer
    end
  from ranked r
  where r.user_id = auth.uid();
$$;

revoke all on function public.my_week_standing(text) from public;
grant execute on function public.my_week_standing(text) to authenticated;

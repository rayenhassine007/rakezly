# Supabase setup

Everything in Rakezly works without Supabase — timer, stopwatch, goals,
planner and your local study log are all stored on the device. Supabase adds
exactly two things:

- **accounts** (Google or email/password), and
- **the weekly leaderboard**, which needs accounts to rank.

Until the steps below are done, the Study panel will show a "Leaderboard
unavailable" message and sign-in will fail. Nothing else is affected.

Your project: `kucqirnkgrtebmowzwlw`
Dashboard: https://supabase.com/dashboard/project/kucqirnkgrtebmowzwlw

---

## 1. Create the tables and functions

1. Open the dashboard → **SQL Editor** → **New query**.
2. Paste the entire contents of [`schema.sql`](./schema.sql).
3. Press **Run**.

It should finish with "Success. No rows returned". The file is idempotent —
re-running it after an edit is safe and will not lose data.

This creates:

| Object | What it does |
|---|---|
| `profiles` | One row per student; `display_name` is the only thing others ever see |
| `study_sessions` | One row per finished focus session |
| `goals` | Daily checklist, mirrored from the device when signed in |
| `leaderboard_week()` | Returns weekly rankings — aggregates only |
| `my_week_standing()` | Your rank and percentile |
| `handle_new_user()` | Creates a profile automatically on sign-up |

Row Level Security is on for all three tables: a student can only ever read
their own rows. The leaderboard is served by `SECURITY DEFINER` functions
that return totals, never anyone's individual sessions.

### Check it worked

Run this in the SQL Editor:

```sql
select 'leaderboard_week' as check, count(*) as ok
from pg_proc where proname = 'leaderboard_week'
union all
select 'tables', count(*) from information_schema.tables
where table_schema = 'public' and table_name in ('profiles','study_sessions','goals');
```

Expect `leaderboard_week = 1` and `tables = 3`.

---

## 2. Turn on sign-in

Dashboard → **Authentication** → **Sign In / Providers**.

### Email (quickest — do this first)

Enable **Email**. That is the whole step.

By default Supabase sends a confirmation email. The app handles this: after
signing up it says *"Check your inbox to confirm your email"*. If you would
rather students get in immediately while testing, turn **Confirm email**
off in the same panel.

### Google (optional, more setup)

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials),
   create an **OAuth 2.0 Client ID** of type *Web application*.
2. Under **Authorised redirect URIs** add exactly:

   ```
   https://kucqirnkgrtebmowzwlw.supabase.co/auth/v1/callback
   ```

3. Copy the **Client ID** and **Client secret** into the Google provider in
   Supabase and enable it.

---

## 3. Point auth back at the site

Dashboard → **Authentication** → **URL Configuration**.

- **Site URL**: `https://rakezly.vercel.app`
- **Redirect URLs** — add both:

  ```
  https://rakezly.vercel.app/**
  http://localhost:5173/**
  ```

This matters: the app sends users to `/?auth=supabase` after a Google
sign-in, and Supabase refuses to redirect anywhere not on this list. The
`/**` wildcard covers the query string.

---

## 4. Try it

1. Open the site, click the **chart icon** in the top-right dock.
2. Create an account or continue with Google.
3. Run one focus session (or use the stopwatch and save).
4. Reopen the panel — you should see your time and your rank.

Any focus sessions logged *before* signing in are uploaded automatically on
first sign-in, as long as they are within the last 14 days.

---

## If something fails

The panel shows the real Postgres error, and the full error object is logged
to the browser console (**F12 → Console**). The usual ones:

| Message | Cause |
|---|---|
| `Could not find the function public.leaderboard_week` | Step 1 was not run, or failed partway |
| `relation "public.study_sessions" does not exist` | Same — re-run `schema.sql` |
| `new row violates row-level security policy` | Signed out, or the session is older than the 14-day upload window |
| `requested path is invalid` after Google sign-in | Step 3: the redirect URL is not on the allowlist |
| `Email not confirmed` | Check the inbox, or turn off *Confirm email* in step 2 |

---

## A known limitation

The publishable key is in the client, which is normal and safe for a
publishable key — RLS is what protects the data. But it does mean a
determined student could post fabricated study time straight to the API and
climb the leaderboard.

Nothing here prevents that. If it becomes a problem, the fix is server-side:
rate-limit inserts per user per day, or reject sessions whose `started_at`
overlaps one already recorded. Worth doing only once the board matters
enough for someone to bother cheating it.

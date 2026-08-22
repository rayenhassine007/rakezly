# Supabase setup

Everything in Rakezly works without Supabase — timer, stopwatch, goals,
planner and your local study log are all stored on the device. Supabase adds
exactly two things:

- **accounts** (Google or email/password), and
- **the weekly leaderboard**, which needs accounts to rank.

Until the steps below are done, the Study panel shows a clear setup /
host-unreachable message and sign-in fails. Nothing else is affected.

Credentials are **not** hard-coded with a fake project. Paste a live Project
URL + anon/publishable key into [`../supabase-config.js`](../supabase-config.js),
or set `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` for Vite/Vercel builds.

---

## Recovering a missing project (do this first if login broke)

Login used to talk to:

`https://kucqirnkgrtebmowzwlw.supabase.co`

That hostname no longer resolves in public DNS (**NXDOMAIN**). The project
was deleted, paused past recovery, or the ref is wrong. **Email and Gmail
login cannot work until you restore or create a live Supabase project and
point the app at it.**

### A. Get a live project

1. Open [https://supabase.com/dashboard](https://supabase.com/dashboard).
2. If the old project still appears and can be restored / unpaused, do that.
3. Otherwise **New project** → copy the project URL
   (`https://<project-ref>.supabase.co`) and the **anon / publishable** key
   (Settings → API). Do not invent these values.

### B. Point the app at it

**Option 1 — edit the config file** (works for static hosting too):

```js
window.RAKEZLY_SUPABASE = {
  url: 'https://YOUR-PROJECT-REF.supabase.co',
  key: 'YOUR_PUBLISHABLE_OR_ANON_KEY'
};
```

in [`../supabase-config.js`](../supabase-config.js).

**Option 2 — env vars** (Vite dev / Vercel). Copy [`.env.example`](../.env.example)
to `.env.local`, or set the same names in the Vercel project:

- `VITE_SUPABASE_URL` (or `SUPABASE_URL`)
- `VITE_SUPABASE_ANON_KEY` (or `SUPABASE_ANON_KEY`)

`vite.config.js` injects those into `supabase-config.js` at serve/build time.
Redeploy after changing env vars.

### C. Confirm the host is alive

In the browser console on the site:

```js
await checkSupabase()
```

- `step0_host` FAILED / `misconfigured` → finish step B.
- `step0_host` FAILED / `host_unreachable` → URL still wrong or DNS not ready.
- `step0_host` OK → continue with schema + providers below.

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
2. Under **Authorised redirect URIs** add exactly (use **your** project ref):

   ```
   https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback
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

The Study panel shows actionable errors (missing credentials, unreachable
host, or the real Auth/Postgres message). The full object is also logged to
the browser console (**F12 → Console**). Run `await checkSupabase()` for a
step-by-step report. The usual ones:

| Message | Cause |
|---|---|
| `Supabase URL/key not set…` | Paste credentials (recovery step B) |
| `Cannot reach Supabase at …` / Failed to fetch | Project deleted/paused or wrong URL — recovery steps A–C |
| `Could not find the function public.leaderboard_week` | Step 1 was not run, or failed partway |
| `relation "public.study_sessions" does not exist` | Same — re-run `schema.sql` |
| `new row violates row-level security policy` | Signed out, or the session is older than the 14-day upload window |
| `requested path is invalid` after Google sign-in | Step 3: the redirect URL is not on the allowlist |
| `Email not confirmed` | Check the inbox, or turn off *Confirm email* in step 2 |
| `provider is not enabled` | Enable Google in step 2 |

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

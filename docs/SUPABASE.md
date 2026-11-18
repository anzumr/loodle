# Cloud saves on Supabase

The game server stores signed-in players' profiles in Postgres (`apps/server/src/db.ts`, API in `apps/server/src/profile.ts`). Everything lives in a schema called `loodle`, so it can sit in an existing Supabase project next to other apps without touching their tables. Without `DATABASE_URL` the server behaves exactly as before and progress stays on each device.

What is stored per Google account: account ID, display name, picture, level/XP/coins/achievements/daily progress, owned and equipped items, solved challenges. No email address.

## One-time setup (owner)

### 1. Create a login that can only reach LOODLE's schema

In the Supabase dashboard for the project you want to use: **SQL Editor → New query**, paste this, replace `CHOOSE-A-LONG-PASSWORD` with a long random password (a password manager can generate one), and run it. Keep the password somewhere safe; it is not stored anywhere in the repository.

```sql
create role loodle_app with login password 'CHOOSE-A-LONG-PASSWORD';
create schema if not exists loodle authorization loodle_app;

create table if not exists loodle.players (
  id          text primary key,
  name        text not null,
  avatar      integer not null default 0,
  progress    jsonb not null,
  wardrobe    jsonb not null,
  challenges  jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table loodle.players owner to loodle_app;

-- Defence in depth: if this schema were ever exposed through Supabase's REST API,
-- these keep the public API roles out. The game server connects as the table owner.
alter table loodle.players enable row level security;
revoke all on schema loodle from anon, authenticated;
revoke all on all tables in schema loodle from anon, authenticated;
```

`loodle` is not in Supabase's "Exposed schemas" list (only `public` is by default), so the table is not reachable through the Supabase REST API. Leave it that way.

### 2. Get the connection string

**Connect** (top of the project dashboard) → **Connection string** → choose **Session pooler**. Render cannot use the "Direct connection" address on the free plan (it needs IPv6). The string looks like:

```
postgresql://postgres.<project-ref>:[YOUR-PASSWORD]@aws-0-<region>.pooler.supabase.com:5432/postgres
```

Change the user part from `postgres.<project-ref>` to `loodle_app.<project-ref>` and put the `loodle_app` password in place of `[YOUR-PASSWORD]`.

### 3. Add it to Render

Render dashboard → `loodle` service → **Environment** → add:

- `DATABASE_URL` = the connection string from step 2.
- Optional but recommended: `DATABASE_CA` = the contents of Supabase's SSL certificate (**Database settings → SSL Configuration → Download certificate**, open the file in a text editor, paste everything). With it the server verifies it is talking to Supabase; without it the connection is still encrypted but not verified.

Save. Render redeploys. In the deploy log you should see `Cloud saves: database connected`. If you see `Cloud saves disabled`, the line after it says why (wrong password, wrong user format, or the pooler address).

## Free plan behaviour

Supabase pauses a free project after about a week without enough database activity. Data is kept, but sign-in sync stops until you restore the project in the dashboard. If LOODLE shares a project with an app that is used every day, the shared project stays awake. Free plan: 500 MB database.

## How syncing works

- First sign-in on a device: if the account has no cloud save, this device's progress is uploaded. If it has one, the two are merged: the save with more XP is kept (coins are never added together), and owned items, achievements and solved challenges from both are kept.
- After that, every change saves about 1.5 seconds later. One account can save at most 30 times a minute.
- Profile → **Delete my cloud save** removes the row and stops uploading from that device until the player turns it back on.
- The apps (Android/iOS) do not have Google sign-in yet, so they do not sync.

## Honest limits

Progress is still calculated in the browser and the server stores what the browser sends after cleaning it (`sanitizeProfile`). A determined player could edit their own coins before they are saved. Server-calculated rewards for online matches, needed before ranked play or anything bought with real money, are the next step.

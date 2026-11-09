# Running on Replit

Replit is the fastest way to get this compiling and running, because it gives you Node, a
database and network access in one place.

## Import and run

1. **Create → Import from GitHub**: paste `https://github.com/nsirivolu27/fantasy-copilot`.
2. Press **Run**.

That's it. `.replit` runs `npm run replit`, which creates the SQLite schema (idempotent, safe on
every boot) and starts Next on `0.0.0.0` so the webview can reach it.

First boot takes a couple of minutes while `npm install` runs.

## First things to do in the Repl

**Check it actually compiles.** This repo was written without a build ever running, so this is
the single most valuable command:

```bash
npx tsc --noEmit
```

Then the test suite, which needs no database and no network:

```bash
npm test        # 69 checks
```

Then use the app: **Settings** → paste your Sleeper league ID → **Sync league** → **Refresh
projections**.

No league ID handy? Stop the Repl, add `SLEEPER_FIXTURES = "1"` under `[env]` in `.replit`, and
use league ID `1124839284756483920`, the whole sync path runs off `fixtures/` with no network.

## Secrets, not .replit

`.replit` is committed to git. Anything sensitive goes in the **Secrets** pane (the padlock),
which injects real environment variables:

| Secret | When you need it |
|---|---|
| `DATABASE_URL` | Only when moving to Postgres, see below |
| `APP_PASSWORD` | Once the Repl is public and you don't want strangers browsing it |
| `SYNC_SECRET` | Once deployed, so nobody else can trigger syncs |

LLM provider keys are **not** environment variables here, they're entered in the app's Settings
page and stored in the database, so you can switch models without redeploying.

## Deploying

Development in the Repl uses SQLite, which is fine because the Repl's filesystem persists.
**Autoscale deployments don't keep a filesystem**: so switch to Postgres before deploying:

1. Open the **Database** tool in the Repl and create a Postgres database. Replit injects
   `DATABASE_URL` automatically.
2. Remove the `DATABASE_URL` line from `[env]` in `.replit` so it doesn't override the real one.
3. In the Shell: `npm run db:push` to create the schema in Postgres.
4. **Deploy** → Autoscale. Build and run commands are already set in `.replit`.

No schema edit is needed, `scripts/prisma-schema.mjs` picks the Prisma provider from the
`DATABASE_URL` scheme, so `file:` means SQLite and `postgresql://` means Postgres.

## Scheduled syncs

Replit **Scheduled Deployments** can hit the sync endpoint daily:

```
curl -X POST https://your-deployment/api/sync \
  -H "Authorization: Bearer $SYNC_SECRET"
```

## If Run fails

- **`prisma: not found`**: install hasn't finished. Wait, or run `npm install` in the Shell.
- **Type errors**: expected on the first real build. Paste them and they're quick fixes.
- **Webview blank**: check the Console for the port. The run command binds `0.0.0.0` and
  honours `$PORT`, which is what the webview needs.
- **Account restricted**: that's a Replit billing or account flag, not this repo. Email
  support@replit.com. `docker compose up -d` runs the same app locally in the meantime.

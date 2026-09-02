# Deploying

The app is a standard Next.js server plus a Postgres database. Three supported paths, in
order of how fast they are.

Whichever you pick, set these:

| Variable | Required | What it does |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string. The Prisma provider switches automatically based on the URL scheme — you never edit the schema. |
| `SYNC_SECRET` | on anything public | Protects `/api/sync` so a stranger can't trigger syncs. Generate with `openssl rand -hex 32`. |
| `APP_PASSWORD` | optional | Locks every page behind HTTP Basic auth. Set it if the URL is reachable by anyone. |

---

## 1. Vercel + Neon — about 5 minutes, free tier

1. Push the repo to GitHub.
2. Create a free Postgres database at [neon.tech](https://neon.tech) (or use Vercel Postgres)
   and copy the connection string.
3. Import the repo at [vercel.com/new](https://vercel.com/new).
4. Add the environment variables above. Use Neon's **pooled** connection string — serverless
   functions open many short-lived connections and a direct URL will exhaust them.
5. Deploy. Then create the tables once, from your machine:

   ```bash
   DATABASE_URL="<your postgres url>" npm run db:push
   ```

6. Open the deployment, go to **Settings**, paste your Sleeper league ID, and sync.

`vercel.json` already registers a daily cron that hits `/api/sync` at 09:00 UTC. Vercel
sends the cron request with your `CRON_SECRET`; set `SYNC_SECRET` to the same value so the
endpoint accepts it.

**Note on serverless:** the retrieval index is an in-memory cache with a 5-minute TTL, so
it rebuilds per cold start. That's a few milliseconds for a 12-team league — fine. If the
corpus ever gets large, move it to a table.

---

## 2. Docker — one command, runs anywhere

```bash
docker compose up -d
```

Brings up Postgres and the app, creates the schema on first boot, and serves on
http://localhost:3000. Edit the environment block in `docker-compose.yml` to set
`APP_PASSWORD` and `SYNC_SECRET` before exposing it beyond your own machine.

For a single container against an existing database:

```bash
docker build -t fantasy-copilot .
docker run -p 3000:3000 -e DATABASE_URL="postgresql://…" fantasy-copilot
```

The image is a standalone Next.js build with a `/api/health` healthcheck baked in.

---

## 3. Railway / Render / Fly — a long-running Node server

These run the app as a normal server, which suits it better than serverless: the retrieval
index stays warm and there's no connection-pooling caveat.

- Build command: `npm run build`
- Start command: `npm start`
- Add a Postgres add-on and set `DATABASE_URL` from it
- Run `npm run db:push` once as a release/deploy command
- Add a scheduled job hitting `POST /api/sync` daily with
  `Authorization: Bearer $SYNC_SECRET`

---

## After deploying

Check `/api/health` — it returns `{ ok: true, database: "connected", leagues: n }`. It's
deliberately exempt from `APP_PASSWORD` so uptime probes keep working.

## Updating the schema

This project uses `prisma db push` rather than migration files, which is the right tradeoff
while the schema is still moving each phase. Before there are real users to worry about,
switch to `prisma migrate` and commit the migration history.

# Running it for other people

The AWS stack in `infra/` will host this app. It will not, on its own, let other
people use it, and the gap is worth being precise about before you invite anyone.

## What the app assumes today

It is built as **one league, one operator**:

- No user accounts. Anyone who can open the URL sees everything.
- `Setting.activeLeagueId` is a single global row. Two people cannot look at
  two different leagues at the same time; changing yours changes theirs.
- `Team.isMine` is a single boolean per league, so "my team" is a property of
  the deployment rather than of a viewer.
- `APP_PASSWORD` is one shared password. It keeps strangers out, which is the
  right tool for you and eleven leaguemates, and the wrong tool for public
  signups.
- LLM provider keys live in the database, unscoped. Every viewer spends whoever
  configured it.

That is a deliberate design for a self-hosted app, and it is genuinely fine for
your league. It breaks the moment two unrelated leagues share one deployment.

## Two honest options

### Option 1: one deployment per league

Cheapest and simplest. Each league gets its own container and database, or its
own Repl. No code changes, no auth to build, no way for one league's data to
leak into another's.

At small numbers this is the right answer. The cost is operational: five
leagues is five deployments to update.

### Option 2: real multi-tenancy

Necessary if you want people to sign up themselves. It is a real piece of work,
roughly in this order:

**1. Accounts.** Add `Account` and `User`, and pick an auth library rather than
writing one. Session cookies, email verification, password reset.

**2. Scope every table.** `League` gains `accountId`. Everything already hangs
off `League`, so the rest follows, but every query needs the scope adding and
missing one is a data leak rather than a bug. Consider Postgres row-level
security so the database enforces it instead of trusting the query layer.

**3. Replace the global settings.** `activeLeagueId` becomes per-user.
`Team.isMine` becomes a `LeagueMembership` row joining a user to a team.

**4. Scope the credentials.** ESPN cookies and LLM keys move under the account,
encrypted with a key from KMS rather than sitting in plaintext columns. Right
now a database dump hands over every user's ESPN session.

**5. Rate limit and budget the shared costs.** One user running projections for
a 14-team league is fine; a hundred doing it at once is a bill and a stampede
on nflverse. Queue the ingest, cache the player dictionary and the stats files
once globally rather than per league, and cap LLM spend per account.

**6. Scope the API keys.** `ApiKey` gains `accountId`, and MCP requests resolve
the league from the key rather than from a global setting.

**7. Decide what you are promising.** Hosting other people's league data means
a privacy policy, a deletion path, and a plan for when the app is down on a
Sunday morning. That is not code, and it is the part most projects skip.

## Recommendation

Ship option 1 now. Run your own league on the AWS stack, or on Replit, and get
a season of real use out of it. Multi-tenancy is a week of careful work plus
ongoing responsibility, and it is much easier to do once you know which parts
people actually use.

If you do go to option 2, do steps 1, 2 and 4 in one pass and do not deploy
partway. A half-scoped query layer is worse than no tenancy at all, because it
looks like it works.

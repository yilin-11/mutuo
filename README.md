# Mutuo

**Learn together, teach together.**

Mutuo is a skill-swapping directory. Every member lists one skill they can teach
and one they want to learn, plus the city and postal code they are in. Browse the
directory, search by skill or location, and get in touch — or let Mutuo deal you
a random member to reach out to.

Express · Sequelize · Passport · SQLite/Postgres · jQuery

[![CI](https://github.com/yilin-11/mutuo/actions/workflows/ci.yml/badge.svg)](https://github.com/yilin-11/mutuo/actions/workflows/ci.yml)

**[Live demo](https://mutuo-gamma.vercel.app/)** — log in as `ada@example.com`
with the password `swap-skills-demo`, or sign up for a fresh account. The demo
runs on a free tier, so the first request after an idle spell waits on a cold
start.

Run it locally in three commands — see [Getting started](#getting-started). The
seeded database ships with ten members, so the directory has something in it on
first load.

<!-- Three screenshots carry this README. Take them at 1280px wide against a
     seeded database, save them under docs/, and swap the placeholders in:
       1. the member directory, mid-search, with results filtered
       2. a profile detail page with the map rendered
       3. the random-match page having dealt a card
-->
![The member directory](docs/directory.png)

---

## About this project

Mutuo started as an early project of mine — a small full-stack app built while I
was still learning the stack. I came back to it later and treated it the way I
would treat an unfamiliar codebase at work: read it end to end, wrote tests that
pinned down what it actually did, and fixed what those tests exposed.

Most of what follows is that second pass. The feature set is deliberately
unchanged; what changed is whether it holds up. **The table below is the
record** — every defect in it was reproduced with a failing test before it was
fixed, and every one of those tests is still in the suite. `npm test` runs them.

## What the second pass found

| Defect | Where | Why it mattered |
| --- | --- | --- |
| Member directory readable without a session | `routes/api-routes.js` | `/members` was behind a login, but `/api/profiles` was not — `curl` returned every member's email address to anyone who asked. The guard on the page was decorative. |
| Auth guard bypassable through the static handler | `app.js`, pages moved to `views/` | Pages lived in `public/`, which `express.static` serves before any route runs. `GET /pages/members.html` reached the member area without ever touching `isAuthenticated`. |
| Race between "do I have a profile?" and inserting one | `routes/api-routes.js` | Two submits in flight together both saw "no profile yet"; the loser tripped the unique index and surfaced as a 409 about an email address the member never typed. |
| Credentials shipped to the browser | `config/geocode.js` | A MapQuest key and a Mapbox token were hardcoded in a public script. Geocoding moved server-side, behind a cache and a rate-limited queue; the map now uses OpenStreetMap tiles, which need no token. |
| Unbounded cache and queue on an open endpoint | `config/geocode.js` | Every distinct lookup added a permanent cache entry and a slot in a globally serialised queue, so an anonymous caller could grow memory without limit and push real users behind a backlog. Now capped, and it sheds load with a 503. |
| `res.redirect()` and `res.sendFile()` on one response | `routes/html-routes.js` | Every logged-in visitor to `/` hit `ERR_HTTP_HEADERS_SENT`. |
| Relative asset paths | `views/*.html` | `../js/common.js` resolved differently under `/detail/1` and `/detail/1/`. The trailing-slash form loaded no JavaScript at all and rendered a blank page with no error. |
| Off-by-one in the random match | `public/js/game.js` | `Math.floor(Math.random() * length) + 1` could index past the end of the array and crash on the resulting `undefined`. |
| Save button that navigated away | `public/js/application.js` | The profile form's submit was an `<a href="/members">`, so the browser left before the request finished. Nothing was ever saved. |
| Client-invented owner ids | `public/js/application.js` | The browser generated a random `User_ID` for each profile, so a member could never find or edit their own again. The owner now comes from the session and is never read from the request body. |
| Unescaped member input | `public/js/common.js` | Names, cities and bios were interpolated straight into HTML strings. A bio containing `<img onerror=...>` ran script in every other member's browser. |
| No limit on login attempts | `config/middleware/rateLimit.js` | Unlimited password guesses. Now ten failures per address per fifteen minutes — successes do not count against the budget. |
| Sessions in process memory | `config/sessionStore.js` | `express-session`'s default store leaks, loses every session on restart, and is invisible to a second process. Sessions now live in the database. |

Two of these are worth a longer note, because the first fix was wrong:

**The profile race.** The obvious repair is `findOrCreate`. It fails here:
`findOrCreate` opens a transaction, and SQLite will not run concurrent
transactions — the test came back with `SQLITE_ERROR: cannot commit - no
transaction is active` and a 500. The version in the tree instead lets the unique
index on `userId` be the arbiter and treats losing the race as a signal to re-read
and update. No transaction, and it behaves the same on every dialect.

**The rate limiter.** The first draft kept its counters in a module-level map,
which meant the login limiter and the signup limiter shared one budget keyed by
address — a failed login would quietly spend someone's signup allowance. Each
limiter now owns its store, and a test pins that down.

## Architecture

```
app.js                 Express app: middleware, session, routes, error handling
server.js              Entry point: syncs the schema, then listens
config/
  config.js            Per-environment database settings, read from the environment
  passport.js          Local email/password strategy and session serialisation
  geocode.js           Postal code -> coordinates via OpenStreetMap, cached and queued
  sessionStore.js      Sessions in the database rather than in process memory
  middleware/
    isAuthenticated.js Page guard: redirects anonymous visitors to /login
    apiAuth.js         API guard: answers 401 JSON
    rateLimit.js       In-memory fixed-window limiter, used on login and signup
models/
  user.js              Account and password hashing
  profile.js           Member profile, one per user
routes/
  html-routes.js       Page routes
  api-routes.js        JSON API
views/                 One HTML file per page, served by html-routes
public/                Everything served as-is by express.static
  js/                  common.js holds the shared helpers
  stylesheets/
scripts/
  seed.js              Ten demo members, five reciprocal teach/learn pairs
test/
  api.test.js          End-to-end API tests
  rate-limit.test.js   The rate limiter on its own
```

Pages live in `views/`, not under `public/`. Anything inside `public/` is served
directly by `express.static` without passing through a route, so a page kept
there is reachable regardless of the guard on its route — which is exactly the
bug listed above.

## Getting started

Requires Node 18 or newer. No database server needed — Mutuo uses SQLite by
default and creates the file on first run.

```bash
npm install
npm run seed     # ten demo members, so the directory is not empty
npm start
```

Then open <http://localhost:8080> and log in as `ada@example.com` with the
password `swap-skills-demo`. Or sign up, fill in your profile, and you land in
the member directory.

### Scripts

| Script           | What it does                                     |
| ---------------- | ------------------------------------------------ |
| `npm start`      | Start the server on `PORT` (default 8080)        |
| `npm run dev`    | Same, with nodemon reloading on file changes     |
| `npm run seed`   | Add the demo members (`-- --fresh` wipes first)  |
| `npm test`       | API tests against an in-memory database          |
| `npm run lint`   | ESLint over the whole project                    |
| `npm run fix`    | ESLint with `--fix`                              |
| `npm run format` | Prettier over js/json/css/html/md                |
| `npm run check`  | Lint and test together, as CI runs them          |

## Testing

```bash
npm test
```

37 tests, roughly two seconds, no fixtures to maintain. `test/api.test.js` drives
the real Express app with supertest against a throwaway in-memory SQLite
database, so the tests exercise routing, session handling, Passport and Sequelize
together rather than mocking them apart. `test/rate-limit.test.js` covers the
limiter on its own, against a budget of two, because the API's real limits are
set high enough that the end-to-end suite never trips them.

CI runs `npm run lint && npm test` on Node 18, 20 and 22.

## Configuration

Everything is optional for local development. Copy `.env.example` to `.env` to
change anything.

| Variable          | Default                | Notes                                                |
| ----------------- | ---------------------- | ---------------------------------------------------- |
| `PORT`            | `8080`                 | Port to listen on                                    |
| `SESSION_SECRET`  | random per boot        | **Required in production** — the app refuses to start without it |
| `SQLITE_STORAGE`  | `./data/mutuo.sqlite`  | Where the SQLite file lives                          |
| `DATABASE_URL`    | —                      | Set to use MySQL/Postgres instead of SQLite          |
| `DB_DIALECT`      | `mysql`                | Which dialect `DATABASE_URL` speaks                  |
| `DB_SSL`          | `false`                | Set `true` for managed Postgres, which requires TLS  |
| `SQL_LOG`         | `false`                | Log every SQL statement                              |
| `MUTUO_CONTACT`   | placeholder            | Contact string sent to the geocoder — set your own before deploying |
| `MUTUO_DEMO_SEED` | `false`                | Lets the demo seed run under `NODE_ENV=production` — see [Deployment](#vercel--where-the-live-demo-runs) |

In development a session secret is generated at boot, so sessions end when the
server restarts. That is deliberate: it means no placeholder secret is committed
to the repo. It also means the database-backed session store only visibly
survives a restart once `SESSION_SECRET` is pinned.

### Using MySQL or Postgres instead

```bash
DATABASE_URL=postgres://user:password@localhost:5432/mutuo DB_DIALECT=postgres npm start
```

`pg`, `pg-hstore` and `mysql2` ship as optional dependencies.

## API

| Method | Path                 | Auth | Purpose                                  |
| ------ | -------------------- | ---- | ---------------------------------------- |
| POST   | `/api/signup`        | —    | Create an account and log in             |
| POST   | `/api/login`         | —    | Log in                                   |
| POST   | `/api/logout`        | —    | End the session                          |
| GET    | `/api/user_data`     | —    | Current account, or `{}` when logged out |
| GET    | `/api/profiles`      | yes  | Every member profile                     |
| GET    | `/api/profiles/me`   | yes  | Your own profile, or `null`              |
| POST   | `/api/profiles`      | yes  | Create or update your own profile        |
| PUT    | `/api/profiles/me`   | yes  | Same as above                            |
| GET    | `/api/profiles/:id`  | yes  | One profile, `404` if unknown            |
| GET    | `/api/geocode?zip=`  | yes  | Coordinates for a postal code            |

A profile always belongs to whoever is logged in — the owner comes from the
session, never from the request body.

`POST /api/login` allows ten *failed* attempts per address per fifteen minutes; a
correct password does not count against the budget. `POST /api/signup` allows
fifty per address per hour. Both answer `429` with a `Retry-After` header once
over — and once over, every attempt from that address is refused until the window
resets, correct password included. That is the point, but it does mean visitors
sharing an outbound address share the budget.

## Deployment

Whatever the target, the app needs Postgres rather than the SQLite default. Every
platform worth deploying this to has an ephemeral filesystem: a SQLite file lives
either until the next deploy takes the container with it, or — on a serverless
platform — not at all, because there is nowhere writable to put it.

Set `MUTUO_CONTACT` to your own contact address before deploying — Nominatim's
[usage policy](https://operations.osmfoundation.org/policies/nominatim/) asks
that requests identify their operator. For real traffic, use a geocoding service
intended for it.

### Vercel — where the live demo runs

`api/index.js` hands each request to the same express app that `server.js` runs
locally, and `vercel.json` rewrites everything that is not a file on disk to it.
Rewrites are checked after the filesystem, so `public/` is still served from the
CDN and only real routes cost an invocation.

Serverless has no startup phase in which to create the schema, so
`config/ready.js` memoises that work and both entry points await the same
promise. The first request into a cold instance pays for it; the rest do not.

1. Import the repository on Vercel. No build settings to change — the
   `vercel-build` script is picked up automatically.
2. Add a Postgres database. Vercel's marketplace has Neon on a free plan that
   does not expire, and attaching it sets `DATABASE_URL` for you.
3. Set the remaining environment variables (Settings → Environment Variables):

   | Variable           | Value                                        |
   | ------------------ | -------------------------------------------- |
   | `SESSION_SECRET`   | `openssl rand -hex 32` — the app refuses to boot without it |
   | `DB_DIALECT`       | `postgres`                                   |
   | `DB_SSL`           | `true`                                       |
   | `MUTUO_DEMO_SEED`  | `true` — see below                           |
   | `MUTUO_CONTACT`    | your own contact address                     |

4. Redeploy, so the build runs with those variables present.

`MUTUO_DEMO_SEED=true` is what lets the demo seed itself. `npm run seed` refuses
to run under `NODE_ENV=production` on its own, because it writes accounts with a
password published in this README — which belongs nowhere near a real
deployment. The public demo is the one case that wants exactly that, so it says
so explicitly rather than the check being weakened for everybody. Seeding stays
additive even then: `--fresh` drops tables and is refused in production
regardless.

Deploying without `MUTUO_DEMO_SEED` is fine — the build skips the seed and the
app comes up with an empty directory.

### Render, or any container host

`render.yaml` describes a web service and a Postgres database; point Render at
the repository and it reads the blueprint. There is also a `Dockerfile` for
anywhere that takes a container. Both run `server.js`, which syncs the schema
before it binds a port, and neither involves `api/index.js`.

Note that Render's free Postgres plan **expires 30 days** after it is created and
is deleted 14 days later, which is why the demo above is not on it.

### Known limits

Honest about what is not production-ready:

- `db.sequelize.sync()` creates tables but does not migrate them. Once there is
  data worth keeping, switch to `sequelize-cli` migrations.
- The rate-limit counters and the geocode cache are per-process and in memory.
  Behind more than one process each enforces its own budget; a shared store
  (Redis) is the fix. Sessions are already in the database and do not have this
  problem. This is worse on the serverless deployment than on a container one:
  every function instance keeps its own counters, so the login limiter bounds
  guesses per instance rather than per address, and the geocode cache starts
  empty on each cold start.
- There is no email verification, no password reset, and no way to delete an
  account.

## License

MIT

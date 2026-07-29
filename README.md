# Mutuo

**Learn together, teach together.**

Mutuo is a skill-swapping directory. Every member lists one skill they can teach
and one they want to learn, plus the city and postal code they are in. See who is
nearby, sorted by how far away they actually are, search by skill or location,
match with the ones you want to swap with — or let Mutuo deal you a random member
when nobody in particular stands out.

Express · Sequelize · Passport · SQLite/Postgres · jQuery

[![CI](https://github.com/yilin-11/mutuo/actions/workflows/ci.yml/badge.svg)](https://github.com/yilin-11/mutuo/actions/workflows/ci.yml)

**[Live demo](https://mutuo-demo.vercel.app/)** · Run it locally in three
commands — see [Getting started](#getting-started). Either way the database is
seeded with fifty members, so the directory has something in it on first load.

**People nearby.** Cards lead with the one thing a skill-swapping app is for:
whether a trade is possible at all. A straight swap in Lisbon outranks a
neighbour who teaches nothing you want — and the neighbour four kilometres away
who *does* teach it comes second, not fortieth. Distance decides everything
within a group, and the **Within** control bounds the lot.

![People nearby, showing straight swaps and one-way overlaps ahead of members sorted by distance](docs/directory.png)

**Matching is one-directional and needs no acceptance.** Press Match; if they
press it back, the pair is mutual, the count on the nav item tells you so, and
their address turns into a link. Mutual matches sort to the front — those are
the ones where something can actually happen.

![The matches page, with two mutual matches ahead of one that has not been answered](docs/matches.png)

**A profile.** The map places a member by postal code and never more precisely
than a circle, so a directory of strangers does not double as a list of
addresses.

![A member's profile, with a swap note and a map of roughly where they are based](docs/profile.png)

**And when nobody in particular stands out, Mutuo picks.** Not uniformly — from
the people a swap is possible with, inside whatever distance you have set.

![The random match, having picked a member who teaches what you want](docs/match.png)

Nothing above is visible without a session — the directory is full of people, and
`/api/profiles` is behind the same guard as the page that draws it. So the demo
offers an account rather than opening the directory up: `ada@example.com`,
password `swap-skills-demo`, and a button that fills the form in. The offer
appears only where `MUTUO_DEMO_SEED` is set, so a deployment with real members in
it never publishes a password.

![The login page, offering a demo account](docs/login.png)

The demo runs on a free tier, so the first request after an idle spell waits on a
cold start.

---

## About this project

Mutuo started as an early project of mine — a small full-stack app built while I
was still learning the stack. I came back to it later and treated it the way I
would treat an unfamiliar codebase at work: read it end to end, wrote tests that
pinned down what it actually did, and fixed what those tests exposed.

Most of what follows is that second pass, and for the whole of it the feature set
was deliberately left alone: what changed was whether it held up. **The table
below is the record** — every defect in it was reproduced with a failing test
before it was fixed, and every one of those tests is still in the suite.
`npm test` runs them.

A third pass has since changed the feature set, because holding up is not the
same as being worth using. The app sorted a directory by insertion order and left
the reader to work out, card by card, whether a trade was even possible — in an
app whose entire premise is trading. That work is described under
[Architecture](#architecture): distance that means something, an ordering that
leads with a possible swap, and matching that tells the other person.

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
| Off-by-one in the random match | `public/js/members.js` | `Math.floor(Math.random() * length) + 1` could index past the end of the array and crash on the resulting `undefined`. It lived in `game.js` until the random match became a button on the members page. |
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
server.js              Entry point: readies the schema, then listens
config/
  config.js            Per-environment database settings, read from the environment
  passport.js          Local email/password strategy and session serialisation
  geocode.js           Postal code -> coordinates via OpenStreetMap, cached and queued
  locate.js            The geocode a profile gets once, when it is saved
  distance.js          Haversine, for sorting the directory by how far away someone is
  schema.js            Adds columns sync() cannot add to a table that already exists
  sessionStore.js      Sessions in the database rather than in process memory
  middleware/
    isAuthenticated.js Page guard: redirects anonymous visitors to /login
    apiAuth.js         API guard: answers 401 JSON
    rateLimit.js       In-memory fixed-window limiter, used on login and signup
models/
  user.js              Account, password hashing, and when matches were last seen
  profile.js           Member profile, one per user
  match.js             One member marking another; two rows facing make a mutual match
routes/
  html-routes.js       Page routes
  api-routes.js        JSON API
views/                 One HTML file per page, served by html-routes
public/                Everything served as-is by express.static
  js/                  common.js holds the shared helpers
    theme.js           Applies the stored theme before the body paints
  stylesheets/
    base.css           Design tokens and every shared component
    <page>.css         Only what one page adds to them
scripts/
  seed.js              Fifty demo members, twenty-five reciprocal teach/learn pairs
test/
  api.test.js          End-to-end API tests
  rate-limit.test.js   The rate limiter on its own
```

Pages live in `views/`, not under `public/`. Anything inside `public/` is served
directly by `express.static` without passing through a route, so a page kept
there is reachable regardless of the guard on its route — which is exactly the
bug listed above.

The member area is three pages, in this order: **people nearby**, **matches**,
**my profile**. Nearby comes first because it is the reason to open the app;
your own profile comes last because it is filled in once and edited rarely. The
random match is a button on the nearby page rather than a destination of its own
— deciding who to ask is something you do while looking at the list — and
`/game`, which used to serve it, redirects to `/members`.

**Nearby means nearby.** Each profile's postal code is resolved to coordinates
once, when the profile is saved (`config/locate.js`), and stored on the row.
Distance is then a great-circle calculation from the asker's own coordinates.
Geocoding on read instead would mean one lookup per member per page load against
a service that permits about one a second — the better part of a minute for fifty
members, and many times over its queue limit besides. A member whose postal code
cannot be placed sorts to the end rather than disappearing. A **Within** control
bounds the list, and everything past the bound folds into a *Farther away*
section rather than vanishing — a page called "people nearby" that leads with
someone 16,000 km away is arguing with its own title.

The demo members are clustered several to a city for the same reason. One member
per city put the nearest person three hundred kilometres away, which made the
distance ordering a formality and left the **Within** control unable to return
anything at all — a filter that can only ever come back empty is worse than no
filter.

**A possible swap outranks a short walk.** The seed data is built as
twenty-five reciprocal pairs, and for a long time nothing in the app said so: the
list
was sorted by distance and the reader was left to compare two skill pills on
every card to work out whether a trade was even possible. Each card now says it
outright — *Straight swap*, *Teaches what you want*, *Wants what you teach* — and
the ordering puts those first, with distance deciding within each group.
Complementarity is the harder constraint: a neighbour who teaches nothing you
want is not a swap at all, and the **Within** control is there for anyone who
disagrees about how far is too far.

**Matching tells someone.** Matching is one-directional and needs no acceptance,
but until both sides have done it nothing has happened — so the count of *new*
mutual matches sits on the **Matches** item in the nav, and clears when the page
is opened. Without it, matching was a dead end: you pressed the button, the other
member was never told, and the only way to find out they had pressed it back was
to reopen a page you had no reason to reopen. A mutual match also turns the
address on their card into a link, which is the point of the whole exercise.

There is no CSS framework. The pages pulled Bootstrap off a CDN and then spent
most of each stylesheet arguing with it, so it was removed rather than
overridden; its JavaScript had already been replaced by six lines in
`common.js`. What took its place is `base.css`: custom properties for colour,
spacing, radius and shadow, and one definition each for the button, input, nav
and card. A page stylesheet only holds what that page adds. Nothing is fetched
to render a page — no framework, no web font, no avatar service.

**Dark is the default and light is opt-in.** The dark values sit unqualified on
`:root`, so a first visit — and a visit with JavaScript turned off — gets dark
rather than a flash of something else. Choosing light puts `data-theme="light"`
on `<html>`, which swaps the same token names for their light values; no
component knows which theme it is in. `js/theme.js` applies the stored choice
and is loaded from `<head>` without `defer` on purpose, because the attribute
has to be set before the body paints or the visitor sees the theme they did not
pick. `prefers-color-scheme` is deliberately not consulted: dark is this app's
default, not a guess at what the visitor's system wants.

## Getting started

Requires Node 18 or newer. No database server needed — Mutuo uses SQLite by
default and creates the file on first run.

```bash
npm install
npm run seed     # fifty demo members, so the directory is not empty
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

65 tests, a few seconds, no fixtures to maintain. `test/api.test.js` drives the
real Express app with supertest against a throwaway in-memory SQLite database, so
the tests exercise routing, session handling, Passport and Sequelize together
rather than mocking them apart. `test/rate-limit.test.js` covers the limiter on
its own, against a budget of two.

The end-to-end suite now signs up more members than the signup limiter allows in
an hour, and every request in it arrives from the same address — so it clears
both limiters between tests. Otherwise a run long enough starts reporting `429`s
from tests that only wanted an account to work with, which is the budget becoming
the subject of tests that are about something else.

Geocoding is the one thing the suite refuses to do: `config/locate.js` returns
nothing under `NODE_ENV=test` rather than spend a second per saved profile in a
third-party queue. Anything that cares about distance writes coordinates
directly.

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
| `MUTUO_DEMO_SEED` | `false`                | Lets the demo seed run under `NODE_ENV=production`, and puts the demo account on the login page — see [Deployment](#vercel--where-the-live-demo-runs) |

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

| Method | Path                     | Auth | Purpose                                    |
| ------ | ------------------------ | ---- | ------------------------------------------ |
| POST   | `/api/signup`            | —    | Create an account and log in               |
| POST   | `/api/login`             | —    | Log in                                     |
| POST   | `/api/logout`            | —    | End the session                            |
| GET    | `/api/user_data`         | —    | Current account, or `{}` when logged out   |
| GET    | `/api/profiles`          | yes  | Everyone but you, nearest first            |
| GET    | `/api/profiles/me`       | yes  | Your own profile, or `null`                |
| POST   | `/api/profiles`          | yes  | Create or update your own profile          |
| PUT    | `/api/profiles/me`       | yes  | Same as above                              |
| GET    | `/api/profiles/:id`      | yes  | One profile, `404` if unknown              |
| GET    | `/api/matches`           | yes  | The members you have matched with          |
| GET    | `/api/matches/count`     | yes  | `{ mutual, unseen }` — what the nav badge shows |
| POST   | `/api/matches/seen`      | yes  | Mark the current mutual matches as seen    |
| POST   | `/api/matches/:id`       | yes  | Match with that profile                    |
| DELETE | `/api/matches/:id`       | yes  | Unmatch                                    |
| GET    | `/api/geocode?zip=`      | yes  | Coordinates for a postal code              |
| GET    | `/api/demo`              | —    | The demo account to offer, or `null`       |

A profile always belongs to whoever is logged in — the owner comes from the
session, never from the request body. The same goes for a match: you can only
ever add or remove your own.

Anything a profile carries that depends on *who is asking* is computed per
request rather than stored: `distanceKm` from the asker's own postal code, `swap`
(`"both"`, `"teaches"`, `"wants"` or `null`) for how the two sets of skills line
up, `matched` if they have matched this member, and `mutual` if that member has
matched them back. All four are `null`/`false` for a member who has not filled in
a profile yet — there is nothing to compare against — which is why
`/members` says so rather than quietly serving an unsorted list.

Matching is one-directional and needs no acceptance: `mutual` is simply both rows
existing. Both match routes are idempotent — matching someone twice, or
unmatching someone you never matched, is the state you asked for rather than an
error. `POST /api/matches/seen` is a POST and not a side effect of the `GET`
because a browser may prefetch a `GET`, and a badge that clears itself because
something looked ahead is a badge nobody can trust.

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

The same variable decides whether the login page offers that account to a
visitor (`config/demo.js`, served by `GET /api/demo`). The two are one switch on
purpose: the page must not advertise an account the database was never given, and
a deployment with real members must not publish a working password next to their
addresses.

Deploying without `MUTUO_DEMO_SEED` is fine — the build skips the seed, the login
page offers nothing, and the app comes up with an empty directory.

### Render, or any container host

`render.yaml` describes a web service and a Postgres database; point Render at
the repository and it reads the blueprint. There is also a `Dockerfile` for
anywhere that takes a container. Both run `server.js`, which readies the schema
before it binds a port, and neither involves `api/index.js`.

Note that Render's free Postgres plan **expires 30 days** after it is created and
is deleted 14 days later, which is why the demo above is not on it.

### Known limits

Honest about what is not production-ready:

- `db.sequelize.sync()` creates tables but never alters one it finds. Adding a
  column to a model therefore does nothing to a database that already exists, and
  since Sequelize names every attribute in its `SELECT`, the next query dies on
  "no such column" — a new deployment is fine and every existing one breaks.
  `config/schema.js` closes exactly that gap and nothing wider: it looks at what
  a table has and adds what it is missing. Renames, type changes and drops are
  all still unhandled, and `sync({ alter: true })` is not the answer because it
  performs them. Once there is data worth keeping, switch to `sequelize-cli`
  migrations.
- The nearby list is loaded, ranked and sorted in memory, because the distance is
  a haversine against the asker's own coordinates and writing that as an
  `ORDER BY` means writing it once per dialect. Fine for a directory of this
  size; the thing to add before the trigonometry moves into SQL is a bounding box
  in the `WHERE` clause.
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

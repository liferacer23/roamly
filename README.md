<p align="center"><img src="public/wordmark.svg" width="240" alt="Roamly" /></p>

# Leave room for wonder.

Roamly is a multi-city travel planner with local-time itineraries, real interactive maps, currency-aware expenses and permissioned sharing. Its quiet editorial interface keeps practical planning details close without turning a trip into a spreadsheet.

**Status:** built and verified locally; public deployment is intentionally on hold. No hosted demo URL exists yet. The local homepage opens an isolated, editable demo without registration.

![Journey collection](public/screenshots/desktop-journeys.png)

<details><summary>Itinerary and mobile experience</summary>

![A day in Tokyo](public/screenshots/desktop-itinerary.png)
<img src="public/screenshots/mobile-itinerary.png" width="320" alt="Mobile local-time itinerary and actual OpenFreeMap basemap" />

</details>

## What works

- Independent private journeys with date ranges, fixed base currency, budgets, lifecycle status, search and filtering.
- Multi-country destination stops with coordinates, arrival/departure dates and IANA time zones. Destination edits validate existing activities and recalculate UTC instants when the time zone changes.
- Persistent daily activities, local start times, durations, notes, categories, map coordinates, editing/deletion and visible overlap warnings.
- Real MapLibre/OpenFreeMap vector maps with markers, location popups, zoom/pan, accessible place lists, source attribution and explicitly labeled straight-line connections.
- Curated place search without credentials; optional genuine MapTiler worldwide geocoding behind a server environment variable. Results always identify their source.
- A local day planner using the curated catalog and nearest-neighbor ordering, plus optional structured AI selection from that catalog. Existing populated days are preserved. The local planner is never presented as AI.
- Coordinate-aware day optimization with walking-time estimates and buffers, bounded to finish on the same local day. Actual transport routes and hours are not invented.
- Original-currency expense records, Decimal conversions, dated Frankfurter reference-rate snapshots, idempotent submissions, category filtering, spending bars, budget progress and explicit partial totals when conversion is unavailable.
- Private accommodation/transport records with departure/arrival time zones, booking references and notes. These are planning records, not bookings made by the app.
- Persistent categorized checklists with optimistic completion and rollback on save failures.
- Revocable, expiring view-only or itinerary-editor sharing links. Shared responses omit expenses, reservations, booking references, checklists, authentication and tenant metadata.
- Trip summaries, travel statistics, printable summaries and CSV itineraries with local/UTC times and spreadsheet-formula protection.
- Real password authentication, hashed sessions, server authorization, origin checks, audit records, isolated demo reset/expiry, themes, responsive navigation and `⌘/Ctrl K` shortcuts.

## Architecture

Next.js 16 App Router, React 19, strict TypeScript, Prisma 6, PostgreSQL 16, Luxon, Decimal.js, MapLibre GL JS, Zod, Lucide, Node test runner and Playwright. CSS design tokens define an independent cream/coral/olive visual identity with editorial serif typography.

```mermaid
flowchart LR
  Browser[Journey workspace] --> API[Next.js handlers]
  API --> Guard[Session + origin + Zod + tenant scope]
  Guard --> Service[Transactional planning services]
  Service --> Time[Luxon local time / DST validation]
  Service --> Money[Decimal budget / dated FX snapshots]
  Service --> PG[(PostgreSQL)]
  API --> Providers[Bounded provider adapters]
  Providers --> FX[Frankfurter reference rates]
  Providers --> Places[Optional MapTiler geocoding]
  Providers --> AI[Optional structured AI selection]
  Browser --> Tiles[MapLibre + OpenFreeMap]
  Shared[Bearer sharing link] --> Projection[Restricted itinerary projection / edit capability]
  Projection --> Service
```

### Engineering decisions

`src/lib/planning.ts` contains deterministic calendar, distance, scheduling, overlap and financial functions. Calendar dates are stored separately from time-zone-aware activity instants. A local time must round-trip through its IANA zone; daylight-saving gaps and repeated ambiguous times are rejected instead of silently moved. Reservations preserve explicit offsets for cross-zone travel.

`src/lib/service.ts` checks ownership before any tenant mutation, locks workspace/trip rows and applies writes transactionally. Journey settings use optimistic revisions. Nested IDs are verified against the selected trip, including all shared-editor operations. Expenses have a unique trip/idempotency key, and currency cannot silently change after conversions exist.

Sharing uses a cryptographically random bearer token; only its SHA-256 hash is stored. A replacement invalidates the previous link, revocation is checked again inside the write transaction, and links expire after 14 days (or earlier with demo expiry). Editors can modify itinerary activities only. No external message is sent when a link is created.

### Data model

- `Workspace`, `User`, `Session`: ownership, scrypt password hashes, hashed session tokens and expiry.
- `Trip`, `Stop`, `Activity`: trip settings/revision, geographic stops, local wall times, UTC instants, durations and provenance.
- `Expense`, `FxRate`: original amounts, frozen conversion snapshots, observation dates, source, idempotency and reference-rate caching.
- `Reservation`, `Checklist`: private logistics and preparation records, excluded from public sharing.
- `SearchCache`, `RateLimit`, `Audit`: bounded provider caches, API request limits and tenant audit history.

Foreign-key cascades support atomic demo reset and trip deletion. Indexes cover tenant trip listing, ordered stops, activity start times, expense dates/idempotency, reference-rate lookup and expiry cleanup. The app uses a single serverless-compatible service, with no persistent in-function workers.

## Local setup

Requires Node 22, pnpm 9.15.4, and PostgreSQL 16 (or Docker).

```sh
pnpm install --frozen-lockfile
cp .env.example .env
docker compose up -d
pnpm db:migrate
pnpm dev
```

Open **http://127.0.0.1:3206**. Choose **Explore the live demo** for a private synthetic travel journal, or register for an empty workspace. The bundled Docker database binds only to loopback port 54326. An existing independent PostgreSQL database can be configured instead.

## Configuration

| Variable           | Purpose                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`     | Required independent PostgreSQL connection; use a managed pooled connection for serverless deployment. |
| `APP_URL`          | Exact app origin; HTTPS in production, used for origin checks and session-cookie security.             |
| `CRON_SECRET`      | Random server-only bearer token for scheduled expiry cleanup; blank disables cron access.              |
| `MAPTILER_API_KEY` | Optional server-only worldwide geocoding credential. No account is provisioned automatically.          |
| `OPENAI_API_KEY`   | Optional server-only AI planner credential. AI requests are disabled in public demos.                  |
| `OPENAI_MODEL`     | Optional Responses API model supporting structured output; default `gpt-4.1-mini`.                     |

OpenFreeMap tiles and Frankfurter reference rates require no API credential. Provider use remains subject to the providers’ terms and availability. Keys stay server-side and are never included in data responses or logs. Do not commit `.env` files. Example database credentials are for local development only.

The server transport uses bounded IPv4 HTTPS requests to three fixed provider hosts, with deadlines, response-size limits and redirect rejection. This resolved observed local dual-stack fetch timeouts without changing machine network settings.

## Verification

Use an independent **roamly_test** database. Tests refuse other database names. Fixtures are synthetic; no private/client environment data is used.

```sh
createdb roamly_test
cp .env .env.test
# Point .env.test DATABASE_URL at the separate roamly_test database.
DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:PORT/roamly_test?schema=public' pnpm db:migrate
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm build
pnpm exec playwright install chromium webkit
pnpm test:e2e
pnpm audit --audit-level high
```

Local results on **2026-11-23**: **15 domain/database tests** and **20 production-server E2E tests** passed, with successful type checking, linting and production build. Desktop Chromium and iPhone WebKit exercise journey/destination/activity workflows, scheduling, place search, expenses, reservations, optimistic checklists, sharing permissions/revocation, private-data projection, tenant isolation, export, reset, settings and real authentication. Both browsers loaded actual OpenFreeMap tiles and inspected real map markers with no provider-request failures in that verification.

A separate real provider smoke check fetched and persisted a Frankfurter CAD→USD observation dated 2026-11-20 (0.699); synthetic provider contract tests validate caching, dates, error boundaries and structured selections. No paid MapTiler or AI requests were made: those integrations are contract-tested with explicit test-only injected responses and have not been credential-verified live.

GitHub Actions repeats verification with PostgreSQL and uploads browser evidence. Hosted CI results must be checked independently. Auditing remains an unsuppressed CI job.

## Deployment preparation — Vercel

Deployment is **deferred at the owner’s direction**. No managed database, public domain, paid infrastructure or provider subscription has been provisioned.

Before public release:

1. Resolve the shared Next.js/Zod stack’s known critical/high dependency advisories and verify a clean audit. The current local audit retry failed with registry `ETIMEDOUT`; this is not security clearance. Recommended patch versions were unavailable during the portfolio build.
2. Connect the personal GitHub repository to Vercel. Configure Node 22 and `pnpm build`; Prisma Client generation is included in build/postinstall.
3. Provision a separate approved managed PostgreSQL database, configure production environment variables and apply `pnpm db:migrate` through a controlled release step.
4. Configure a managed scheduled `GET /api/cron` with `Authorization: Bearer <CRON_SECRET>` to expire demos, sessions, request buckets and search cache. No long-running worker is required.
5. Verify the actual production origin, isolated demo/reset, local-time activity edits, maps, expense conversion, shared viewer/editor boundaries and export. Update this README and GitHub with the real URL only after that succeeds.

## Deliberate limits and roadmap

- The app is a planner, not a booking agent. No live venue hours, prices, visa advice, weather, transport timetables or availability are claimed.
- Distance and walking duration are Haversine estimates at 4.5 km/h with a minimum 15-minute buffer. They ignore roads, barriers, elevation, accessibility, queues and transit. A road/transit provider is a future extension.
- Six curated cities and a small approximate place catalog power the credential-free demo; arbitrary destinations and manually located activities are supported. Worldwide geocoding requires a configured provider key.
- The AI planner selects up to three validated catalog places. It does not invent destinations or opening hours. Broader provider-grounded generation is a roadmap item.
- Seven currencies (USD/EUR/GBP/JPY/CAD/AUD/CHF); reference rates may differ from card/bank settlement. JPY inputs use whole yen. Missing conversions remain visible and excluded from known totals. Example demo conversions are labeled **EXAMPLE FX**.
- Expenses and reservation records can be removed/recreated; dedicated edit forms, receipt uploads and split-expense settlement are not implemented.
- Up to 20 journeys/workspace, 20 stops/trip, 500 activities/expenses, 100 reservations and 200 reminders/trip, with explicit validation limits.
- A private workspace has one owner. Collaboration uses a scoped bearer link; named invitations, per-user history and account recovery/email verification remain future work.
- Public hosting/security clearance and live verification of credential-based providers remain incomplete. Functional local passes are not a claim that those release tasks are done.

## License and assets

Application code is [MIT licensed](LICENSE). MapLibre, OpenFreeMap, OpenMapTiles and OpenStreetMap attribution is visible in map views. See the [OpenFreeMap integration guide](https://openfreemap.org/quick_start/), [MapTiler API documentation](https://docs.maptiler.com/cloud/api/geocoding/), [Frankfurter documentation](https://frankfurter.dev/) and [Luxon documentation](https://moment.github.io/luxon/api-docs/index.html).

Bundled destination photographs are downloaded from Unsplash under the [Unsplash license](https://unsplash.com/license): [Kyoto](https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e), [Porto waterfront](https://images.unsplash.com/photo-1555881400-74d7acaacd8b), [Paris](https://images.unsplash.com/photo-1502602898657-3e91760cbb34). Images illustrate destinations and are not hotel or booking claims.

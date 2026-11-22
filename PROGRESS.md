# Roamly progress

Updated 2026-11-23. Independent app on `build/roamly`, separate PostgreSQL `roamly` and `roamly_test` databases. Migration `202611220009_initial` applied to both. Deployments remain deferred.

## Completed

- Journey/destination/activity persistence, calendar bounds, IANA time zones, UTC instants, DST gap/ambiguity rejection and overlap feedback.
- Coordinate-aware day optimization, local curated planner, optional genuine structured AI catalog selection, explicit unavailable provider states.
- Real MapLibre/OpenFreeMap maps, markers/popups, source attribution, location list and clearly labeled straight-line distance/connection estimates.
- Curated and optional MapTiler search, dated Frankfurter FX snapshots, Decimal expenses/budget totals, idempotent recording and partial-conversion warnings.
- Private stays/transport details, optimistic checklists, printable summaries, CSV exports, trip statistics, themes and command navigation.
- Real password/session auth, server tenant enforcement, row-lock mutations, optimistic trip settings, audit, scoped hashed/expiring/revocable viewer/editor links and isolated resettable demos.
- README, architecture/data/setup/release documentation, MIT license, local photographs/wordmark, actual desktop/mobile screenshots and GitHub Actions.

## Executed checks

- Types, lint, production build: passed.
- 15 domain/database tests: passed.
- 20 production-server E2E tests: passed, desktop Chromium + iPhone WebKit. Three repeated mobile navigation runs and two focused map checks also passed after a page-lifecycle teardown fix. No forced/skipped critical interactions. Real map tiles loaded in both with no provider-request failures; markers/popups inspected.
- Actual Frankfurter CAD→USD 2026-11-20 reference observation fetched and cached (0.699). Provider requests use bounded native IPv4 HTTPS; standard local dual-stack fetch timed out.
- Live MapTiler/AI calls not run: credentials absent; injected contract tests passed and UI exposes the absence accurately. No paid calls/provisioning.
- Fresh dependency audit failed with registry ETIMEDOUT, including retry outside sandbox. Known shared-stack critical/high advisories remain an external public-release blocker; no security-clearance claim.
- Frozen pnpm install, formatting and final source/secret review: passed. Applied Prisma-generated SQL EOF newline preserved to keep its migration checksum intact.

## Decisions / limitations

One serverless-compatible Next.js app + PostgreSQL. Luxon/Decimal domain calculations. MapLibre 5.24.1 selected because current 6.19.0 depends on unavailable bidi-js ^1.1.0; normal pinned registry packages and verified official artifact integrity used. No machine network changes. Approximate walking geometry, seven currencies, small curated catalog, no actual bookings. Sharing omits expenses/reservations/checklists. Single private owner; no email recovery/verification, receipt uploads or expense/reservation edit forms yet.

## Publication and next steps

Personal GitHub `liferacer23` / type User verified; target repository was absent. Publication target: https://github.com/liferacer23/roamly, branch `build/roamly`. Exact public ownership/default branch/remote SHA verification is required after the push; the parent portfolio checkpoint records that result. No deployments are authorized yet. Hosted CI status is unverified.

# Maintenance review, 2026-09-23

## Scope and changes

- Reviewed the two Edge Functions, API access layer, migration permission definitions and admin layout/dialogs. Existing migration history and business workflows were retained.
- Account creation now requires an authenticated, active administrator, just like role updates. Optional account-edit fields remain optional for existing callers.
- Notification calls authenticate once and check the caller's role and relationship to the requested shift before using the service-role client. Substitute replies after declining remain supported.
- A new, additive database trigger prevents self-service changes to profile identity, role and active state while preserving normal profile edits and trusted administrative updates.
- Admin pages load on demand. Hidden desktop/mobile notification components no longer run simultaneously. Cancellation-message queries skip shifts without active bookings.
- Shared dialogs have one scrollable body, constrained visible viewport height, focus management and safe-area padding. Large shift dialogs and account dialogs use this path. Form action bars no longer cover fields while scrolling.
- Mobile personnel/import tables, navigation, notification panels and touch targets were adjusted without changing stored data.

## Verification

- `node node_modules/typescript/bin/tsc --noEmit`
- `node node_modules/vite/bin/vite.js build`
- `node scripts/test-edge-authorization.mjs`
- `node scripts/test-absence-suggestions.mjs`
- `node scripts/test-pass-bilagor.mjs`
- `scripts/test-admin-mobile.cjs`: mocked Supabase, 15 admin routes at 320x568, 390x844, 768x600 and 1440x500; long dialog scrolling and reachable buttons. Requires Playwright or PLAYWRIGHT_MODULE and local Vite with the documented test URL.
- `scripts/test-profile-permissions.sql`: disposable PostgreSQL only; CI runs this before applying the new migration.

## Deployment and limits

- Both Edge Functions must be deployed; the existing deployment workflow now covers both and runs regression tests first.
- The profile protection workflow tests and applies only the new migration. It does not rewrite or replay the existing schema.
- Browser verification uses fixtures, not production accounts or real push delivery. A physical iPhone keyboard/safe-area check is still useful; browser emulation cannot certify every device.
- This is not a complete production security certification. The repository does not fully define all current tables/policies (for example push subscriptions and pass messages), so live RLS/grants must be compared separately.
- Remaining architectural work: transactional booking/request/time-correction operations, notification idempotency/retries, replacing shared temporary-password defaults with invitations, and pagination for large result sets. These were not silently changed during this behavior-preserving maintenance pass.

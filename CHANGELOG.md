# Changelog

## [2.0.0] - 2026-08-11

### Fixed
- **Links no longer disappear.** Storage was an in-process `Map`, so every link created
  before an Appwrite container recycle stopped resolving. Links and clicks now live in an
  Appwrite database, and the server refuses to start in production without one
  (`STORE=memory` is opt-in, for local development).
- **Admin endpoints no longer answer strangers.** `requireAdmin` waved everyone through when
  `ADMIN_API_KEY` was unset — and it was unset in production, leaving `GET /api/urls` and
  `DELETE /api/urls/:code` open. A missing key now disables those routes (503) and a present
  key is compared in constant time.
- **QR codes are real QR codes.** The previous generator drew a grid that only resembled one
  ("actual QR needs more complex encoding", said its own comment) and no route served it. The
  encoder is now `qrcode`, exposed at `/api/qr/:code.svg|.png`, and the test suite decodes the
  PNG to prove a scanner can read it.
- **Analytics are visible.** Click totals, last click and a 14-day per-day sparkline are shown
  per link in the UI; they were collected from day one and never surfaced.

### Added
- `/api/health` reporting the active store driver and whether admin auth is configured.
- Click history is deleted along with its link; visitor IPs are stored only as a salted hash.
- Atomic click counting (`incrementDocumentAttribute`) instead of read-modify-write.
- `scripts/restart-check.mjs` — creates a link, kills the process, and resolves it from a new
  one against the real database. `scripts/verify-preview.mjs` — the same checks against a
  deployed URL. `server/e2e.test.ts` — 19 tests covering all four defects above.

### Changed
- Front end rebuilt on the tapiwa.me design system, with QR + analytics per link and a local
  history (the full list is admin-only, as it should be).


All notable changes to this project will be documented in this file.

## [1.0.0] - 2025

### Added
- Initial release
- Full implementation
- CI/CD pipeline
- Documentation

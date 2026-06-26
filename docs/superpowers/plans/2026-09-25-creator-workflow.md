# Creator workflow implementation plan

**Goal:** Deliver the approved personal creation workflow in the existing project.
**Spec:** `docs/superpowers/specs/2026-09-25-creator-workflow-design.md`
**Architecture:** Retain React, browser storage, FastAPI and PostgreSQL. Separate persistence helpers from page state; additive migrations preserve legacy records.
**Execution:** Implementation on `feat/creator-workflow`; independent backend and persistence modules delegated using dispatching-parallel-agents, UI integrated by primary agent. Publication to `main` subsequently authorized as ten dated commits. No production DB migration.

## Global constraints
- Existing secrets and database contents remain untouched.
- Title and body must retain their own random IVs; encryption v1 remains readable when metadata permits.
- AI output must not overwrite text without adoption; cancellation preserves current edits.
- Offline cache is encrypted and scoped to backend/account; retries must not create duplicate drafts.
- Automatic publishing and analytics scraping remain deferred.

## Review focus
- Concurrent saves and late responses must not overwrite newer edits.
- Missing key/legacy IV must not silently discard data.
- Changing account must not expose old drafts or restore them to the wrong account.
- Backup restore and image confirmation must verify ownership and avoid partial writes.
- Empty pages, network failures, streaming interruption and narrow panels must remain usable.

## Tasks
- [x] 1. Backend contracts: additive migration, version-aware drafts, tags/deduplication, validated images, manual records/metrics, error responses and OpenAPI. RED: real API integration tests against isolated PostgreSQL; GREEN: implement route/model changes.
- [x] 2. Frontend persistence: typed settings/API, v2 draft envelopes, encrypted account-scoped recovery, timeout/abort-aware SSE and backup envelope. RED: roundtrip/race/error tests; GREEN: minimal helpers.
- [x] 3. Backup: authenticated export/transactional restore and settings UI with encrypted file/password validation. RED: malformed/cross-owner/roundtrip tests; GREEN: implementation.
- [x] 4. UI workflow: four-tab navigation, toast/error states, collection/library/drafts/editor/publishing flows. RED: save/reopen/full-content/adoption integration tests; GREEN: UI and persistence integration.
- [x] 5. Verification: complete frontend/backend suites, build, migration on isolated database, extension browser smoke/visual QA, independent review, fix important findings. Document startup and migration/backup steps.

## Execution ledger
- Baseline: 151 frontend tests passed; frontend build has existing type errors; backend OpenAPI fails on missing Optional import.
- Ruling: operate on a feature branch in the user's clean existing checkout so installed dependencies remain usable; no production migration or remote publication.

- Completed backend additive migration and contracts with real PostgreSQL tests (random schemas in maintenance database); user's application database untouched.
- Completed independent persistence/API and backup implementations; parent integrated collection, all-page decrypted search, editor, signed image previews and manual publication/metrics.
- Final independent review: fixed foreign R2 object ownership during restore, dangling image references after deletion, and unsigned thumbnails in the editor. All have regression coverage.
- Additional save-race regressions: preserve newer edits after late responses, pin recovery to origin account, prevent cross-draft AI undo and reject stale copy retries.
- Final verification: 190 frontend tests, 33 backend tests, 4 real Chromium extension E2E tests all passed; production build and git diff --check passed.
- Browser QA: 390px panel snapshots reviewed; no horizontal overflow. Screenshots in docs/previews.
- Delivery: user requested ten commits to main, dated June 4, 7, 9 (three), 15, 20 (three), and 25, 2026, with author and committer times set to 16:39:59+08:00. No migration of xhs_tool performed. Real R2/AI/platform integrations require user configuration and were not exercised.

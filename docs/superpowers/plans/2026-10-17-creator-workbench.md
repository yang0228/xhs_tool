# Creator Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Implement the approved personal creation loop, preserving encrypted content, ownership and recovery.

**Architecture:** Extend existing drafts rather than add topics. Use one optional RAGFlow HTTP integration, browser Canvas and existing publishing/analytics; no workflow engine or queue.

**Tech Stack:** Existing React/TypeScript/FastAPI/PostgreSQL; only new browser dependency is `fflate`.

**Spec:** `docs/superpowers/specs/2026-10-16-phase-one-creator-workbench-design.md`

## Global Constraints

- Four existing navigation entries; support approximately 390px side panel and full page.
- Add `idea` to `draft|ready|published`; preserve optimistic locking, account isolation and encrypted recovery.
- RAGFlow plaintext copies contain selected material only; never send the master key. Check ownership and active document bindings.
- Two templates: checklist and steps. Default 1080 × 1440, at most 100 MB per ZIP.
- At most six retrieval chunks and 8,000 characters; at most three profile examples; CSV at most 500 rows.
- Read backup v1 and v2; do not change the existing application database during development.
- No publishing or pushing to GitHub is part of this implementation request.

## Review Focus

1. Partial old-client draft updates must preserve metadata, including explicit clearing versus omission.
2. Failed external deletion must immediately exclude retrieval and retain cleanup IDs.
3. Account switches and late asynchronous responses must never apply another account's text.
4. Snapshot and original image references must remain usable after draft deletion.
5. Interrupted restore ID remapping must retain encrypted context and permit retry.

---

### Task 1: Persistence and encrypted creation records

**Files:** backend models/schemas/routers for drafts, user/profile, publish, images; one additive Alembic migration; `backend/tests/test_workbench.py`.

**Interfaces:** Profile `GET/PUT /profile` returns `{encrypted_profile, version}`, PUT takes `expected_version`. Draft adds nullable encrypted envelope `encrypted_context`, nullable date `planned_date`, tags and `idea`. Publishing accepts optional encrypted snapshot with mandatory version when present and copies validated image IDs.

- [x] Write and run failing PostgreSQL behavior checks for idea creation, metadata-preserving old updates, profile conflict, versioned snapshot/idempotence and protected publication images.
- [x] Implement additive models/migration, strict envelope boundaries and owner/version checks. Keep legacy requests valid without pretending they contain snapshots.
- [x] Run new checks and existing backend suite, including migration round trip.
- [x] Commit the independently working persistence change locally.

### Task 2: Backup compatibility and creation interface

**Files:** `backend/app/routers/backup.py`, frontend draft types/codec/editor/list/settings, profile/brief UI; existing backup and editor tests.

**Interfaces:** DraftDocument extends title/content/image_ids with optional status/date/tags/context. Context format 1 contains brief, style snapshot, references and cards. Backup password envelope stays v1; payload/records emit v2, accept v1. Restore returns existing ID mapping; browser repairs only imported encrypted records, retaining retry state.

- [x] Add failing checks for context round trip, empty-body idea sync, metadata signature/recovery and v1/v2 backup restore with profile and image mappings.
- [x] Implement codec, editor form fields and profile settings; use existing tags/date controls and draft list. No new main navigation entry.
- [x] Implement backup field validation and retryable client-side context remapping; keep credentials absent.
- [x] Run backend, frontend and build checks; commit locally.

### Task 3: Optional RAGFlow and grounded writing

**Files:** one RAGFlow service, RAG router/config/model registration, existing material delete/AI routes; frontend material/settings/editor controls; RAG behavior checks.

**Interfaces:** `GET /rag/status`, `GET/POST/DELETE /materials/{id}/rag`, `POST /rag/retrieve` with question/optional material IDs. `POST /ai/grounded` streams suggestions from brief/style and server-fetched validated source IDs. Index bindings hold durable cleanup state; no client-selected dataset/API credentials.

- [x] Write failing checks with HTTP transport stubs for disabled service, ownership, upload retry, parse status, failed deletion exclusion and forged sources.
- [x] Pin documented API contract; use current httpx, controlled dataset binding and deterministic document names. Persist bindings before external mutation and retain cleanup records.
- [x] Add consent setting, per-material and batch synchronization, retrieval cards/exclusion and outline/body generation with explicit adoption and undo.
- [x] Run covered suites and build, then commit. Record that a real deployment is separately required.

### Task 4: Fixed cards and complete export

**Files:** card renderer/export helper and editor card component; publish page integration; package lock; card/export tests.

**Interfaces:** Context cards contain template `checklist|steps`, palette, ordered page text and optional image ID. Pure pagination accepts a measure function; async Canvas rendering returns PNG blobs. Export creates title/content/sources files and numbered image files in one ZIP.

- [x] Write failing checks for long/Unicode text, explicit page breaks/order, oversized or failed image export and ZIP contents.
- [x] Implement native Canvas pagination, editable cards, previews, download and `fflate` ZIP; wait for fonts and use current authorized image downloads.
- [x] Freeze saved version for export and publication snapshot; require reload when server version changes, retaining local work.
- [x] Run relevant checks/build and commit locally.

### Task 5: Scheduling, metrics import and review loop

**Files:** analytics schemas/router and simple CSV parser; publication schedule/snapshot display; analytics page; workflow tests.

**Interfaces:** Metrics accepts optional timezone-aware `collected_at`. `POST /analytics/import` takes CSV plus `confirm` (false previews, true revalidates and imports transactionally). `GET /analytics/insights` groups by immutable publication theme/template, reports sample/age/missing data. Review suggestions turn into idea DraftDocument seeds.

- [x] Write failing checks for malformed/foreign/duplicate CSV, invalid observation times, zero denominator and observation-window comparisons.
- [x] Implement at most 500 rows using stdlib CSV, unique observation handling, aggregate views and grounded review inputs.
- [x] Add week/unscheduled list, actual publication time, snapshot readback, observation entry/import and next-idea action.
- [x] Run relevant suites/build and commit locally.

### Task 6: Integrated verification and operational documentation

**Files:** representative browser workflow tests, README/config examples, verification report.

**Interfaces:** All preceding tasks; read real configured service statuses without requiring external credentials in tests.

- [x] Exercise idea → brief → sources → writing → cards → export → snapshot → metrics → next idea in browser, with intercepted external APIs clearly identified.
- [x] Run complete frontend/backend suites, production build, isolated migration round trip and 390px/full-page browser checks. Record actual results and unavailable live-service coverage.
- [x] Review whole branch with one fresh reviewer; reproduce important findings with failing checks, fix and run suites.
- [x] Commit verification/docs locally and leave a reviewable feature branch. Preserve the user's original checkout and untracked proposal.

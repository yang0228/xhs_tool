# Personal creator workflow

Approved intent: a personal Xiaohongshu content assistant, retaining React/Chrome extension and FastAPI/PostgreSQL. Implement stable storage, collection, creation, publishing assistance and encrypted backup. Automatic publishing and analytics scraping are explicitly deferred.

## Experience
- Four navigation entries: collection, library, creation, publishing. Settings in the header; images within library; manual analytics within publishing.
- Preserve complete collected text; selected text and pasted material supported. Search decrypted material locally, filter tags, paginate, detect duplicate content, select material for an outline/draft.
- Load/update existing drafts. Separate title/content IVs, versioned encryption metadata, recoverable encrypted local edits, optimistic version checks. AI suggestions stream separately and are applied explicitly with undo.
- Choose/reorder images and preview the note. Copy content, download images, open creator center and record an actual publication URL. Manually record metrics.
- Test connection/identity in settings; encrypted password-protected backup of database records, master key and pending edits; authenticated transactional restore with ownership checks.

## Contracts
- Draft retains existing fields and adds `content_iv: string|null`, `encryption_version: number`, `image_ids: string[]`. Writes use v2 and independent IVs. PUT includes `expected_version`; mismatch returns 409. Legacy missing body IV must show a recovery error, never silently overwrite.
- Material adds `tags: string[]`; POST duplicate hash within owner returns existing record. Pagination remains `{items,total,page}`.
- GET `/publish/posts` returns `{items,total,page}`. POST `/publish/records` takes `{draft_id,xhs_post_url}`. POST `/analytics/posts/{post_id}` takes nonnegative metric counts. Existing automatic routes fail explicitly as unsupported.
- GET `/backup` returns a versioned encrypted-record snapshot; POST `/backup/restore` transactionally imports under the current user with stable mapping of IDs. No raw encryption keys reach the backend.
- All new schema fields are additive. Do not run migrations against the user's existing database during development. Use a separate test database/schema. Preserve original data and legacy ciphertext.

## Verification
Build and OpenAPI must pass. Tests cover saving/reopening, repeat saves, conflicting saves, interrupted AI, offline recovery, full-length material, duplicate collection, upload failure/ownership, manual publication and metrics, wrong-password/corrupt backup and transactional restore. Real provider/creator-center behavior is reported separately from local tests.

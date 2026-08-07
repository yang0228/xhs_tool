# Verification — 2026-10-17

Implemented the approved phase-one creator workbench: topic/draft metadata, encrypted profile and brief, optional RAGFlow retrieval and citations, fixed Canvas cards and ZIP export, versioned publication snapshots, scheduling, CSV metrics and descriptive review-to-idea. Automatic publishing and analytics scraping remain deferred.

| Check | Result |
| --- | --- |
| Frontend Vitest | 238 tests across 39 files passed |
| Backend unittest | 78 tests passed, including live-contract and legacy material compatibility regressions |
| Extension TypeScript + Vite production build | Passed |
| Real Chromium extension tests | 7 workflows passed, including isolated short-article extraction, the complete phase-one loop and historical original-image recovery |
| Whitespace check | `git diff --check` passed |
| Documentation | Local README/spec/guide references passed |

Backend tests exercise real PostgreSQL transactions in isolated random schemas, including migration upgrades/downgrades, ownership, optimistic conflicts, deduplication, image deletion and transactional backup restore. They do not use the existing `xhs_tool` database.

Browser tests load the built extension in a temporary Chromium profile. They cover actual content-script extraction, 390px navigation, settings, existing editing/publication workflows, and topic → brief/profile → material retrieval → adopted writing → real Canvas PNGs → actual ZIP download/unzip → encrypted snapshot → metrics/CSV → review → next topic. The new flow also checks a 1280px viewport. Exported 1080×1440 cover and body PNGs were visually inspected, and ZIP text/source/image ordering was verified. API responses are intercepted; no real AI calls, R2 uploads or Xiaohongshu publications were made.

The full loop now deletes its original draft and renders the retained historical cards. A separate browser workflow publishes two originals in a deliberately different order from the image library, deletes the draft, checks the exact signed-URL request order and decoded pixels, then downloads an original and compares its bytes. Both 390px and 1280px checks include the main content's scroll width.

## Whole-branch review and fix pass

A fresh reviewer inspected `7e3590d..030e3c8`. The four important findings were reproduced and fixed in one consolidated pass: stale-account material/review carry-forward, stale-account rescheduling on cloned backends, truncated grounded streams without DONE, and missing historical original-image access. Card generation/splitting above the codec's 100-page limit was also treated as an acceptance issue because it produced an unsaveable normal editing state; generation now rejects without truncation and splitting stops at the limit.

Eleven focused behavioral regressions were observed failing before production fixes and passing afterward. The complete frontend/backend/build/browser checks above then passed. Seed navigation carries a hashed origin scope; the destination editor validates it before adopting text or reading a recovery cache. Schedule items and publication snapshots retain their load identity, including image fetches. Grounded writing alone requires the final stream sentinel, preserving the existing generic streaming contract.

Review boundaries remain explicit: no live RAGFlow/parser/embedding compatibility check, factual-entailment or prompt-injection model evaluation, live R2 CORS/signature check, actual platform publishing, or independent manual sample of 20 materials and two real publications was performed. The regression pass addresses the newly introduced paths and does not certify every pre-existing account-switch action surface. These limits can affect deployment compatibility, generated-content quality and untested edge cases; they are not established by the intercepted browser APIs.

Regression coverage includes account switches/late responses, metadata-preserving old-client updates, empty-body ideas, profile conflicts, interrupted encrypted reference repair, publication image remapping, stale saved versions, duplicate observations/CSV transactions, retrieval ownership/revocation/hash/config changes and invalid streamed citations. New migrations were upgraded/downgraded in isolated schemas while retaining legacy ciphertext. RAG HTTP behavior uses a fake remote transport and real PostgreSQL; it is not live RAGFlow compatibility or retrieval-quality evidence.

The RAG direct collection→writing check explicitly covers bindings still marked `processing`: retrieval accepts available remote chunks without requiring the user to visit the progress page first, while preserving all active-owner/hash/config filters.

Known operational requirements:
- Back up the existing PostgreSQL database and apply Alembic migration before starting the updated backend.
- Legacy ciphertext whose original IV is missing cannot be repaired by schema migration.
- R2 requires its own configuration/CORS; backups contain image references, not image bytes.
- Backup restoration requires the original API Key and same backend/account. Different local encryption keys are never overwritten.
- RAGFlow is separately deployed and configured using the fixed candidate API contract `v1.0.0-rc2`; live service/embedding/AI acceptance is still required on the deployment. Source-ID validation does not prove factual entailment.
- Backup v2 includes profile/context/snapshots but excludes service keys and external RAGFlow data. A new instance needs re-indexing; interrupted reference repair remains retryable in settings.
- The historical verification at the previous main baseline was frontend190/backend33/browser4. Counts above describe this feature branch, not a deployed service.

## Local RAGFlow deployment follow-up

The later local deployment exercised real RAGFlow `v1.0.0-rc2` (`ac29b4b29928ca65d3efca19b6cfae3f86069b81`), Ollama `0.40.5` and the official BGE-M3 F16 embedding model (1024 dimensions) on ARM64. The model manifest, configuration, license and weights were verified against their SHA-256 digests. These checks extend the earlier mocked-HTTP evidence; they do not retroactively change the original reviewer’s untested-service findings.

Real requests exposed two rc2 differences: absent `name`/`id` document filters return code 102, and parsing uses `ingestion_status` (`COMPLETED`/`FAILED`) rather than legacy `run`. The adapter now paginates the authorized dataset and filters exact names/IDs locally, and accepts both status formats. Three regressions failed before these changes and passed afterward; the full backend suite passed 76 tests.

The live acceptance check used a disposable PostgreSQL schema and temporary RAGFlow datasets. It passed upload → parse → local embedding → cited-source retrieval, cross-user denial and revocation/removal from retrieval. Temporary datasets and schema were removed. No production material or paid AI generation was used. This verifies the basic plain-text integration for this deployed version/model; image/PDF parsing, factual support of AI output, large-corpus quality and other RAGFlow versions remain separate checks.

## Existing-material indexing follow-up

An original-collector material exposed a hash compatibility issue: its saved hash is SHA-256 of the exact `标题：<title>\n\n<body>` plaintext, whereas the newer collector hashes the normalized JSON title/body pair. Indexing now also accepts the known original envelope when its title matches stored metadata and its exact plaintext hash matches the saved material hash. Original ciphertext, hash and other fields remain unchanged. Regression coverage checks successful indexing/retrieval/idempotence, unchanged original records, and rejection of modified titles/text/hashes or unrecognized raw-hash formats. The reproduction failed before the fix; all 78 backend tests then passed.

The existing database was backed up and restored into a disposable database to verify all row fingerprints. The valid material was decrypted and submitted by the user's Chrome extension; its real local index reached `ready`. Production retrieval preserved source material/hash/URL bindings and rejected cross-user access and invented source IDs. Every original table fingerprint remained unchanged, excluding the newly populated RAG index table. One malformed historical test record was retained without indexing. The old captured body contains a news feed rather than the complete article matching its headline, so successful indexing alone does not establish source relevance or completeness.

After the user supplied a valid DeepSeek service key, the local backend was restarted and the authenticated HTTP path passed real retrieval → grounded outline → grounded body generation. The sample used two retrieved excerpts totaling 1,008 characters. Both streams returned the final `[DONE]`, contained no error events, and used only the two bound citation numbers. The outline had four citation markers and the body five. A manual comparison found the sampled price, performance-gap and token-share numbers in their referenced excerpts; this is source-consistency evidence, not independent verification of the news. Raw streams, generated texts and copies with source excerpts were saved separately. All ten database tables had identical row counts and fingerprints before and after generation, including drafts and RAG indexes. No draft was created or overwritten. This verifies one live sample with `deepseek-chat`; it does not certify broad retrieval quality or factual entailment across other materials.

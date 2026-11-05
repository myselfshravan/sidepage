# Data model (Cloud Firestore)

All access is through the Admin SDK on the server. Security rules deny every client read and write. Shapes are defined in `src/server/firebase/model.ts`, and field names are snake_case.

## Collections

| Path | Responsibility | Written by | Read by |
|---|---|---|---|
| `works/{workId}` | The author's workspace for a publication: draft metadata, status, visibility, dates, chapter order, counters | studio services | studio only |
| `works/{id}/chapters/{chapterId}` | Draft chapter: `doc` (manuscript JSON), `rev` (autosave concurrency), word count | studio services | studio only |
| `works/{id}/chapters/{cid}/revisions/{revId}` | Revision snapshots: `AUTO` (≥10 min or ≥200 words apart), `CHECKPOINT`, `BEFORE_RESTORE` | studio services | studio only |
| `works/{id}/events/{eventId}` | Append-only history: `occurred_at` (server time), `effective_at` (claimed date), actor, status change, edition | same transaction as each change | studio |
| `editions/{workId}-e{n}` | Edition header: `state` SEALING→SEALED, `seal_token`, metadata snapshot, table of contents, `content_hash`, `effective_published_at`, `sealed_at` | publishing service | public read model |
| `editions/{id}/parts/{token}-{ordinal}-{part}` | Chapter snapshot (one or more parts per chapter) | publishing service | public read model |
| `published/{workId}` | Public read model: `live`, `listed`, `visibility`, `current_edition_id`, card metadata, dates | publishing and visibility services | public pages |
| `slugs/{slug}` | Global slug reservation → `work_id` | created in a transaction with the work | public pages |
| `rate_limits/{sha256}` | Fixed-window counters, keyed by a salted hash (no raw IPs or uids) | rate limiter | rate limiter |

Deferred collections (designed, not created yet): `grants`, `invitations`, `share_links`, `users/{uid}/progress`, `users/{uid}/bookmarks`, `assets`, `ingest_batches`, `story_entities`, `story_connections`, `audit_events`.

## Dates

| Field | Meaning |
|---|---|
| `created_at` | When the record was created. |
| `last_edited_at`, `last_edited_by` | Latest draft or metadata change. |
| `original_written_at` | `PartialDate {year, month?, day?, approximate}`. A memory, not a timestamp. |
| `digitized_at` | When a physical original was transcribed. |
| `first_published_at` | Intended date of the first publication, backdatable. Earlier backdates move it earlier. |
| `last_published_at` | Intended date of the current edition. |
| `last_publish_executed_at` | When the latest publish actually ran (server time). |
| `scheduled_for` | Intended future publication instant, while SCHEDULED. |
| `timezone` | The author's IANA zone. Dates are entered and displayed in it and stored as instants. |

## Queries and indexes (`firestore.indexes.json`)

| Query | Index |
|---|---|
| Collection page: `published where listed==true and collection==X order by sort_at desc` | `listed, collection, sort_at desc` |
| Home and archive: `published where listed==true order by sort_at desc` | `listed, sort_at desc` |
| Scheduler: `works where status=='SCHEDULED' and scheduled_for<=now order by scheduled_for` | `status, scheduled_for` |
| Studio filter: `works where status==X order by last_edited_at desc` | `status, last_edited_at desc` |
| Editions list: `editions where work_id==X order by number desc` | `work_id, number desc` |
| Stale-seal sweep: `editions where state=='SEALING' and claimed_at<cutoff` | `state, claimed_at` |

`doc` fields on chapters, revisions and parts are excluded from indexing. Lists are paginated: the studio table has 20 per page with a cursor, and public lists are capped.

## Size limits

- Draft chapter: 900 KB, under Firestore's 1 MiB document cap. The author is asked to split longer chapters.
- Edition parts: 800 KB each, split at block boundaries.
- `chapter_order` is capped at 400 chapters.
- There are no other unbounded arrays.

## Retention and deletion

| Data | Rule |
|---|---|
| Editions and events | Never deleted by the application. |
| Deleting a draft chapter | Removes the chapter and its revisions; editions keep their copy. |
| `rate_limits` | Carry `expires_at`; configure a Firestore TTL policy on that field. |
| Abandoned SEALING claims | Swept after one hour. |
| Automatic revisions | Pruning is planned (keep checkpoints, last 50 automatic, one per day). |

# Architecture

## Shape

One Next.js 16 application on Vercel. There are no client-side database reads or writes. The browser talks to the Next.js server, and the server talks to Firebase through the Admin SDK.

```
Browser ──► Next.js (Vercel, Node runtime)
              ├─ public pages ─► src/server/read/public.ts ─► Firestore: slugs, published, editions (sealed)
              ├─ studio pages + server actions ─► src/server/services/* ─► Firestore: works, chapters, revisions, events, editions
              ├─ /api/auth/session ─► Firebase Auth (ID token ⇄ session cookie)
              └─ /api/cron/publish-due ◄── GitHub Actions, every 15 min
```

## Layers

| Layer | Path | Rule |
|---|---|---|
| Domain | `src/domain` | Pure TypeScript: lifecycle state machine, manuscript schema and validation, metrics, partial dates, slugs. Lint forbids Firebase, Next.js and React imports. |
| Server infrastructure | `src/server/firebase` | The only place Firebase is initialised. Typed document shapes and paths in `model.ts`. |
| Auth and HTTP | `src/server/auth`, `src/server/http` | Session cookies, author check, CSRF origin check, rate limiting. |
| Services | `src/server/services` | Every write. Each takes an `Actor`, validates input with Zod, uses transactions. |
| Public read model | `src/server/read/public.ts` | The only module public pages read from. It may use `'use cache'`; nothing else may. |
| Content | `src/content` | Tiptap extensions for the editor and `RenderDoc`, a server-side JSON→React renderer. Both are derived from the domain manuscript schema. |
| UI | `src/app`, `src/components` | Server Components by default, with small client islands for the reader shell, editor and studio forms. |

Lint enforces these boundaries (`eslint.config.mjs`):
- `'use cache'` is an error in services, auth, studio and editor code.
- Public routes and components may not import services or studio actions.
- The domain layer may not import infrastructure.

## Rendering and caching (Cache Components)

- **Collection, home, archive and sitemap pages** are static and cached with `cacheLife('max')`, tagged `catalog`.
- **Publication and chapter pages** use partial prerendering. The params-dependent part streams inside `<Suspense>`. Data comes from cached functions tagged `slug:<slug>`, `work:<id>` and `edition:<id>`.
- **Sealed editions never change**, so their content is cached indefinitely by edition id. Access always goes through `getPublicWork`, which is invalidated by tag whenever visibility or lifecycle changes.
- **Invalidation:** server actions call `updateTag` (immediate). The cron route calls `revalidateTag(tag, { expire: 0 })`.
- **Studio** pages read the session through `getViewer()`, which calls `connection()` and `cookies()`. They are therefore request-time only and are never prerendered or prefetched with data. Every studio page authorises itself, because layouts and pages render in parallel.

## Manuscript format

The canonical content is ProseMirror/Tiptap JSON restricted to the node and mark set in `src/domain/manuscript/schema.ts`:
- nodes: paragraph, heading 2–4, blockquote, bullet and ordered lists, horizontal rule, hard break, footnote;
- marks: bold, italic, link.

`validateManuscript` normalises untrusted JSON on every save. It drops unknown attributes and rejects unknown nodes, unsafe links and deep nesting. The format is portable and independent of the renderer. HTML is never stored.

## Publishing engine

The lifecycle is a pure function, `transition(state, command, now)`, in `src/domain/lifecycle/machine.ts`.

Publishing is two-phase (`src/server/services/publishing.ts`):

1. **Claim.** A transaction claims `editions/{workId}-e{n}` in state `SEALING` with a random `seal_token`. It fails if that edition is already SEALED or the draft changed since the snapshot.
2. **Parts.** Chapter snapshots are written as `editions/{id}/parts/{token}-{ordinal}-{part}`, in batches capped at 400 writes and 8 MiB. Chapters over 800 KB are split at block boundaries.
3. **Commit.** A transaction re-reads the work and re-runs the state machine. It checks token ownership, `draft_version` and `edition_count`. Only then does it mark the edition SEALED, update the work, write the `published` read model and append an event.

| Situation | What happens |
|---|---|
| Concurrent publishes | Collide on the deterministic edition id. One wins; the other gets `CONFLICT`. |
| Losing attempt | Its parts carry a different token: ignored by readers, deleted after commit. |
| Abandoned claim | `sweepStaleSeals` deletes it after an hour. |
| Republish with identical content | Refused (`NO_CHANGES`). |
| Publish after a withdrawal, nothing changed | Reuses the existing edition. |

The content hash is SHA-256 of canonical (key-sorted) JSON of the edition metadata plus the ordered `{slug, title, doc}` of each chapter. `verifyEdition` recomputes it from the stored parts.

## Scheduling

`schedule(at)` stores the intended time in `scheduled_for`. `/api/cron/publish-due` (Bearer `CRON_SECRET`) publishes every due work:
- The edition is dated `scheduled_for`, however late the run.
- `last_publish_executed_at` records the actual run time.
- Runs are idempotent and safe to overlap, because the commit transaction re-checks status.
- A GitHub Actions cron triggers it every 15 minutes, because Vercel Hobby crons are daily only.

## Sessions

1. The browser signs in with the Firebase client SDK, using in-memory persistence so nothing is stored on the device.
2. It sends the fresh ID token to `POST /api/auth/session`.
3. The server verifies the token (checking revocation, `auth_time` under 5 minutes, and the author claim plus email), then sets a 1-day httpOnly `__session` cookie.
4. The client then signs out locally.
5. Sign-out revokes refresh tokens server-side.
6. Auth changes use full navigations, so the client router cache is discarded.

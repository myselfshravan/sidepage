# Project status

**Release 1, the publishing journey: built and verified locally against the Firebase emulators. Not deployed.**
Last updated 2026-11-05.

## Done and verified

Each item was checked by the named tests, or in a real browser (Chromium via Playwright; screenshots taken desktop and mobile).

| Area | What works | Verified by |
|---|---|---|
| Lifecycle | DRAFT → REVIEW → SCHEDULED → PUBLISHED → ARCHIVED, covering submit, reject (with note), return to draft, schedule, cancel schedule, publish, backdated publish, republish, withdraw, archive and restore. Pure state machine. | `tests/domain/lifecycle.test.ts` (unit plus 500-run property test), `tests/integration/publishing.test.ts` |
| Immutable editions | Two-phase sealing, content hashes, edition history in the studio. Draft edits never change a sealed edition. Republishing keeps earlier editions. Concurrent publishes produce one edition. Mid-publish draft changes abort. Large chapters split across parts. Stale-claim sweep. | publishing.test.ts, `tests/e2e/publishing.spec.ts` |
| Historical dates | Approximate "originally written" partial date; digitised date; backdated publication date entered in the author's time zone. Intended and executed times recorded separately. `created_at` untouched. | `tests/integration/drafts.test.ts`, publishing.test.ts, e2e |
| Scheduling | Due works publish via `/api/cron/publish-due`, dated at the intended time even when the run is late. Duplicate and overlapping runs are safe. Cancel works. | publishing.test.ts; e2e checks the endpoint refuses calls without the secret |
| Studio | Dashboard, paginated and filterable publication list, create, metadata, visibility, duplicate, chapters (add, reorder, delete, URL), events history, editions list. | e2e journey, screenshots |
| Editor | Tiptap with headings, bold and italic, quotes, lists, scene breaks, safe links and footnotes. Autosave with conflict detection. Automatic and checkpoint revisions with preview and restore. Word count, reading time, draft preview, shortcuts (⌘S, ⌘K, ⌘⇧P, ⌘/), unsaved-changes guard. | drafts.test.ts (autosave, conflicts, revisions, restore); e2e (autosave persists across reload) |
| Reader | Memoir and fiction themes, collection pages, publication pages, chapter reader. Size, typeface, spacing and light/dark preferences applied before paint. Progress bar, resume, bookmarks, table of contents, full screen, fiction content-warning gate. | `tests/e2e/reader.spec.ts` on desktop and mobile |
| Security | Deny-all rules; httpOnly session cookies; author = claim + verified email; revocation; CSRF origin checks; rate limits; CSP and security headers; strict public/private read separation; no client token storage. | `tests/rules`, `tests/integration/auth.test.ts`, e2e (forged cookie, cross-site POST, sign-out replay) |
| Tooling | Strict TS, ESLint with architecture boundary rules, CI workflow, scheduled-publish workflow, secret scan, emulator seed, `scripts/limited.sh` resource cap. | `pnpm verify` |

## Test status (last run 2026-11-05)

| Suite | Result |
|---|---|
| `pnpm typecheck`, `pnpm lint` | pass, 0 warnings |
| `pnpm test` (unit) | 37/37 |
| Integration + rules (emulators) | 44/44 |
| `pnpm build` | pass: public pages static or partial-prerendered, studio request-time |
| `pnpm test:e2e` | 13/13 (desktop + mobile) |
| `pnpm check:secrets` | pass |

The GitHub Actions CI has not run yet; it starts with the first push.

## Deployment status

| Item | State |
|---|---|
| GitHub repository | **Not created.** Waiting for your go (`gh repo create myselfshravan/sidepage --public`). |
| Vercel | **Not linked.** Waiting for your go. |
| Firebase `sidepage-c4daa` | Exists; web app config is in `.env.local`. Firestore database not yet created; rules not deployed; Auth Google provider not confirmed. |
| Workload Identity Federation | Code written; GCP setup not run (DEPLOYMENT.md §2). |
| Production project, domain, monitoring, backups | Not started (Phase 9). |

## Known limitations

- **Visibility:** only PUBLIC works are served. UNLISTED and PRIVATE hide a work completely until sharing (Phase 4) lands.
- **Uploads:** no image or cover uploads (Spark plan). Typographic covers are generated instead.
- **Soft 404s:** unknown publication URLs render the not-found page with HTTP 200, because they stream under partial prerendering. Search engines get `noindex`.
- **Reader data:** progress and bookmarks live on the reader's device.
- **Revision pruning:** automatic revisions are not pruned yet.
- **Monitoring:** no analytics, Sentry or email yet.
- **Dashboard:** "reader statistics" are not shown; they need analytics.
- **Revocation timing:** Firebase revocation has one-second granularity.

## Blockers (need you)

1. Approval to create the public GitHub repo and push.
2. Approval to link Vercel; your Vercel team slug for WIF.
3. In the Firebase console:
   - create the Firestore database (region `asia-south1` recommended; permanent);
   - enable the Google sign-in provider.
4. Later: the Blaze upgrade, with a budget alert first.

## Next recommended actions

1. Push, link Vercel, set up WIF on `sidepage-c4daa`, and deploy a preview. Verify real sign-in and the token exchange end to end.
2. Run `pnpm grant-author` against `sidepage-c4daa`.
3. Phase 4: sharing and invitations, with the full reader-access security matrix.

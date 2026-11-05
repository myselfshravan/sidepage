# Project status

**sidepage is a live multi-author platform at https://sidepage.vercel.app.** Readers sign up, authors are approved by an admin, and each author manages only their own work. Private and invited reading (Phase 4) is next.
Last updated 2026-11-06.

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

## Test status (last run 2026-11-06, commit `76bd0ef`)

| Suite | Result |
|---|---|
| `pnpm typecheck`, `pnpm lint` | pass, 0 warnings |
| `pnpm test` (unit, including access policy and the analytics privacy check) | 43/43 |
| Integration + rules (emulators; including cross-author isolation, roles, the author-request flow and reader data) | 58/58 |
| `pnpm build` | pass |
| `pnpm test:e2e` (sign-up and verification, author approval, cross-author isolation, library, synced bookmarks, publishing journey, reader) | 17/17 |

## Deployment status

| Item | State |
|---|---|
| GitHub | https://github.com/myselfshravan/sidepage (public). CI green on `86bdca9`. Secrets set: `CRON_SECRET`, `SIDEPAGE_URL`. |
| Vercel | Project `myselfshravans-projects/sidepage`, production https://sidepage.vercel.app. Node 24 with `NODE_OPTIONS=--experimental-require-module` (see D15). All variables set for Production and Preview. |
| Auto-deploy from git | **Not working yet.** The repo is linked, but pushes create no deployments, most likely because the Vercel GitHub App's repository access excludes `sidepage`. Current deployments come from the CLI (`vercel deploy --prod`). |
| Firebase `sidepage-c4daa` | Firestore `(default)` in `nam5`; deny-all rules and indexes deployed; Auth set up with Google enabled; `sidepage.vercel.app` authorized. |
| Credentials | Workload Identity pool `vercel` → service account `sidepage-app` (roles: `datastore.user`, `firebaseauth.admin`, `serviceusage.serviceUsageConsumer`). No keys exist. Verified: STS exchange, impersonation, Firestore and Auth reads (`pnpm check:credentials`), and the production runtime. |
| Production checks | Public pages 200 and CDN-cached; security headers present; `/studio` redirects; forged cookie gets no data; cross-site session POST 403; bad token 401; cron without secret 401. |
| Auth providers | Google, plus email/password with verification, enabled on `sidepage-c4daa`. |
| PostHog | Shares the existing PostHog project; every event is tagged `app: sidepage` (D18). |
| Still open | Your admin role (sign in once, then `pnpm grant-admin`). Private and invited reading (Phase 4). Separate `sidepage-prod` project, domain, backups (Phase 9). |

## Known limitations

- **Visibility:** only PUBLIC works are served. UNLISTED and PRIVATE hide a work completely until sharing (Phase 4) lands.
- **Copy:** homepage and About copy are neutral placeholders in `src/lib/site.ts` and `src/app/(house)/about/page.tsx`, for you to replace.
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

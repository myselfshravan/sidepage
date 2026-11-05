# Decisions

Each entry: the decision, why, and what it costs.

### D1. Rules deny all clients; the server is the only data path
- **Why:** access needs joins across visibility, editions and (later) grants that rules express poorly. One TypeScript authorization layer is easier to test, and rules can't drift from it.
- **Cost:** every read and write is a server hop. Rules tests only prove "deny everything", so the real security tests are service and e2e tests.

### D2. Drafts (`works`) and the public read model (`published` + sealed `editions`) are separate collections
- **Why:** public code never touches a draft, and published content is immutable by construction.
- **Cost:** some metadata is duplicated per edition.

### D3. Two-phase edition sealing with a deterministic id and a random seal token
- **Why:** an edition with many chapters exceeds one transaction's limits. The deterministic id makes concurrent publishes collide. The token stops a losing attempt's writes from mixing with the winner's. See ARCHITECTURE.md.
- **Cost:** abandoned claims need a sweeper.

### D4. Historical dates: `PartialDate` for "written"; intended vs executed publication times kept separately
- **Why:** memoir dates are often approximate. Backdated and late-scheduled publications must show the intended date while recording what really happened.

### D5. Workload Identity Federation instead of a service-account key
- **Investigated:**
  - firebase-admin only forwards service-account keys or ADC to Firestore, so it can't use a federated credential directly.
  - `@google-cloud/firestore` accepts a `GoogleAuth` built from an `ExternalAccountClient`, and Firebase Auth accepts a custom `Credential`.
  - Both are wired in `src/server/firebase/admin.ts`.
- **Status:** compiles and runs against the emulators. The real token exchange is unverified until the first Vercel preview.
- **Fallback, only if WIF proves unworkable:** a dev-only key stored as a sensitive Vercel variable, recorded here with the reason.

### D6. Static CSP with `'unsafe-inline'` scripts instead of nonces
- **Why:** nonces force fully dynamic rendering, which is incompatible with partial prerendering. Manuscripts can't inject script because they render as React text from allowlisted JSON.
- **Revisit:** when SRI-based CSP is stable.

### D7. Scheduled publishing via GitHub Actions every 15 minutes
- **Why:** Vercel Hobby crons run daily.
- **Cost:** up to about 15 minutes of latency, plus GitHub's own cron jitter. The run is idempotent, and editions are dated at the intended time regardless.

### D8. Spark plan for release 1
- **Why:** the author's choice, to defer billing.
- **Cost:** no cloud Storage, so no image covers; a typographic cover is generated from the title instead. No PITR or backups yet. Storage works in the emulator.

### D9. Bespoke studio primitives instead of shadcn/ui (for now)
- **Why:** release 1 needs buttons, fields, panels and native radios and dialogs. A handful of small components on the design tokens avoids generated boilerplate and its generic look.
- **Revisit:** adopt shadcn/ui (Radix) when the studio needs menus, popovers or a command palette with complex focus management.

### D10. Firebase server SDKs are external packages (`serverExternalPackages`)
- **Why:** bundling put two copies of `@google-cloud/firestore` into different server chunks. Firestore then rejected `Timestamp` objects from the other copy (found by the e2e suite).

### D11. Auth changes use full page navigations
- **Why:** partial prefetching cached a "signed-out → /sign-in" redirect for `/studio`, which was replayed after sign-in. A full navigation also drops any studio payloads from the client router cache at sign-out.

### D12. ~~The author is identified by claim and email~~ (superseded by D16)

### D13. ~~Reader progress and bookmarks are stored on the device~~ (superseded by D17)
- **Why:** release 1 has public reading only, with no reader accounts. Synced progress arrives with invited readers.
- **Not stored on the device:** draft manuscripts. Recovery uses server autosave and revisions only.

### D14. Regions: Firestore `nam5`, Vercel functions `iad1`
- **Why:** the `(default)` database was created in `nam5` (US multi-region) before this plan's `asia-south1` recommendation was applied. A Firestore location is permanent, so functions run in `iad1` to keep Admin SDK round-trips short.
- **Cost:** readers in India get CDN-cached public pages, so this matters mainly for studio latency.

### D15. `NODE_OPTIONS=--experimental-require-module` on Vercel
- **Why:** Vercel's Node runtime has `require(esm)` disabled. `firebase-admin` 14 → `jwks-rsa` 4 → `jose` 6 (ESM-only) then fails with `ERR_REQUIRE_ESM` on every Auth call. Reproduced locally with `--no-experimental-require-module`.
- **Revisit:** remove the flag if firebase-admin ships an ESM-safe dependency chain.

### D16. Multi-author platform; roles live in Firestore, not in token claims
- **Change:** sidepage was first built for a single author identified by `AUTHOR_EMAIL`. It is now a platform where anyone can sign up as a reader, readers ask to write, and an admin approves them.
- **Why roles are in `users/{uid}`:** the server reads the role on every request, so promotions and demotions apply immediately. Custom claims would only refresh with a new token.
- **Ownership:** every work has an `owner_uid`. Services return not-found to non-owners, so the existence of drafts isn't revealed. Admins can moderate any work.
- **Sessions:** readers get 14-day sessions; authors and admins get 1-day sessions.

### D17. Signed-in reader data is stored server-side
- **What:** progress, bookmarks, library and follows live under `users/{uid}`. Writes are accepted only for works the reader can currently read.
- **Anonymous readers:** keep progress and bookmarks on the device as before.
- **Static pages:** reading pages stay static and fetch account state from `/api/reader` after load.

### D18. PostHog shares the existing project
- **Why:** the PostHog organization's free plan allows one project, which an existing app already uses.
- **How:** every sidepage event carries `app: "sidepage"`. Moving to its own project means changing `NEXT_PUBLIC_POSTHOG_KEY`.
- **Settings:** autocapture and session recording are off, and page titles are stripped. Sentry was dropped at the user's request.

### D19. Pen names are unlinkable by construction
- **How:** a publication's `byline` is `profile`, `pen_name` or `anonymous`. For the last two, the public read model stores `public_author_uid: null` and an empty handle. Author pages, follows and the library all query `public_author_uid`, so pen-name works can't be joined to an account or to each other through any public surface.
- **Who can still see the link:** `owner_uid` stays on server-only documents so the studio and admins can manage the work.

### D20. Private reading is by secret link
- **How:** `share_links/{sha256(token)}`. The 256-bit token is the key, shown once.
- **Expiry and revocation:** checked on every request. Link pages are dynamic, `no-store`, `noindex` and `no-referrer`.
- **Why not reader accounts:** chosen over invite-by-account for simplicity; readers need no account. A link opens the current edition of a live work, and withdrawing the work closes every link.

### D21. Agents use personal access tokens and a local stdio MCP server
- **Tokens:** created by admins only, `sp_` + 256 bits, stored hashed. They act with the owner's *current* role, so demotion cuts them off.
- **API:** `/api/v1` uses bearer auth only (no cookies, so CSRF doesn't apply) and is rate-limited per owner.
- **MCP server:** `scripts/mcp/sidepage-mcp.mts` is a stateless client of that API, chosen over a hosted MCP endpoint per the owner's preference.

### D22. Open Graph cards are generated in the site's type
- **How:** `next/og` with Newsreader and Bodoni (OFL, in `assets/fonts`).
- **Private pages:** secret-link pages deliberately inherit the generic site card, so a pasted private link never previews its title.

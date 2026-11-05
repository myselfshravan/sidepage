# Security

## Model

1. **Rules deny everything.** `firestore.rules` and `storage.rules` deny all client reads and writes, so the server is the only data path. Tests in `tests/rules` prove this for anonymous users, readers and an author-claim token.
2. **Authorization lives in server code.**
   - Every studio page calls `requireAuthorPage()`.
   - Every server action calls `guard()`: `assertSameOrigin`, then `requireAuthor`, then `rateLimit`.
   - Route handlers check origin and rate limits themselves.
   - `src/proxy.ts` only does an optimistic redirect. It is not a security boundary.
3. **The author is** a Firebase user with custom claim `role: "author"` **and** a verified email equal to `AUTHOR_EMAIL`. Both must hold on every request.

## Controls

| Control | Where |
|---|---|
| Session cookies: httpOnly, SameSite=Lax, Secure over HTTPS, 1-day lifetime, minted only from sign-ins under 5 minutes old | `src/server/auth/session.ts`, `src/app/api/auth/session/route.ts` |
| Revocation: `verifySessionCookie(…, checkRevoked=true)` on every request; sign-out calls `revokeRefreshTokens` | session.ts. Firebase revocation has one-second granularity. |
| No client token storage: Firebase client persistence is in-memory, and the client signs out right after the exchange | `src/lib/firebase-client.ts` |
| CSRF: `Origin` must match the request origin or `APP_ORIGINS`; `Sec-Fetch-Site` must be `same-origin`; a missing Origin is refused; plus SameSite cookies | `src/server/http/origin.ts` |
| Rate limits: session 10/min/IP, saves 120/min, publishes 20/min, other writes 60/min per author, as salted-hash keyed Firestore counters | `src/server/http/rate-limit.ts` |
| Input validation: Zod for all metadata and commands; `validateManuscript` allowlists nodes, marks and attributes and rejects `javascript:` and protocol-relative links | `src/lib/validation`, `src/domain/manuscript/validate.ts` |
| Rendering: manuscripts render as React elements and text only. No `dangerouslySetInnerHTML` for content (the only inline script is a constant preference loader). | `src/content/render/RenderDoc.tsx` |
| Security headers: CSP, HSTS, `X-Frame-Options: DENY`, `frame-ancestors 'none'`, nosniff, Referrer-Policy, Permissions-Policy, COOP `same-origin-allow-popups` | `next.config.ts` |
| Public vs private reads: public pages read only `src/server/read/public.ts`, which serves PUBLISHED + PUBLIC sealed editions; lint bans `'use cache'` in private code; studio responses are `private, no-store`, `noindex` | eslint.config.mjs, next.config.ts |
| Cron: `Authorization: Bearer CRON_SECRET`, compared in constant time | `src/app/api/cron/publish-due/route.ts` |
| Credentials: Workload Identity Federation from Vercel OIDC (no long-lived keys); Admin SDK only behind `server-only` | `src/server/firebase/admin.ts` |

### Why the CSP allows inline scripts

Pages are prerendered (partial prerendering), and per-request nonces would force every page to render dynamically. Script injection is instead closed off at the source: manuscript content can never become markup. Revisit this when Next.js SRI-based CSP is stable.

## Private writing

- Manuscripts and titles are never logged. Error logs record only the error name and message.
- Analytics and Sentry are not integrated yet. When added, events carry IDs only, and `beforeSend` strips request bodies.
- Public metadata, Open Graph tags and the sitemap come only from the public read model.
- The repository contains no manuscripts.
  - Seed data is fictional placeholder text and refuses to run outside the emulators.
  - `scripts/check-secrets.sh` runs in CI and fails on tracked `.env` files or key-like strings.

## Tested guarantees

| Guarantee | Test |
|---|---|
| Clients cannot read or write any collection or storage path | `tests/rules/deny-all.test.ts` |
| Unpublished drafts, UNLISTED and PRIVATE works, withdrawn and archived works are not publicly readable | `tests/integration/publishing.test.ts` (visibility, withdraw/archive), `tests/e2e/reader.spec.ts` |
| Only the author can hold a session (wrong email, missing claim, unverified email and stale sign-ins are refused) | `tests/integration/auth.test.ts` |
| Revoked sessions fail on the next request | auth.test.ts, `tests/e2e/publishing.spec.ts` (sign-out replay) |
| Studio is closed to visitors, forged cookies, cross-site POSTs and cron calls without the secret | publishing.spec.ts |
| Published editions never change when the draft changes; republishing preserves earlier editions; hashes verify | publishing.test.ts, publishing.spec.ts |
| Concurrent publishes produce exactly one edition | publishing.test.ts |

Deferred, to be added with invitations: invited readers can't access unrelated works; revoked readers lose access immediately; storage access matches publication access.

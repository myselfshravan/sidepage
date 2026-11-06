# Security

## Model

1. **Rules deny everything.** `firestore.rules` and `storage.rules` deny all client reads and writes, so the server is the only data path. Tests in `tests/rules` prove this for anonymous users, readers and an author-claim token.
2. **Authorization lives in server code.**
   - Every studio page calls `requireAuthorPage()`.
   - Every server action calls `guard()`: `assertSameOrigin`, then `requireAuthor`, then `rateLimit`.
   - Route handlers check origin and rate limits themselves.
   - `src/proxy.ts` only does an optimistic redirect. It is not a security boundary.
3. **Roles are read from `users/{uid}` on every request** (reader, author, admin). Any verified account can hold a session. Writing needs `author` or `admin`, and every studio service checks that the actor owns the work, returning not-found otherwise. Administration needs `admin`.

## Controls

| Control | Where |
|---|---|
| Session cookies: httpOnly, SameSite=Lax, Secure over HTTPS; 14 days for readers, 1 day for writers; minted only from verified-email sign-ins under 5 minutes old | `src/server/auth/session.ts`, `src/app/api/auth/session/route.ts` |
| Revocation: `verifySessionCookie(…, checkRevoked=true)` on every request; sign-out calls `revokeRefreshTokens` | session.ts. Firebase revocation has one-second granularity. |
| No client token storage: Firebase client persistence is in-memory, and the client signs out right after the exchange | `src/lib/firebase-client.ts` |
| CSRF: `Origin` must match the request origin or `APP_ORIGINS`; `Sec-Fetch-Site` must be `same-origin`; a missing Origin is refused; plus SameSite cookies | `src/server/http/origin.ts` |
| Rate limits: session 10/min/IP, saves 120/min, publishes 20/min, other writes 60/min per author, as salted-hash keyed Firestore counters | `src/server/http/rate-limit.ts` |
| Input validation: Zod for all metadata and commands; `validateManuscript` allowlists nodes, marks and attributes and rejects `javascript:` and protocol-relative links | `src/lib/validation`, `src/domain/manuscript/validate.ts` |
| Rendering: manuscripts render as React elements and text only. No `dangerouslySetInnerHTML` for content (the only inline script is a constant preference loader). | `src/content/render/RenderDoc.tsx` |
| Security headers: CSP, HSTS, `X-Frame-Options: DENY`, `frame-ancestors 'none'`, nosniff, Referrer-Policy, Permissions-Policy, COOP `same-origin-allow-popups` | `next.config.ts` |
| Public vs private reads: public pages read only `src/server/read/public.ts`, which serves PUBLISHED + PUBLIC sealed editions; lint bans `'use cache'` in private code; studio responses are `private, no-store`, `noindex` | eslint.config.mjs, next.config.ts |
| Cron: `Authorization: Bearer CRON_SECRET`, compared in constant time | `src/app/api/cron/publish-due/route.ts` |
| Agent API: bearer personal access tokens (hashed, revocable, admin-issued), per-owner rate limit, same services and ownership checks as the studio | `src/app/api/v1/[...path]/route.ts`, `src/server/services/api-tokens.ts` |
| Secret links: 256-bit tokens stored hashed; checked live on every request; `no-store`, `noindex`, `no-referrer`; generic link previews | `src/server/read/shared.ts`, `next.config.ts` |
| Credentials: Workload Identity Federation from Vercel OIDC (no long-lived keys); Admin SDK only behind `server-only` | `src/server/firebase/admin.ts` |

### Why the CSP allows inline scripts

Pages are prerendered (partial prerendering), and per-request nonces would force every page to render dynamically. Script injection is instead closed off at the source: manuscript content can never become markup. Revisit this when Next.js SRI-based CSP is stable.

## Private writing

- Manuscripts and titles are never logged. Error logs record only the error name and message.
- PostHog events carry ids and enums only, from a typed catalogue enforced by `tests/unit/analytics.test.ts`. Autocapture and session recording are off, and page titles are stripped.
- Public metadata, Open Graph tags and the sitemap come only from the public read model.
- The repository contains no manuscripts.
  - Seed data is fictional placeholder text and refuses to run outside the emulators.
  - `scripts/check-secrets.sh` runs in CI and fails on tracked `.env` files or key-like strings.

## Tested guarantees

| Guarantee | Test |
|---|---|
| Clients cannot read or write any collection or storage path | `tests/rules/deny-all.test.ts` |
| Unpublished drafts, UNLISTED and PRIVATE works, withdrawn and archived works are not publicly readable | `tests/integration/publishing.test.ts` (visibility, withdraw/archive), `tests/e2e/reader.spec.ts` |
| Unverified emails and stale sign-ins are refused; roles apply live; deleted profiles lose their session | `tests/integration/auth.test.ts` |
| Authors can't read, edit, publish or archive another author's drafts; readers can't write; only admins approve or change roles; admins can't demote themselves | `tests/integration/access.test.ts`, `tests/e2e/publishing.spec.ts` |
| Reader data is per-account and only for readable works | `tests/integration/reader.test.ts` |
| Revoked sessions fail on the next request | auth.test.ts, `tests/e2e/publishing.spec.ts` (sign-out replay) |
| Studio is closed to visitors, forged cookies, cross-site POSTs and cron calls without the secret | publishing.spec.ts |
| Published editions never change when the draft changes; republishing preserves earlier editions; hashes verify | publishing.test.ts, publishing.spec.ts |
| Concurrent publishes produce exactly one edition | publishing.test.ts |

| Secret links open only their own work; revoked, expired or malformed links and withdrawn works fail immediately; only owners and admins manage links; tokens are never stored | `tests/integration/sharing.test.ts`, `tests/e2e/agent.spec.ts` |
| Pen-name and anonymous works expose no handle, account id or real name anywhere public, and never appear on the author page | `sharing.test.ts`, `agent.spec.ts` |
| API tokens: admin-created only, stored hashed, refused when revoked, malformed or when the owner can't write; the API refuses missing or bad tokens | `sharing.test.ts`, `agent.spec.ts` |

| Personas expose no account id, name or handle on any public surface; author pages list only their own work; personas can't be used on another owner's work | `tests/integration/personas-comments.test.ts`, `tests/e2e/persona.spec.ts` |
| Comments never return account ids; owners post under the byline; only public chapters accept comments; moderation is limited to the owner and admins; readers delete only their own | `personas-comments.test.ts`, `persona.spec.ts` |

Still deferred: storage access matching publication access, which arrives with uploads on Blaze.

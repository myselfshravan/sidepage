# Roadmap

Each phase is done only when its checks pass: typecheck, lint, unit, emulator and end-to-end tests, a production build, and a real browser check.

| Phase | Scope | Done when | State |
|---|---|---|---|
| 0. Discovery and docs | PRD, architecture, data model, security, deployment, decisions | Docs describe what is built | Done |
| 1. Foundation | Next.js 16 + strict TS, design tokens and themes, Firebase server module, sessions, CSRF, rate limits, deny-all rules, CI | All local checks green | Done locally; CI and preview wait on push approval |
| 2. Publishing engine | Works, chapters, Tiptap editor, autosave, revisions, historical dates, full lifecycle, immutable editions, scheduling | Integration and e2e journey green | Done |
| 3. Reader | Collections, publication pages, chapter reader, preferences, progress, bookmarks, content warnings, SEO | e2e reader suite green on desktop and mobile | Done (public visibility only) |
| 3b. Multi-author platform | Accounts and roles, author requests and approval, ownership, author pages, reader library, follows and synced progress, PostHog | Access matrix and e2e account journeys green | Done |
| 4. Sharing and agents | Secret links (expiry, revocation), pen names and anonymous bylines, agent tokens, `/api/v1`, stdio MCP server, OG cards and icons | Sharing, byline and token tests; e2e agent journey | Done |
| 4b. Invitations | Invite-by-account, gift invitations, Resend adapter | Invited-scope isolation, single-use gifts | Next |
| 5. Assets | Blaze; Storage bucket and rules; signed uploads; covers, images and captions; private asset proxy; orphan sweep | Storage permissions match publication permissions (tested) | After Blaze |
| 6. Rich blocks | Memoir blocks (author's notes, archival photos, memory cards, then/now) and fiction blocks (characters, relationships, timelines, letters, playlists) in schema, editor and renderer | Collection-scoped nodes enforced server-side | |
| 7. Digitisation | Upload, job state machine, OCR adapter (fake, then Document AI), structure extraction, AI proposals, side-by-side human verification | AI never replaces canonical text without approval (tested) | |
| 8. Exports | Markdown, DOCX, EPUB (epubcheck), PDF from sealed editions | Exports validate | |
| 9. Launch | `sidepage-prod`, WIF for prod, domain, backups and restore drill, accessibility and performance review, launch report | Restore drill timed and documented | |

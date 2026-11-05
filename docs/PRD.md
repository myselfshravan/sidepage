# Product requirements

## What sidepage is

A publishing platform for memoir and fiction. It has two collections with distinct identities on one engine:

- **Memoirs.** Real experiences, essays and reflections. Intimate and editorial: warm ivory paper, serif type, archival captions.
- **Fiction.** Literary fiction. Cinematic: deep charcoal, burgundy, dramatic display type, content warnings before chapters.

The platform is the identity. Every publication belongs to an author and links to their public page.

## People

| Role | Can |
|---|---|
| Visitor | Read any public work without an account. |
| Reader (anyone who signs up) | Sync progress and bookmarks across devices, save works to a library, follow authors, ask to become an author. |
| Author (approved) | Write, revise, publish, re-date and republish their **own** publications in the studio. |
| Admin | Approve or decline author requests, change roles, moderate any publication. |

Sign-up is Google or email and password, and email must be verified.

## Current release

1. Sign-up and sign-in. A reader profile with a unique handle is created on first sign-in.
2. Reader requests to write → admin approves → studio access, applied on the next request.
3. Authors create publications in either collection and write chapters: autosave, revisions, word count, reading time, footnotes.
4. Historical dates, the immutable-edition lifecycle, scheduling, withdraw, archive and restore, duplicate.
5. Public reading in themed readers. Signed-in readers keep progress and bookmarks on their account.
6. Library: continue reading, saved, new from followed authors.
7. Author pages at `/authors/[handle]`; a platform homepage across all authors.
8. Product analytics in PostHog. Events carry ids only.

## Deferred (designed for, not built yet)

- Unlisted share links and private, invite-only reading with revocation; gift invitations
- Image and audio uploads and covers (need Cloud Storage, which needs the Blaze plan)
- Memoir blocks (memory cards, archival photos, audio reflections) and fiction blocks (characters, relationships, timelines, letters)
- Digitisation pipeline (OCR, structure extraction, AI review, human verification)
- Exports (EPUB, PDF, DOCX, Markdown)
- Email notifications (new chapters from followed authors)

See [ROADMAP.md](ROADMAP.md) for order and acceptance criteria.

## Non-negotiables

- Editing a draft never changes a published edition.
- Publication dates (`first_published_at`, intended) are distinct from record dates (`created_at`) and from execution time (`last_publish_executed_at`).
- Unpublished writing never reaches analytics, logs, public metadata or the git repository.
- An author can never read or change another author's drafts.
- Every access decision is made on the server.

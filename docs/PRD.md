# Product requirements

## What sidepage is

A boutique publishing house for one author, Shravan Revanna, combined with a digital library. It has two collections with distinct identities on one engine:

- **Memoirs.** Real experiences, essays and reflections. Intimate and editorial: warm ivory paper, serif type, archival captions.
- **Fiction.** Literary fiction, initially dark romance. Cinematic: deep charcoal, burgundy, dramatic display type, content warnings before chapters.

## Users

| User | Needs |
|---|---|
| The author | Write, revise, publish, re-date and republish without ever corrupting what readers already have. |
| Public reader | Read comfortably on any device without an account. |
| Invited reader *(later)* | Read private or unlisted work shared with them; lose access when it is revoked. |

## Release 1: the publishing journey (this release)

1. The author signs in to the Studio. Only the configured author account is allowed in.
2. The author creates a publication in either collection.
3. The author writes chapters in a rich-text editor. Autosave, revisions, word count, reading time and footnotes are included.
4. The author records historical dates: when it was originally written (to whatever precision is remembered), when it was digitised, and a backdated publication date.
5. The author publishes. Publication seals an **immutable edition**.
6. Anyone can read it publicly, in a themed reader with typography controls, progress, bookmarks and a table of contents.
7. The author keeps editing the draft. Readers still see the sealed edition.
8. The author republishes as a new edition. Earlier editions remain sealed and unchanged.
9. The full lifecycle: review, reject, schedule, cancel schedule, withdraw, archive, restore, duplicate.

## Deferred (designed for, not built yet)

- Unlisted share links, private libraries, invitations, revocation and gift invitations
- Image and audio uploads and covers (need Cloud Storage, which needs the Blaze plan)
- Memoir blocks (memory cards, archival photos, audio reflections) and fiction blocks (characters, relationships, timelines, letters)
- Digitisation pipeline (OCR, structure extraction, AI review, human verification)
- Exports (EPUB, PDF, DOCX, Markdown)
- Analytics, error monitoring, email

See [ROADMAP.md](ROADMAP.md) for order and acceptance criteria.

## Non-negotiables

- Editing a draft never changes a published edition.
- Publication dates (`first_published_at`, intended) are distinct from record dates (`created_at`) and from execution time (`last_publish_executed_at`).
- Private writing never reaches analytics, logs, error reports, public metadata or the git repository.
- Every access decision is made on the server.

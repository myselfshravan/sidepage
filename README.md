# sidepage

An independent digital publishing house for one author: a **memoir** collection and a **fiction** collection on a shared publishing engine, an **Author Studio** for writing and publishing, and a reader built for long attention.

Every piece is a publication, not a post. It has immutable editions, historical dates that mean what they say, and an event history.

- Product: [docs/PRD.md](docs/PRD.md)
- Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Data model: [docs/DATA_MODEL.md](docs/DATA_MODEL.md)
- Security: [docs/SECURITY.md](docs/SECURITY.md)
- Deployment: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- Roadmap and decisions: [docs/ROADMAP.md](docs/ROADMAP.md), [docs/DECISIONS.md](docs/DECISIONS.md)
- Where things stand: [PROJECT_STATUS.md](PROJECT_STATUS.md)

## Stack

Next.js 16 (App Router, Cache Components), React 19, TypeScript (strict), Tailwind CSS 4, Tiptap 3, Firebase Auth, Cloud Firestore and Storage (Admin SDK on the server only), Zod, Vitest, Playwright, GitHub Actions, Vercel.

## Run it locally

Requirements: Node 24, pnpm 10, Java 21 (for the Firebase emulators).

```bash
pnpm install
cp .env.example .env.local        # emulator defaults work as-is

pnpm emulators                    # terminal 1: Auth, Firestore, Storage emulators (UI on :4000)
pnpm seed                         # terminal 2: author account + sample publications
pnpm dev                          # http://localhost:3000
```

Sign in at `/sign-in` with `AUTHOR_EMAIL` and the password `sidepage-local-only`. The email form appears only in emulator mode. Seed data is placeholder text and refuses to run against a real project.

## Tests

| Command | What it runs | Needs |
|---|---|---|
| `pnpm typecheck` / `pnpm lint` | TypeScript, ESLint (including architecture boundary rules) | — |
| `pnpm test` | Unit tests: lifecycle state machine (property-based), manuscript validation, dates, slugs | — |
| `pnpm test:emulated` | Security-rules tests and service integration tests (publishing, editions, scheduling, auth, rate limits) | Java; starts the emulators itself |
| `pnpm test:e2e` | Playwright journeys on desktop and mobile against a production build | `pnpm emulators`, `pnpm seed`, `pnpm build` |
| `pnpm check:secrets` | Fails if credentials or `.env` files are tracked | — |

Heavy commands can be wrapped with `scripts/limited.sh <minutes> <command>`, which kills the process tree past a time limit or 4 GB of RSS.

## Repository layout

```
src/domain/         pure business rules: lifecycle, manuscript schema, dates, slugs
src/server/         server-only: Firebase, auth, services, public read model
src/content/        manuscript editor extensions and the JSON→React renderer
src/app/            routes: (house) home/about/archive, memoirs, fiction, studio, api
src/components/     site, publication, reader, studio, editor
tests/              domain, integration (emulators), rules, e2e
scripts/            seed, grant-author, limited.sh, check-secrets
```

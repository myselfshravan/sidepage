# Deployment

**Status: not deployed yet.** These steps are written but none have been run against real infrastructure. Each step marked **(you)** needs the author's account or approval.

## Environments

| Environment | Firebase | Vercel |
|---|---|---|
| Local and CI | Emulators, project `demo-sidepage` | — |
| Preview | `sidepage-c4daa` (the existing project, used as dev) | Preview deployments for PRs and branches |
| Production | `sidepage-prod`, to be created at launch | Production branch `main` |

Variables are documented in `.env.example`, which also notes which are public and which are server-only.

## 1. Firebase project `sidepage-c4daa` (you)

The project belongs to `shravanrevanna@gmail.com`. The machine's default firebase-tools login is a different account, so use `--account shravanrevanna@gmail.com` or run `firebase login:use shravanrevanna@gmail.com` first.

1. **Firestore:** done. The `(default)` database exists in **`nam5`** (US multi-region), Native mode, which is permanent. Vercel functions therefore run in `iad1` (`vercel.ts`). Rules and indexes are deployed.
2. **Authentication:**
   - Enable **Google**.
   - Under Settings → Authorized domains, add the Vercel production domain and `*.vercel.app` preview hosts as needed.
3. **Web app:**
   - Project settings → Your apps → Add web app.
   - Copy `apiKey`, `authDomain`, `projectId` and `appId` into the `NEXT_PUBLIC_FIREBASE_*` variables. (Done locally in `.env.local`.)
4. **Deploy rules and indexes:**
   ```bash
   firebase deploy --only firestore:rules,firestore:indexes --project dev --account shravanrevanna@gmail.com
   ```
   Storage rules can only be deployed once a bucket exists, which needs Blaze.

   **Deploy indexes before the code that needs them.** The emulators don't enforce composite indexes, so a missing index only shows up in production, as a `FAILED_PRECONDITION` error. Builds take a few minutes; a query fails until its index is `READY`.
5. **Grant the author role:**
   - Sign in once at `/sign-in` with Google. This is refused at first, which is expected, but it creates the account.
   - Then run, with Application Default Credentials for that Google account:
     ```bash
     gcloud auth application-default login   # as shravanrevanna@gmail.com
     FIREBASE_PROJECT_ID=sidepage-c4daa USE_FIREBASE_EMULATORS=0 pnpm grant-author
     ```

## 2. Credentials for Vercel: Workload Identity Federation (you approve; the commands are scriptable)

No service-account key is created. Vercel issues each deployment an OIDC token, and Google STS exchanges it for a short-lived token that impersonates a dedicated service account.

Implemented in `src/server/firebase/admin.ts`. **Verified only against the emulators so far.** The real exchange is verified on the first preview deployment.

```bash
P=sidepage-c4daa; N=854947687129; TEAM=myselfshravans-projects
gcloud iam service-accounts create sidepage-app --project $P
for r in roles/datastore.user roles/firebaseauth.admin; do
  gcloud projects add-iam-policy-binding $P --member="serviceAccount:sidepage-app@$P.iam.gserviceaccount.com" --role=$r
done
gcloud iam workload-identity-pools create vercel --project $P --location=global
gcloud iam workload-identity-pools providers create-oidc vercel --project $P --location=global \
  --workload-identity-pool=vercel --issuer-uri="https://oidc.vercel.com/$TEAM" \
  --allowed-audiences="https://vercel.com/$TEAM" \
  --attribute-mapping="google.subject=assertion.sub,attribute.project=assertion.project,attribute.environment=assertion.environment" \
  --attribute-condition="assertion.project=='sidepage'"
gcloud iam service-accounts add-iam-policy-binding sidepage-app@$P.iam.gserviceaccount.com --project $P \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$N/locations/global/workloadIdentityPools/vercel/attribute.project/sidepage"
```

Then set these variables in Vercel:
- `GCP_WORKLOAD_IDENTITY_AUDIENCE=//iam.googleapis.com/projects/$N/locations/global/workloadIdentityPools/vercel/providers/vercel`
- `GCP_SERVICE_ACCOUNT_EMAIL=sidepage-app@$P.iam.gserviceaccount.com`

For production, use a separate project and pool, with the condition also requiring `assertion.environment=='production'`, so preview deployments can never get production credentials.

## 3. GitHub (you: approval to create and push)

```bash
gh repo create myselfshravan/sidepage --public --source=. --remote=origin
git push -u origin main
```

Repository secrets for `.github/workflows/scheduled-publish.yml`:
- `SIDEPAGE_URL` (production URL)
- `CRON_SECRET` (the same value as in Vercel)

CI (`.github/workflows/ci.yml`) runs on every PR and every push to `main`:
- typecheck, lint, unit tests, secret scan;
- emulator rules and integration tests;
- seeded production build plus Playwright.

## 4. Vercel (you: approval to link)

```bash
npm i -g vercel@latest            # CLI is 62.x; current is 65.x
vercel link --project sidepage
vercel git connect
```

Settings:
- Framework: Next.js. Install `pnpm install --frozen-lockfile`. Build `pnpm build`.
- Function region `iad1`, next to Firestore `nam5` (set in `vercel.ts`).
- Production branch `main`. Preview deployments for all other branches and PRs.

Environment variables per environment:
- `FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_*`
- `GCP_*`
- `AUTHOR_EMAIL`
- `CRON_SECRET`
- `RATE_LIMIT_SALT`
- `NEXT_PUBLIC_SITE_URL`
- `USE_FIREBASE_EMULATORS=0` and `NEXT_PUBLIC_USE_FIREBASE_EMULATORS=0`

Public pages prerender from Firestore at build time, so the build needs the same credentials as runtime. Vercel provides the OIDC token during builds.

## 5. Blaze plan (you: billing)

Spark is enough for this release. Blaze unlocks:
- Cloud Storage: covers, images, audio, original scans;
- Firestore point-in-time recovery and scheduled backups;
- Document AI OCR.

Before upgrading, **create a budget alert** (Billing → Budgets, for example $10/month with alerts at 50/90/100%).

After upgrading:
1. Create the default bucket and deploy `storage.rules`.
2. Set `NEXT_PUBLIC_STORAGE_ENABLED=1`.
3. Enable PITR:
   ```bash
   gcloud firestore databases update --enable-pitr
   ```
4. Add a daily backup schedule:
   ```bash
   gcloud firestore backups schedules create --database='(default)' --recurrence=daily --retention=14d
   ```
5. Add a Firestore TTL policy on `rate_limits.expires_at`.

## Restore procedure (after Blaze)

1. Restore into a **new** database; never restore in place:
   ```bash
   gcloud firestore databases restore --source-backup=<backup> --destination-database=restore-YYYYMMDD
   ```
2. Verify editions:
   - run `verifyEdition` across all editions;
   - compare counts of `works`, `editions` and `published`.
3. Point `FIRESTORE_DATABASE_ID` at the restored database and redeploy.

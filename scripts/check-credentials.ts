// Verifies that the server can reach the configured Firebase project with its
// configured credentials (Workload Identity on Vercel, or the local OIDC token
// from `vercel env pull`). Reads only; prints no secrets.
//
//   FIREBASE_PROJECT_ID=sidepage-c4daa USE_FIREBASE_EMULATORS=0 pnpm check:credentials
import "./load-env";
import { adminAuth, db } from "@/server/firebase/admin";

async function main() {
  const published = await db().collection("published").limit(1).get();
  console.info(`firestore: ok (${published.size} published document(s) visible)`);
  const users = await adminAuth().listUsers(1);
  console.info(`auth: ok (${users.users.length} user(s) listed)`);
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(`check-credentials: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  },
);

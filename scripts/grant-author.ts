// Grants the author role to the account whose email is AUTHOR_EMAIL.
//
//   pnpm grant-author            # uses .env.local
//
// Run once per Firebase project after the author has signed in with Google at
// least once (so the account exists). Needs credentials allowed to manage Auth
// users: Application Default Credentials locally (`gcloud auth application-default login`).
import "./load-env";
import { adminAuth } from "@/server/firebase/admin";

async function main() {
  const email = process.env.AUTHOR_EMAIL;
  if (!email) throw new Error("AUTHOR_EMAIL is not set");
  const user = await adminAuth().getUserByEmail(email);
  if (!user.emailVerified) throw new Error(`${email} is not verified; sign in with Google first.`);
  await adminAuth().setCustomUserClaims(user.uid, { ...(user.customClaims ?? {}), role: "author" });
  // Existing sessions predate the claim; make the author sign in again.
  await adminAuth().revokeRefreshTokens(user.uid);
  console.info(`grant-author: ${email} (${user.uid}) is now the author on ${process.env.FIREBASE_PROJECT_ID}. Sign in again.`);
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(`grant-author: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  },
);

// Makes an existing account an administrator (who approves authors and manages roles).
//
//   pnpm grant-admin you@example.com
//
// The account must have signed in at least once (that creates its profile). Uses the
// server's configured credentials; run against the emulators by default.
import "./load-env";
import { Timestamp } from "@google-cloud/firestore";
import { adminAuth } from "@/server/firebase/admin";
import { col } from "@/server/firebase/model";

async function main() {
  const email = process.argv[2];
  if (!email) throw new Error("usage: pnpm grant-admin <email>");
  const user = await adminAuth().getUserByEmail(email);
  const ref = col.user(user.uid);
  if (!(await ref.get()).exists) throw new Error(`${email} has no profile yet; sign in once first.`);
  await ref.update({ role: "admin", author_status: "approved", updated_at: Timestamp.now() });
  console.info(`grant-admin: ${email} (${user.uid}) is now an admin on ${process.env.FIREBASE_PROJECT_ID}.`);
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(`grant-admin: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  },
);

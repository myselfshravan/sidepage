// Lists Firebase Auth users (email, verified, author claim) for the configured project.
import "./load-env";
import { adminAuth } from "@/server/firebase/admin";

adminAuth()
  .listUsers(20)
  .then((r) => {
    for (const u of r.users) console.info(`${u.email} verified=${u.emailVerified} author=${u.customClaims?.role === "author"} providers=${u.providerData.map((p) => p.providerId).join(",")}`);
    process.exit(0);
  })
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });

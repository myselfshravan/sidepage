// e2e runs against the Auth and Firestore emulators with data from `pnpm seed`.
export const PASSWORD = "sidepage-local-only";
export const ACCOUNTS = {
  admin: "admin@sidepage.test",
  mira: "mira@sidepage.test",
  theo: "theo@sidepage.test",
  reader: "reader@sidepage.test",
} as const;

export const AUTH_EMULATOR = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099"}`;

export default async function globalSetup() {
  if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error("e2e tests run only against the Auth emulator (FIREBASE_AUTH_EMULATOR_HOST)");
  const res = await fetch(`${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/projects/demo-sidepage/accounts:lookup`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer owner" },
    body: JSON.stringify({ email: [ACCOUNTS.mira] }),
  });
  const body = (await res.json()) as { users?: unknown[] };
  if (!body.users?.length) throw new Error("Seed data missing: run `pnpm seed` against the emulators first.");
}

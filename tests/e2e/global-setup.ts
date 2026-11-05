// e2e runs against the Auth and Firestore emulators with data from `pnpm seed`.
export const PASSWORD = "sidepage-local-only";
export const ACCOUNTS = {
  admin: "admin@sidepage.test",
  mira: "mira@sidepage.test",
  theo: "theo@sidepage.test",
  reader: "reader@sidepage.test",
} as const;

export const AUTH_EMULATOR = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099"}`;

/** Earlier runs leave rate-limit windows behind; start every run with fresh counters. */
async function clearRateLimits() {
  const base = `http://${process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080"}/v1/projects/demo-sidepage/databases/(default)/documents`;
  const headers = { authorization: "Bearer owner" };
  const list = (await (await fetch(`${base}/rate_limits?pageSize=300`, { headers })).json()) as { documents?: { name: string }[] };
  await Promise.all((list.documents ?? []).map((d) => fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080"}/v1/${d.name}`, { method: "DELETE", headers })));
}

export default async function globalSetup() {
  if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error("e2e tests run only against the Auth emulator (FIREBASE_AUTH_EMULATOR_HOST)");
  await clearRateLimits();
  const res = await fetch(`${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/projects/demo-sidepage/accounts:lookup`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer owner" },
    body: JSON.stringify({ email: [ACCOUNTS.mira] }),
  });
  const body = (await res.json()) as { users?: unknown[] };
  if (!body.users?.length) throw new Error("Seed data missing: run `pnpm seed` against the emulators first.");
}

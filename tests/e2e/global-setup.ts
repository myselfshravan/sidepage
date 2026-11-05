// Ensures the author account exists in the Auth emulator with the author claim.
// Emulator-only account; the password never exists outside the local Auth emulator.
export const AUTHOR = { email: process.env.AUTHOR_EMAIL ?? "author@sidepage.test", password: "sidepage-local-only" };

if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error("e2e tests run only against the Auth emulator (FIREBASE_AUTH_EMULATOR_HOST)");

const AUTH = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099"}/identitytoolkit.googleapis.com/v1/projects/demo-sidepage`;
const headers = { "content-type": "application/json", authorization: "Bearer owner" };

export default async function globalSetup() {
  // Create if missing (the emulator ignores custom claims on create), then set password, verification and claim.
  await fetch(`${AUTH}/accounts`, { method: "POST", headers, body: JSON.stringify({ email: AUTHOR.email, password: AUTHOR.password, emailVerified: true }) });
  const lookup = await fetch(`${AUTH}/accounts:lookup`, { method: "POST", headers, body: JSON.stringify({ email: [AUTHOR.email] }) });
  const { users } = (await lookup.json()) as { users?: { localId: string }[] };
  if (!users?.[0]) throw new Error("Could not create the e2e author in the Auth emulator");
  const updated = await fetch(`${AUTH}/accounts:update`, {
    method: "POST",
    headers,
    body: JSON.stringify({ localId: users[0].localId, password: AUTHOR.password, emailVerified: true, customAttributes: JSON.stringify({ role: "author" }) }),
  });
  if (!updated.ok) throw new Error(`Could not grant the e2e author claim: ${await updated.text()}`);
}

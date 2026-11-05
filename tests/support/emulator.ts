const PROJECT = "demo-sidepage";

export async function clearFirestore() {
  const res = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Could not clear Firestore emulator: ${res.status}`);
}

export async function clearAuth() {
  const res = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/accounts`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Could not clear Auth emulator: ${res.status}`);
}

/** Signs in against the Auth emulator and returns a real ID token. */
export async function signIn(email: string, password: string): Promise<string> {
  const res = await fetch(
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }) },
  );
  const body = (await res.json()) as { idToken?: string; error?: unknown };
  if (!body.idToken) throw new Error(`Emulator sign-in failed: ${JSON.stringify(body.error)}`);
  return body.idToken;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

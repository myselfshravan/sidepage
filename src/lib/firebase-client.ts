"use client";

import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, inMemoryPersistence, initializeAuth, browserPopupRedirectResolver, type Auth } from "firebase/auth";
import { clientEnv } from "./env.client";

// Browser Firebase is used for one thing: proving who you are at sign-in. The ID
// token is exchanged for an httpOnly session cookie and the client session is then
// discarded. Persistence is in-memory, so no tokens are written to IndexedDB or
// localStorage on this device.

const EMULATOR_PROJECT_ID = "demo-sidepage";

let auth: Auth | undefined;

export function clientAuth(): Auth {
  if (auth) return auth;
  // The emulators run as the demo project (see .firebaserc), whatever real config is set.
  const config = clientEnv.useEmulators ? { apiKey: "demo-key", authDomain: "localhost", projectId: EMULATOR_PROJECT_ID } : clientEnv.firebase;
  const app: FirebaseApp = getApps()[0] ?? initializeApp(config);
  auth = initializeAuth(app, { persistence: inMemoryPersistence, popupRedirectResolver: browserPopupRedirectResolver });
  if (clientEnv.useEmulators) connectAuthEmulator(auth, clientEnv.authEmulatorUrl, { disableWarnings: true });
  return auth;
}

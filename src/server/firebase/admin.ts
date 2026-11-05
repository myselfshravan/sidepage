import "server-only";
import { Firestore } from "@google-cloud/firestore";
import { getVercelOidcToken } from "@vercel/oidc";
import { initializeApp, getApps, type App, type Credential } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { ExternalAccountClient, GoogleAuth, type AuthClient } from "google-auth-library";
import { serverEnv } from "@/lib/env.server";

// The one place Firebase is initialised on the server.
//
// Credentials, in order of preference:
//   1. Emulators: none needed.
//   2. Vercel: Workload Identity Federation. Vercel's per-deployment OIDC token is
//      exchanged with Google STS for a short-lived token impersonating a service
//      account. No long-lived key exists anywhere.
//   3. Local machine against a real project: Application Default Credentials
//      (`gcloud auth application-default login`).
//
// Firestore is created directly from @google-cloud/firestore because firebase-admin
// only forwards service-account keys or ADC to Firestore, not a federated client.

const SCOPES = ["https://www.googleapis.com/auth/cloud-platform", "https://www.googleapis.com/auth/firebase", "https://www.googleapis.com/auth/identitytoolkit", "https://www.googleapis.com/auth/userinfo.email"];

type Clients = { app: App; auth: Auth; db: Firestore };

const globalForFirebase = globalThis as unknown as { __sidepageFirebase?: Clients };

// The external-account config is built from our own server env vars, never from
// request input, so the library's "untrusted credential config" warning does not apply.
function federatedClient(): AuthClient | null {
  const env = serverEnv();
  if (!env.GCP_WORKLOAD_IDENTITY_AUDIENCE || !env.GCP_SERVICE_ACCOUNT_EMAIL) return null;
  const client = ExternalAccountClient.fromJSON({
    type: "external_account",
    audience: env.GCP_WORKLOAD_IDENTITY_AUDIENCE,
    subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
    token_url: "https://sts.googleapis.com/v1/token",
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${env.GCP_SERVICE_ACCOUNT_EMAIL}:generateAccessToken`,
    subject_token_supplier: { getSubjectToken: () => getVercelOidcToken() },
    scopes: SCOPES,
  });
  if (!client) throw new Error("Could not build the Workload Identity client");
  return client;
}

function asFirebaseCredential(client: AuthClient): Credential {
  return {
    async getAccessToken() {
      const { token, res } = await client.getAccessToken();
      if (!token) throw new Error("Workload Identity returned no access token");
      const expiry = Number(res?.data?.expireTime ? Date.parse(res.data.expireTime) : Date.now() + 3000_000);
      return { access_token: token, expires_in: Math.max(60, Math.floor((expiry - Date.now()) / 1000)) };
    },
  };
}

function init(): Clients {
  const env = serverEnv();
  const federated = env.USE_FIREBASE_EMULATORS ? null : federatedClient();

  const app =
    getApps().find((a) => a.name === "sidepage") ??
    initializeApp(
      {
        projectId: env.FIREBASE_PROJECT_ID,
        ...(federated ? { credential: asFirebaseCredential(federated) } : {}),
      },
      "sidepage",
    );

  const db = new Firestore({
    projectId: env.FIREBASE_PROJECT_ID,
    databaseId: env.FIRESTORE_DATABASE_ID,
    ignoreUndefinedProperties: false,
    ...(federated ? { auth: new GoogleAuth({ authClient: federated, scopes: SCOPES }) } : {}),
  });

  return { app, auth: getAuth(app), db };
}

function clients(): Clients {
  globalForFirebase.__sidepageFirebase ??= init();
  return globalForFirebase.__sidepageFirebase;
}

export const adminAuth = (): Auth => clients().auth;
export const db = (): Firestore => clients().db;

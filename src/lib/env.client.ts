// Public configuration, safe to ship to the browser. Each variable is referenced
// literally so Next.js can inline it at build time.

export const clientEnv = {
  firebase: {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
  },
  useEmulators: process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "1",
  authEmulatorUrl: process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL ?? "http://127.0.0.1:9099",
  /** Cloud Storage needs the Blaze plan; uploads stay disabled until it is turned on. */
  storageEnabled: process.env.NEXT_PUBLIC_STORAGE_ENABLED === "1",
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
} as const;

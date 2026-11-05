import "server-only";
import { z } from "zod";

// Server-only configuration. Importing this file from a Client Component fails the
// build (via `server-only`), so nothing here can leak into browser bundles.

const flag = z
  .enum(["0", "1", "true", "false"])
  .optional()
  .transform((v) => v === "1" || v === "true");

const schema = z
  .object({
    FIREBASE_PROJECT_ID: z.string().min(1),
    FIRESTORE_DATABASE_ID: z.string().min(1).default("(default)"),
    USE_FIREBASE_EMULATORS: flag,
    FIRESTORE_EMULATOR_HOST: z.string().optional(),
    FIREBASE_AUTH_EMULATOR_HOST: z.string().optional(),

    // Workload Identity Federation (Vercel OIDC -> GCP). See docs/DEPLOYMENT.md.
    GCP_WORKLOAD_IDENTITY_AUDIENCE: z.string().optional(),
    GCP_SERVICE_ACCOUNT_EMAIL: z.email().optional(),

    AUTHOR_EMAIL: z.email(),
    /** Comma-separated extra origins accepted for state-changing requests. */
    APP_ORIGINS: z.string().optional(),
    CRON_SECRET: z.string().min(32).optional(),
    RATE_LIMIT_SALT: z.string().min(16).default("sidepage-local-rate-limit-salt"),
  })
  .superRefine((env, ctx) => {
    if (env.USE_FIREBASE_EMULATORS && (!env.FIRESTORE_EMULATOR_HOST || !env.FIREBASE_AUTH_EMULATOR_HOST)) {
      ctx.addIssue({
        code: "custom",
        message: "USE_FIREBASE_EMULATORS=1 needs FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST",
      });
    }
    if (!env.USE_FIREBASE_EMULATORS && (env.FIRESTORE_EMULATOR_HOST || env.FIREBASE_AUTH_EMULATOR_HOST)) {
      ctx.addIssue({ code: "custom", message: "Emulator hosts are set but USE_FIREBASE_EMULATORS is off" });
    }
  });

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  if (!cached) {
    // An empty value in a .env file means "not set".
    const env = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== ""));
    const parsed = schema.safeParse(env);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "env"}: ${i.message}`).join("; ");
      throw new Error(`Invalid server environment: ${issues}`);
    }
    cached = parsed.data;
  }
  return cached;
}

/** Origins allowed to send state-changing requests (CSRF defence). */
export function allowedOrigins(): Set<string> {
  const env = serverEnv();
  const origins = new Set<string>();
  for (const o of (env.APP_ORIGINS ?? "").split(",")) {
    if (o.trim()) origins.add(new URL(o.trim()).origin);
  }
  for (const host of [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL]) {
    if (host) origins.add(`https://${host}`);
  }
  if (process.env.NODE_ENV !== "production") origins.add("http://localhost:3000");
  return origins;
}

import { vi } from "vitest";

// Points the server modules at the local emulators. Loaded before every integration test file.
process.env.FIREBASE_PROJECT_ID = "demo-sidepage";
process.env.USE_FIREBASE_EMULATORS = "1";
process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
process.env.AUTHOR_EMAIL = "author@sidepage.test";
process.env.CRON_SECRET = "test-cron-secret-that-is-long-enough-123";
process.env.RATE_LIMIT_SALT = "test-rate-limit-salt";

// `next/cache` and `next/headers` only work inside a Next.js request; in tests caching is a no-op.
vi.mock("next/cache", () => ({ cacheLife: () => undefined, cacheTag: () => undefined, updateTag: () => undefined, revalidateTag: () => undefined }));

import type { VercelConfig } from "@vercel/config/v1";

// Functions run next to Firestore, which lives in nam5 (US multi-region).
// Security headers are set in next.config.ts; scheduled publishing is triggered
// from GitHub Actions (Hobby crons are daily only).
export const config: VercelConfig = {
  framework: "nextjs",
  installCommand: "pnpm install --frozen-lockfile",
  buildCommand: "pnpm build",
  regions: ["iad1"],
};

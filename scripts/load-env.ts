// Loads .env* files with the same parser and precedence as Next.js.
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

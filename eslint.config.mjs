import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const useCacheDirective = {
  selector: "ExpressionStatement[directive=/^use cache/]",
  message: "Author-only code must never be cached: 'use cache' is only allowed in src/server/read/public.ts.",
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Private data paths: caching here could serve one person's drafts to another.
    files: ["src/server/services/**", "src/server/auth/**", "src/app/studio/**", "src/components/studio/**", "src/components/editor/**"],
    rules: { "no-restricted-syntax": ["error", useCacheDirective] },
  },
  {
    // The domain layer is pure: no Firebase, no Next.js, no React.
    files: ["src/domain/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: ["firebase*", "@google-cloud/*", "next", "next/*", "react", "@/server/*"], message: "src/domain must stay pure." }] },
      ],
    },
  },
  {
    // The public read model may not import draft or author-only modules.
    files: [
      "src/server/read/public.ts",
      "src/app/memoirs/**",
      "src/app/fiction/**",
      "src/app/(house)/page.tsx",
      "src/app/(house)/about/**",
      "src/app/(house)/archive/**",
      "src/app/(house)/contact/**",
      "src/app/(house)/authors/**",
      "src/components/publication/**",
      "src/components/reader/**",
    ],
    rules: {
      "no-restricted-imports": ["error", { patterns: [{ group: ["@/server/services/*", "@/app/studio/*"], message: "Public pages read only from @/server/read/public." }] }],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "playwright-report/**", "test-results/**", ".artifacts/**"]),
]);

export default eslintConfig;

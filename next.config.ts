import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";
const useEmulators = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "1";
const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;

// Content Security Policy. Pages are statically prerendered (Partial Prerendering),
// which rules out per-request nonces, so inline scripts are allowed. The risk that
// normally carries is closed elsewhere: manuscripts are rendered from validated
// JSON as React text, never as HTML (see src/content/render/RenderDoc.tsx).
// Firebase Auth's sign-in popup needs Google's auth endpoints.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://apis.google.com https://us-assets.i.posthog.com${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://lh3.googleusercontent.com",
  "font-src 'self'",
  [
    "connect-src 'self'",
    "https://identitytoolkit.googleapis.com",
    "https://securetoken.googleapis.com",
    "https://www.googleapis.com",
    "https://us.i.posthog.com",
    "https://us-assets.i.posthog.com",
    useEmulators ? "http://127.0.0.1:9099 http://localhost:9099" : "",
    isDev ? "ws://localhost:* ws://127.0.0.1:*" : "",
  ]
    .filter(Boolean)
    .join(" "),
  `frame-src 'self' https://accounts.google.com${authDomain ? ` https://${authDomain}` : ""}${useEmulators ? " http://127.0.0.1:9099 http://localhost:9099" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  // Not with emulators: they are plain-http on localhost.
  ...(isDev || useEmulators ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  // Allows the Firebase sign-in popup to report back to this window.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  // Load the Firebase server SDKs from node_modules rather than bundling them, so
  // every route shares one copy (Firestore rejects Timestamps from a second copy).
  serverExternalPackages: ["firebase-admin", "@google-cloud/firestore", "google-auth-library"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Author-only surfaces are never stored by browsers or shared caches, nor indexed.
      {
        source: "/studio/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ];
  },
};

export default nextConfig;

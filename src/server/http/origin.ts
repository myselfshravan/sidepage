import "server-only";
import { allowedOrigins } from "@/lib/env.server";
import { AppError } from "../errors";

/**
 * CSRF defence for state-changing requests. A request is accepted only when the
 * browser says it came from this site: `Origin` must be our own origin (or an
 * explicitly allowed one) and, where the browser sends it, `Sec-Fetch-Site`
 * must be `same-origin`. Requests without an Origin header are refused.
 *
 * The session cookie is also `SameSite=Lax`, so this is a second, independent layer.
 */
export function assertSameOrigin(headers: Headers): void {
  const fetchSite = headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") {
    throw new AppError("FORBIDDEN", "Cross-site request refused.");
  }
  const origin = headers.get("origin");
  if (!origin) throw new AppError("FORBIDDEN", "Missing Origin header.");
  if (origin !== selfOrigin(headers) && !allowedOrigins().has(origin)) {
    throw new AppError("FORBIDDEN", "Cross-site request refused.");
  }
}

export function selfOrigin(headers: Headers): string | null {
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  if (!host) return null;
  const proto = headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return `${proto}://${host}`;
}

export function clientIp(headers: Headers): string {
  return (
    headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

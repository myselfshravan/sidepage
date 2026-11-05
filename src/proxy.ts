import { NextResponse, type NextRequest } from "next/server";

// An optimistic redirect only: visitors with no session cookie never reach the
// studio's loading shell. This is NOT the security boundary — every studio page,
// server action and route handler verifies the session itself.
export function proxy(request: NextRequest) {
  if (!request.cookies.has("__session")) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/studio", "/studio/:path*"] };

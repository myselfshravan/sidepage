import Link from "next/link";
import type { ReactNode } from "react";
import { SignOutButton } from "./SignOutButton";

export function StudioShell({ email, isAdmin, children }: { email: string; isAdmin: boolean; children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-rule bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-3">
          <div className="flex items-center gap-6">
            <Link href="/studio" className="font-display text-lg italic">
              sidepage <span className="font-sans text-xs font-medium not-italic text-muted">studio</span>
            </Link>
            <nav aria-label="Studio" className="flex gap-4 text-sm">
              <Link href="/studio" className="text-muted hover:text-ink">
                Dashboard
              </Link>
              <Link href="/studio/publications" className="text-muted hover:text-ink">
                Publications
              </Link>
              {isAdmin ? (
                <Link href="/studio/admin" className="text-muted hover:text-ink">
                  Admin
                </Link>
              ) : null}
              <Link href="/" className="text-muted hover:text-ink">
                View site
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm text-muted">
            <span className="hidden sm:inline">{email}</span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-5 py-8">
        {children}
      </main>
    </div>
  );
}

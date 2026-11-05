import Link from "next/link";
import { Suspense } from "react";
import { site } from "@/lib/site";
import { AccountNav } from "./AccountNav";

const NAV = [
  { href: "/memoirs", label: "Memoirs" },
  { href: "/fiction", label: "Fiction" },
  { href: "/archive", label: "Archive" },
  { href: "/about", label: "About" },
] as const;

export function SiteHeader({ current }: { current?: (typeof NAV)[number]["href"] }) {
  return (
    <header className="no-print border-b border-rule">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-5 sm:px-8">
        <Link href="/" className="font-display text-[1.375rem] leading-none tracking-tight italic">
          {site.name}
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1 sm:gap-2">
          <ul className="hidden items-center sm:flex">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={current === item.href ? "page" : undefined}
                  className="flex h-10 items-center px-3 text-[0.9375rem] text-muted transition-colors hover:text-ink aria-[current=page]:text-ink aria-[current=page]:underline aria-[current=page]:decoration-1 aria-[current=page]:underline-offset-[0.4em]"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <span aria-hidden className="mx-2 hidden h-5 w-px bg-rule sm:block" />
          <Suspense fallback={<span className="block h-10 w-20" />}>
            <AccountNav />
          </Suspense>
        </nav>
      </div>
      {/* Small screens: the sections sit on their own line under the wordmark. */}
      <nav aria-label="Sections" className="border-t border-rule sm:hidden">
        <ul className="mx-auto flex max-w-6xl items-center justify-between px-3">
          {NAV.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={current === item.href ? "page" : undefined}
                className="flex h-11 items-center px-2 text-[0.9375rem] text-muted aria-[current=page]:text-ink aria-[current=page]:underline aria-[current=page]:underline-offset-[0.4em]"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}

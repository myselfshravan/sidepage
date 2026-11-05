import Link from "next/link";
import { Suspense } from "react";
import { AccountNav } from "./AccountNav";
import { site } from "@/lib/site";

const NAV = [
  { href: "/memoirs", label: "Memoirs" },
  { href: "/fiction", label: "Fiction" },
  { href: "/archive", label: "Archive" },
  { href: "/about", label: "About" },
] as const;

export function SiteHeader({ current }: { current?: (typeof NAV)[number]["href"] }) {
  return (
    <header className="no-print border-b border-rule">
      <div className="mx-auto flex max-w-6xl flex-wrap items-baseline justify-between gap-x-8 gap-y-3 px-5 py-5 sm:px-8">
        <Link href="/" className="font-display text-xl tracking-tight italic">
          {site.name}
        </Link>
        <nav aria-label="Main">
          <ul className="meta flex flex-wrap gap-x-6 gap-y-2 uppercase">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={current === item.href ? "page" : undefined}
                  className="py-2 transition-colors hover:text-ink aria-[current=page]:text-ink aria-[current=page]:underline aria-[current=page]:underline-offset-[0.5em]"
                >
                  {item.label}
                </Link>
              </li>
            ))}
            <li className="border-l border-rule pl-6">
              <Suspense fallback={<span className="inline-block w-12" />}>
                <AccountNav />
              </Suspense>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AccountForms } from "@/components/account/AccountForms";
import { SiteHeader } from "@/components/site/SiteHeader";
import { PageSkeleton } from "@/components/site/PageSkeleton";
import { canAdminister, canWrite } from "@/domain/access/policy";
import { requireUserPage } from "@/server/auth/session";
import { getUser } from "@/server/services/users";

export const metadata: Metadata = { title: "Account settings", robots: { index: false } };

const ROLE_COPY = {
  reader: "Reader. You can read, keep a library and follow authors.",
  author: "Author. You can publish your own work from the studio.",
  admin: "Admin. You can publish, approve new authors and manage accounts.",
} as const;

export default function AccountPage() {
  return (
    <>
      <SiteHeader />
      <Suspense fallback={<PageSkeleton />}>
        <Account />
      </Suspense>
    </>
  );
}

async function Account() {
  const viewer = await requireUserPage("/account");
  const user = await getUser(viewer.uid);
  if (!user) return null;
  const writer = canWrite(viewer);

  return (
    <main id="main" className="mx-auto grid w-full max-w-5xl flex-1 gap-12 px-5 py-16 sm:px-8 md:grid-cols-[17rem_1fr] md:gap-16 md:py-24">
      <aside className="md:sticky md:top-10 md:self-start">
        <span aria-hidden className="grid size-16 place-items-center rounded-full bg-accent font-display text-3xl text-on-accent italic">
          {user.display_name.trim().charAt(0).toUpperCase() || "?"}
        </span>
        <h1 className="mt-5 font-display text-4xl leading-tight">{user.display_name}</h1>
        <p className="meta mt-1">@{user.handle}</p>
        <p className="mt-6 leading-relaxed text-muted">{ROLE_COPY[viewer.role]}</p>
        <ul className="mt-6 space-y-2">
          <li>
            <Link href="/library" className="link-quiet">
              Your library
            </Link>
          </li>
          {writer ? (
            <>
              <li>
                <Link href="/studio" className="link-quiet">
                  Open the studio
                </Link>
              </li>
              <li>
                <Link href={`/authors/${user.handle}`} className="link-quiet">
                  Your author page
                </Link>
              </li>
            </>
          ) : null}
          {canAdminister(viewer) ? (
            <li>
              <Link href="/studio/admin" className="link-quiet">
                Admin: author requests and accounts
              </Link>
            </li>
          ) : null}
        </ul>
      </aside>
      <AccountForms
        email={user.email}
        profile={{ handle: user.handle, display_name: user.display_name, bio: user.bio }}
        role={viewer.role}
        authorStatus={user.author_status}
        pitch={user.author_request?.pitch ?? ""}
      />
    </main>
  );
}

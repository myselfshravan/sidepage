import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AccountForms } from "@/components/account/AccountForms";
import { SiteHeader } from "@/components/site/SiteHeader";
import { PageSkeleton } from "@/components/site/PageSkeleton";
import { canWrite } from "@/domain/access/policy";
import { requireUserPage } from "@/server/auth/session";
import { getUser } from "@/server/services/users";

export const metadata: Metadata = { title: "Your account", robots: { index: false } };

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
  return (
    <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-5 py-20 sm:px-8">
      <p className="meta uppercase">Your account</p>
      <h1 className="mt-4 font-display text-4xl italic">{user.display_name}</h1>
      <p className="meta mt-2">
        {user.email} · {viewer.role}
        {canWrite(viewer) ? (
          <>
            {" · "}
            <Link href={`/authors/${user.handle}`} className="link-quiet">
              Your author page
            </Link>
          </>
        ) : null}
      </p>
      <AccountForms
        profile={{ handle: user.handle, display_name: user.display_name, bio: user.bio }}
        role={viewer.role}
        authorStatus={user.author_status}
        pitch={user.author_request?.pitch ?? ""}
      />
    </main>
  );
}

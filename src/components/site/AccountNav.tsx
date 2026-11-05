import Link from "next/link";
import { canWrite } from "@/domain/access/policy";
import { getViewer } from "@/server/auth/session";
import { AnalyticsIdentity } from "./AnalyticsIdentity";

/** Account links in the header. Reads the session, so it streams in behind the static shell. */
export async function AccountNav() {
  const viewer = await getViewer();
  if (!viewer) {
    return (
      <Link href="/sign-in" prefetch={false} className="py-2 hover:text-ink">
        Sign in
      </Link>
    );
  }
  return (
    <span className="flex gap-x-6">
      <AnalyticsIdentity uid={viewer.uid} role={viewer.role} />
      <Link href="/library" prefetch={false} className="py-2 hover:text-ink">
        Library
      </Link>
      {canWrite(viewer) ? (
        <Link href="/studio" prefetch={false} className="py-2 hover:text-ink">
          Studio
        </Link>
      ) : null}
      <Link href="/account" prefetch={false} className="py-2 hover:text-ink">
        {viewer.displayName.split(" ")[0]}
      </Link>
    </span>
  );
}

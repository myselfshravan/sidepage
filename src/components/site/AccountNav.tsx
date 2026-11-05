import Link from "next/link";
import { canAdminister, canWrite } from "@/domain/access/policy";
import { getViewer } from "@/server/auth/session";
import { AccountMenu } from "./AccountMenu";
import { AnalyticsIdentity } from "./AnalyticsIdentity";

/** The header's account control. Reads the session, so it streams in behind the static shell. */
export async function AccountNav() {
  const viewer = await getViewer();
  if (!viewer) {
    return (
      <Link href="/sign-in" prefetch={false} className="btn btn-quiet h-10 min-h-0 px-4 text-[0.9375rem]">
        Sign in
      </Link>
    );
  }
  return (
    <>
      <AnalyticsIdentity uid={viewer.uid} role={viewer.role} />
      <AccountMenu name={viewer.displayName} handle={viewer.handle} canWrite={canWrite(viewer)} isAdmin={canAdminister(viewer)} />
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { AdminUsers } from "@/components/studio/AdminUsers";
import { ApiTokensPanel } from "@/components/studio/ApiTokensPanel";
import { Panel } from "@/components/studio/ui";
import { requireAdminPage } from "@/server/auth/session";
import { actorFrom } from "@/server/services/actor";
import { listApiTokens } from "@/server/services/api-tokens";
import { listAuthorRequests, listUsers } from "@/server/services/users";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminPage({ searchParams }: PageProps<"/studio/admin">) {
  // Pages render in parallel with the layout, so each one authorises itself.
  const actor = actorFrom(await requireAdminPage());
  const after = (await searchParams).after;
  const [requests, people, tokens] = await Promise.all([listAuthorRequests(actor), listUsers(actor, typeof after === "string" ? after : undefined), listApiTokens(actor)]);

  return (
    <div className="space-y-8">
      <h1 className="font-display text-3xl italic">Admin</h1>
      <Panel id="requests" title="Requests to write" description="Approving makes the account an author immediately.">
        {requests.length === 0 ? <p className="text-sm text-muted">No pending requests.</p> : <AdminUsers mode="requests" users={requests} selfUid={actor.uid} />}
      </Panel>
      <ApiTokensPanel tokens={tokens} />
      <Panel id="people" title="People">
        <AdminUsers mode="all" users={people.items} selfUid={actor.uid} />
        {people.next ? (
          <Link href={`/studio/admin?after=${people.next}`} className="mt-4 inline-block text-sm text-muted hover:text-ink">
            Next page →
          </Link>
        ) : null}
      </Panel>
    </div>
  );
}

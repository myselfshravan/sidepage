import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink, StatusBadge, VisibilityBadge } from "@/components/studio/ui";
import { COLLECTION_LABEL, STATUSES, type Status } from "@/domain/types";
import { formatDate } from "@/lib/format";
import { listWorks } from "@/server/services/works";
import { requireWriterPage } from "@/server/auth/session";
import { actorFrom } from "@/server/services/actor";

export const metadata: Metadata = { title: "Publications" };

export default async function PublicationsPage({ searchParams }: PageProps<"/studio/publications">) {
  // Pages render in parallel with the layout, so each one authorises itself.
  const actor = actorFrom(await requireWriterPage());
  const params = await searchParams;
  const status = typeof params.status === "string" && (STATUSES as readonly string[]).includes(params.status) ? (params.status as Status) : undefined;
  const after = typeof params.after === "string" ? params.after : undefined;
  const { items, next } = await listWorks(actor, { status, after });
  const filterHref = (s?: Status) => (s ? `/studio/publications?status=${s}` : "/studio/publications");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-3xl italic">Publications</h1>
        <ButtonLink href="/studio" variant="primary">
          New publication
        </ButtonLink>
      </div>

      <nav aria-label="Filter by status" className="flex flex-wrap gap-2 text-sm">
        {[undefined, ...STATUSES].map((s) => (
          <Link
            key={s ?? "all"}
            href={filterHref(s)}
            aria-current={s === status ? "page" : undefined}
            className="rounded-full border border-rule px-3 py-1 text-muted hover:text-ink aria-[current=page]:border-ink aria-[current=page]:text-ink"
          >
            {s ? s.charAt(0) + s.slice(1).toLowerCase() : "All"}
          </Link>
        ))}
      </nav>

      {items.length === 0 ? (
        <div className="rounded-[var(--radius)] border border-dashed border-rule px-6 py-12 text-center text-sm text-muted">
          {status ? `No ${status.toLowerCase()} publications.` : "No publications yet. Create one from the dashboard."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius)] border border-rule bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-rule text-xs text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Title</th>
                <th scope="col" className="px-4 py-3 font-medium">Collection</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3 font-medium text-right">Chapters</th>
                <th scope="col" className="px-4 py-3 font-medium text-right">Words</th>
                <th scope="col" className="px-4 py-3 font-medium text-right">Editions</th>
                <th scope="col" className="px-4 py-3 font-medium">Last edited</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {items.map((w) => (
                <tr key={w.id} className="hover:bg-paper">
                  <td className="px-4 py-3">
                    <Link href={`/studio/publications/${w.id}`} className="font-medium hover:underline">
                      {w.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted">{COLLECTION_LABEL[w.collection]}</td>
                  <td className="px-4 py-3">
                    <span className="flex gap-1.5">
                      <StatusBadge status={w.status} />
                      {w.visibility !== "PUBLIC" ? <VisibilityBadge visibility={w.visibility} /> : null}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">{w.chapter_count}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">{w.word_count.toLocaleString("en-GB")}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">{w.edition_count}</td>
                  <td className="px-4 py-3 text-muted">{formatDate(w.last_edited_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex justify-between text-sm">
        {after ? (
          <Link href={filterHref(status)} className="text-muted hover:text-ink">
            ← First page
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link href={`/studio/publications?${new URLSearchParams({ ...(status ? { status } : {}), after: next })}`} className="text-muted hover:text-ink">
            Next page →
          </Link>
        ) : null}
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChaptersPanel } from "@/components/studio/ChaptersPanel";
import { DuplicateButton } from "@/components/studio/DuplicateButton";
import { MetadataForm } from "@/components/studio/MetadataForm";
import { PublishPanel } from "@/components/studio/PublishPanel";
import { ShareLinksPanel } from "@/components/studio/ShareLinksPanel";
import { VisibilityControl } from "@/components/studio/VisibilityControl";
import { Panel, StatusBadge, VisibilityBadge } from "@/components/studio/ui";
import { COLLECTION_LABEL } from "@/domain/types";
import { formatDateInZone, formatWords } from "@/lib/format";
import { listChapters } from "@/server/services/chapters";
import { listEditions } from "@/server/services/publishing";
import { listShareLinks } from "@/server/services/share-links";
import { getManagedWork, listEvents } from "@/server/services/works";
import { requireWriterPage } from "@/server/auth/session";
import { actorFrom } from "@/server/services/actor";

export const metadata: Metadata = { title: "Publication" };

export default async function PublicationPage({ params }: PageProps<"/studio/publications/[id]">) {
  // Pages render in parallel with the layout, so each one authorises itself.
  const actor = actorFrom(await requireWriterPage());
  const { id } = await params;
  const work = await getManagedWork(actor, id);
  if (!work) notFound();
  const [chapters, editions, events, links] = await Promise.all([listChapters(actor, id), listEditions(actor, id), listEvents(actor, id), listShareLinks(actor, id)]);
  const tz = work.timezone;
  const iso = (t: { toDate(): Date } | null) => (t ? t.toDate().toISOString() : null);
  const publicHref = `/${work.collection}/${work.slug}`;

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Link href="/studio/publications" className="text-sm text-muted hover:text-ink">
          ← Publications
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl italic">{work.title}</h1>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
              {COLLECTION_LABEL[work.collection]} · {formatWords(work.word_count)} · {chapters.length} chapters
              <StatusBadge status={work.status} />
              <VisibilityBadge visibility={work.visibility} />
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {work.status === "PUBLISHED" && work.visibility === "PUBLIC" ? (
              <Link href={publicHref} className="inline-flex min-h-10 items-center rounded-[var(--radius)] border border-rule bg-surface px-4 text-sm hover:border-ink" target="_blank">
                View live ↗
              </Link>
            ) : null}
            <DuplicateButton workId={id} />
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <ChaptersPanel workId={id} chapters={chapters} editable={work.status !== "ARCHIVED" && work.status !== "SCHEDULED"} />
          <MetadataForm
            workId={id}
            locked={work.status === "ARCHIVED"}
            slugLocked={work.edition_count > 0}
            initial={{
              title: work.title,
              subtitle: work.subtitle,
              description: work.description,
              author_name: work.author_name,
              byline: work.byline ?? "profile",
              slug: work.slug,
              content_warnings: work.content_warnings,
              seo_title: work.seo_title,
              seo_description: work.seo_description,
              timezone: work.timezone,
              original_written_at: work.original_written_at,
              digitized_at: iso(work.digitized_at),
            }}
          />
        </div>
        <div className="space-y-6">
          <PublishPanel
            workId={id}
            status={work.status}
            timezone={tz}
            hasChapters={chapters.length > 0}
            hasEdition={work.current_edition_id !== null}
            scheduledFor={iso(work.scheduled_for)}
          />
          <VisibilityControl workId={id} visibility={work.visibility} />
          <ShareLinksPanel workId={id} links={links} live={work.status === "PUBLISHED"} />

          <Panel id="dates" title="Dates" description={`Shown in ${tz}.`}>
            <dl className="space-y-2 text-sm">
              {(
                [
                  ["Created", iso(work.created_at)],
                  ["Last edited", iso(work.last_edited_at)],
                  ["First published", iso(work.first_published_at)],
                  ["Latest edition dated", iso(work.last_published_at)],
                  ["Latest publish ran", iso(work.last_publish_executed_at)],
                  ["Digitised", iso(work.digitized_at)],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4">
                  <dt className="text-muted">{label}</dt>
                  <dd className="text-right font-mono text-xs">{value ? formatDateInZone(value, tz) : "—"}</dd>
                </div>
              ))}
            </dl>
          </Panel>

          <Panel id="editions" title="Editions" description="Sealed snapshots. They never change.">
            {editions.length === 0 ? (
              <p className="text-sm text-muted">No editions yet.</p>
            ) : (
              <ol className="space-y-3 text-sm">
                {editions.map((e) => (
                  <li key={e.id} className="flex justify-between gap-3">
                    <span>
                      <span className="font-medium">Edition {e.number}</span>
                      {e.id === work.current_edition_id ? <span className="ml-2 text-xs text-success">current</span> : null}
                      <span className="block text-xs text-muted">
                        dated {formatDateInZone(e.effectivePublishedAt, tz)} · {e.chapters} ch · {e.words.toLocaleString("en-GB")} words
                      </span>
                    </span>
                    <code className="font-mono text-[0.65rem] text-faint" title={`Content hash ${e.hash}`}>
                      {e.hash.slice(0, 8)}
                    </code>
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          <Panel id="history" title="History">
            <ol className="space-y-3 text-sm">
              {events.map((e) => (
                <li key={e.id}>
                  <span className="font-medium">{e.type.replaceAll("_", " ").toLowerCase()}</span>
                  {e.note ? <span className="text-muted"> — {e.note}</span> : null}
                  <span className="block text-xs text-muted">
                    {formatDateInZone(e.occurredAt, tz)} · {e.actor}
                    {e.effectiveAt && e.effectiveAt !== e.occurredAt ? ` · dated ${formatDateInZone(e.effectiveAt, tz)}` : ""}
                  </span>
                </li>
              ))}
            </ol>
          </Panel>
        </div>
      </div>
    </div>
  );
}

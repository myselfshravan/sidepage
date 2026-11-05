import Link from "next/link";
import { NewPublicationForm } from "@/components/studio/NewPublicationForm";
import { Panel, StatusBadge } from "@/components/studio/ui";
import { COLLECTION_LABEL } from "@/domain/types";
import { formatDateInZone } from "@/lib/format";
import { dashboardStats, DEFAULT_TIMEZONE } from "@/server/services/works";
import { requireAuthorPage } from "@/server/auth/session";

export default async function DashboardPage() {
  // Pages render in parallel with the layout, so each one authorises itself.
  await requireAuthorPage();
  const stats = await dashboardStats();
  const tiles = [
    ["Publications", stats.total],
    ["Drafts", stats.drafts],
    ["In review", stats.review],
    ["Scheduled", stats.scheduled],
    ["Published", stats.published],
    ["Words written", stats.words.toLocaleString("en-GB")],
  ] as const;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl italic">Dashboard</h1>
          <p className="mt-1 text-sm text-muted">Everything in the house at a glance.</p>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius)] border border-rule bg-rule sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map(([label, value]) => (
          <div key={label} className="bg-surface px-4 py-4">
            <dt className="text-xs text-muted">{label}</dt>
            <dd className="mt-1 font-mono text-2xl tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Panel id="recent" title="Recently edited">
          {stats.recent.length === 0 ? (
            <p className="text-sm text-muted">Nothing yet. Start your first publication.</p>
          ) : (
            <ul className="divide-y divide-rule">
              {stats.recent.map((w) => (
                <li key={w.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <Link href={`/studio/publications/${w.id}`} className="font-medium hover:underline">
                    {w.title}
                  </Link>
                  <span className="flex items-center gap-3 text-xs text-muted">
                    {COLLECTION_LABEL[w.collection]}
                    <StatusBadge status={w.status} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <div className="space-y-6">
          <Panel id="new" title="New publication">
            <NewPublicationForm />
          </Panel>
          <Panel id="upcoming" title="Scheduled">
            {stats.upcoming.length === 0 ? (
              <p className="text-sm text-muted">Nothing is scheduled.</p>
            ) : (
              <ul className="space-y-3">
                {stats.upcoming.map((w) => (
                  <li key={w.id} className="text-sm">
                    <Link href={`/studio/publications/${w.id}`} className="font-medium hover:underline">
                      {w.title}
                    </Link>
                    <p className="text-xs text-muted">{w.scheduled_for ? formatDateInZone(w.scheduled_for, DEFAULT_TIMEZONE) : ""}</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <p className="text-xs text-muted">Reader statistics arrive with analytics in a later release.</p>
        </div>
      </div>
    </div>
  );
}

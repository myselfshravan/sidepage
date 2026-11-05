"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { updateMetadataAction } from "@/app/studio/actions";
import { instantToZonedWallTime, zonedWallTimeToInstant } from "@/domain/dates/partial-date";
import type { PartialDate } from "@/domain/types";
import { Button, Field, inputClass, Panel } from "./ui";

type Initial = {
  title: string;
  subtitle: string;
  description: string;
  author_name: string;
  slug: string;
  content_warnings: string[];
  seo_title: string;
  seo_description: string;
  timezone: string;
  original_written_at: PartialDate | null;
  digitized_at: string | null;
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function MetadataForm({ workId, initial, locked, slugLocked }: { workId: string; initial: Initial; locked: boolean; slugLocked: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string }>();
  const [dirty, setDirty] = useState(false);
  // Browsers differ on canonical names (Chrome lists "Asia/Calcutta", not "Asia/Kolkata"),
  // so the saved zone is always offered first and never silently replaced.
  const zones = useMemo(() => [initial.timezone, ...Intl.supportedValuesOf("timeZone").filter((z) => z !== initial.timezone)], [initial.timezone]);
  const written = initial.original_written_at;
  const digitizedDay = initial.digitized_at ? instantToZonedWallTime(new Date(initial.digitized_at), initial.timezone).slice(0, 10) : "";

  return (
    <Panel id="details" title="Details" description="Draft metadata. Readers see the version sealed in the current edition.">
      <form
        className="space-y-5"
        onChange={() => setDirty(true)}
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const s = (k: string) => String(f.get(k) ?? "");
          const timezone = s("timezone");
          const year = s("written_year");
          const month = s("written_month");
          const day = s("written_day");
          const digitized = s("digitized_at");
          const input = {
            title: s("title"),
            subtitle: s("subtitle"),
            description: s("description"),
            author_name: s("author_name"),
            slug: s("slug"),
            content_warnings: s("content_warnings").split(",").map((w) => w.trim()).filter(Boolean),
            seo_title: s("seo_title"),
            seo_description: s("seo_description"),
            timezone,
            original_written_at: year
              ? { year: Number(year), ...(month ? { month: Number(month) } : {}), ...(month && day ? { day: Number(day) } : {}), approximate: f.get("written_approx") === "on" }
              : null,
            digitized_at: digitized ? zonedWallTimeToInstant(`${digitized}T00:00`, timezone).toISOString() : null,
          };
          setResult(undefined);
          startTransition(async () => {
            const r = await updateMetadataAction(workId, input);
            setResult(r.ok ? { ok: true, message: "Saved." } : { ok: false, message: r.message });
            if (r.ok) {
              setDirty(false);
              router.refresh();
            }
          });
        }}
      >
        <fieldset disabled={locked || pending} className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Title" htmlFor="m-title">
              <input id="m-title" name="title" required maxLength={200} defaultValue={initial.title} className={inputClass} />
            </Field>
            <Field label="Subtitle" htmlFor="m-subtitle">
              <input id="m-subtitle" name="subtitle" maxLength={300} defaultValue={initial.subtitle} className={inputClass} />
            </Field>
          </div>
          <Field label="Description" htmlFor="m-description" hint="Shown on the publication page and collection lists.">
            <textarea id="m-description" name="description" rows={3} maxLength={2000} defaultValue={initial.description} className={inputClass} />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Author" htmlFor="m-author">
              <input id="m-author" name="author_name" required maxLength={120} defaultValue={initial.author_name} className={inputClass} />
            </Field>
            <Field label="URL slug" htmlFor="m-slug" hint={slugLocked ? "Locked after the first edition so links keep working." : "Lowercase letters, numbers and hyphens."}>
              <input id="m-slug" name="slug" required readOnly={slugLocked} defaultValue={initial.slug} className={inputClass} pattern="[a-z0-9]+(-[a-z0-9]+)*" />
            </Field>
          </div>
          <Field label="Content warnings" htmlFor="m-cw" hint="Comma-separated. Fiction readers see these before each chapter.">
            <input id="m-cw" name="content_warnings" defaultValue={initial.content_warnings.join(", ")} className={inputClass} />
          </Field>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Originally written</legend>
            <p className="text-xs text-muted">As precisely as you remember it. Leave the year empty if unknown.</p>
            <div className="grid grid-cols-[6rem_1fr_5rem] gap-2">
              <input aria-label="Year written" name="written_year" inputMode="numeric" pattern="\d{4}" placeholder="Year" defaultValue={written?.year ?? ""} className={inputClass} />
              <select aria-label="Month written" name="written_month" defaultValue={written?.month ?? ""} className={inputClass}>
                <option value="">Month (optional)</option>
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
              <input aria-label="Day written" name="written_day" inputMode="numeric" placeholder="Day" defaultValue={written?.day ?? ""} className={inputClass} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="written_approx" defaultChecked={written?.approximate ?? false} /> Approximate (shown as “c.”)
            </label>
          </fieldset>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Digitised on" htmlFor="m-digitized" hint="When a physical original was transcribed.">
              <input id="m-digitized" type="date" name="digitized_at" defaultValue={digitizedDay} className={inputClass} />
            </Field>
            <Field label="Time zone" htmlFor="m-tz" hint="Dates you enter and see are in this zone.">
              <select id="m-tz" name="timezone" defaultValue={initial.timezone} className={inputClass} suppressHydrationWarning>
                {zones.map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <details className="rounded-[var(--radius)] border border-rule px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium">Search &amp; sharing</summary>
            <div className="mt-4 space-y-4">
              <Field label="SEO title" htmlFor="m-seo-title" hint="Defaults to the title.">
                <input id="m-seo-title" name="seo_title" maxLength={120} defaultValue={initial.seo_title} className={inputClass} />
              </Field>
              <Field label="SEO description" htmlFor="m-seo-desc" hint="Defaults to the description.">
                <textarea id="m-seo-desc" name="seo_description" rows={2} maxLength={300} defaultValue={initial.seo_description} className={inputClass} />
              </Field>
            </div>
          </details>

          <div className="rounded-[var(--radius)] border border-dashed border-rule px-4 py-3 text-sm text-muted">
            Cover images need Cloud Storage, which turns on with the Firebase Blaze plan. Until then each publication uses a typographic cover built from its title.
          </div>
        </fieldset>

        <div className="flex items-center gap-4">
          <Button type="submit" variant="primary" disabled={locked || pending || !dirty}>
            {pending ? "Saving…" : "Save details"}
          </Button>
          <p aria-live="polite" className="text-sm">
            {result ? <span className={result.ok ? "text-success" : "text-danger"}>{result.message}</span> : dirty ? <span className="text-muted">Unsaved changes</span> : null}
          </p>
        </div>
      </form>
    </Panel>
  );
}

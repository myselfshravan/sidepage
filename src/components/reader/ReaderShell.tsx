"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  applyPrefs,
  bookmarksKey,
  MAX_BOOKMARKS,
  parsePrefs,
  PREFS_KEY,
  progressKey,
  type Bookmark,
  type Progress,
  type ReaderPrefs,
} from "./prefs";
import { readerOp, useReaderAccount } from "./account";
import { parseJson, setStored, useHydrated, useStored } from "./storage";
import { track } from "@/lib/analytics";

type TocItem = { slug: string; title: string; ordinal: number };

type Props = {
  workId: string;
  base: string;
  workTitle: string;
  chapter: { slug: string; title: string };
  toc: TocItem[];
  /** False for secret-link reading: nothing is stored on the reader's account. */
  accountSync?: boolean;
  children: ReactNode;
};

type Panel = null | "contents" | "settings";

/** Signed-in progress is sent at most this often while reading (and once as the page closes). */
const REMOTE_PROGRESS_MS = 15_000;

export function ReaderShell({ workId, base, workTitle, chapter, toc, accountSync = true, children }: Props) {
  const articleRef = useRef<HTMLDivElement>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [progress, setProgress] = useState(0);
  const [chromeHidden, setChromeHidden] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const hydrated = useHydrated();
  const prefs = parsePrefs(parseJson<Partial<ReaderPrefs> | null>(useStored(PREFS_KEY), null));
  const storedBookmarks = useStored(bookmarksKey(workId));
  const { state: account, reload: reloadAccount } = useReaderAccount(workId, accountSync);
  const signedIn = account.status === "signed-in";
  // Signed in: bookmarks live on the account. Otherwise: on this device.
  const bookmarks: (Bookmark & { id?: string })[] =
    account.status === "signed-in" ? account.bookmarks : parseJson<Bookmark[]>(storedBookmarks, []).slice(0, MAX_BOOKMARKS);
  const remoteProgress = account.status === "signed-in" ? account.progress : null;
  const chapterIndex = toc.findIndex((t) => t.slug === chapter.slug);
  const isLastChapter = chapterIndex === toc.length - 1;

  // Keep <html> attributes in step with the stored preferences (covers client-side navigation).
  const prefsKey = JSON.stringify(prefs);
  useEffect(() => applyPrefs(JSON.parse(prefsKey) as ReaderPrefs), [prefsKey]);

  // Resume: `#resume` scrolls to where the reader left this chapter.
  useEffect(() => {
    if (window.location.hash !== "#resume" || account.status === "loading") return;
    const saved = remoteProgress ?? parseJson<Progress | null>(localStorage.getItem(progressKey(workId)), null);
    const el = articleRef.current;
    if (!saved || saved.chapter !== chapter.slug || !el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: top + saved.fraction * el.offsetHeight - window.innerHeight * 0.3 });
    history.replaceState(null, "", window.location.pathname);
  }, [workId, chapter.slug, account.status, remoteProgress]);

  useEffect(() => track("read_started", { work_id: workId, chapter_index: chapterIndex }), [workId, chapterIndex]);

  // Reading progress: measured on scroll, kept on this device at most every 1.5 s and,
  // for signed-in readers, on the account every 15 s and when the page is hidden.
  useEffect(() => {
    let lastWrite = 0;
    let lastRemote = 0;
    let latest = 0;
    let finished = false;
    const sendRemote = (keepalive = false) => {
      if (!signedIn) return;
      lastRemote = Date.now();
      void readerOp({ op: "progress", data: { workId, chapterSlug: chapter.slug, chapterTitle: chapter.title, fraction: latest } }, { keepalive });
    };
    let lastY = window.scrollY;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const el = articleRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const total = Math.max(1, rect.height - window.innerHeight * 0.6);
      const fraction = Math.min(1, Math.max(0, -rect.top / total));
      latest = fraction;
      setProgress(fraction);
      if (isLastChapter && fraction > 0.98 && !finished) {
        finished = true;
        track("read_finished", { work_id: workId });
      }
      const y = window.scrollY;
      setChromeHidden(y > lastY && y > 200);
      lastY = y;
      const now = Date.now();
      if (now - lastWrite > 1500) {
        lastWrite = now;
        const progress: Progress = { chapter: chapter.slug, title: chapter.title, fraction, at: now };
        setStored(progressKey(workId), JSON.stringify(progress));
      }
      if (now - lastRemote > REMOTE_PROGRESS_MS && latest > 0) sendRemote();
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    const onHide = () => {
      if (document.visibilityState === "hidden" && latest > 0) sendRemote(true);
    };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onHide);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [workId, chapter.slug, chapter.title, signedIn, isLastChapter]);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement !== null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPanel(null);
    };
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const update = (next: Partial<ReaderPrefs>) => setStored(PREFS_KEY, JSON.stringify({ ...prefs, ...next }));

  const toggleFullscreen = useCallback(async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else if (document.documentElement.requestFullscreen) {
      // The whole document goes full screen so the page keeps scrolling normally.
      await document.documentElement.requestFullscreen().catch(() => setNotice("Full screen isn't available in this browser."));
    } else {
      setNotice("Full screen isn't available in this browser.");
    }
  }, []);

  const addBookmark = useCallback(async () => {
    const blocks = articleRef.current?.querySelectorAll<HTMLElement>("[data-block]") ?? [];
    const block = Array.from(blocks).find((b) => b.getBoundingClientRect().bottom > 80);
    if (!block) return;
    const excerpt = (block.textContent ?? "").trim().slice(0, 120);
    if (signedIn) {
      const r = await readerOp({ op: "bookmark.add", data: { workId, chapterSlug: chapter.slug, chapterTitle: chapter.title, block: block.id, excerpt } });
      if (!r.ok) return setNotice(r.message ?? "Couldn't save the bookmark.");
      await reloadAccount();
    } else {
      const item: Bookmark = { chapter: chapter.slug, title: chapter.title, block: block.id, excerpt, at: Date.now() };
      const next = [item, ...bookmarks.filter((b) => !(b.chapter === item.chapter && b.block === item.block))];
      setStored(bookmarksKey(workId), JSON.stringify(next.slice(0, MAX_BOOKMARKS)));
    }
    setNotice(signedIn ? "Bookmarked to your account." : "Bookmarked on this device. Sign in to keep bookmarks everywhere.");
  }, [bookmarks, chapter.slug, chapter.title, workId, signedIn, reloadAccount]);

  const removeBookmark = async (b: Bookmark & { id?: string }) => {
    if (signedIn && b.id) {
      await readerOp({ op: "bookmark.remove", id: b.id });
      await reloadAccount();
      return;
    }
    const next = bookmarks.filter((x) => !(x.chapter === b.chapter && x.block === b.block));
    setStored(bookmarksKey(workId), JSON.stringify(next));
  };

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 2600);
    return () => clearTimeout(t);
  }, [notice]);

  const toolbarButton = "min-h-11 min-w-11 items-center justify-center px-2 sm:px-3 text-[0.9375rem] text-muted hover:text-ink aria-expanded:text-ink";

  return (
    <div data-reader className="relative min-h-screen">
      <div
        role="progressbar"
        aria-label="Chapter progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        className="no-print fixed inset-x-0 top-0 z-40 h-0.5 origin-left bg-accent"
        style={{ transform: `scaleX(${progress})` }}
      />

      <div
        role="toolbar"
        aria-label="Reader"
        className={`no-print sticky top-0 z-30 border-b border-rule bg-paper/95 backdrop-blur-sm transition-transform duration-200 ease-page ${chromeHidden && !panel ? "-translate-y-full" : ""}`}
      >
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-3 sm:px-6">
          <Link href={base} className="min-w-0 truncate py-3 text-[0.9375rem] text-muted hover:text-ink" aria-label={`Back to ${workTitle}`}>
            ← <span className="hidden sm:inline">{workTitle}</span>
          </Link>
          <div className="flex items-center">
            <button type="button" className={`${toolbarButton} inline-flex`} aria-expanded={panel === "contents"} aria-controls="reader-contents" onClick={() => setPanel(panel === "contents" ? null : "contents")}>
              Contents
            </button>
            <button type="button" className={`${toolbarButton} inline-flex`} aria-label="Reading settings" aria-expanded={panel === "settings"} aria-controls="reader-settings" onClick={() => setPanel(panel === "settings" ? null : "settings")}>
              Aa
            </button>
            <button type="button" className={`${toolbarButton} inline-flex`} onClick={() => void addBookmark()} disabled={!hydrated || account.status === "loading"}>
              Bookmark
            </button>
            <button type="button" className={`${toolbarButton} hidden sm:inline-flex`} aria-pressed={fullscreen} onClick={toggleFullscreen}>
              {fullscreen ? "Exit full screen" : "Full screen"}
            </button>
          </div>
        </div>

        {panel === "settings" ? (
          <section id="reader-settings" aria-label="Reading settings" className="border-t border-rule bg-surface">
            <div className="mx-auto grid max-w-5xl gap-5 px-5 py-5 sm:grid-cols-4 sm:px-6">
              <fieldset>
                <legend className="meta">Size</legend>
                <div className="mt-2 flex items-center gap-2">
                  <button type="button" className="min-h-11 min-w-11 border border-rule" aria-label="Smaller text" disabled={prefs.size <= 1} onClick={() => update({ size: (prefs.size - 1) as ReaderPrefs["size"] })}>
                    A−
                  </button>
                  <span className="meta w-8 text-center" aria-live="polite">
                    {prefs.size}/5
                  </span>
                  <button type="button" className="min-h-11 min-w-11 border border-rule" aria-label="Larger text" disabled={prefs.size >= 5} onClick={() => update({ size: (prefs.size + 1) as ReaderPrefs["size"] })}>
                    A+
                  </button>
                </div>
              </fieldset>
              <Choice legend="Typeface" value={prefs.family} options={[["serif", "Serif"], ["sans", "Sans"]]} onChange={(family) => update({ family })} />
              <Choice legend="Spacing" value={prefs.leading} options={[["tight", "Tight"], ["normal", "Normal"], ["loose", "Loose"]]} onChange={(leading) => update({ leading })} />
              <Choice legend="Page" value={prefs.mode} options={[["theme", "Default"], ["light", "Light"], ["dark", "Dark"]]} onChange={(mode) => update({ mode })} />
            </div>
          </section>
        ) : null}

        {panel === "contents" ? (
          <nav id="reader-contents" aria-label="Contents" className="max-h-[70vh] overflow-y-auto border-t border-rule bg-surface">
            <div className="mx-auto max-w-5xl px-5 py-5 sm:px-6">
              <ol className="divide-y divide-rule">
                {toc.map((c) => (
                  <li key={c.slug}>
                    <Link
                      href={`${base}/${c.slug}`}
                      aria-current={c.slug === chapter.slug ? "page" : undefined}
                      className="flex gap-4 py-3 hover:text-accent-ink aria-[current=page]:text-accent-ink"
                      onClick={() => setPanel(null)}
                    >
                      <span className="meta w-8">{String(c.ordinal).padStart(2, "0")}</span>
                      <span>{c.title}</span>
                    </Link>
                  </li>
                ))}
              </ol>
              <h2 className="meta mt-6">Bookmarks</h2>
              {bookmarks.length === 0 ? (
                <p className="mt-2 text-sm text-muted italic">No bookmarks yet. Use Bookmark to mark your place.</p>
              ) : (
                <ul className="mt-2 divide-y divide-rule">
                  {bookmarks.map((b) => (
                    <li key={`${b.chapter}-${b.block}`} className="flex items-start justify-between gap-4 py-3">
                      <Link href={`${base}/${b.chapter}#${b.block}`} className="text-sm hover:text-accent-ink" onClick={() => setPanel(null)}>
                        <span className="meta block">{b.title}</span>
                        {b.excerpt}…
                      </Link>
                      <button type="button" className="meta min-h-11 px-2 hover:text-danger" onClick={() => void removeBookmark(b)} aria-label={`Remove bookmark in ${b.title}`}>
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </nav>
        ) : null}
      </div>

      <div ref={articleRef}>{children}</div>

      <p role="status" aria-live="polite" className="no-print pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center">
        {notice ? <span className="meta bg-ink px-4 py-2 text-paper">{notice}</span> : null}
      </p>
    </div>
  );
}

function Choice<T extends string>({ legend, value, options, onChange }: { legend: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <fieldset>
      <legend className="meta">{legend}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map(([v, label]) => (
          <label key={v} className="meta inline-flex min-h-11 cursor-pointer items-center border border-rule px-3 has-[:checked]:border-ink has-[:checked]:text-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--focus)]">
            <input type="radio" className="sr-only" name={legend} value={v} checked={value === v} onChange={() => onChange(v)} />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

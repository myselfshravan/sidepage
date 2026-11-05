"use client";

import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { checkpointAction, saveChapterAction, setChapterSlugAction } from "@/app/studio/actions";
import { manuscriptExtensions } from "@/content/editor/extensions";
import { readingMinutes, wordCount } from "@/domain/manuscript/metrics";
import { isSafeHref, type JSONNode, type ManuscriptDoc } from "@/domain/manuscript/schema";
import { Button, inputClass } from "@/components/studio/ui";
import { RevisionsPanel } from "./RevisionsPanel";

type Props = {
  workId: string;
  chapterId: string;
  initial: { title: string; slug: string; doc: ManuscriptDoc; rev: number; updatedAt: string };
  readOnly: boolean;
  readOnlyReason?: string;
  previewHref: string;
};

type SaveState =
  | { kind: "saved"; at: string }
  | { kind: "dirty" }
  | { kind: "saving" }
  | { kind: "error"; message: string }
  | { kind: "conflict"; serverRev: number; updatedAt: string };

const DEBOUNCE_MS = 1500;
const MAX_WAIT_MS = 10_000;

export function ChapterEditor({ workId, chapterId, initial, readOnly, readOnlyReason, previewHref }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(initial.title);
  const [save, setSave] = useState<SaveState>({ kind: "saved", at: initial.updatedAt });
  const [panel, setPanel] = useState<null | "link" | "footnote" | "revisions" | "shortcuts">(null);
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  const [notice, setNotice] = useState<string>();

  // Autosave state lives in refs so the timers always see the latest values.
  const rev = useRef(initial.rev);
  const titleRef = useRef(initial.title);
  const dirty = useRef(false);
  const inFlight = useRef<Promise<void> | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstDirtyAt = useRef<number | null>(null);
  const conflicted = useRef(false);
  const editorRef = useRef<Editor | null>(null);

  /** Saves pending changes. Resolves true when everything typed so far is saved. */
  const flush = useCallback(async (): Promise<boolean> => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = null;
    if (inFlight.current) await inFlight.current;
    // Edits made while a save is in flight are saved straight after it.
    while (dirty.current && !conflicted.current) {
      const editor = editorRef.current;
      if (!editor) return false;
      dirty.current = false;
      firstDirtyAt.current = null;
      setSave({ kind: "saving" });
      const run = saveChapterAction({ workId, chapterId, baseRev: rev.current, title: titleRef.current, doc: editor.getJSON() }).then((result) => {
        if (!result.ok) {
          dirty.current = true;
          setSave({ kind: "error", message: result.message });
          return false;
        }
        if (result.value.status === "conflict") {
          conflicted.current = true;
          setSave({ kind: "conflict", serverRev: result.value.serverRev, updatedAt: result.value.updatedAt });
          return false;
        }
        rev.current = result.value.rev;
        setSave(dirty.current ? { kind: "dirty" } : { kind: "saved", at: result.value.savedAt });
        return true;
      });
      inFlight.current = run.then(() => undefined);
      const ok = await run;
      inFlight.current = null;
      if (!ok) return false;
    }
    return !conflicted.current;
  }, [workId, chapterId]);

  const markDirty = useCallback(() => {
    if (conflicted.current) return;
    dirty.current = true;
    firstDirtyAt.current ??= Date.now();
    setSave((s) => (s.kind === "saving" ? s : { kind: "dirty" }));
    if (debounce.current) clearTimeout(debounce.current);
    const waited = Date.now() - firstDirtyAt.current;
    debounce.current = setTimeout(() => void flush(), waited >= MAX_WAIT_MS ? 0 : Math.min(DEBOUNCE_MS, MAX_WAIT_MS - waited));
  }, [flush]);

  const editor = useEditor({
    extensions: manuscriptExtensions(),
    content: initial.doc,
    editable: !readOnly,
    immediatelyRender: false,
    editorProps: {
      attributes: { class: "prose-reader !max-w-none !mx-0", "aria-label": "Chapter text", spellcheck: "true" },
    },
    onUpdate: () => markDirty(),
  });
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  const stats = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      if (!e) return { ready: false, words: 0, minutes: 0, bold: false, italic: false, heading: 0, quote: false, bullet: false, ordered: false, link: false, footnote: false };
      const words = wordCount(e.getJSON() as JSONNode);
      return {
        ready: true,
        words,
        minutes: readingMinutes(words),
        bold: e.isActive("bold"),
        italic: e.isActive("italic"),
        heading: ([2, 3, 4] as const).find((level) => e.isActive("heading", { level })) ?? 0,
        quote: e.isActive("blockquote"),
        bullet: e.isActive("bulletList"),
        ordered: e.isActive("orderedList"),
        link: e.isActive("link"),
        footnote: e.isActive("footnote"),
      };
    },
  });

  // Until the editor reports its first state, show the counts of the saved chapter.
  const initialWords = useMemo(() => wordCount(initial.doc as JSONNode), [initial.doc]);
  const words = stats?.ready ? stats.words : initialWords;

  // Never lose work: warn before closing the tab, and flush when the tab is hidden.
  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty.current || inFlight.current) e.preventDefault();
    };
    const hidden = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    // In-app links: hold navigation while there are unsaved changes.
    const click = (e: MouseEvent) => {
      if (!dirty.current && !inFlight.current) return;
      const a = (e.target as HTMLElement | null)?.closest("a");
      if (!a || a.target === "_blank" || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      e.preventDefault();
      e.stopPropagation();
      setLeaveTo(url.pathname + url.search);
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("visibilitychange", hidden);
    document.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("visibilitychange", hidden);
      document.removeEventListener("click", click, true);
    };
  }, [flush]);

  const checkpoint = useCallback(async () => {
    if (!(await flush())) return;
    const r = await checkpointAction(workId, chapterId);
    setNotice(r.ok ? "Checkpoint saved to revisions." : r.message);
  }, [flush, workId, chapterId]);

  // Shortcuts: Mod+S checkpoint, Mod+Shift+P preview, Mod+K link, Mod+/ help.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) {
        if (e.key === "Escape") setPanel(null);
        return;
      }
      const key = e.key.toLowerCase();
      if (key === "s") {
        e.preventDefault();
        void checkpoint();
      } else if (key === "p" && e.shiftKey) {
        e.preventDefault();
        void flush().then(() => window.open(previewHref, "_blank", "noopener"));
      } else if (key === "k") {
        e.preventDefault();
        setPanel("link");
      } else if (key === "/") {
        e.preventDefault();
        setPanel((p) => (p === "shortcuts" ? null : "shortcuts"));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [checkpoint, flush, previewHref]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(undefined), 3000);
    return () => clearTimeout(t);
  }, [notice]);

  const chain = () => editor!.chain().focus();
  const tool = (label: string, active: boolean, onClick: () => void, aria?: string) => (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      aria-pressed={active}
      aria-label={aria}
      disabled={readOnly || !editor}
      className="min-h-9 min-w-9 rounded-[var(--radius)] px-2 text-sm text-muted hover:bg-paper hover:text-ink aria-pressed:bg-ink aria-pressed:text-paper disabled:opacity-40"
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      {readOnly ? <p className="rounded-[var(--radius)] border border-rule bg-surface px-4 py-3 text-sm">{readOnlyReason}</p> : null}

      {save.kind === "conflict" ? (
        <div role="alert" className="rounded-[var(--radius)] border border-danger bg-surface px-4 py-3 text-sm">
          <p className="font-medium text-danger">This chapter was saved somewhere else (another tab or device).</p>
          <p className="mt-1 text-muted">To avoid overwriting it, autosave has stopped. Copy anything you need from here, then reload to continue from the latest version.</p>
          <Button size="sm" variant="primary" className="mt-3" onClick={() => window.location.reload()}>
            Reload latest version
          </Button>
        </div>
      ) : null}

      {leaveTo ? (
        <div role="alertdialog" aria-labelledby="leave-title" className="rounded-[var(--radius)] border border-warning bg-surface px-4 py-3 text-sm">
          <p id="leave-title" className="font-medium">You have unsaved changes.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="primary"
              autoFocus
              onClick={async () => {
                if (await flush()) router.push(leaveTo);
              }}
            >
              Save and leave
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                dirty.current = false;
                router.push(leaveTo);
              }}
            >
              Leave without saving
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setLeaveTo(null)}>
              Stay
            </Button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_16rem]">
        <div className="rounded-[var(--radius)] border border-rule bg-surface">
          <div role="toolbar" aria-label="Formatting" className="sticky top-0 z-10 flex flex-wrap items-center gap-1 border-b border-rule bg-surface px-2 py-1.5">
            {tool("B", stats?.bold ?? false, () => chain().toggleBold().run(), "Bold")}
            {tool("I", stats?.italic ?? false, () => chain().toggleItalic().run(), "Italic")}
            <span className="mx-1 h-5 w-px bg-rule" />
            {tool("H2", stats?.heading === 2, () => chain().toggleHeading({ level: 2 }).run(), "Heading")}
            {tool("H3", stats?.heading === 3, () => chain().toggleHeading({ level: 3 }).run(), "Subheading")}
            {tool("“ ”", stats?.quote ?? false, () => chain().toggleBlockquote().run(), "Quote")}
            {tool("•", stats?.bullet ?? false, () => chain().toggleBulletList().run(), "Bulleted list")}
            {tool("1.", stats?.ordered ?? false, () => chain().toggleOrderedList().run(), "Numbered list")}
            {tool("⁂", false, () => chain().setHorizontalRule().run(), "Scene break")}
            <span className="mx-1 h-5 w-px bg-rule" />
            {tool("Link", stats?.link ?? false, () => setPanel(panel === "link" ? null : "link"))}
            {tool(stats?.footnote ? "Edit note" : "Note", stats?.footnote ?? false, () => setPanel(panel === "footnote" ? null : "footnote"), "Footnote")}
          </div>

          {panel === "link" && editor ? <LinkForm editor={editor} onDone={() => setPanel(null)} /> : null}
          {panel === "footnote" && editor ? <FootnoteForm editor={editor} onDone={() => setPanel(null)} /> : null}

          <div className="px-5 pt-6 sm:px-10">
            <label htmlFor="chapter-title" className="sr-only">
              Chapter title
            </label>
            <input
              id="chapter-title"
              value={title}
              readOnly={readOnly}
              maxLength={200}
              onChange={(e) => {
                setTitle(e.target.value);
                titleRef.current = e.target.value;
                markDirty();
              }}
              className="w-full bg-transparent font-display text-3xl italic outline-none placeholder:text-faint"
              placeholder="Chapter title"
            />
          </div>
          <div className="editor-surface px-5 pt-6 pb-16 sm:px-10">
            {editor ? <EditorContent editor={editor} /> : <p className="text-sm text-muted">Loading editor…</p>}
          </div>
        </div>

        <aside className="space-y-4 text-sm lg:sticky lg:top-4 lg:self-start">
          <div className="rounded-[var(--radius)] border border-rule bg-surface px-4 py-3">
            <SaveStatus state={save} />
            <dl className="mt-3 space-y-1 text-xs text-muted">
              <div className="flex justify-between">
                <dt>Words</dt>
                <dd className="font-mono">{words.toLocaleString("en-GB")}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Reading time</dt>
                <dd className="font-mono">{readingMinutes(words)} min</dd>
              </div>
            </dl>
          </div>
          <div className="flex flex-col gap-2">
            <Button onClick={() => void checkpoint()} disabled={readOnly}>
              Save checkpoint <kbd className="font-mono text-xs text-muted">⌘S</kbd>
            </Button>
            <Link href={previewHref} target="_blank" onClick={() => void flush()} className="inline-flex min-h-10 items-center justify-center rounded-[var(--radius)] border border-rule bg-surface text-sm hover:border-ink">
              Preview draft ↗
            </Link>
            <Button variant="ghost" onClick={() => setPanel(panel === "revisions" ? null : "revisions")} aria-expanded={panel === "revisions"}>
              Revision history
            </Button>
            <Button variant="ghost" onClick={() => setPanel(panel === "shortcuts" ? null : "shortcuts")} aria-expanded={panel === "shortcuts"}>
              Shortcuts <kbd className="font-mono text-xs">⌘/</kbd>
            </Button>
          </div>
          <SlugField workId={workId} chapterId={chapterId} initial={initial.slug} disabled={readOnly} />
          {panel === "shortcuts" ? <Shortcuts /> : null}
          <p aria-live="polite" className="min-h-5 text-xs text-success">
            {notice}
          </p>
        </aside>
      </div>

      {panel === "revisions" ? (
        <RevisionsPanel
          workId={workId}
          chapterId={chapterId}
          readOnly={readOnly}
          beforeRestore={flush}
          currentRev={() => rev.current}
          onRestored={() => window.location.reload()}
          onClose={() => setPanel(null)}
        />
      ) : null}
    </div>
  );
}

function SaveStatus({ state }: { state: SaveState }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  const text = (() => {
    switch (state.kind) {
      case "saved":
        return `Saved ${relative(state.at)}`;
      case "dirty":
        return "Unsaved changes";
      case "saving":
        return "Saving…";
      case "error":
        return `Not saved — ${state.message}`;
      case "conflict":
        return "Autosave stopped (conflict)";
    }
  })();
  const tone = state.kind === "error" || state.kind === "conflict" ? "text-danger" : state.kind === "saved" ? "text-success" : "text-muted";
  return (
    <p role="status" aria-live="polite" className={`font-medium ${tone}`}>
      {text}
    </p>
  );
}

function relative(iso: string) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return new Date(iso).toLocaleString();
}

function LinkForm({ editor, onDone }: { editor: Editor; onDone: () => void }) {
  const current = (editor.getAttributes("link").href as string | undefined) ?? "";
  const [href, setHref] = useState(current);
  const [error, setError] = useState<string>();
  return (
    <form
      className="flex flex-wrap items-center gap-2 border-b border-rule px-3 py-2"
      onSubmit={(e) => {
        e.preventDefault();
        const value = href.trim();
        if (!value) {
          editor.chain().focus().extendMarkRange("link").unsetLink().run();
          return onDone();
        }
        const normalised = /^[a-z]+:|^\/|^#/i.test(value) ? value : `https://${value}`;
        if (!isSafeHref(normalised)) return setError("Use a web address, an email (mailto:) or a path on this site.");
        editor.chain().focus().extendMarkRange("link").setLink({ href: normalised }).run();
        onDone();
      }}
    >
      <label htmlFor="link-href" className="text-sm">
        Link to
      </label>
      <input id="link-href" autoFocus value={href} onChange={(e) => setHref(e.target.value)} placeholder="https://…" className={`${inputClass} max-w-sm`} />
      <Button type="submit" size="sm" variant="primary">
        {href.trim() ? "Apply" : "Remove link"}
      </Button>
      <Button size="sm" variant="ghost" onClick={onDone}>
        Cancel
      </Button>
      {error ? <span className="w-full text-sm text-danger">{error}</span> : null}
    </form>
  );
}

function FootnoteForm({ editor, onDone }: { editor: Editor; onDone: () => void }) {
  const editing = editor.isActive("footnote");
  const [text, setText] = useState(editing ? ((editor.getAttributes("footnote").text as string) ?? "") : "");
  return (
    <form
      className="flex flex-wrap items-start gap-2 border-b border-rule px-3 py-2"
      onSubmit={(e) => {
        e.preventDefault();
        const value = text.trim();
        if (!value) return;
        if (editing) editor.chain().focus().updateFootnote(value).run();
        else editor.chain().focus().insertFootnote(value).run();
        onDone();
      }}
    >
      <label htmlFor="footnote-text" className="pt-2 text-sm">
        {editing ? "Edit note" : "Footnote"}
      </label>
      <textarea id="footnote-text" autoFocus rows={2} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} className={`${inputClass} max-w-md flex-1`} />
      <Button type="submit" size="sm" variant="primary" disabled={!text.trim()}>
        {editing ? "Update" : "Insert"}
      </Button>
      {editing ? (
        <Button
          size="sm"
          variant="danger"
          onClick={() => {
            editor.chain().focus().deleteSelection().run();
            onDone();
          }}
        >
          Remove note
        </Button>
      ) : null}
      <Button size="sm" variant="ghost" onClick={onDone}>
        Cancel
      </Button>
    </form>
  );
}

function SlugField({ workId, chapterId, initial, disabled }: { workId: string; chapterId: string; initial: string; disabled: boolean }) {
  const [slug, setSlug] = useState(initial);
  const [message, setMessage] = useState<{ ok: boolean; text: string }>();
  return (
    <form
      className="space-y-1.5 rounded-[var(--radius)] border border-rule bg-surface px-4 py-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await setChapterSlugAction(workId, chapterId, slug);
        setMessage(r.ok ? { ok: true, text: "URL updated." } : { ok: false, text: r.message });
      }}
    >
      <label htmlFor="chapter-slug" className="block text-xs font-medium">
        Chapter URL
      </label>
      <div className="flex gap-2">
        <input id="chapter-slug" value={slug} disabled={disabled} onChange={(e) => setSlug(e.target.value)} className={`${inputClass} font-mono text-xs`} />
        <Button type="submit" size="sm" disabled={disabled || slug === initial}>
          Set
        </Button>
      </div>
      <p className="text-xs text-muted">Changes apply to the next edition.</p>
      {message ? <p className={`text-xs ${message.ok ? "text-success" : "text-danger"}`}>{message.text}</p> : null}
    </form>
  );
}

function Shortcuts() {
  const rows = [
    ["⌘/Ctrl B", "Bold"],
    ["⌘/Ctrl I", "Italic"],
    ["⌘/Ctrl K", "Link"],
    ["⌘/Ctrl S", "Save a checkpoint"],
    ["⌘/Ctrl ⇧ P", "Preview draft"],
    ["⌘/Ctrl Z", "Undo"],
    ["## + space", "Heading"],
    ["> + space", "Quote"],
    ["- + space", "Bulleted list"],
    ["---", "Scene break"],
  ];
  return (
    <div className="rounded-[var(--radius)] border border-rule bg-surface px-4 py-3">
      <h2 className="text-xs font-medium">Keyboard shortcuts</h2>
      <dl className="mt-2 space-y-1 text-xs">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3">
            <dt>
              <kbd className="font-mono">{k}</kbd>
            </dt>
            <dd className="text-muted">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

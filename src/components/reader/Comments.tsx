"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { track } from "@/lib/analytics";

type Comment = {
  id: string;
  parentId: string | null;
  body: string;
  name: string;
  handle: string;
  isAuthor: boolean;
  pinned: boolean;
  createdAt: string;
  mine: boolean;
  canModerate: boolean;
};

type State = { status: "loading" } | { status: "ready"; comments: Comment[]; signedIn: boolean; canModerate: boolean; open: boolean };

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

async function send(body: Record<string, unknown>) {
  const res = await fetch("/api/comments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return (await res.json().catch(() => ({ ok: false, message: "Something went wrong." }))) as { ok: boolean; message?: string };
}

export function Comments({ workId, chapterSlug, base }: { workId: string; chapterSlug: string; base: string }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [replyTo, setReplyTo] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/comments?work=${encodeURIComponent(workId)}&chapter=${encodeURIComponent(chapterSlug)}`, { cache: "no-store" }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as (Omit<Extract<State, { status: "ready" }>, "status"> & { ok?: boolean }) | null;
    if (body && Array.isArray(body.comments)) setState({ status: "ready", ...body });
  }, [workId, chapterSlug]);

  useEffect(() => {
    let live = true;
    fetch(`/api/comments?work=${encodeURIComponent(workId)}&chapter=${encodeURIComponent(chapterSlug)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((body) => {
        if (live && Array.isArray(body.comments)) setState({ status: "ready", ...body });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [workId, chapterSlug]);

  if (state.status === "loading" || !state.open) return null;
  const top = state.comments.filter((c) => !c.parentId);
  const replies = (id: string) => state.comments.filter((c) => c.parentId === id);
  const count = state.comments.length;

  return (
    <section aria-labelledby="comments-h" className="no-print mx-auto mt-20 max-w-[var(--measure)] border-t border-rule pt-10">
      <h2 id="comments-h" className="font-display text-2xl">
        {count === 0 ? "Responses" : `${count} ${count === 1 ? "response" : "responses"}`}
      </h2>

      {state.signedIn ? (
        <Composer workId={workId} chapterSlug={chapterSlug} parentId={null} canPin={state.canModerate} onPosted={load} />
      ) : (
        <p className="mt-4 text-muted">
          <Link href={`/sign-in?next=${encodeURIComponent(`${base}/${chapterSlug}`)}`} className="link-quiet text-ink">
            Sign in
          </Link>{" "}
          to respond to this chapter.
        </p>
      )}

      {top.length === 0 ? (
        <p className="meta mt-8">No responses yet.</p>
      ) : (
        <ol className="mt-8 space-y-8">
          {top.map((c) => (
            <li key={c.id}>
              <Entry comment={c} onChange={load} onReply={state.signedIn ? () => setReplyTo(replyTo === c.id ? null : c.id) : undefined} />
              {replies(c.id).length > 0 || replyTo === c.id ? (
                <ol className="mt-5 space-y-5 border-l border-rule pl-5">
                  {replies(c.id).map((r) => (
                    <li key={r.id}>
                      <Entry comment={r} onChange={load} />
                    </li>
                  ))}
                  {replyTo === c.id ? (
                    <li>
                      <Composer
                        workId={workId}
                        chapterSlug={chapterSlug}
                        parentId={c.id}
                        canPin={false}
                        onPosted={async () => {
                          setReplyTo(null);
                          await load();
                        }}
                      />
                    </li>
                  ) : null}
                </ol>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function Entry({ comment: c, onChange, onReply }: { comment: Comment; onChange: () => Promise<void>; onReply?: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <article className={c.pinned ? "rounded-md border border-rule bg-surface px-5 py-4" : ""}>
      <header className="flex flex-wrap items-baseline gap-x-2">
        {c.handle ? (
          <Link href={`/authors/${c.handle}`} className={`font-medium ${c.isAuthor ? "" : "hover:text-accent-ink"}`}>
            {c.name}
          </Link>
        ) : (
          <span className="font-medium">{c.name}</span>
        )}
        {c.isAuthor ? <span className="rounded-full bg-accent px-2 py-px text-[0.75rem] text-on-accent">{c.pinned ? "Author's note" : "Author"}</span> : null}
        <time dateTime={c.createdAt} className="meta">
          {dateFmt.format(new Date(c.createdAt))}
        </time>
      </header>
      <p className="mt-2 leading-relaxed whitespace-pre-line">{c.body}</p>
      <div className="mt-2 flex gap-4 text-[0.875rem] text-muted">
        {onReply ? (
          <button type="button" className="hover:text-ink" onClick={onReply}>
            Reply
          </button>
        ) : null}
        {c.mine || c.canModerate ? (
          <button
            type="button"
            disabled={busy}
            className="hover:text-danger disabled:opacity-50"
            onClick={async () => {
              setBusy(true);
              await send({ op: "remove", id: c.id });
              await onChange();
              setBusy(false);
            }}
          >
            {c.mine ? "Delete" : "Hide"}
          </button>
        ) : null}
      </div>
    </article>
  );
}

function Composer({ workId, chapterSlug, parentId, canPin, onPosted }: { workId: string; chapterSlug: string; parentId: string | null; canPin: boolean; onPosted: () => Promise<void> }) {
  const [body, setBody] = useState("");
  const [pin, setPin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <form
      className="mt-6 space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(undefined);
        const data = { workId, chapterSlug, body, ...(pin ? {} : { parentId }) };
        const r = await send({ op: pin ? "note" : "post", data });
        if (r.ok) {
          track("comment_posted", { work_id: workId, reply: !!parentId });
          setBody("");
          setPin(false);
          await onPosted();
        } else setError(r.message);
        setBusy(false);
      }}
    >
      <label className="block">
        <span className="sr-only">{parentId ? "Your reply" : "Your response"}</span>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} required maxLength={2000} rows={parentId ? 2 : 3} placeholder={parentId ? "Reply…" : "Respond to this chapter…"} className="field" />
      </label>
      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" disabled={busy || !body.trim()} className="btn btn-primary">
          {busy ? "Posting…" : parentId ? "Reply" : "Post"}
        </button>
        {canPin && !parentId ? (
          <label className="flex items-center gap-2 text-[0.9375rem] text-muted">
            <input type="checkbox" checked={pin} onChange={(e) => setPin(e.target.checked)} /> Pin as an author&apos;s note
          </label>
        ) : null}
        {error ? (
          <p role="alert" className="text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </form>
  );
}

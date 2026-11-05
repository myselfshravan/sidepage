"use client";

import { useState, useTransition } from "react";
import { requestAuthorshipAction, updateProfileAction } from "@/app/account/actions";
import type { AuthorStatus, Role } from "@/domain/access/policy";
import { resetIdentity, track } from "@/lib/analytics";

type Props = {
  email: string;
  profile: { handle: string; display_name: string; bio: string };
  role: Role;
  authorStatus: AuthorStatus;
  pitch: string;
};

type Message = { ok: boolean; text: string } | undefined;

export function AccountForms({ email, profile, role, authorStatus, pitch }: Props) {
  const [pending, startTransition] = useTransition();
  const [profileMsg, setProfileMsg] = useState<Message>();
  const [requestMsg, setRequestMsg] = useState<Message>();
  const [dirty, setDirty] = useState(false);

  return (
    <div className="space-y-16">
      <section aria-labelledby="profile-h">
        <h2 id="profile-h" className="font-display text-2xl">
          Profile
        </h2>
        <p className="meta mt-1">Shown next to your name wherever you publish or are followed.</p>
        <form
          className="mt-8 space-y-6"
          onChange={() => setDirty(true)}
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            startTransition(async () => {
              const r = await updateProfileAction({ display_name: f.get("display_name"), handle: f.get("handle"), bio: f.get("bio") });
              setProfileMsg(r.ok ? { ok: true, text: "Profile saved." } : { ok: false, text: r.message });
              if (r.ok) setDirty(false);
            });
          }}
        >
          <div className="grid gap-6 sm:grid-cols-2">
            <label className="block">
              <span className="field-label">Name</span>
              <input name="display_name" required maxLength={80} defaultValue={profile.display_name} autoComplete="name" className="field" />
            </label>
            <label className="block">
              <span className="field-label">Handle</span>
              <span className="flex items-stretch">
                <span className="grid place-items-center rounded-l-[4px] border border-r-0 border-rule bg-paper px-3 text-muted">@</span>
                <input name="handle" required maxLength={30} pattern="[a-z0-9]+(-[a-z0-9]+)*" defaultValue={profile.handle} className="field rounded-l-none" spellCheck={false} />
              </span>
              <span className="field-hint">Lowercase letters, numbers and hyphens.</span>
            </label>
          </div>
          <label className="block">
            <span className="field-label">Bio</span>
            <textarea name="bio" rows={4} maxLength={600} defaultValue={profile.bio} className="field" placeholder="A line or two about you and what you write." />
          </label>
          <div className="flex flex-wrap items-center gap-4">
            <button type="submit" disabled={pending || !dirty} className="btn btn-primary">
              {pending ? "Saving…" : "Save profile"}
            </button>
            <Status message={profileMsg} />
          </div>
        </form>
      </section>

      <section aria-labelledby="write-h" className="border-t border-rule pt-12">
        <h2 id="write-h" className="font-display text-2xl">
          Writing
        </h2>
        {role !== "reader" ? (
          <p className="mt-3 leading-relaxed text-muted">
            You can publish on sidepage.{" "}
            <a href="/studio" className="link-quiet text-ink">
              Open the studio
            </a>
            .
          </p>
        ) : authorStatus === "requested" ? (
          <div className="mt-6 rounded-md border border-rule bg-surface px-5 py-4">
            <p>Your request to write is with the editors.</p>
            <p className="meta mt-1">The studio opens for you as soon as it&apos;s approved. You don&apos;t need to sign in again.</p>
          </div>
        ) : (
          <form
            className="mt-6 space-y-6"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              startTransition(async () => {
                const r = await requestAuthorshipAction({ pitch: f.get("pitch") });
                if (r.ok) track("author_requested", {});
                setRequestMsg(r.ok ? { ok: true, text: "Request sent." } : { ok: false, text: r.message });
              });
            }}
          >
            {authorStatus === "rejected" ? <p className="text-muted">Your last request wasn&apos;t approved. You can send a new one.</p> : null}
            <label className="block">
              <span className="field-label">Want to publish here? Tell the editors what you write.</span>
              <textarea name="pitch" required minLength={20} maxLength={1500} rows={5} defaultValue={pitch} className="field" placeholder="Memoir essays about…, a serialised novel about…, links to anything you've written before." />
              <span className="field-hint">At least 20 characters. An admin reads every request.</span>
            </label>
            <div className="flex flex-wrap items-center gap-4">
              <button type="submit" disabled={pending} className="btn btn-primary">
                Request to write
              </button>
              <Status message={requestMsg} />
            </div>
          </form>
        )}
      </section>

      <section aria-labelledby="signin-h" className="border-t border-rule pt-12">
        <h2 id="signin-h" className="font-display text-2xl">
          Sign-in
        </h2>
        <p className="mt-3 text-muted">
          Signed in as <span className="text-ink">{email}</span>.
        </p>
        <button
          type="button"
          className="btn btn-quiet mt-6"
          onClick={async () => {
            await fetch("/api/auth/session", { method: "DELETE" }).catch(() => undefined);
            resetIdentity();
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- auth changed; the client cache must be discarded
            window.location.assign("/");
          }}
        >
          Sign out everywhere
        </button>
      </section>
    </div>
  );
}

function Status({ message }: { message: Message }) {
  return (
    <p aria-live="polite" className={message?.ok ? "text-success" : "text-danger"}>
      {message?.text}
    </p>
  );
}

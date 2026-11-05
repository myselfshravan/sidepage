"use client";

import { useState, useTransition } from "react";
import { requestAuthorshipAction, updateProfileAction } from "@/app/account/actions";
import type { AuthorStatus, Role } from "@/domain/access/policy";
import { resetIdentity, track } from "@/lib/analytics";

const field = "mt-1 block min-h-11 w-full border border-rule bg-surface px-3 py-2";

export function AccountForms({ profile, role, authorStatus, pitch }: { profile: { handle: string; display_name: string; bio: string }; role: Role; authorStatus: AuthorStatus; pitch: string }) {
  const [pending, startTransition] = useTransition();
  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string }>();
  const [requestMsg, setRequestMsg] = useState<{ ok: boolean; text: string }>();

  return (
    <div className="mt-12 space-y-14">
      <section aria-labelledby="profile-h">
        <h2 id="profile-h" className="meta uppercase">
          Profile
        </h2>
        <form
          className="mt-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            startTransition(async () => {
              const r = await updateProfileAction({ display_name: f.get("display_name"), handle: f.get("handle"), bio: f.get("bio") });
              setProfileMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.message });
            });
          }}
        >
          <label className="block">
            <span className="meta">Name shown on your work and comments</span>
            <input name="display_name" required maxLength={80} defaultValue={profile.display_name} className={field} />
          </label>
          <label className="block">
            <span className="meta">Handle (your page is /authors/handle)</span>
            <input name="handle" required maxLength={30} pattern="[a-z0-9]+(-[a-z0-9]+)*" defaultValue={profile.handle} className={`${field} font-mono text-sm`} />
          </label>
          <label className="block">
            <span className="meta">Bio</span>
            <textarea name="bio" rows={3} maxLength={600} defaultValue={profile.bio} className={field} />
          </label>
          <div className="flex items-center gap-4">
            <button type="submit" disabled={pending} className="min-h-11 bg-ink px-5 text-paper disabled:opacity-50">
              Save profile
            </button>
            <p aria-live="polite" className={profileMsg?.ok ? "text-success" : "text-danger"}>
              {profileMsg?.text}
            </p>
          </div>
        </form>
      </section>

      <section aria-labelledby="write-h" className="border-t border-rule pt-10">
        <h2 id="write-h" className="meta uppercase">
          Writing on sidepage
        </h2>
        {role !== "reader" ? (
          <p className="mt-4">
            You can write and publish. <a href="/studio" className="link-quiet">Open the studio</a>.
          </p>
        ) : authorStatus === "requested" ? (
          <p className="mt-4 text-muted">Your request to write is waiting for review. We&apos;ll open the studio for you once it&apos;s approved.</p>
        ) : (
          <form
            className="mt-4 space-y-4"
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
            {authorStatus === "rejected" ? <p className="text-muted">Your last request wasn&apos;t approved. You&apos;re welcome to try again.</p> : null}
            <label className="block">
              <span className="meta">Want to publish here? Tell us what you write.</span>
              <textarea name="pitch" required minLength={20} maxLength={1500} rows={4} defaultValue={pitch} className={field} />
            </label>
            <div className="flex items-center gap-4">
              <button type="submit" disabled={pending} className="min-h-11 bg-ink px-5 text-paper disabled:opacity-50">
                Request to write
              </button>
              <p aria-live="polite" className={requestMsg?.ok ? "text-success" : "text-danger"}>
                {requestMsg?.text}
              </p>
            </div>
          </form>
        )}
      </section>

      <section className="border-t border-rule pt-10">
        <button
          type="button"
          className="meta min-h-11 uppercase link-quiet"
          onClick={async () => {
            await fetch("/api/auth/session", { method: "DELETE" }).catch(() => undefined);
            resetIdentity();
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- auth changed; the client cache must be discarded
            window.location.assign("/");
          }}
        >
          Sign out
        </button>
      </section>
    </div>
  );
}

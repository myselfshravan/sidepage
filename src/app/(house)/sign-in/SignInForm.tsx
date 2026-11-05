"use client";

import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from "firebase/auth";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useHydrated } from "@/components/reader/storage";
import { clientAuth } from "@/lib/firebase-client";
import { track } from "@/lib/analytics";

type Mode = "sign-in" | "sign-up" | "reset";
type State = { kind: "idle" } | { kind: "working" } | { kind: "error"; message: string } | { kind: "info"; message: string; resend?: boolean };

/** Only same-site relative paths are honoured as a post-sign-in destination. */
function safeNext(value: string | null): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null;
  return value;
}

export function SignInForm() {
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [mode, setMode] = useState<Mode>("sign-in");
  const [state, setState] = useState<State>({ kind: "idle" });
  const [unverified, setUnverified] = useState<User | null>(null);
  const hydrated = useHydrated();
  // Until React has hydrated, nothing is clickable, so a native form submission can
  // never send credentials anywhere.
  const working = state.kind === "working" || !hydrated;

  async function startSession(user: User, method: "google" | "password") {
    // Force a refresh so the token reflects the latest verification state.
    const idToken = await user.getIdToken(true);
    const res = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
    const body = (await res.json().catch(() => ({}))) as { message?: string; role?: string };
    if (!res.ok) throw new Error(body.message ?? "Sign-in failed.");
    track("signed_in", { method });
    const destination = next ?? (body.role === "author" || body.role === "admin" ? "/studio" : "/library");
    // A full navigation: auth changed, so nothing cached by the client router may be reused.
    window.location.assign(destination);
  }

  async function run(fn: () => Promise<void>) {
    setState({ kind: "working" });
    try {
      await fn();
    } catch (error) {
      setState({ kind: "error", message: friendly(error instanceof Error ? error.message : "Something went wrong.") });
    }
  }

  const google = () =>
    run(async () => {
      const auth = clientAuth();
      try {
        const { user } = await signInWithPopup(auth, new GoogleAuthProvider());
        await startSession(user, "google");
      } finally {
        await signOut(auth).catch(() => undefined);
      }
    });

  const submit = (data: FormData) =>
    run(async () => {
      const auth = clientAuth();
      const email = String(data.get("email") ?? "").trim();
      if (mode === "reset") {
        await sendPasswordResetEmail(auth, email).catch(() => undefined);
        // Same message whether or not the account exists.
        setState({ kind: "info", message: "If an account exists for that email, a reset link is on its way." });
        return;
      }
      const password = String(data.get("password") ?? "");
      if (mode === "sign-up") {
        const name = String(data.get("name") ?? "").trim();
        const { user } = await createUserWithEmailAndPassword(auth, email, password);
        if (name) await updateProfile(user, { displayName: name });
        await sendEmailVerification(user);
        track("signed_up", { method: "password" });
        setUnverified(user);
        setState({ kind: "info", message: `We've sent a verification link to ${email}. Open it, then sign in.`, resend: true });
        setMode("sign-in");
        await signOut(auth);
        return;
      }
      const { user } = await signInWithEmailAndPassword(auth, email, password);
      if (!user.emailVerified) {
        setUnverified(user);
        setState({ kind: "info", message: "Verify your email first: open the link we sent you, then sign in again.", resend: true });
        return;
      }
      try {
        await startSession(user, "password");
      } finally {
        await signOut(auth).catch(() => undefined);
      }
    });

  const resend = () =>
    run(async () => {
      if (!unverified) return;
      await sendEmailVerification(unverified);
      setState({ kind: "info", message: "Verification email sent again." });
    });

  return (
    <div className="mt-10 space-y-8">
      <button
        type="button"
        disabled={working}
        onClick={google}
        className="flex min-h-12 w-full items-center justify-center border border-ink px-5 transition-colors hover:bg-ink hover:text-paper disabled:opacity-50"
      >
        Continue with Google
      </button>

      <form
        method="post"
        action="/sign-in"
        className="space-y-3 border-t border-rule pt-8"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(new FormData(e.currentTarget));
        }}
      >
        <p className="meta uppercase">{mode === "sign-up" ? "Create an account" : mode === "reset" ? "Reset your password" : "Sign in with email"}</p>
        {mode === "sign-up" ? (
          <label className="block">
            <span className="meta">Name</span>
            <input name="name" required maxLength={80} autoComplete="name" className="mt-1 block min-h-11 w-full border border-rule bg-surface px-3" />
          </label>
        ) : null}
        <label className="block">
          <span className="meta">Email</span>
          <input name="email" type="email" required autoComplete="email" className="mt-1 block min-h-11 w-full border border-rule bg-surface px-3" />
        </label>
        {mode !== "reset" ? (
          <label className="block">
            <span className="meta">Password</span>
            <input
              name="password"
              type="password"
              required
              minLength={mode === "sign-up" ? 10 : undefined}
              autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
              className="mt-1 block min-h-11 w-full border border-rule bg-surface px-3"
            />
            {mode === "sign-up" ? <span className="meta mt-1 block">At least 10 characters.</span> : null}
          </label>
        ) : null}
        <button type="submit" disabled={working} className="min-h-11 w-full bg-ink px-5 text-paper disabled:opacity-50">
          {state.kind === "working" ? "Working…" : mode === "sign-up" ? "Create account" : mode === "reset" ? "Send reset link" : "Sign in"}
        </button>
        <div className="meta flex flex-wrap justify-between gap-2 pt-1">
          {mode === "sign-in" ? (
            <>
              <button type="button" className="link-quiet" onClick={() => setMode("sign-up")}>
                New here? Create an account
              </button>
              <button type="button" className="link-quiet" onClick={() => setMode("reset")}>
                Forgot password
              </button>
            </>
          ) : (
            <button type="button" className="link-quiet" onClick={() => setMode("sign-in")}>
              Back to sign in
            </button>
          )}
        </div>
      </form>

      <div aria-live="polite" className="min-h-6">
        {state.kind === "error" ? (
          <p role="alert" className="text-danger">
            {state.message}
          </p>
        ) : state.kind === "info" ? (
          <p className="text-muted">
            {state.message}{" "}
            {state.resend && unverified ? (
              <button type="button" className="link-quiet" onClick={resend}>
                Resend
              </button>
            ) : null}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function friendly(message: string) {
  if (message.includes("popup-closed-by-user") || message.includes("cancelled-popup-request")) return "Sign-in was cancelled.";
  if (message.includes("invalid-credential") || message.includes("wrong-password") || message.includes("user-not-found")) return "That email and password don't match.";
  if (message.includes("email-already-in-use")) return "There's already an account with that email. Sign in instead.";
  if (message.includes("weak-password")) return "Choose a longer password.";
  if (message.includes("too-many-requests")) return "Too many attempts. Wait a minute and try again.";
  if (message.includes("account-exists-with-different-credential")) return "That email already uses another sign-in method.";
  return message.replace(/^Firebase: /, "");
}

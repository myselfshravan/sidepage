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
    <div className="mt-10 space-y-6">
      <button
        type="button"
        disabled={working}
        onClick={google}
        className="btn btn-quiet w-full"
      >
        <svg aria-hidden viewBox="0 0 48 48" className="size-5">
          <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.8-2.1 5.1-4.4 6.7v5.6h7.1c4.2-3.8 6.6-9.5 6.6-16.3z" />
          <path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.3l-7.1-5.6c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.6-3.8-12.3-9.1H4.3v5.7C7.9 41.1 15.4 46 24 46z" />
          <path fill="#FBBC05" d="M11.7 28.1c-.4-1.3-.7-2.7-.7-4.1s.3-2.8.7-4.1v-5.7H4.3C2.8 17.2 2 20.5 2 24s.8 6.8 2.3 9.8l7.4-5.7z" />
          <path fill="#EA4335" d="M24 10.8c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4.2 29.9 2 24 2 15.4 2 7.9 6.9 4.3 14.2l7.4 5.7c1.7-5.3 6.6-9.1 12.3-9.1z" />
        </svg>
        Continue with Google
      </button>
      <p className="flex items-center gap-4 text-muted" aria-hidden>
        <span className="h-px flex-1 bg-rule" />
        or with email
        <span className="h-px flex-1 bg-rule" />
      </p>

      <form
        method="post"
        action="/sign-in"
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(new FormData(e.currentTarget));
        }}
      >
        {mode !== "sign-in" ? <h2 className="font-display text-xl">{mode === "sign-up" ? "Create an account" : "Reset your password"}</h2> : null}
        {mode === "sign-up" ? (
          <label className="block">
            <span className="field-label">Name</span>
            <input name="name" required maxLength={80} autoComplete="name" className="field" />
          </label>
        ) : null}
        <label className="block">
          <span className="field-label">Email</span>
          <input name="email" type="email" required autoComplete="email" className="field" />
        </label>
        {mode !== "reset" ? (
          <label className="block">
            <span className="field-label">Password</span>
            <input
              name="password"
              type="password"
              required
              minLength={mode === "sign-up" ? 10 : undefined}
              autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
              className="field"
            />
            {mode === "sign-up" ? <span className="field-hint">At least 10 characters.</span> : null}
          </label>
        ) : null}
        <button type="submit" disabled={working} className="btn btn-primary w-full">
          {state.kind === "working" ? "Working…" : mode === "sign-up" ? "Create account" : mode === "reset" ? "Send reset link" : "Sign in"}
        </button>
        <div className="flex flex-wrap justify-between gap-2 text-[0.9375rem]">
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

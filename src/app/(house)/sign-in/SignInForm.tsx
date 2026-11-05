"use client";

import { GoogleAuthProvider, signInWithEmailAndPassword, signInWithPopup, signOut, type UserCredential } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { clientEnv } from "@/lib/env.client";
import { clientAuth } from "@/lib/firebase-client";

type State = { kind: "idle" } | { kind: "working" } | { kind: "error"; message: string };

export function SignInForm() {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "idle" });

  async function finish(signIn: () => Promise<UserCredential>) {
    setState({ kind: "working" });
    const auth = clientAuth();
    try {
      const credential = await signIn();
      // Force a refresh so the token carries the latest custom claims.
      const idToken = await credential.user.getIdToken(true);
      const res = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) throw new Error(body.message ?? "Sign-in failed.");
      router.replace("/studio");
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? friendly(error.message) : "Sign-in failed.";
      setState({ kind: "error", message });
    } finally {
      await signOut(auth).catch(() => undefined);
    }
  }

  const working = state.kind === "working";

  return (
    <div className="mt-10 space-y-8">
      <button
        type="button"
        disabled={working}
        onClick={() => finish(() => signInWithPopup(clientAuth(), new GoogleAuthProvider()))}
        className="flex min-h-12 w-full items-center justify-center border border-ink px-5 transition-colors hover:bg-ink hover:text-paper disabled:opacity-50"
      >
        {working ? "Signing in…" : "Continue with Google"}
      </button>

      {clientEnv.useEmulators ? (
        <form
          className="space-y-3 border-t border-rule pt-8"
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            void finish(() => signInWithEmailAndPassword(clientAuth(), String(data.get("email")), String(data.get("password"))));
          }}
        >
          <p className="meta uppercase">Local emulator sign-in</p>
          <label className="block">
            <span className="meta">Email</span>
            <input name="email" type="email" required autoComplete="username" className="mt-1 block min-h-11 w-full border border-rule bg-surface px-3" />
          </label>
          <label className="block">
            <span className="meta">Password</span>
            <input name="password" type="password" required autoComplete="current-password" className="mt-1 block min-h-11 w-full border border-rule bg-surface px-3" />
          </label>
          <button type="submit" disabled={working} className="min-h-11 w-full bg-ink px-5 text-paper disabled:opacity-50">
            Sign in with email
          </button>
        </form>
      ) : null}

      <p role="alert" aria-live="assertive" className="min-h-6 text-danger">
        {state.kind === "error" ? state.message : ""}
      </p>
    </div>
  );
}

function friendly(message: string) {
  if (message.includes("popup-closed-by-user") || message.includes("cancelled-popup-request")) return "Sign-in was cancelled.";
  if (message.includes("invalid-credential") || message.includes("wrong-password")) return "That email and password don't match.";
  return message.replace(/^Firebase: /, "");
}

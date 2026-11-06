"use client";

import posthog from "posthog-js";

// Product analytics (PostHog). Every event is declared here with its properties,
// and properties are identifiers and enums only — never titles, text, emails or
// anything a reader or author wrote. tests/unit/analytics.test.ts enforces this.

export type AnalyticsEvents = {
  signed_up: { method: "google" | "password" };
  signed_in: { method: "google" | "password" };
  author_requested: Record<string, never>;
  publication_created: { work_id: string; collection: "memoirs" | "fiction" };
  published: { work_id: string; edition_id: string | null; kind: "publish" | "republish" | "schedule" };
  read_started: { work_id: string; chapter_index: number };
  read_finished: { work_id: string };
  saved_to_library: { work_id: string; saved: boolean };
  followed_author: { author_uid: string; following: boolean };
  comment_posted: { work_id: string; reply: boolean };
};

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

let started = false;

function client(): typeof posthog | null {
  if (!KEY || typeof window === "undefined") return null;
  if (!started) {
    posthog.init(KEY, {
      api_host: HOST,
      person_profiles: "identified_only",
      autocapture: false,
      capture_pageview: "history_change",
      capture_pageleave: true,
      disable_session_recording: true,
      // Never send page titles: unlisted and private work titles must not leave the site.
      sanitize_properties: (props) => {
        delete props.title;
        delete props.$title;
        return props;
      },
    });
    // Shares a PostHog project with other apps; every sidepage event is tagged.
    posthog.register({ app: "sidepage" });
    started = true;
  }
  return posthog;
}

export function track<E extends keyof AnalyticsEvents>(event: E, properties: AnalyticsEvents[E]) {
  client()?.capture(event, properties);
}

/** Ties events to an account by its opaque uid (never by email). */
export function identify(uid: string, role: string) {
  client()?.identify(uid, { role });
}

export function resetIdentity() {
  client()?.reset();
}

/** Starts analytics (and its pageview tracking) on any page that renders the provider. */
export function startAnalytics() {
  client();
}

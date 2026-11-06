import "server-only";
import type { Timestamp } from "@google-cloud/firestore";
import type { EventType } from "@/domain/lifecycle/machine";
import type { ManuscriptDoc } from "@/domain/manuscript/schema";
import type { AuthorStatus, Role } from "@/domain/access/policy";
import type { Byline, Collection, PartialDate, Status, Visibility } from "@/domain/types";
import { db } from "./admin";

// Firestore document shapes. See docs/DATA_MODEL.md for responsibilities,
// relationships and access rules. Field names are snake_case to match the stored data.

/** A person's account profile. Roles are read from here on every request. */
export type UserDoc = {
  handle: string;
  display_name: string;
  bio: string;
  /** Private: never rendered on public pages. */
  email: string;
  role: Role;
  author_status: AuthorStatus;
  author_request: { pitch: string; requested_at: Timestamp } | null;
  author_decided_by: string | null;
  author_decided_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
};

/** A reserved handle: either an account's or a persona's. */
export type HandleDoc = { uid?: string; persona_id?: string };

/**
 * A pen-name identity owned by an account. Public pages show only its handle, name
 * and bio; `owner_uid` is server-only and never leaves the server.
 */
export type PersonaDoc = {
  owner_uid: string;
  handle: string;
  display_name: string;
  bio: string;
  created_at: Timestamp;
  updated_at: Timestamp;
};

/** A reader's comment on a chapter. `author_uid` is server-only. */
export type CommentDoc = {
  work_id: string;
  chapter_slug: string;
  parent_id: string | null;
  body: string;
  author_uid: string;
  /** How the comment is shown: the commenter's profile, or the work's byline when the owner posts. */
  display_name: string;
  display_handle: string;
  is_author: boolean;
  pinned: boolean;
  status: "visible" | "hidden" | "deleted";
  created_at: Timestamp;
  moderated_by: string | null;
};

/** A personal access token for agents. Stored by the SHA-256 of the token; the token is shown once. */
export type ApiTokenDoc = {
  owner_uid: string;
  name: string;
  /** First characters of the token, so the owner can tell tokens apart. */
  hint: string;
  created_at: Timestamp;
  last_used_at: Timestamp | null;
  revoked_at: Timestamp | null;
};

/** The owning author's workspace for a publication. Never read by public code paths. */
export type WorkDoc = {
  owner_uid: string;
  collection: Collection;
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  author_name: string;
  byline: Byline;
  /** The persona credited when byline is "persona". */
  persona_id: string | null;
  content_warnings: string[];
  seo_title: string;
  seo_description: string;
  status: Status;
  visibility: Visibility;
  scheduled_for: Timestamp | null;
  archived_from: Status | null;
  /** IANA zone the author thinks in; used to show and enter dates. */
  timezone: string;
  original_written_at: PartialDate | null;
  digitized_at: Timestamp | null;
  created_at: Timestamp;
  last_edited_at: Timestamp;
  last_edited_by: string;
  /** Intended (effective) publication dates, as the reader should see them. */
  first_published_at: Timestamp | null;
  last_published_at: Timestamp | null;
  /** When the most recent publish actually executed (server time). */
  last_publish_executed_at: Timestamp | null;
  current_edition_id: string | null;
  edition_count: number;
  /** Bumped on every content or metadata change; guards sealing against races. */
  draft_version: number;
  chapter_order: string[];
  word_count: number;
  reading_minutes: number;
  duplicated_from: string | null;
};

export type ChapterDoc = {
  title: string;
  slug: string;
  doc: ManuscriptDoc;
  schema_version: number;
  word_count: number;
  /** Optimistic-concurrency counter for autosave. */
  rev: number;
  created_at: Timestamp;
  updated_at: Timestamp;
  last_revision_at: Timestamp | null;
  last_revision_words: number;
};

export type RevisionKind = "AUTO" | "CHECKPOINT" | "BEFORE_RESTORE";

export type RevisionDoc = {
  doc: ManuscriptDoc;
  title: string;
  rev: number;
  kind: RevisionKind;
  word_count: number;
  content_hash: string;
  created_at: Timestamp;
  created_by: string;
};

/** Append-only. Written in the same transaction as the change it records. */
export type WorkEventDoc = {
  type: EventType | "CREATED" | "DUPLICATED" | "METADATA_UPDATED" | "VISIBILITY_CHANGED";
  occurred_at: Timestamp;
  /** The date the event claims (backdated publication, intended schedule time). */
  effective_at: Timestamp | null;
  actor_uid: string;
  from_status: Status | null;
  to_status: Status | null;
  edition_id: string | null;
  note: string | null;
};

export type EditionMetadata = {
  collection: Collection;
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  author_name: string;
  byline: Byline;
  persona_id: string | null;
  content_warnings: string[];
  seo_title: string;
  seo_description: string;
  original_written_at: PartialDate | null;
  timezone: string;
};

export type TocEntry = {
  chapter_id: string;
  slug: string;
  title: string;
  ordinal: number;
  word_count: number;
  parts: number;
};

/** Immutable once SEALED. Chapters live in `editions/{id}/parts`. */
export type EditionDoc = {
  work_id: string;
  number: number;
  state: "SEALING" | "SEALED";
  /** Random per sealing attempt; part docs are namespaced by it. */
  seal_token: string;
  claimed_at: Timestamp;
  sealed_at: Timestamp | null;
  effective_published_at: Timestamp;
  draft_version: number;
  metadata: EditionMetadata;
  toc: TocEntry[];
  word_count: number;
  reading_minutes: number;
  content_hash: string;
};

export type EditionPartDoc = {
  seal_token: string;
  chapter_id: string;
  ordinal: number;
  part: number;
  doc: ManuscriptDoc;
  schema_version: number;
};

/** The public read model. The only collection public pages read (plus sealed editions). */
export type PublishedDoc = {
  work_id: string;
  owner_uid: string;
  /** The account credited publicly: the owner for profile bylines, null for pen names and anonymous works. */
  public_author_uid: string | null;
  /** The persona credited publicly, for persona bylines; null otherwise. */
  public_persona_id: string | null;
  /** Empty for pen names and anonymous works, so nothing links back to the account. */
  author_handle: string;
  collection: Collection;
  slug: string;
  visibility: Visibility;
  /** True only while the work is PUBLISHED and PUBLIC. */
  listed: boolean;
  live: boolean;
  current_edition_id: string;
  title: string;
  subtitle: string;
  description: string;
  author_name: string;
  content_warnings: string[];
  word_count: number;
  reading_minutes: number;
  chapter_count: number;
  original_written_at: PartialDate | null;
  first_published_at: Timestamp;
  last_published_at: Timestamp;
  sort_at: Timestamp;
  updated_at: Timestamp;
};

export type SlugDoc = { work_id: string };

/** A secret link that opens one publication. Stored by the SHA-256 of its token; the token itself is never stored. */
export type ShareLinkDoc = {
  work_id: string;
  owner_uid: string;
  label: string;
  created_by: string;
  created_at: Timestamp;
  expires_at: Timestamp | null;
  revoked_at: Timestamp | null;
  last_opened_at: Timestamp | null;
  /** Present when the link is a gift: shown to the recipient before the book. */
  gift: { recipient_name: string; dedication: string } | null;
};

export type RateLimitDoc = { window_start: Timestamp; count: number; expires_at: Timestamp };

export const col = {
  works: () => db().collection("works"),
  work: (id: string) => db().collection("works").doc(id),
  chapters: (workId: string) => db().collection("works").doc(workId).collection("chapters"),
  chapter: (workId: string, chapterId: string) => db().collection("works").doc(workId).collection("chapters").doc(chapterId),
  revisions: (workId: string, chapterId: string) =>
    db().collection("works").doc(workId).collection("chapters").doc(chapterId).collection("revisions"),
  events: (workId: string) => db().collection("works").doc(workId).collection("events"),
  editions: () => db().collection("editions"),
  edition: (id: string) => db().collection("editions").doc(id),
  parts: (editionId: string) => db().collection("editions").doc(editionId).collection("parts"),
  published: () => db().collection("published"),
  publishedDoc: (workId: string) => db().collection("published").doc(workId),
  slug: (slug: string) => db().collection("slugs").doc(slug),
  rateLimit: (key: string) => db().collection("rate_limits").doc(key),
  users: () => db().collection("users"),
  user: (uid: string) => db().collection("users").doc(uid),
  handle: (handle: string) => db().collection("handles").doc(handle),
  personas: () => db().collection("personas"),
  persona: (id: string) => db().collection("personas").doc(id),
  comments: () => db().collection("comments"),
  comment: (id: string) => db().collection("comments").doc(id),
  apiTokens: () => db().collection("api_tokens"),
  apiToken: (hash: string) => db().collection("api_tokens").doc(hash),
  shareLinks: () => db().collection("share_links"),
  shareLink: (hash: string) => db().collection("share_links").doc(hash),
};

export const editionId = (workId: string, number: number) => `${workId}-e${number}`;
export const partId = (sealToken: string, ordinal: number, part: number) =>
  `${sealToken}-${String(ordinal).padStart(4, "0")}-${part}`;

import "server-only";
import { Timestamp } from "@google-cloud/firestore";
import { connection } from "next/server";
import { col, type PublishedDoc, type ShareLinkDoc } from "../firebase/model";
import { hashShareToken, isShareTokenShape } from "../services/share-links";
import { loadChapter, loadEdition } from "./editions";
import { toPublicWork, type PublicChapter, type PublicToc, type PublicWork } from "./public";

// Reading through a secret link. Never cached: the link, its expiry, its revocation
// and the work's published state are checked on every request, so revoking a link
// or withdrawing the work locks readers out immediately.

export type SharedWork = { work: PublicWork; toc: PublicToc };

async function resolve(token: string, at?: Date): Promise<{ pub: PublishedDoc; linkId: string } | null> {
  // Request-time only: never part of a prerendered or prefetched shell.
  if (!at) await connection();
  const now = at ?? new Date();
  if (!isShareTokenShape(token)) return null;
  const linkId = hashShareToken(token);
  const link = (await col.shareLink(linkId).get()).data() as ShareLinkDoc | undefined;
  if (!link || link.revoked_at) return null;
  if (link.expires_at && link.expires_at.toMillis() <= now.getTime()) return null;
  const pub = (await col.publishedDoc(link.work_id).get()).data() as PublishedDoc | undefined;
  if (!pub || !pub.live) return null;
  return { pub, linkId };
}

export async function getSharedWork(token: string, at?: Date): Promise<SharedWork | null> {
  const found = await resolve(token, at);
  const now = at ?? new Date();
  if (!found) return null;
  const edition = await loadEdition(found.pub.current_edition_id);
  if (!edition) return null;
  // Best-effort "last opened", useful to the author; never blocks reading.
  void col.shareLink(found.linkId).update({ last_opened_at: Timestamp.fromDate(now) }).catch(() => undefined);
  return {
    work: toPublicWork(found.pub),
    toc: edition.toc.map((t) => ({ slug: t.slug, title: t.title, ordinal: t.ordinal, wordCount: t.word_count })),
  };
}

export async function getSharedChapter(token: string, chapterSlug: string, at?: Date): Promise<PublicChapter | null> {
  const found = await getSharedWork(token, at);
  if (!found) return null;
  const index = found.toc.findIndex((t) => t.slug === chapterSlug);
  if (index === -1) return null;
  const doc = await loadChapter(found.work.editionId, chapterSlug);
  if (!doc) return null;
  const around = (i: number) => (found.toc[i] ? { slug: found.toc[i]!.slug, title: found.toc[i]!.title } : null);
  return { work: found.work, toc: found.toc, chapter: { ...found.toc[index]!, doc }, prev: around(index - 1), next: around(index + 1) };
}

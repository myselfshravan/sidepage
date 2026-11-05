// Seeds the local emulators with sample accounts and publications.
//
//   pnpm emulators          # in one terminal
//   pnpm seed               # in another
//
// Accounts (password for all: sidepage-local-only):
//   admin@sidepage.test    admin
//   mira@sidepage.test     author (memoir)
//   theo@sidepage.test     author (fiction)
//   reader@sidepage.test   reader
//
// Refuses to run against a real project: seed data is obviously fictional sample
// text and must never reach production.
import "./load-env";
import { Timestamp } from "@google-cloud/firestore";
import type { Role } from "@/domain/access/policy";
import { adminAuth } from "@/server/firebase/admin";
import { col } from "@/server/firebase/model";
import type { Actor } from "@/server/services/actor";
import { createChapter, saveChapter } from "@/server/services/chapters";
import { applyCommand } from "@/server/services/publishing";
import { ensureUser } from "@/server/services/users";
import { createWork, requireManagedWork, updateWorkMetadata } from "@/server/services/works";

export const SEED_PASSWORD = "sidepage-local-only";

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST || !process.env.FIREBASE_PROJECT_ID?.startsWith("demo-")) {
  console.error("seed: refusing to run outside the emulators (needs *_EMULATOR_HOST and a demo- project id).");
  process.exit(1);
}

const p = (...paras: string[]) => ({ type: "doc", content: paras.map((text) => ({ type: "paragraph", content: [{ type: "text", text }] })) });

async function account(email: string, name: string, role: Role): Promise<Actor> {
  const existing = await adminAuth().getUserByEmail(email).catch(() => null);
  const user = existing ?? (await adminAuth().createUser({ email, password: SEED_PASSWORD, emailVerified: true, displayName: name }));
  await ensureUser({ uid: user.uid, email, name });
  await col.user(user.uid).update({ role, author_status: role === "reader" ? "none" : "approved", updated_at: Timestamp.now() });
  return { uid: user.uid, kind: "user", role };
}

async function publication(actor: Actor, opts: { collection: "memoirs" | "fiction"; title: string; meta: Record<string, unknown>; chapters: [string, ReturnType<typeof p>][]; publish?: Date }) {
  const { workId } = await createWork(actor, { collection: opts.collection, title: opts.title });
  const work = await requireManagedWork(actor, workId);
  await updateWorkMetadata(actor, workId, {
    title: opts.title,
    subtitle: "",
    description: "",
    author_name: work.author_name,
    slug: work.slug,
    content_warnings: [],
    seo_title: "",
    seo_description: "",
    timezone: "Asia/Kolkata",
    original_written_at: null,
    digitized_at: null,
    ...opts.meta,
  });
  for (const [title, doc] of opts.chapters) {
    const { chapterId } = await createChapter(actor, workId, title);
    await saveChapter(actor, { workId, chapterId, baseRev: 1, title, doc });
  }
  if (opts.publish) await applyCommand(actor, workId, { type: "publish", effectiveAt: opts.publish });
  return workId;
}

async function main() {
  await account("admin@sidepage.test", "Sample Admin", "admin");
  const mira = await account("mira@sidepage.test", "Mira Sample", "author");
  const theo = await account("theo@sidepage.test", "Theo Sample", "author");
  await account("reader@sidepage.test", "Rae Reader", "reader");

  await publication(mira, {
    collection: "memoirs",
    title: "The Ferry at Dusk",
    meta: {
      subtitle: "Sample memoir for local development",
      description: "Placeholder text that exercises the memoir layout: chapters, a historical date, and a backdated first publication.",
      original_written_at: { year: 2009, month: 7, approximate: true },
    },
    chapters: [
      [
        "Crossing",
        p(
          "This is sample text for the local emulator. The ferry left at six, and the river took the colour of the sky as if it had been waiting all day for permission.",
          "Nobody spoke on the lower deck. There was a man with a bicycle, two schoolgirls sharing one pair of earphones, and a crate of something that smelled of ginger.",
          "It is the kind of evening that seems unremarkable until years later, when it turns out to be the one you remember.",
        ),
      ],
      ["The Other Bank", p("More sample text. On the far side the lamps were already lit, and the road climbed away from the water in a slow, patient curve.")],
    ],
    publish: new Date("2012-03-14T09:00:00+05:30"),
  });

  await publication(theo, {
    collection: "fiction",
    title: "Velvet Hours",
    meta: {
      subtitle: "Sample fiction for local development",
      description: "Placeholder text that exercises the fiction layout, the content-warning gate and chapter navigation.",
      content_warnings: ["sample warning", "obsession"],
    },
    chapters: [
      ["The Invitation", p("Sample fiction text. The card was black, the ink was not, and it had been delivered to a door that did not have a letterbox.", "She read it twice and then once more, slowly, as if the words might rearrange themselves into an explanation.")],
      ["Midnight Rules", p("More sample text. Rule one: arrive alone. Rule two: leave before the candles do. There was no rule three, which was the first thing that frightened her.")],
    ],
    publish: new Date(),
  });

  await publication(mira, {
    collection: "memoirs",
    title: "Unfinished Letters",
    meta: { subtitle: "A sample draft that is never public" },
    chapters: [["Dear —", p("Draft-only sample text. This must never appear on the public site.")]],
  });

  console.info(`seed: done. Accounts admin@, mira@, theo@, reader@sidepage.test — password ${SEED_PASSWORD}`);
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);

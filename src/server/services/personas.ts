import "server-only";
import { Timestamp } from "@google-cloud/firestore";
import { z } from "zod";
import { canManageWork, canWrite } from "@/domain/access/policy";
import { slugify } from "@/domain/publication/slug";
import { handleSchema } from "@/lib/validation/user";
import { AppError } from "../errors";
import { db } from "../firebase/admin";
import { col, type PersonaDoc } from "../firebase/model";
import type { Actor } from "./actor";
import { parseInput } from "./works";

// Personas are pen-name identities an author writes under. Each has its own handle
// (from the same namespace as accounts), author page and catalogue. The owning
// account is stored server-side only; nothing public connects a persona to its
// owner or to the owner's other personas.

const MAX_PERSONAS = 50;

const createInput = z.object({
  display_name: z.string().trim().min(1, "Name the persona.").max(80),
  handle: handleSchema.optional(),
  bio: z.string().trim().max(600).default(""),
});

const updateInput = z.object({
  display_name: z.string().trim().min(1).max(80).optional(),
  handle: handleSchema.optional(),
  bio: z.string().trim().max(600).optional(),
});

function assertWriter(actor: Actor) {
  if (actor.kind !== "user" || !canWrite(actor)) throw new AppError("FORBIDDEN", "Only approved authors can create personas.");
}

export type PersonaSummary = { id: string; handle: string; displayName: string; bio: string; createdAt: string };

const toSummary = (id: string, p: PersonaDoc): PersonaSummary => ({ id, handle: p.handle, displayName: p.display_name, bio: p.bio, createdAt: p.created_at.toDate().toISOString() });

export async function createPersona(actor: Actor, input: unknown, now = new Date()): Promise<PersonaSummary> {
  assertWriter(actor);
  const data = parseInput(createInput, input);
  const count = await col.personas().where("owner_uid", "==", actor.uid).count().get();
  if (count.data().count >= MAX_PERSONAS) throw new AppError("INVALID", `You can have at most ${MAX_PERSONAS} personas.`);
  const ref = col.personas().doc();
  const ts = Timestamp.fromDate(now);
  const persona = await db().runTransaction(async (tx) => {
    let handle = data.handle;
    if (handle) {
      if ((await tx.get(col.handle(handle))).exists) throw new AppError("CONFLICT", "That handle is taken.");
    } else {
      const root = slugify(data.display_name).slice(0, 30) || "writer";
      for (let n = 1; n <= 30 && !handle; n++) {
        const candidate = n === 1 ? root : `${root}-${n}`;
        if (!(await tx.get(col.handle(candidate))).exists) handle = candidate;
      }
      if (!handle) throw new AppError("CONFLICT", "Choose a handle for this persona.");
    }
    const doc: PersonaDoc = { owner_uid: actor.uid, handle, display_name: data.display_name, bio: data.bio, created_at: ts, updated_at: ts };
    tx.create(col.handle(handle), { persona_id: ref.id });
    tx.create(ref, doc);
    return doc;
  });
  return toSummary(ref.id, persona);
}

export async function listPersonas(actor: Actor): Promise<PersonaSummary[]> {
  assertWriter(actor);
  const snap = await col.personas().where("owner_uid", "==", actor.uid).orderBy("created_at", "asc").limit(MAX_PERSONAS).get();
  return snap.docs.map((d) => toSummary(d.id, d.data() as PersonaDoc));
}

/** The persona, if it belongs to `ownerUid`. Not-found otherwise, so ids can't be probed. */
export async function requirePersonaOf(ownerUid: string, personaId: string): Promise<PersonaDoc> {
  const persona = (await col.persona(personaId).get()).data() as PersonaDoc | undefined;
  if (!persona || persona.owner_uid !== ownerUid) throw new AppError("NOT_FOUND", "That persona doesn't exist.");
  return persona;
}

export async function updatePersona(actor: Actor, personaId: unknown, input: unknown, now = new Date()): Promise<PersonaSummary> {
  assertWriter(actor);
  const id = parseInput(z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/), personaId);
  const data = parseInput(updateInput, input);
  const ts = Timestamp.fromDate(now);
  const updated = await db().runTransaction(async (tx) => {
    const ref = col.persona(id);
    const snap = await tx.get(ref);
    const persona = snap.data() as PersonaDoc | undefined;
    if (!persona || !canManageWork(actor.kind === "user" ? actor : null, persona)) throw new AppError("NOT_FOUND", "That persona doesn't exist.");
    const handle = data.handle ?? persona.handle;
    if (handle !== persona.handle) {
      if ((await tx.get(col.handle(handle))).exists) throw new AppError("CONFLICT", "That handle is taken.");
      tx.delete(col.handle(persona.handle));
      tx.create(col.handle(handle), { persona_id: id });
    }
    const next: PersonaDoc = { ...persona, handle, display_name: data.display_name ?? persona.display_name, bio: data.bio ?? persona.bio, updated_at: ts };
    tx.set(ref, next);
    return next;
  });

  // Keep the byline in step everywhere this persona is credited: drafts and the public read model.
  const [drafts, published] = await Promise.all([
    col.works().where("persona_id", "==", id).select().get(),
    col.published().where("public_persona_id", "==", id).select().get(),
  ]);
  const writer = db().bulkWriter();
  for (const d of drafts.docs) writer.update(d.ref, { author_name: updated.display_name });
  for (const d of published.docs) writer.update(d.ref, { author_name: updated.display_name, author_handle: updated.handle });
  await writer.close();
  return toSummary(id, updated);
}

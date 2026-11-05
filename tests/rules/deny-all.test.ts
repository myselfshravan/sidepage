import { readFileSync } from "node:fs";
import { assertFails, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { collection, doc, getDoc, getDocs, setDoc, deleteDoc, collectionGroup, query } from "firebase/firestore";
import { ref, getBytes, uploadString } from "firebase/storage";

// The security rules deny every client read and write; the server (Admin SDK) is the
// only data path. These tests prove that for every collection the app uses and for
// every kind of caller, including one holding the author claim.

const COLLECTIONS = ["works", "editions", "published", "slugs", "rate_limits", "users"];
const SUBCOLLECTIONS = ["works/w1/chapters/c1", "works/w1/chapters/c1/revisions/r1", "works/w1/events/e1", "editions/w1-e1/parts/p1"];

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-sidepage-rules",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
    storage: { rules: readFileSync("storage.rules", "utf8"), host: "127.0.0.1", port: 9199 },
  });
});

afterAll(async () => env?.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const name of COLLECTIONS) await setDoc(doc(db, name, "seed"), { secret: "x" });
    for (const path of SUBCOLLECTIONS) await setDoc(doc(db, path), { secret: "x" });
    await uploadString(ref(ctx.storage(), "publications/w1/covers/cover.jpg"), "bytes");
  });
});

const callers = () => [
  ["anonymous", env.unauthenticatedContext()],
  ["reader", env.authenticatedContext("reader-uid", { email: "reader@example.test", email_verified: true })],
  ["author claim", env.authenticatedContext("author-uid", { email: "author@sidepage.test", email_verified: true, role: "author" })],
] as const;

describe("firestore.rules", () => {
  it("denies reads, writes and deletes on every top-level collection", async () => {
    for (const [, ctx] of callers()) {
      const db = ctx.firestore();
      for (const name of COLLECTIONS) {
        await assertFails(getDoc(doc(db, name, "seed")));
        await assertFails(getDocs(collection(db, name)));
        await assertFails(setDoc(doc(db, name, "new"), { x: 1 }));
        await assertFails(setDoc(doc(db, name, "seed"), { x: 1 }));
        await assertFails(deleteDoc(doc(db, name, "seed")));
      }
    }
  });

  it("denies drafts, revisions, events and edition snapshots, including collection-group queries", async () => {
    for (const [, ctx] of callers()) {
      const db = ctx.firestore();
      for (const path of SUBCOLLECTIONS) {
        await assertFails(getDoc(doc(db, path)));
        await assertFails(setDoc(doc(db, path), { x: 1 }));
      }
      for (const group of ["chapters", "revisions", "events", "parts"]) {
        await assertFails(getDocs(query(collectionGroup(db, group))));
      }
    }
  });
});

describe("storage.rules", () => {
  it("denies direct reads and uploads for every caller", async () => {
    for (const [, ctx] of callers()) {
      const storage = ctx.storage();
      await assertFails(getBytes(ref(storage, "publications/w1/covers/cover.jpg")));
      await assertFails(uploadString(ref(storage, "publications/w1/covers/new.jpg"), "bytes"));
      await assertFails(uploadString(ref(storage, "anything/at/all.txt"), "bytes"));
    }
  });
});

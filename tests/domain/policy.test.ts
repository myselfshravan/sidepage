import { describe, expect, it } from "vitest";
import { canAdminister, canManageWork, canRequestAuthorship, canWrite } from "@/domain/access/policy";

const work = { owner_uid: "alice" };

describe("access policy", () => {
  it("lets only authors and admins write", () => {
    expect(canWrite(null)).toBe(false);
    expect(canWrite({ uid: "r", role: "reader" })).toBe(false);
    expect(canWrite({ uid: "a", role: "author" })).toBe(true);
    expect(canWrite({ uid: "x", role: "admin" })).toBe(true);
  });

  it("lets authors manage only their own works; admins manage all", () => {
    expect(canManageWork({ uid: "alice", role: "author" }, work)).toBe(true);
    expect(canManageWork({ uid: "bob", role: "author" }, work)).toBe(false);
    expect(canManageWork({ uid: "alice", role: "reader" }, work)).toBe(false);
    expect(canManageWork({ uid: "ada", role: "admin" }, work)).toBe(true);
    expect(canManageWork(null, work)).toBe(false);
  });

  it("gates administration and author requests", () => {
    expect(canAdminister({ uid: "a", role: "author" })).toBe(false);
    expect(canAdminister({ uid: "x", role: "admin" })).toBe(true);
    expect(canRequestAuthorship({ uid: "r", role: "reader" }, "none")).toBe(true);
    expect(canRequestAuthorship({ uid: "r", role: "reader" }, "rejected")).toBe(true);
    expect(canRequestAuthorship({ uid: "r", role: "reader" }, "requested")).toBe(false);
    expect(canRequestAuthorship({ uid: "a", role: "author" }, "none")).toBe(false);
  });
});

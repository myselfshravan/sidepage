import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Analytics must never carry what people wrote. Every event property declared in
// src/lib/analytics.ts must be an identifier, enum, number or boolean.
const FORBIDDEN = /\b(title|text|body|content|excerpt|email|name|description|pitch|bio|doc|query)\b/i;

describe("analytics event catalogue", () => {
  const source = readFileSync("src/lib/analytics.ts", "utf8");
  const start = source.indexOf("export type AnalyticsEvents");
  const block = source.slice(start, source.indexOf("\n};", start));
  const properties = [...block.matchAll(/(\w+)\??:\s*(?!\{)/g)].map((m) => m[1]!);

  it("declares events", () => {
    expect(block).toContain("published");
    expect(properties.length).toBeGreaterThan(5);
  });

  it("has no property that could contain written content or personal data", () => {
    for (const prop of properties) expect(prop, prop).not.toMatch(FORBIDDEN);
  });

  it("never sends page titles", () => {
    expect(source).toContain("delete props.$title");
    expect(source).toContain("autocapture: false");
  });
});

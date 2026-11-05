import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import type { Collection } from "@/domain/types";

// Open Graph cards, set in the site's own type: Newsreader on paper for the house and
// memoirs, Bodoni on charcoal for fiction. Used only for public pages; secret-link
// pages fall back to the generic site card so titles never leak into link previews.

export const OG_SIZE = { width: 1200, height: 630 };

const fonts = (async () => {
  const dir = join(process.cwd(), "assets/fonts");
  const [regular, italic, bodoni] = await Promise.all([
    readFile(join(dir, "newsreader-latin-400-normal.woff")),
    readFile(join(dir, "newsreader-latin-400-italic.woff")),
    readFile(join(dir, "bodoni-moda-latin-500-normal.woff")),
  ]);
  return [
    { name: "Newsreader", data: regular, style: "normal" as const, weight: 400 as const },
    { name: "Newsreader", data: italic, style: "italic" as const, weight: 400 as const },
    { name: "Bodoni", data: bodoni, style: "normal" as const, weight: 500 as const },
  ];
})();

const PAPER = { bg: "#f4f0e8", ink: "#1f1d1a", muted: "#605a50", rule: "#dcd5c8", accent: "#24345e" };
const NIGHT = { bg: "#141214", ink: "#ece6e1", muted: "#a39a95", rule: "#332d30", accent: "#b5444b" };

type Card = { collection?: Collection; title: string; subtitle?: string; byline?: string; footnote?: string };

/** Long titles step down in size so they always fit in three lines. */
function titleSize(title: string, fiction: boolean) {
  const n = title.length;
  if (fiction) return n > 48 ? 54 : n > 28 ? 66 : 84;
  return n > 60 ? 64 : n > 34 ? 80 : 104;
}

export async function ogCard({ collection, title, subtitle, byline, footnote }: Card) {
  const fiction = collection === "fiction";
  const c = fiction ? NIGHT : PAPER;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: c.bg, color: c.ink, padding: "64px 80px", fontFamily: "Newsreader" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontSize: 34, fontStyle: "italic" }}>sidepage</span>
          <span style={{ fontSize: 26, fontStyle: "italic", color: c.muted }}>{collection === "fiction" ? "Fiction" : collection === "memoirs" ? "Memoir" : ""}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          {fiction ? <div style={{ width: 72, height: 3, background: c.accent }} /> : null}
          <div
            style={{
              display: "flex",
              fontFamily: fiction ? "Bodoni" : "Newsreader",
              fontStyle: fiction ? "normal" : "italic",
              fontSize: titleSize(title, fiction),
              lineHeight: 1.04,
              letterSpacing: fiction ? "0.08em" : "-0.01em",
              textTransform: fiction ? "uppercase" : "none",
              maxWidth: 1000,
            }}
          >
            {title}
          </div>
          {subtitle ? <div style={{ display: "flex", fontSize: 34, color: c.muted, fontStyle: "italic", maxWidth: 980 }}>{subtitle}</div> : null}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderTop: `1px solid ${c.rule}`, paddingTop: 26 }}>
          <span style={{ fontSize: 30 }}>{byline ?? ""}</span>
          <span style={{ fontSize: 24, color: c.muted, fontStyle: "italic" }}>{footnote ?? ""}</span>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts: await fonts },
  );
}

/** The square mark used for favicons and home-screen icons: an italic “s” in ink-blue. */
export async function iconMark(size: number) {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: PAPER.accent, borderRadius: size >= 128 ? size * 0.22 : size * 0.18 }}>
        <span style={{ fontFamily: "Newsreader", fontStyle: "italic", color: PAPER.bg, fontSize: size * 0.82, lineHeight: 1, marginTop: -size * 0.12 }}>s</span>
      </div>
    ),
    { width: size, height: size, fonts: await fonts },
  );
}

import { Atkinson_Hyperlegible_Next, Bodoni_Moda, Crimson_Pro, Geist, Geist_Mono, IBM_Plex_Mono, Newsreader } from "next/font/google";

// Each section imports only the families it uses, so a route preloads two or three files.

export const newsreader = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  variable: "--font-newsreader",
  display: "swap",
});

export const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const bodoni = Bodoni_Moda({
  subsets: ["latin"],
  axes: ["opsz"],
  variable: "--font-bodoni",
  display: "swap",
});

export const crimson = Crimson_Pro({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-crimson",
  display: "swap",
});

export const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
export const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

/** Optional sans-serif reading face, chosen in reader preferences. */
export const atkinson = Atkinson_Hyperlegible_Next({
  subsets: ["latin"],
  variable: "--font-atkinson",
  display: "swap",
  preload: false,
  // No fallback metrics ship for this family; skip the generated fallback.
  adjustFontFallback: false,
});

export const houseFonts = `${newsreader.variable} ${plexMono.variable}`;
export const fictionFonts = `${bodoni.variable} ${crimson.variable}`;
export const studioFonts = `${geist.variable} ${geistMono.variable}`;

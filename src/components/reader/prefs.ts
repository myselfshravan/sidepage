// Reader preferences, progress and bookmarks. All of it is about *public* content
// and stays on this device (localStorage). Preferences are applied as attributes on
// <html> before first paint (READER_PREFS_SCRIPT); CSS does the rest.

export type ReaderPrefs = {
  size: 1 | 2 | 3 | 4 | 5;
  family: "serif" | "sans";
  leading: "tight" | "normal" | "loose";
  mode: "theme" | "light" | "dark";
};

export const PREFS_KEY = "sidepage:reader:v1";
export const DEFAULT_PREFS: ReaderPrefs = { size: 3, family: "serif", leading: "normal", mode: "theme" };

export function parsePrefs(raw: Partial<ReaderPrefs> | null): ReaderPrefs {
  if (!raw) return DEFAULT_PREFS;
  return {
    size: [1, 2, 3, 4, 5].includes(raw.size as number) ? (raw.size as ReaderPrefs["size"]) : DEFAULT_PREFS.size,
    family: raw.family === "sans" ? "sans" : "serif",
    leading: raw.leading === "tight" || raw.leading === "loose" ? raw.leading : "normal",
    mode: raw.mode === "light" || raw.mode === "dark" ? raw.mode : "theme",
  };
}

export function applyPrefs(prefs: ReaderPrefs) {
  const html = document.documentElement;
  html.dataset.readerSize = String(prefs.size);
  html.dataset.readerFamily = prefs.family;
  html.dataset.readerLeading = prefs.leading;
  if (prefs.mode === "theme") delete html.dataset.readerMode;
  else html.dataset.readerMode = prefs.mode;
}

/** Runs synchronously during HTML parsing so the first paint already uses the reader's settings. */
export const READER_PREFS_SCRIPT = `try{var p=JSON.parse(localStorage.getItem(${JSON.stringify(PREFS_KEY)})||"{}"),h=document.documentElement;if([1,2,3,4,5].indexOf(p.size)>-1)h.dataset.readerSize=p.size;if(p.family==="sans")h.dataset.readerFamily="sans";if(p.leading==="tight"||p.leading==="loose")h.dataset.readerLeading=p.leading;if(p.mode==="light"||p.mode==="dark")h.dataset.readerMode=p.mode}catch(e){}`;

/** Where a reader left off in a publication: chapter slug + fraction through it. */
export type Progress = { chapter: string; title: string; fraction: number; at: number };
export const progressKey = (workId: string) => `sidepage:progress:${workId}`;

export function parseProgress(raw: Progress | null): Progress | null {
  return raw && typeof raw.chapter === "string" && typeof raw.fraction === "number" ? raw : null;
}

export type Bookmark = { chapter: string; title: string; block: string; excerpt: string; at: number };
export const bookmarksKey = (workId: string) => `sidepage:bookmarks:${workId}`;
export const MAX_BOOKMARKS = 200;

export const warningKey = (workId: string) => `sidepage:cw:${workId}`;

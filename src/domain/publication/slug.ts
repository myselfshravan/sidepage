export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SLUG_MAX = 80;

/** Words that would collide with routes or read as system pages. */
const RESERVED = new Set(["new", "edit", "studio", "api", "admin", "feed", "rss", "sitemap"]);

export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, "");
}

export function checkSlug(slug: string): string | null {
  if (slug.length === 0) return "Slug can't be empty.";
  if (slug.length > SLUG_MAX) return `Slug must be at most ${SLUG_MAX} characters.`;
  if (!SLUG_PATTERN.test(slug)) return "Use lowercase letters, numbers and single hyphens.";
  if (RESERVED.has(slug)) return `"${slug}" is reserved.`;
  return null;
}

/** Picks `base`, `base-2`, `base-3`… avoiding `taken`. */
export function uniqueSlug(base: string, taken: ReadonlySet<string>): string {
  const root = base || "untitled";
  if (!taken.has(root)) return root;
  for (let n = 2; ; n++) {
    const candidate = `${root}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

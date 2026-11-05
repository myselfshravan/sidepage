import type { MetadataRoute } from "next";
import { site } from "@/lib/site";
import { listPublicWorks } from "@/server/read/public";

// Only listed, public works appear here; it reads the same public read model as the site.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const works = await listPublicWorks(null, 100);
  const pages = ["", "/memoirs", "/fiction", "/archive", "/about", "/contact"].map((path) => ({ url: `${site.url}${path}` }));
  return [...pages, ...works.map((w) => ({ url: `${site.url}/${w.collection}/${w.slug}`, lastModified: w.lastPublishedAt }))];
}

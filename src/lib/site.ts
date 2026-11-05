// The platform's identity. All public-facing copy that isn't written by an author
// lives here, so it can be replaced in one place.
export const site = {
  name: "sidepage",
  // Placeholder description — replace with your own words.
  tagline: "Memoir and fiction from independent authors.",
  established: 2026,
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
} as const;

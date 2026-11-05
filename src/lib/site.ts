// The house's identity. Edit here; nothing else hardcodes it.
export const site = {
  name: "sidepage",
  author: "Shravan Revanna",
  tagline: "An independent house for memoir and fiction.",
  established: 2026,
  github: "https://github.com/myselfshravan",
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
} as const;

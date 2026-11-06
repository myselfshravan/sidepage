// Core vocabulary shared by every layer. Pure TypeScript: no Firebase, no React.

export const COLLECTIONS = ["memoirs", "fiction"] as const;
export type Collection = (typeof COLLECTIONS)[number];

export const STATUSES = ["DRAFT", "REVIEW", "SCHEDULED", "PUBLISHED", "ARCHIVED"] as const;
export type Status = (typeof STATUSES)[number];

export const VISIBILITIES = ["PUBLIC", "UNLISTED", "PRIVATE"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

/**
 * A date the author remembers with varying precision ("1984", "March 1984",
 * "around 12 March 1984"). Memoir dates are rarely exact, so this is not a timestamp.
 */
export type PartialDate = {
  year: number;
  month?: number;
  day?: number;
  approximate: boolean;
};

export function isCollection(value: string): value is Collection {
  return (COLLECTIONS as readonly string[]).includes(value);
}

export const COLLECTION_LABEL: Record<Collection, string> = {
  memoirs: "Memoirs",
  fiction: "Fiction",
};

/**
 * Who a publication is credited to. Only "profile" links to the account; personas,
 * pen names and anonymous works never do.
 */
export const BYLINES = ["profile", "persona", "pen_name", "anonymous"] as const;
export type Byline = (typeof BYLINES)[number];

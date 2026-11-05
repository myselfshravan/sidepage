// Who may do what. Pure functions over plain data, so every rule is unit-tested
// and the server calls exactly these.

export const ROLES = ["reader", "author", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const AUTHOR_STATUSES = ["none", "requested", "approved", "rejected"] as const;
export type AuthorStatus = (typeof AUTHOR_STATUSES)[number];

export type Principal = { uid: string; role: Role };

/** May use the studio at all. */
export function canWrite(p: Principal | null): boolean {
  return !!p && (p.role === "author" || p.role === "admin");
}

/** May edit, publish or delete this particular work. */
export function canManageWork(p: Principal | null, work: { owner_uid: string }): boolean {
  if (!p) return false;
  if (p.role === "admin") return true;
  return p.role === "author" && work.owner_uid === p.uid;
}

export function canAdminister(p: Principal | null): boolean {
  return p?.role === "admin";
}

/** A reader may ask to become an author unless already one, or a request is pending. */
export function canRequestAuthorship(p: Principal | null, status: AuthorStatus): boolean {
  return !!p && p.role === "reader" && (status === "none" || status === "rejected");
}

import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";
import type { Status, Visibility } from "@/domain/types";

// A deliberately small set of studio primitives. Native elements first, so focus,
// keyboard and form behaviour come for free.

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-on-accent hover:bg-[color-mix(in_srgb,var(--accent)_88%,black)] border border-transparent",
  secondary: "bg-surface text-ink border border-rule hover:border-ink",
  ghost: "text-muted hover:text-ink border border-transparent",
  danger: "bg-surface text-danger border border-rule hover:border-danger",
};

export function buttonClass(variant: Variant = "secondary", size: "sm" | "md" = "md") {
  return `inline-flex items-center justify-center gap-2 rounded-[var(--radius)] font-sans font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
    size === "sm" ? "min-h-9 px-3 text-sm" : "min-h-10 px-4 text-sm"
  } ${VARIANTS[variant]}`;
}

export function Button({ variant = "secondary", size = "md", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" }) {
  return <button type="button" {...props} className={`${buttonClass(variant, size)} ${className}`} />;
}

export function ButtonLink({ variant = "secondary", size = "md", className = "", ...props }: ComponentProps<typeof Link> & { variant?: Variant; size?: "sm" | "md" }) {
  return <Link {...props} className={`${buttonClass(variant, size)} ${className}`} />;
}

export const inputClass =
  "block min-h-10 w-full rounded-[var(--radius)] border border-rule bg-surface px-3 py-2 font-sans text-sm text-ink placeholder:text-faint focus-visible:border-ink disabled:opacity-60";

export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: string; error?: string; children: ReactNode; htmlFor: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

const STATUS_STYLE: Record<Status, string> = {
  DRAFT: "bg-stone-100 text-stone-700",
  REVIEW: "bg-amber-50 text-amber-800",
  SCHEDULED: "bg-sky-50 text-sky-800",
  PUBLISHED: "bg-emerald-50 text-emerald-800",
  ARCHIVED: "bg-stone-200 text-stone-600",
};

export function StatusBadge({ status }: { status: Status }) {
  return <span className={`inline-flex rounded-full px-2 py-0.5 font-mono text-[0.7rem] tracking-wide ${STATUS_STYLE[status]}`}>{status}</span>;
}

export function VisibilityBadge({ visibility }: { visibility: Visibility }) {
  return <span className="inline-flex rounded-full border border-rule px-2 py-0.5 font-mono text-[0.7rem] tracking-wide text-muted">{visibility}</span>;
}

export function Panel({ title, description, children, actions, id }: { title: string; description?: string; children: ReactNode; actions?: ReactNode; id?: string }) {
  return (
    <section aria-labelledby={id} className="rounded-[var(--radius)] border border-rule bg-surface">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-rule px-5 py-4">
        <div>
          <h2 id={id} className="font-sans text-base font-semibold">
            {title}
          </h2>
          {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
        </div>
        {actions}
      </header>
      <div className="px-5 py-5">{children}</div>
    </section>
  );
}

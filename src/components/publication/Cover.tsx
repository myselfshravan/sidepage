import type { Collection } from "@/domain/types";

// A typographic cover, generated from the publication itself. Used until image
// covers are available (they need Cloud Storage, which needs the Blaze plan).

type Props = { collection: Collection; title: string; subtitle?: string; author: string; size?: "sm" | "md" | "lg"; className?: string };

const SIZES = {
  sm: "w-24 text-[0.55rem]",
  md: "w-44 text-[0.8rem]",
  lg: "w-56 sm:w-72 text-[1rem]",
} as const;

export function Cover({ collection, title, subtitle, author, size = "md", className = "" }: Props) {
  const base = `${SIZES[size]} aspect-[2/3] shrink-0 select-none overflow-hidden ${className}`;
  if (collection === "fiction") {
    return (
      <div aria-hidden className={`${base} relative flex flex-col justify-between bg-[#0d0b0c] p-[1.1em] text-[#ece6e1] shadow-[0_1px_0_#332d30]`}>
        <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_10%,#3a1219_0%,transparent_60%)]" />
        <span className="relative font-[family-name:var(--font-plex-mono)] text-[0.75em] tracking-[0.2em] text-[#a39a95] uppercase">{author}</span>
        <div className="relative space-y-[0.6em]">
          <span className="block h-px w-[2.2em] bg-[#b5444b]" />
          <span className="credits block text-[1.35em] leading-[1.15] [text-wrap:balance]" style={{ fontFamily: "var(--font-bodoni), serif" }}>
            {title}
          </span>
          {subtitle ? <span className="block text-[0.8em] text-[#a39a95] italic" style={{ fontFamily: "var(--font-crimson), serif" }}>{subtitle}</span> : null}
        </div>
      </div>
    );
  }
  return (
    <div aria-hidden className={`${base} flex flex-col justify-between border border-[#d9cfbf] bg-[#fbf8f1] p-[1.1em] text-[#2b2620] shadow-[0_1px_0_#d9cfbf,0_10px_24px_-18px_rgba(43,38,32,0.45)]`}>
      <span className="font-[family-name:var(--font-plex-mono)] text-[0.7em] tracking-[0.18em] text-[#6b6257] uppercase">Memoir</span>
      <div className="space-y-[0.5em]">
        <span className="block text-[1.5em] leading-[1.1] italic [text-wrap:balance]" style={{ fontFamily: "var(--font-newsreader), serif" }}>
          {title}
        </span>
        {subtitle ? <span className="block text-[0.85em] text-[#6b6257]" style={{ fontFamily: "var(--font-newsreader), serif" }}>{subtitle}</span> : null}
      </div>
      <div className="space-y-[0.5em]">
        <span className="block h-px w-full bg-[#d9cfbf]" />
        <span className="block font-[family-name:var(--font-plex-mono)] text-[0.7em] tracking-[0.12em] text-[#6b6257] uppercase">{author}</span>
      </div>
    </div>
  );
}

import type { Collection } from "@/domain/types";

/**
 * The first thing a gift's recipient sees: a letter addressed to them, signed with
 * the work's byline (a persona's gift stays a persona's).
 */
export function GiftIntro({ collection, recipientName, dedication, from, title }: { collection: Collection; recipientName: string; dedication: string; from: string; title: string }) {
  const fiction = collection === "fiction";
  return (
    <section aria-label="A gift for you" className="border-b border-rule">
      <div className="mx-auto flex min-h-[78vh] max-w-2xl flex-col justify-center px-6 py-24 text-center">
        <p className="meta">A book, given to you</p>
        <h1 className={fiction ? "credits mt-8 text-[clamp(2.4rem,7vw,4.5rem)] leading-[1.05]" : "mt-8 font-display text-[clamp(3rem,9vw,5.5rem)] leading-[1] italic"}>
          For {recipientName}
        </h1>
        {dedication ? <p className="mx-auto mt-10 max-w-xl text-xl leading-relaxed whitespace-pre-line">{dedication}</p> : null}
        <p className="mt-10 font-display text-xl italic">— {from}</p>
        <a href="#book" className="btn btn-primary mx-auto mt-14">
          Open “{title}”
        </a>
      </div>
    </section>
  );
}

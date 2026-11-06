import type { Metadata } from "next";
import { PersonasManager } from "@/components/studio/PersonasManager";
import { requireWriterPage } from "@/server/auth/session";
import { actorFrom } from "@/server/services/actor";
import { listPersonas } from "@/server/services/personas";

export const metadata: Metadata = { title: "Personas" };

export default async function PersonasPage() {
  // Pages render in parallel with the layout, so each one authorises itself.
  const actor = actorFrom(await requireWriterPage());
  const personas = await listPersonas(actor);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl italic">Personas</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Pen names you write under. Each has its own author page and catalogue. Nothing public connects a persona to your account or to your other personas, and when you respond to comments on a persona&apos;s work, you respond as the persona.
        </p>
      </div>
      <PersonasManager personas={personas} />
    </div>
  );
}

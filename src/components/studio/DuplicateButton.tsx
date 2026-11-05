"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { duplicateWorkAction } from "@/app/studio/actions";
import { Button } from "./ui";

export function DuplicateButton({ workId }: { workId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <span className="flex items-center gap-2">
      <Button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await duplicateWorkAction(workId);
            if (r.ok) router.push(`/studio/publications/${r.value.workId}`);
            else setError(r.message);
          })
        }
      >
        {pending ? "Duplicating…" : "Duplicate"}
      </Button>
      {error ? (
        <span role="alert" className="text-sm text-danger">
          {error}
        </span>
      ) : null}
    </span>
  );
}

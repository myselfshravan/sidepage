"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { resetIdentity } from "@/lib/analytics";

type Props = { name: string; handle: string; canWrite: boolean; isAdmin: boolean };

export function AccountMenu({ name, handle, canWrite, isAdmin }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const initial = name.trim().charAt(0).toUpperCase() || "?";
  const item = "flex h-10 items-center rounded-[3px] px-3 text-[0.9375rem] hover:bg-paper focus-visible:bg-paper";

  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 items-center gap-2.5 rounded-full py-1 pr-3 pl-1 text-[0.9375rem] transition-colors hover:bg-surface aria-expanded:bg-surface"
      >
        <span aria-hidden className="grid size-8 place-items-center rounded-full bg-accent font-display text-[0.9375rem] text-on-accent italic">
          {initial}
        </span>
        <span className="hidden max-w-[10rem] truncate sm:inline">{name}</span>
        <svg aria-hidden viewBox="0 0 12 12" className={`size-3 text-muted transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      </button>
      {open ? (
        <div id={menuId} role="menu" aria-label="Account" className="absolute right-0 z-50 mt-2 w-60 rounded-md border border-rule bg-raised p-1.5 shadow-[0_12px_32px_-12px_rgba(31,29,26,0.28)]">
          <p className="px-3 pt-2 pb-2.5">
            <span className="block truncate">{name}</span>
            <span className="meta block truncate">@{handle}</span>
          </p>
          <div className="my-1 h-px bg-rule" />
          <Link role="menuitem" href="/library" prefetch={false} className={item} onClick={() => setOpen(false)}>
            Your library
          </Link>
          {canWrite ? (
            <Link role="menuitem" href="/studio" prefetch={false} className={item} onClick={() => setOpen(false)}>
              Studio
            </Link>
          ) : null}
          {isAdmin ? (
            <Link role="menuitem" href="/studio/admin" prefetch={false} className={item} onClick={() => setOpen(false)}>
              Admin
            </Link>
          ) : null}
          {canWrite ? (
            <Link role="menuitem" href={`/authors/${handle}`} prefetch={false} className={item} onClick={() => setOpen(false)}>
              Your author page
            </Link>
          ) : null}
          <Link role="menuitem" href="/account" prefetch={false} className={item} onClick={() => setOpen(false)}>
            Account settings
          </Link>
          <div className="my-1 h-px bg-rule" />
          <button
            role="menuitem"
            type="button"
            className={`${item} w-full text-left text-muted`}
            onClick={async () => {
              await fetch("/api/auth/session", { method: "DELETE" }).catch(() => undefined);
              resetIdentity();
              // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- auth changed; the client cache must be discarded
              window.location.assign("/");
            }}
          >
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Copy, Monitor, Moon, Sun, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toaster";

export function CopyButton({ value, label = "Copy", className, small }: { value: string; label?: string; className?: string; small?: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={cn("btn btn-secondary", small && "btn-sm", className)}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          toast("Copied", "success");
          setTimeout(() => setDone(false), 1500);
        } catch {
          toast("Couldn't copy. Select the text and copy it instead.", "error");
        }
      }}
    >
      {done ? <Check /> : <Copy />}
      {label}
    </button>
  );
}

/** Dropdown built on <details>, closes on outside click and Escape. */
export function Menu({
  trigger,
  children,
  align = "right",
  className,
  panelClassName,
  label,
}: {
  trigger: ReactNode;
  children: ReactNode;
  align?: "left" | "right";
  className?: string;
  panelClassName?: string;
  label?: string;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onDoc = (e: MouseEvent) => {
      if (el.open && !el.contains(e.target as Node)) el.open = false;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") el.open = false;
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);
  return (
    <details ref={ref} className={cn("relative", className)}>
      <summary aria-label={label} className="list-none">
        {trigger}
      </summary>
      <div
        onClick={(e) => {
          const t = e.target as HTMLElement;
          if (t.closest("a,button[data-close]") && ref.current) ref.current.open = false;
        }}
        className={cn(
          "animate-rise absolute top-[calc(100%+8px)] z-50 min-w-56 rounded-xl border border-line bg-card p-1.5 shadow-[var(--shadow-lg)]",
          align === "right" ? "right-0" : "left-0",
          panelClassName,
        )}
      >
        {children}
      </div>
    </details>
  );
}

export function MenuItem({ href, children, icon, danger }: { href: string; children: ReactNode; icon?: ReactNode; danger?: boolean }) {
  return (
    <a
      href={href}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium hover:bg-hover [&>svg]:size-4 [&>svg]:text-muted",
        danger ? "text-down" : "text-ink-2 hover:text-ink",
      )}
    >
      {icon}
      {children}
    </a>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={cn(
        "m-auto w-[calc(100%-32px)] max-w-lg rounded-2xl border border-line bg-card p-0 text-ink shadow-[var(--shadow-lg)] backdrop:bg-black/40 backdrop:backdrop-blur-[2px]",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <h2 className="text-lg">{title}</h2>
        <button type="button" onClick={onClose} className="btn btn-ghost btn-icon btn-sm" aria-label="Close">
          <X />
        </button>
      </div>
      <div className="max-h-[75vh] overflow-y-auto px-5 py-5">{children}</div>
    </dialog>
  );
}

export function ModalButton({
  label,
  title,
  children,
  className,
  variant = "secondary",
}: {
  label: ReactNode;
  title: ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  className?: string;
  variant?: "primary" | "secondary" | "ghost" | "accent" | "danger";
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <>
      <button type="button" className={cn("btn", `btn-${variant}`, className)} onClick={() => setOpen(true)}>
        {label}
      </button>
      <Modal open={open} onClose={close} title={title}>
        {typeof children === "function" ? children(close) : children}
      </Modal>
    </>
  );
}

type ThemeChoice = "system" | "light" | "dark";

export function ThemeToggle({ initial, className }: { initial: ThemeChoice; className?: string }) {
  const [theme, setTheme] = useState<ThemeChoice>(initial);
  function apply(next: ThemeChoice) {
    setTheme(next);
    document.cookie = `tt_theme=${next}; path=/; max-age=31536000; samesite=lax`;
    if (next === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", next);
  }
  const opts: { v: ThemeChoice; icon: ReactNode; label: string }[] = [
    { v: "light", icon: <Sun />, label: "Light" },
    { v: "dark", icon: <Moon />, label: "Dark" },
    { v: "system", icon: <Monitor />, label: "System" },
  ];
  return (
    <div className={cn("inline-flex rounded-lg border border-line bg-sunk p-0.5", className)} role="radiogroup" aria-label="Theme">
      {opts.map((o) => (
        <button
          key={o.v}
          type="button"
          role="radio"
          aria-checked={theme === o.v}
          title={o.label}
          onClick={() => apply(o.v)}
          className={cn(
            "grid h-7 w-8 place-items-center rounded-md text-muted transition-colors [&>svg]:size-3.5",
            theme === o.v ? "bg-card text-ink shadow-[var(--shadow-sm)]" : "hover:text-ink",
          )}
        >
          {o.icon}
        </button>
      ))}
    </div>
  );
}

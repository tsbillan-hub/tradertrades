import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A settings style card: title row on top, content below, optional footer. */
export function Panel({
  title,
  description,
  children,
  footer,
  className,
  action,
  danger,
}: {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
  action?: ReactNode;
  danger?: boolean;
}) {
  return (
    <section className={cn("card", danger && "border-down/40", className)}>
      <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <h2 className={cn("text-[17px]", danger && "text-down")}>{title}</h2>
          {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children ? <div className="px-5 py-5 sm:px-6">{children}</div> : null}
      {footer ? <div className="flex items-center justify-end gap-2 border-t border-line bg-sunk/60 px-5 py-3 sm:px-6">{footer}</div> : null}
    </section>
  );
}

import Link from "next/link";
import type { ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import type { ReportTarget } from "@/generated/prisma/enums";
import { TARGET_LABEL, type TargetPreview } from "@/server/admin";

/** One reported or flagged thing: what it is, a look at it, the reasons, and the decision form beside it. */
export function TargetCard({
  type,
  preview,
  meta,
  children,
  form,
}: {
  type: ReportTarget;
  preview: TargetPreview;
  meta: ReactNode;
  children: ReactNode;
  form: ReactNode;
}) {
  return (
    <article className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-sunk/50 px-5 py-2.5">
        <span className="badge badge-outline">{TARGET_LABEL[type]}</span>
        {!preview.exists ? <span className="badge badge-bad">Deleted</span> : preview.gone ? <span className="badge badge-bad">Already down</span> : null}
        <span className="text-xs text-muted">{meta}</span>
      </div>
      <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-4">
          <div>
            <h2 className="text-base font-semibold">{preview.title}</h2>
            {preview.excerpt ? <p className="mt-1 text-sm whitespace-pre-line text-ink-2">{preview.excerpt}</p> : null}
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {preview.href ? (
                <Link href={preview.href} target="_blank" className="inline-flex items-center gap-1 font-semibold text-ink-2 hover:text-ink">
                  See it in place <ExternalLink className="size-3.5" />
                </Link>
              ) : null}
              {preview.owner ? (
                <Link href={`/admin/users/${preview.owner.id}`} className="text-muted hover:text-ink">
                  By {preview.owner.displayName} (@{preview.owner.username})
                </Link>
              ) : null}
            </div>
          </div>
          {children}
        </div>
        <div className="lg:border-l lg:border-line lg:pl-5">{form}</div>
      </div>
    </article>
  );
}

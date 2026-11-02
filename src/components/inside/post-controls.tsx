"use client";

import { startTransition, useOptimistic, useState } from "react";
import { Flag, MoreHorizontal, Pencil, Pin, PinOff, SmilePlus, Trash2 } from "lucide-react";
import { Menu, Modal } from "@/components/ui/client";
import { ActionForm, FormMessage, SubmitButton, Textarea } from "@/components/ui/form";
import { ReportForm } from "@/components/report-button";
import { addComment, deleteComment, deletePost, editPost, togglePin, toggleReaction } from "@/server/actions/community";
import { REACTIONS, REACTION_LABEL, type ReactionEmoji } from "@/lib/community";
import { cn } from "@/lib/utils";

const itemCls =
  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-ink-2 hover:bg-hover hover:text-ink [&>svg]:size-4 [&>svg]:text-muted";

export function ReactionBar({ postId, counts, mine, canReact }: { postId: string; counts: Record<string, number>; mine: string[]; canReact: boolean }) {
  const [state, apply] = useOptimistic({ counts, mine }, (s, emoji: string) => {
    const has = s.mine.includes(emoji);
    return {
      counts: { ...s.counts, [emoji]: Math.max(0, (s.counts[emoji] ?? 0) + (has ? -1 : 1)) },
      mine: has ? s.mine.filter((e) => e !== emoji) : [...s.mine, emoji],
    };
  });
  const react = (emoji: string) => {
    if (!canReact) return;
    startTransition(async () => {
      apply(emoji);
      const fd = new FormData();
      fd.set("postId", postId);
      fd.set("emoji", emoji);
      await toggleReaction(fd);
    });
  };
  const shown = REACTIONS.filter((e) => (state.counts[e] ?? 0) > 0);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {shown.map((e) => {
        const on = state.mine.includes(e);
        return (
          <button
            key={e}
            type="button"
            onClick={() => react(e)}
            disabled={!canReact}
            aria-pressed={on}
            aria-label={`${REACTION_LABEL[e as ReactionEmoji]}: ${state.counts[e]}`}
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-full border px-2 text-sm transition-colors",
              on ? "border-accent/40 bg-accent/10 text-ink" : "border-line bg-card text-ink-2 hover:bg-hover",
            )}
          >
            <span aria-hidden>{e}</span>
            <span className="num text-xs font-semibold">{state.counts[e]}</span>
          </button>
        );
      })}
      {canReact ? (
        <Menu
          align="left"
          label="Add a reaction"
          trigger={
            <span className="inline-flex h-7 cursor-pointer items-center rounded-full border border-dashed border-line px-2 text-muted hover:bg-hover hover:text-ink">
              <SmilePlus className="size-4" />
            </span>
          }
          panelClassName="min-w-0 flex gap-0.5 p-1"
        >
          {REACTIONS.map((e) => (
            <button key={e} type="button" data-close title={REACTION_LABEL[e]} aria-label={REACTION_LABEL[e]} onClick={() => react(e)} className="grid size-9 place-items-center rounded-lg text-lg hover:bg-hover">
              {e}
            </button>
          ))}
        </Menu>
      ) : null}
    </div>
  );
}

export function PostMenu({
  postId,
  body,
  canEdit,
  canDelete,
  canPin,
  pinned,
  canReport,
  isAlert,
}: {
  postId: string;
  body: string;
  canEdit: boolean;
  canDelete: boolean;
  canPin: boolean;
  pinned: boolean;
  canReport: boolean;
  isAlert: boolean;
}) {
  const [modal, setModal] = useState<null | "edit" | "report">(null);
  if (!canEdit && !canDelete && !canPin && !canReport) return null;
  return (
    <>
      <Menu label="Post options" trigger={<span className="btn btn-ghost btn-icon btn-sm cursor-pointer text-muted">{<MoreHorizontal />}</span>} panelClassName="min-w-44">
        {canPin ? (
          <form action={togglePin}>
            <input type="hidden" name="postId" value={postId} />
            <button type="submit" data-close className={itemCls}>
              {pinned ? <PinOff /> : <Pin />}
              {pinned ? "Unpin" : "Pin to top"}
            </button>
          </form>
        ) : null}
        {canEdit && !isAlert ? (
          <button type="button" data-close className={itemCls} onClick={() => setModal("edit")}>
            <Pencil /> Edit
          </button>
        ) : null}
        {canDelete ? (
          <form
            action={deletePost}
            onSubmit={(e) => {
              if (!window.confirm("Delete this post? Replies go with it.")) e.preventDefault();
            }}
          >
            <input type="hidden" name="postId" value={postId} />
            <button type="submit" data-close className={cn(itemCls, "text-down [&>svg]:text-down")}>
              <Trash2 /> Delete
            </button>
          </form>
        ) : null}
        {canReport ? (
          <button type="button" data-close className={itemCls} onClick={() => setModal("report")}>
            <Flag /> Report
          </button>
        ) : null}
      </Menu>
      <Modal open={modal === "edit"} onClose={() => setModal(null)} title="Edit post">
        {modal === "edit" ? (
          <ActionForm action={editPost} refreshOnSuccess onSuccess={() => setModal(null)} className="space-y-3">
            <input type="hidden" name="postId" value={postId} />
            <Textarea name="body" rows={8} maxLength={5000} defaultValue={body} aria-label="Post" />
            <FormMessage hideSuccess />
            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn-ghost" onClick={() => setModal(null)}>
                Cancel
              </button>
              <SubmitButton>Save</SubmitButton>
            </div>
          </ActionForm>
        ) : null}
      </Modal>
      <Modal open={modal === "report"} onClose={() => setModal(null)} title="Report post">
        {modal === "report" ? <ReportForm targetType="POST" targetId={postId} onDone={() => setModal(null)} /> : null}
      </Modal>
    </>
  );
}

export function CommentForm({ postId, placeholder = "Write a reply..." }: { postId: string; placeholder?: string }) {
  return (
    <ActionForm action={addComment} resetOnSuccess refreshOnSuccess className="flex items-start gap-2">
      <input type="hidden" name="postId" value={postId} />
      <div className="min-w-0 flex-1">
        <Textarea name="body" rows={1} maxLength={2000} placeholder={placeholder} aria-label="Reply" className="min-h-10 resize-y py-2" />
        <FormMessage hideSuccess className="mt-2" />
      </div>
      <SubmitButton variant="secondary" size="md" className="shrink-0">
        Reply
      </SubmitButton>
    </ActionForm>
  );
}

export function CommentMenu({ commentId, canDelete, canReport }: { commentId: string; canDelete: boolean; canReport: boolean }) {
  const [reporting, setReporting] = useState(false);
  if (!canDelete && !canReport) return null;
  return (
    <>
      <Menu label="Reply options" trigger={<span className="grid size-7 cursor-pointer place-items-center rounded-md text-faint hover:bg-hover hover:text-ink">{<MoreHorizontal className="size-4" />}</span>} panelClassName="min-w-40">
        {canDelete ? (
          <form
            action={deleteComment}
            onSubmit={(e) => {
              if (!window.confirm("Delete this reply?")) e.preventDefault();
            }}
          >
            <input type="hidden" name="commentId" value={commentId} />
            <button type="submit" data-close className={cn(itemCls, "text-down [&>svg]:text-down")}>
              <Trash2 /> Delete
            </button>
          </form>
        ) : null}
        {canReport ? (
          <button type="button" data-close className={itemCls} onClick={() => setReporting(true)}>
            <Flag /> Report
          </button>
        ) : null}
      </Menu>
      <Modal open={reporting} onClose={() => setReporting(false)} title="Report reply">
        {reporting ? <ReportForm targetType="COMMENT" targetId={commentId} onDone={() => setReporting(false)} /> : null}
      </Modal>
    </>
  );
}

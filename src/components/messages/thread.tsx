"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { ActionForm, FormMessage, SubmitButton, Textarea } from "@/components/ui/form";
import { sendMessage } from "@/server/actions/messages";

export function MessageComposer({ conversationId }: { conversationId: string }) {
  return (
    <ActionForm action={sendMessage} resetOnSuccess refreshOnSuccess className="card p-3">
      <input type="hidden" name="conversationId" value={conversationId} />
      <div className="flex items-end gap-2">
        <Textarea
          name="body"
          rows={2}
          maxLength={4000}
          aria-label="Message"
          placeholder="Write a message"
          className="min-h-11 flex-1 resize-y"
          onKeyDown={(e) => {
            // Ctrl/Cmd + Enter sends.
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <SubmitButton pendingText="Sending..." className="shrink-0">
          <Send /> Send
        </SubmitButton>
      </div>
      <FormMessage hideSuccess className="mt-2" />
    </ActionForm>
  );
}

/** Keeps an open conversation fresh and scrolled to the newest message. */
export function ThreadWatcher({ count }: { count: number }) {
  const router = useRouter();
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [count]);
  useEffect(() => {
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 10000);
    return () => window.clearInterval(t);
  }, [router]);
  return <div ref={end} aria-hidden />;
}

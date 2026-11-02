"use client";

import { MessageSquare } from "lucide-react";
import { ModalButton } from "@/components/ui/client";
import { ActionForm, Field, FormMessage, SubmitButton, Textarea } from "@/components/ui/form";
import { startConversation } from "@/server/actions/messages";
import { cn } from "@/lib/utils";

export function MessageButton({
  toId,
  toName,
  subject,
  label = "Message",
  className,
  variant = "secondary",
  placeholder,
}: {
  toId: string;
  toName: string;
  subject?: string;
  label?: string;
  className?: string;
  variant?: "primary" | "secondary" | "ghost";
  placeholder?: string;
}) {
  return (
    <ModalButton
      variant={variant}
      className={cn(className)}
      label={
        <>
          <MessageSquare /> {label}
        </>
      }
      title={`Message ${toName}`}
    >
      <ActionForm action={startConversation} className="space-y-4">
        <input type="hidden" name="toId" value={toId} />
        {subject ? <input type="hidden" name="subject" value={subject} /> : null}
        <Field label="Your message" name="body">
          <Textarea name="body" rows={5} maxLength={4000} placeholder={placeholder ?? `Hi ${toName.split(" ")[0]}, …`} autoFocus />
        </Field>
        <p className="text-xs text-muted">Keep payments on TraderTrades. Anyone asking you to pay outside the site isn&apos;t covered by refunds.</p>
        <FormMessage />
        <div className="flex justify-end">
          <SubmitButton>Send</SubmitButton>
        </div>
      </ActionForm>
    </ModalButton>
  );
}

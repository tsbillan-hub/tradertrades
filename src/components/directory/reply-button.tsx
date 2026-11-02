"use client";

import { MessageSquareReply } from "lucide-react";
import { ModalButton } from "@/components/ui/client";
import { ActionForm, Field, FormMessage, SubmitButton, Textarea } from "@/components/ui/form";
import { replyToCompanyReview } from "@/server/actions/directory";

/** The company's public reply to one review. Closes once it's saved. */
export function CompanyReplyButton({ reviewId, companyName, reply }: { reviewId: string; companyName: string; reply: string | null }) {
  return (
    <ModalButton
      label={
        <>
          <MessageSquareReply /> {reply ? "Edit reply" : "Reply"}
        </>
      }
      title="Reply to this review"
      variant="ghost"
      className="btn-sm"
    >
      {(close) => (
        <ActionForm action={replyToCompanyReview} className="space-y-3" onSuccess={close}>
          <input type="hidden" name="reviewId" value={reviewId} />
          <Field label={`Reply as ${companyName}`} name="reply" hint="Shown publicly under the review. Leave it empty to remove your reply.">
            <Textarea name="reply" rows={4} defaultValue={reply ?? ""} maxLength={2000} />
          </Field>
          <FormMessage hideSuccess />
          <SubmitButton>Save reply</SubmitButton>
        </ActionForm>
      )}
    </ModalButton>
  );
}

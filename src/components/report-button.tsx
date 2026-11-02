"use client";

import { Flag } from "lucide-react";
import { ModalButton } from "@/components/ui/client";
import { ActionForm, Field, FormMessage, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { submitReport } from "@/server/actions/reports";
import { REPORT_REASONS } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function ReportButton({ targetType, targetId, label = "Report", className }: { targetType: string; targetId: string; label?: string; className?: string }) {
  return (
    <ModalButton
      variant="ghost"
      className={cn("btn-sm text-muted", className)}
      label={
        <>
          <Flag /> {label}
        </>
      }
      title="Report"
    >
      {(close) => <ReportForm targetType={targetType} targetId={targetId} onDone={close} />}
    </ModalButton>
  );
}

/** The report form on its own, for menus that open their own modal. */
export function ReportForm({ targetType, targetId, onDone }: { targetType: string; targetId: string; onDone: () => void }) {
  return (
    <ActionForm action={submitReport} toastOnSuccess resetOnSuccess onSuccess={onDone} className="space-y-4">
      <input type="hidden" name="targetType" value={targetType} />
      <input type="hidden" name="targetId" value={targetId} />
      <Field label="What's wrong?" name="reason">
        <Select name="reason" defaultValue="">
          <option value="" disabled>
            Pick a reason
          </option>
          {REPORT_REASONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Details" name="details" optional hint="Links, dates, or anything that helps us check.">
        <Textarea name="details" rows={4} maxLength={2000} />
      </Field>
      <FormMessage hideSuccess />
      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          Cancel
        </button>
        <SubmitButton>Send report</SubmitButton>
      </div>
    </ActionForm>
  );
}

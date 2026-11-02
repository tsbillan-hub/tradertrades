"use client";

import {
  createContext,
  startTransition,
  useActionState,
  useContext,
  useEffect,
  useId,
  useRef,
  type ComponentProps,
  type ReactNode,
} from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { initialState, type ActionState } from "@/lib/forms";
import { toast } from "@/components/ui/toaster";

type FormCtx = { state: ActionState; pending: boolean };
const FormContext = createContext<FormCtx>({ state: initialState, pending: false });

export function useFormState() {
  return useContext(FormContext);
}

type SubmitEvt = Parameters<NonNullable<ComponentProps<"form">["onSubmit"]>>[0];

type ActionFormProps = Omit<ComponentProps<"form">, "action"> & {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  /** Show the success message as a toast instead of inline. */
  toastOnSuccess?: boolean;
  /** Clear the form after a successful submit. */
  resetOnSuccess?: boolean;
  /** Where to go after success (client side). Server actions can also redirect themselves. */
  successHref?: string;
  /** Re-run server components after success. */
  refreshOnSuccess?: boolean;
  onSuccess?: (state: ActionState) => void;
  children: ReactNode;
};

export function ActionForm({
  action,
  toastOnSuccess,
  resetOnSuccess,
  successHref,
  refreshOnSuccess,
  onSuccess,
  children,
  onSubmit,
  ...rest
}: ActionFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const lastAt = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!state.at || state.at === lastAt.current) return;
    lastAt.current = state.at;
    if (state.ok) {
      if (toastOnSuccess && state.message) toast(state.message, "success");
      if (resetOnSuccess) formRef.current?.reset();
      onSuccess?.(state);
      if (successHref) router.push(successHref);
      else if (refreshOnSuccess) router.refresh();
    } else if (state.error && toastOnSuccess) {
      toast(state.error, "error");
    }
  }, [state, toastOnSuccess, resetOnSuccess, successHref, refreshOnSuccess, onSuccess, router]);

  // React clears a form after its action runs, which also throws away a picked option or a ticked box when the
  // server sends back an error. Running the action from the submit handler instead keeps what the person entered,
  // and React still shows the pending state. Without JavaScript the form posts through `action` as usual.
  const submit = (e: SubmitEvt) => {
    onSubmit?.(e);
    if (e.defaultPrevented) return;
    e.preventDefault();
    const form = e.currentTarget;
    // The clicked button's name and value go along, like a normal submit (for forms with two choices).
    const by = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | HTMLInputElement | null;
    const formData = new FormData(form, by && by.form === form ? by : null);
    startTransition(() => formAction(formData));
  };

  return (
    <FormContext.Provider value={{ state, pending }}>
      <form ref={formRef} action={formAction} onSubmit={submit} noValidate {...rest}>
        {children}
      </form>
    </FormContext.Provider>
  );
}

/** Shows the form-level error or success message. */
export function FormMessage({ className, hideSuccess }: { className?: string; hideSuccess?: boolean }) {
  const { state } = useFormState();
  if (state.error) {
    return (
      <div role="alert" className={cn("flex items-start gap-2 rounded-lg border border-transparent bg-down-soft px-3 py-2.5 text-sm text-down", className)}>
        <CircleAlert className="mt-0.5 size-4 shrink-0" />
        <span>{state.error}</span>
      </div>
    );
  }
  if (state.ok && state.message && !hideSuccess) {
    return (
      <div role="status" className={cn("flex items-start gap-2 rounded-lg bg-up-soft px-3 py-2.5 text-sm text-up", className)}>
        <CircleCheck className="mt-0.5 size-4 shrink-0" />
        <span>{state.message}</span>
      </div>
    );
  }
  return null;
}

type FieldProps = {
  label?: ReactNode;
  name: string;
  hint?: ReactNode;
  className?: string;
  optional?: boolean;
  children: ReactNode;
  id?: string;
};

const FieldIdContext = createContext<{ id?: string; name?: string; describedBy?: string }>({});

export function Field({ label, name, hint, className, optional, children, id }: FieldProps) {
  const autoId = useId();
  const fieldId = id ?? `f-${name}-${autoId}`;
  const { state } = useFormState();
  const err = state.fieldErrors?.[name]?.[0];
  return (
    <FieldIdContext.Provider value={{ id: fieldId, name, describedBy: err ? `${fieldId}-err` : hint ? `${fieldId}-hint` : undefined }}>
      <div className={className}>
        {label ? (
          <label htmlFor={fieldId} className="label">
            {label}
            {optional ? <span className="ml-1.5 font-normal text-faint">optional</span> : null}
          </label>
        ) : null}
        {children}
        {err ? (
          <p id={`${fieldId}-err`} className="field-error">
            {err}
          </p>
        ) : hint ? (
          <p id={`${fieldId}-hint`} className="hint">
            {hint}
          </p>
        ) : null}
      </div>
    </FieldIdContext.Provider>
  );
}

function useFieldProps(name: string | undefined, defaultValue: unknown) {
  const { state } = useFormState();
  const ctx = useContext(FieldIdContext);
  const key = name ?? ctx.name;
  const submitted = key ? state.values?.[key] : undefined;
  const invalid = key ? Boolean(state.fieldErrors?.[key]?.length) : false;
  return {
    id: ctx.id,
    name: key,
    "aria-invalid": invalid || undefined,
    "aria-describedby": ctx.describedBy,
    defaultValue: submitted !== undefined ? submitted : (defaultValue as string | number | readonly string[] | undefined),
  };
}

export function Input({ className, name, defaultValue, ...rest }: ComponentProps<"input">) {
  const p = useFieldProps(name, defaultValue);
  const isSecret = rest.type === "password";
  return <input className={cn("input", className)} {...p} defaultValue={isSecret ? undefined : p.defaultValue} {...rest} />;
}

export function Textarea({ className, name, defaultValue, ...rest }: ComponentProps<"textarea">) {
  const p = useFieldProps(name, defaultValue);
  return <textarea className={cn("input", className)} {...p} {...rest} />;
}

export function Select({ className, name, defaultValue, children, ...rest }: ComponentProps<"select">) {
  const p = useFieldProps(name, defaultValue);
  return (
    <select className={cn("input", className)} {...p} {...rest}>
      {children}
    </select>
  );
}

export function FieldError({ name, className }: { name: string; className?: string }) {
  const { state } = useFormState();
  const err = state.fieldErrors?.[name]?.[0];
  if (!err) return null;
  return <p className={cn("field-error", className)}>{err}</p>;
}

type SubmitProps = ComponentProps<"button"> & {
  variant?: "primary" | "secondary" | "accent" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  pendingText?: string;
};

export function SubmitButton({ variant = "primary", size = "md", className, children, pendingText, ...rest }: SubmitProps) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || rest.disabled}
      className={cn("btn", `btn-${variant}`, size === "sm" && "btn-sm", size === "lg" && "btn-lg", className)}
      {...rest}
    >
      {pending ? <LoaderCircle className="animate-spin" /> : null}
      {pending && pendingText ? pendingText : children}
    </button>
  );
}

/** A small form that runs a server action from a single button (follow, save, delete...). */
export function ActionButton({
  action,
  children,
  fields,
  confirm,
  className,
  variant = "secondary",
  size = "sm",
  title,
}: {
  action: (formData: FormData) => void | Promise<void>;
  children: ReactNode;
  fields?: Record<string, string>;
  confirm?: string;
  className?: string;
  variant?: SubmitProps["variant"];
  size?: SubmitProps["size"];
  title?: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
      className="contents"
    >
      {fields ? Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />) : null}
      <SubmitButton variant={variant} size={size} className={className} title={title}>
        {children}
      </SubmitButton>
    </form>
  );
}

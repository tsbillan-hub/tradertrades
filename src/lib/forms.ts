import { z } from "zod";

export type ActionState = {
  ok?: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  values?: Record<string, string>;
  /** Changes on every result, so client effects (toasts, resets) fire even when the text repeats. */
  at?: number;
  data?: Record<string, unknown>;
};

export const initialState: ActionState = {};

const SECRET_FIELDS = new Set(["password", "newPassword", "currentPassword", "confirmPassword", "code", "token"]);

export function formValues(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (typeof v !== "string" || SECRET_FIELDS.has(k) || k.startsWith("$ACTION")) continue;
    out[k] = k in out ? `${out[k]},${v}` : v;
  }
  return out;
}

export function invalid(error: z.ZodError, formData?: FormData, message = "Check the highlighted fields."): ActionState {
  const flat = z.flattenError(error);
  return {
    ok: false,
    error: flat.formErrors[0] ?? message,
    fieldErrors: flat.fieldErrors as Record<string, string[] | undefined>,
    values: formData ? formValues(formData) : undefined,
    at: Date.now(),
  };
}

export function fail(error: string, formData?: FormData, fieldErrors?: Record<string, string[]>): ActionState {
  return { ok: false, error, fieldErrors, values: formData ? formValues(formData) : undefined, at: Date.now() };
}

export function success(message?: string, data?: Record<string, unknown>): ActionState {
  return { ok: true, message, data, at: Date.now() };
}

/** Converts FormData into a plain object. Repeated keys (checkbox groups) become arrays. */
export function formObject(formData: FormData, arrays: string[] = []) {
  const obj: Record<string, unknown> = {};
  for (const key of new Set(formData.keys())) {
    if (key.startsWith("$ACTION")) continue;
    const all = formData.getAll(key).filter((v): v is string => typeof v === "string");
    obj[key] = arrays.includes(key) ? all : all[all.length - 1];
  }
  for (const a of arrays) if (!(a in obj)) obj[a] = [];
  return obj;
}

// Shared field rules
export const usernameRule = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "At least 3 characters")
  .max(24, "24 characters at most")
  .regex(/^[a-z0-9_]+$/, "Use letters, numbers and underscores only")
  .refine((v) => !RESERVED_USERNAMES.has(v), "That username is taken");

export const passwordRule = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(200, "That's too long")
  .refine((v) => !/^(.)\1+$/.test(v), "Pick something less simple");

export const emailRule = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email"));

export const optionalUrl = z
  .string()
  .trim()
  .max(500)
  // Missing (a field that isn't on screen) and empty both mean "no link".
  .optional()
  .transform((v) => (v ? v : undefined))
  .pipe(z.url({ protocol: /^https?$/, error: "Enter a full link starting with https://" }).optional());

export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `${max} characters at most`)
    .transform((v) => (v === "" ? undefined : v))
    .optional();

// An unticked box isn't sent at all, so the key has to be optional (Zod 4 rejects a missing key otherwise).
export const checkbox = z
  .union([z.literal("on"), z.literal("true"), z.literal("1"), z.literal("")])
  .optional()
  .transform((v) => v === "on" || v === "true" || v === "1");

export const dollars = (opts: { min?: number; max?: number } = {}) =>
  z
    .string()
    .trim()
    .transform((v) => v.replace(/[$,\s]/g, ""))
    .pipe(z.string().regex(/^\d+(\.\d{1,2})?$/, "Enter an amount like 49 or 49.99"))
    .transform((v) => Math.round(Number(v) * 100))
    .refine((c) => c >= (opts.min ?? 0), `At least $${((opts.min ?? 0) / 100).toFixed(0)}`)
    .refine((c) => c <= (opts.max ?? 10_000_000), `At most $${((opts.max ?? 10_000_000) / 100).toLocaleString()}`);

export const RESERVED_USERNAMES = new Set([
  "admin", "administrator", "root", "support", "help", "tradertrades", "trader", "official", "staff", "team",
  "api", "app", "www", "mail", "login", "logout", "signup", "settings", "creator", "creators", "business",
  "marketplace", "directory", "search", "library", "messages", "notifications", "checkout", "u", "p", "r",
  "go", "company", "jobs", "about", "rules", "fees", "terms", "privacy", "security", "moderator", "mod",
  "null", "undefined", "me", "you", "everyone", "billing", "payouts", "stripe", "verify", "verified",
]);

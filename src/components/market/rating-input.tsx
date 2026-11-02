"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { useFormState } from "@/components/ui/form";
import { cn } from "@/lib/utils";

const WORDS = ["", "Poor", "Not great", "Okay", "Good", "Excellent"];

/** Five tappable stars that fill a hidden "rating" input. */
export function RatingInput({ name = "rating", defaultValue = 0 }: { name?: string; defaultValue?: number }) {
  const { state } = useFormState();
  const submitted = Number(state.values?.[name] ?? 0);
  const [value, setValue] = useState(submitted || defaultValue);
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  const err = state.fieldErrors?.[name]?.[0];
  return (
    <div>
      <input type="hidden" name={name} value={value || ""} />
      <div className="flex items-center gap-3">
        <div className="flex" role="radiogroup" aria-label="Rating" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((i) => (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={value === i}
              aria-label={`${i} star${i > 1 ? "s" : ""}`}
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(0)}
              onClick={() => setValue(i)}
              className="p-0.5"
            >
              <Star className={cn("size-7 transition-colors", i <= shown ? "text-ink" : "text-line-strong")} fill="currentColor" strokeWidth={0} />
            </button>
          ))}
        </div>
        <span className="text-sm font-medium text-muted">{WORDS[shown]}</span>
      </div>
      {err ? <p className="field-error">{err}</p> : null}
    </div>
  );
}

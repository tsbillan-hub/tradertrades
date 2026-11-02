import { ArrowDown, ArrowUp } from "lucide-react";
import { ActionButton } from "@/components/ui/form";

/** Up and down arrows for reordering channels, modules, lessons and files. */
export function MoveButtons({ action, field, id, first, last }: { action: (fd: FormData) => Promise<void>; field: string; id: string; first: boolean; last: boolean }) {
  return (
    <>
      {!first ? (
        <ActionButton action={action} fields={{ [field]: id, dir: "up" }} variant="ghost" className="btn-icon" title="Move up">
          <ArrowUp />
        </ActionButton>
      ) : null}
      {!last ? (
        <ActionButton action={action} fields={{ [field]: id, dir: "down" }} variant="ghost" className="btn-icon" title="Move down">
          <ArrowDown />
        </ActionButton>
      ) : null}
    </>
  );
}

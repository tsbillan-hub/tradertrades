import { cn, initials, monogramColor } from "@/lib/utils";

type AvatarProps = {
  src?: string | null;
  name: string;
  size?: number;
  className?: string;
  square?: boolean;
};

export function Avatar({ src, name, size = 40, className, square }: AvatarProps) {
  const radius = square ? Math.max(6, Math.round(size * 0.22)) : 9999;
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        className={cn("shrink-0 bg-sunk object-cover", className)}
        style={{ width: size, height: size, borderRadius: radius }}
      />
    );
  }
  const { bg, fg } = monogramColor(name);
  return (
    <span
      aria-hidden
      className={cn("inline-grid shrink-0 select-none place-items-center font-display font-extrabold", className)}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: bg,
        color: fg,
        fontSize: Math.max(10, Math.round(size * 0.38)),
        letterSpacing: "-0.02em",
        boxShadow: bg === "#F2EADB" ? "inset 0 0 0 1px var(--line-strong)" : undefined,
      }}
    >
      {initials(name)}
    </span>
  );
}

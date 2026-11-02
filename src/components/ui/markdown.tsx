import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/** Renders user markdown safely: no raw HTML, links open in a new tab. */
export function Markdown({ children, className }: { children: string | null | undefined; className?: string }) {
  if (!children) return null;
  return (
    <div className={cn("prose-tt", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a: ({ href, children: c }) => {
            const safe = href && /^(https?:|mailto:|\/)/i.test(href) ? href : undefined;
            const external = safe?.startsWith("http");
            return (
              <a href={safe} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer nofollow ugc" : undefined}>
                {c}
              </a>
            );
          },
          img: ({ src, alt }) =>
            typeof src === "string" && /^(https:|\/)/.test(src) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={src} alt={alt ?? ""} loading="lazy" />
            ) : null,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

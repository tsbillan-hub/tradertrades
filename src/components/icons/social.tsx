import type { SocialPlatform } from "@/generated/prisma/enums";
import { Globe } from "lucide-react";

type P = { className?: string };

export function YouTubeIcon({ className }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M23 7.2a3 3 0 0 0-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 0 0 1 7.2 31 31 0 0 0 .5 12a31 31 0 0 0 .5 4.8 3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .5-4.8 31 31 0 0 0-.5-4.8ZM9.8 15.1V8.9l5.4 3.1-5.4 3.1Z" />
    </svg>
  );
}
export function InstagramIcon({ className }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
export function TikTokIcon({ className }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M16.6 3c.4 2.2 1.8 3.7 4 3.9v3.2a7.4 7.4 0 0 1-4-1.2v6.2a6 6 0 1 1-6-6c.3 0 .7 0 1 .1v3.3a2.8 2.8 0 1 0 1.8 2.6V3h3.2Z" />
    </svg>
  );
}
export function XIcon({ className }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M17.8 3h3.2l-7 8 8.2 10h-6.4l-5-6.2L5.1 21H1.9l7.5-8.6L1.5 3H8l4.5 5.7L17.8 3Zm-1.1 16.2h1.8L7.4 4.7H5.5l11.2 14.5Z" />
    </svg>
  );
}
export function DiscordIcon({ className }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M19.6 5.3A17 17 0 0 0 15.4 4l-.5 1.1a15.6 15.6 0 0 0-5.8 0L8.6 4a17 17 0 0 0-4.2 1.3C1.7 9.3 1 13.2 1.3 17a17 17 0 0 0 5.2 2.6l1.1-1.8a11 11 0 0 1-1.8-.9l.4-.3a12.2 12.2 0 0 0 11.6 0l.4.3c-.6.4-1.2.7-1.8.9l1.1 1.8a17 17 0 0 0 5.2-2.6c.4-4.4-.7-8.3-3.1-11.7ZM8.7 14.7c-1 0-1.9-1-1.9-2.1s.8-2.1 1.9-2.1 1.9 1 1.9 2.1-.8 2.1-1.9 2.1Zm6.6 0c-1 0-1.9-1-1.9-2.1s.8-2.1 1.9-2.1 1.9 1 1.9 2.1-.8 2.1-1.9 2.1Z" />
    </svg>
  );
}
export function TwitchIcon({ className }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M4.3 2 3 5.4v14h4.7V22h2.6l2.6-2.6h3.9L22 14.2V2H4.3Zm15.9 11.3-3 3h-4.7l-2.6 2.6v-2.6H6V3.8h14.2v9.5ZM17.4 7.2v5.2h-1.8V7.2h1.8Zm-4.8 0v5.2h-1.8V7.2h1.8Z" />
    </svg>
  );
}
export function TelegramIcon({ className }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M21.9 4.3 18.6 20c-.2 1.1-.9 1.4-1.8.9l-5-3.7-2.4 2.3c-.3.3-.5.5-1 .5l.4-5.1 9.3-8.4c.4-.4-.1-.6-.6-.2L6 13.5l-5-1.6c-1.1-.3-1.1-1.1.2-1.6L20.5 2.9c.9-.3 1.7.2 1.4 1.4Z" />
    </svg>
  );
}

export function SocialIcon({ platform, className }: { platform: SocialPlatform; className?: string }) {
  switch (platform) {
    case "YOUTUBE":
      return <YouTubeIcon className={className} />;
    case "INSTAGRAM":
      return <InstagramIcon className={className} />;
    case "TIKTOK":
      return <TikTokIcon className={className} />;
    case "X":
      return <XIcon className={className} />;
    case "DISCORD":
      return <DiscordIcon className={className} />;
    case "TWITCH":
      return <TwitchIcon className={className} />;
    case "TELEGRAM":
      return <TelegramIcon className={className} />;
    default:
      return <Globe className={className} />;
  }
}

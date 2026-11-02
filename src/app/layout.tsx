import type { Metadata, Viewport } from "next";
import { Archivo, IBM_Plex_Mono, Schibsted_Grotesk } from "next/font/google";
import { cookies } from "next/headers";
import { Toaster } from "@/components/ui/toaster";
import { UploadConfig } from "@/components/ui/uploader";
import { features } from "@/lib/env";
import { getViewer } from "@/server/dal";
import { SITE } from "@/lib/constants";
import "./globals.css";

const heading = Archivo({ subsets: ["latin"], variable: "--font-heading", display: "swap", axes: ["wdth"] });
const body = Schibsted_Grotesk({ subsets: ["latin"], variable: "--font-body", display: "swap" });
const code = IBM_Plex_Mono({ subsets: ["latin"], variable: "--font-code", weight: ["400", "500", "600"], display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  title: { default: `${SITE.name}: ${SITE.tagline}`, template: `%s · ${SITE.name}` },
  description: SITE.description,
  openGraph: { siteName: SITE.name, type: "website", images: ["/brand/pfp-400.png"] },
  twitter: { card: "summary" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F6F1E7" },
    { media: "(prefers-color-scheme: dark)", color: "#12100C" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = (await cookies()).get("tt_theme")?.value;
  const dataTheme = theme === "light" || theme === "dark" ? theme : undefined;
  const viewer = await getViewer();
  return (
    <html lang="en" data-theme={dataTheme} className={`${heading.variable} ${body.variable} ${code.variable}`} suppressHydrationWarning>
      <body className="min-h-dvh">
        <UploadConfig blob={features.blob} userId={viewer?.id ?? null}>
          {children}
        </UploadConfig>
        <Toaster />
      </body>
    </html>
  );
}

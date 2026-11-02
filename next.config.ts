import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Classic dynamic rendering: pages read the session cookie and the database
  // on every request. Cache Components stays off on purpose.
  poweredByHeader: false,
  serverExternalPackages: ["pg"],
  experimental: {
    serverActions: {
      bodySizeLimit: "6mb",
    },
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
      { protocol: "https", hostname: "i.ytimg.com" },
      { protocol: "https", hostname: "i.vimeocdn.com" },
    ],
  },
  async rewrites() {
    return [
      { source: "/@:username", destination: "/u/:username" },
      { source: "/@:username/:slug", destination: "/u/:username/:slug" },
      { source: "/@:username/:slug/:path*", destination: "/u/:username/:slug/:path*" },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(self), geolocation=(), payment=(self)",
          },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

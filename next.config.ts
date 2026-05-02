import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Raise the body size limit for API routes to 100 MB so large audio
    // files can be forwarded to the Gemini upload API without a 413.
    serverActions: {
      bodySizeLimit: "100mb",
    },
  },
};

export default nextConfig;

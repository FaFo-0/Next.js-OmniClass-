import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Resolve old production links before Clerk handles its domain-bound session.
  async redirects() {
    return [{
      source: "/:path*",
      has: [{ type: "host", value: "next-js-omni-class.vercel.app" }],
      destination: "https://omnicaenglish.com/:path*",
      permanent: true,
    }];
  },
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;

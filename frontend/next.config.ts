import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The root private-assets directory is outside frontend's tracing root.
  // Also exclude any nested private-assets directories without escaping that root.
  outputFileTracingExcludes: { "/*": ["**/private-assets/**/*"] },
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
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

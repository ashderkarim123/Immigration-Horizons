import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root explicitly so Turbopack doesn't try to infer it
  // from a lockfile in a parent directory outside this repo.
  turbopack: {
    root: __dirname,
  },
  // mongoose relies on Node APIs/optional native drivers that don't bundle
  // cleanly for the server runtime — keep it as a real external require.
  serverExternalPackages: ["mongoose"],
};

export default nextConfig;

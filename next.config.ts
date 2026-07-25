import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The legacy Express app at the repo root has its own lockfile, so Turbopack
  // has to be told that this directory — not the parent — is the workspace root.
  turbopack: {
    root: __dirname,
  },
  // mongoose relies on Node APIs/optional native drivers that don't bundle
  // cleanly for the server runtime — keep it as a real external require.
  serverExternalPackages: ["mongoose"],
};

export default nextConfig;

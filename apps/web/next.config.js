/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Workspace packages are plain TS, not pre-built — let Next transpile them.
  transpilePackages: ["@db-optima/database", "@db-optima/types"],
  // Required for sql.js WASM binary
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
      };
    }
    // Allow WASM files
    config.experiments = { ...config.experiments, asyncWebAssembly: true };
    return config;
  },
  // Required headers for WASM + SharedArrayBuffer (needed by sql.js)
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;

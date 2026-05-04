import type { NextConfig } from "next";
import path from "node:path";

// Vercel deploys this Next.js app from `dashboard/` as the project Root
// Directory. Our API route handlers under `app/api/*` need to import shared
// backend modules (services / models / config / utils) that live at the repo
// root in `src/`, ONE LEVEL ABOVE the Next.js root.
//
// 1) `outputFileTracingRoot` widens Vercel's file-tracing to the repo root so
//    the bundled function image actually includes `src/`.
// 2) `outputFileTracingIncludes` is a belt-and-braces glob that guarantees
//    every file under `src/` is shipped (tracing alone occasionally misses
//    transitive `require(...)` targets resolved at runtime).
// 3) The webpack `resolve.alias` exposes the shared code as `@server/*` so
//    route handlers can `require('@server/services/authService')` instead of
//    relying on relative paths that escape the Next.js root (which webpack
//    refuses to resolve by default).
const repoRoot = path.resolve(__dirname, "..");
const sharedSrc = path.join(repoRoot, "src");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: repoRoot,
  outputFileTracingIncludes: {
    "/api/**/*": ["../src/**/*.js"],
  },
  // CommonJS deps loaded at runtime from node_modules in the function image.
  serverExternalPackages: [
    "bcryptjs",
    "jsonwebtoken",
    "@neondatabase/serverless",
    "dotenv",
  ],
  webpack: (config) => {
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "@server": sharedSrc,
    };
    return config;
  },
};

export default nextConfig;

import type { NextConfig } from "next";
import path from "node:path";

// Vercel deploys this Next.js app from `dashboard/` as the project Root
// Directory. Our API route handlers under `app/api/*` import shared backend
// modules (services / models / config / utils) from `../src/`, which lives
// OUTSIDE the Next.js root. Without help, Next.js's file-tracing skips files
// outside `dashboard/`, breaking the serverless function bundle on Vercel.
//
// `outputFileTracingRoot` widens tracing to the repo root (one level up).
// `outputFileTracingIncludes` is a belt-and-braces glob to guarantee every
// file under `src/` reachable from a route handler is bundled.
const repoRoot = path.resolve(__dirname, "..");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: repoRoot,
  outputFileTracingIncludes: {
    "/api/**/*": ["../src/**/*.js"],
  },
  // CommonJS native-ish deps that should not be processed by the bundler;
  // they're loaded at runtime from node_modules in the function image.
  serverExternalPackages: [
    "bcryptjs",
    "jsonwebtoken",
    "@neondatabase/serverless",
    "dotenv",
  ],
};

export default nextConfig;

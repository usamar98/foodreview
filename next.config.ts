import type { NextConfig } from "next";
const vercel = process.env.SAVOUR_RUNTIME === "vercel";

const nextConfig: NextConfig = {
  // Sites uses vite.config.ts. This configuration is the standard Next.js target.
  env: { SAVOUR_RUNTIME: vercel ? "vercel" : "sites" },
  typescript: { tsconfigPath: vercel ? "tsconfig.vercel.json" : "tsconfig.json" },
};

export default nextConfig;

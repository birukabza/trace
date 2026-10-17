import type { NextConfig } from "next";

const config: NextConfig = {
  distDir: process.env.NODE_ENV === "production" ? ".next-production" : ".next",
  serverExternalPackages: ["node:sqlite"],
  poweredByHeader: false,
  webpack(configuration, { dev }) {
    if (dev) configuration.watchOptions = { ...configuration.watchOptions, poll: 1500, aggregateTimeout: 300 };
    return configuration;
  },
};

export default config;

import type { NextConfig } from "next";

const config: NextConfig = {
  serverExternalPackages: ["node:sqlite"],
  poweredByHeader: false,
  webpack(configuration, { dev }) {
    if (dev) configuration.watchOptions = { ...configuration.watchOptions, poll: 1500, aggregateTimeout: 300 };
    return configuration;
  },
};

export default config;

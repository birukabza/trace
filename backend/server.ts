import nextEnv from "@next/env";
import { createHttpServer } from "./transport";

// Match Next.js locally, including CLI-managed Stripe Projects credentials.
// Hosted services use native environment settings, never copied secret files.
if (process.env.NODE_ENV !== "production") nextEnv.loadEnvConfig(process.cwd());
const { backendHandler } = await import("./runtime");
const handler = backendHandler();
const port = Number(process.env.PORT || 4000);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("PORT must be a valid TCP port.");

const server = createHttpServer(handler);
server.listen(port, "0.0.0.0", () => console.log(`Trace backend listening on port ${port}.`));

// Long-running jobs deliberately outlive individual HTTP requests. Railway
// should use one always-on replica and a /data volume, never request autosleep.
for (const signal of ["SIGTERM", "SIGINT"] as const) process.once(signal, () => {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 10_000).unref();
});

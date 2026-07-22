import { buildApp } from "./app.js";

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 3000);

const app = buildApp({ logger: true });

try {
  await app.listen({ host: HOST, port: PORT });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

// Graceful shutdown for container orchestration.
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    await app.close();
    process.exit(0);
  });
}

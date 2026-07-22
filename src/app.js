import Fastify from "fastify";
import { validateErn } from "./ddex.js";

// ~50MB — DDEX NewReleaseMessage documents (esp. multi-track bundles with rich
// metadata) can be large; asset binaries are referenced by filename, not inlined.
export const MAX_BODY_BYTES = 50 * 1024 * 1024;

const XML_CONTENT_TYPE = /^(application|text)\/xml\b/i;

export function buildApp(opts = {}) {
  const app = Fastify({
    bodyLimit: MAX_BODY_BYTES,
    logger: opts.logger ?? false,
  });

  // Accept raw XML bodies as strings. `parseAs: "string"` keeps the exact bytes
  // (no JSON coercion) and lets Fastify enforce the body limit for us. Empty
  // bodies are tolerated so /validate can return a structured well_formed:false
  // response instead of a transport-level 400.
  app.addContentTypeParser(
    ["application/xml", "text/xml"],
    { parseAs: "string" },
    (_req, body, done) => done(null, body),
  );

  app.get("/healthz", async () => ({ status: "ok" }));

  app.post("/validate", async (request, reply) => {
    const contentType = request.headers["content-type"] || "";
    if (!XML_CONTENT_TYPE.test(contentType)) {
      return reply.code(415).send({
        error: "Unsupported Media Type: send application/xml or text/xml",
      });
    }

    const xml = typeof request.body === "string" ? request.body : "";
    return reply.code(200).send(validateErn(xml));
  });

  return app;
}

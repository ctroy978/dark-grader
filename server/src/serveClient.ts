import fastifyStatic from "@fastify/static";
import type { FastifyInstance } from "fastify";
import path from "node:path";
import { resolveClientDist } from "./paths.js";

/**
 * Serve the Vite production build from this process so nginx can proxy
 * everything to Node, or so `npm start` works without a second static server.
 */
export async function registerClientStatic(
  app: FastifyInstance,
): Promise<string | null> {
  const root = resolveClientDist();
  if (!root) return null;

  await app.register(fastifyStatic, {
    root,
    prefix: "/",
    wildcard: false,
    decorateReply: true,
    setHeaders(reply, filePath) {
      const rel = path.relative(root, filePath).split(path.sep).join("/");
      if (rel === "index.html") {
        reply.header("Cache-Control", "no-cache");
      } else if (rel.startsWith("assets/")) {
        reply.header("Cache-Control", "public, max-age=31536000, immutable");
      } else {
        reply.header("Cache-Control", "public, max-age=86400");
      }
    },
  });

  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith("/api") || req.url.startsWith("/socket.io")) {
      reply.status(404).send({ error: "Not found" });
      return;
    }
    return reply.sendFile("index.html");
  });

  return root;
}

import { Hono } from "hono";
import type { Env } from "./env";
import { webhookRoutes } from "./webhook/routes";

export type { Env };

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) => c.text("ok"));

// Placeholder until the flow is wired (#10): just log what arrives.
app.route(
  "/webhook",
  webhookRoutes(async (message) => {
    console.log("webhook: message", JSON.stringify(message));
  }),
);

export default app;

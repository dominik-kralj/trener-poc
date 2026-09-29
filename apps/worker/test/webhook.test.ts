import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../src/env";
import type { IncomingMessage } from "../src/webhook/payload";
import { webhookRoutes } from "../src/webhook/routes";
import { sign } from "../src/webhook/signature";
import { resetDb, startTestDb } from "./d1";
import { envelope, statusPayload, textPayload } from "./whatsapp-fixtures";

const SECRET = "test-app-secret";

let db: D1Database;
let dispose: () => Promise<void>;

beforeAll(async () => {
  ({ db, dispose } = await startTestDb());
}, 30_000);
afterAll(() => dispose());
beforeEach(() => resetDb(db));

function setup() {
  const received: IncomingMessage[] = [];
  const app = webhookRoutes(async (message) => {
    received.push(message);
  });
  const env = { DB: db, WHATSAPP_APP_SECRET: SECRET, WHATSAPP_VERIFY_TOKEN: "verify-me" } as Env;

  /** Sends a request and waits for everything handed to `waitUntil`. */
  async function request(path: string, init?: RequestInit) {
    const pending: Promise<unknown>[] = [];
    const ctx = {
      waitUntil: (p: Promise<unknown>) => pending.push(p),
      passThroughOnException: () => {},
      props: {},
    } as unknown as ExecutionContext;
    const res = await app.request(path, init, env, ctx);
    await Promise.all(pending);
    return res;
  }

  async function post(payload: unknown, signature?: string) {
    const body = JSON.stringify(payload);
    return request("/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hub-Signature-256": signature ?? (await sign(SECRET, body)),
      },
      body,
    });
  }

  return { received, request, post };
}

describe("GET /webhook (handshake)", () => {
  it("echoes the challenge for the right verify token", async () => {
    const { request } = setup();
    const res = await request("/?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=12345");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("12345");
  });

  it("rejects a wrong verify token", async () => {
    const { request } = setup();
    const res = await request("/?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=12345");
    expect(res.status).toBe(403);
  });
});

describe("POST /webhook", () => {
  it("accepts a validly signed message and processes it", async () => {
    const { post, received } = setup();
    const res = await post(textPayload("385910000001", "wamid.1", "Bok"));
    expect(res.status).toBe(200);
    expect(received).toEqual([
      { from: "+385910000001", messageId: "wamid.1", kind: "text", text: "Bok" },
    ]);
  });

  it("rejects an invalid signature without processing", async () => {
    const { post, received } = setup();
    const res = await post(textPayload("385910000001", "wamid.1", "Bok"), await sign("wrong-secret", "{}"));
    expect(res.status).toBe(401);
    expect(received).toEqual([]);
  });

  it("rejects a missing or malformed signature", async () => {
    const { post, received } = setup();
    expect((await post(textPayload("385910000001", "wamid.1", "Bok"), "sha256=zz")).status).toBe(401);
    expect(received).toEqual([]);
  });

  it("processes a message retried by Meta only once", async () => {
    const { post, received } = setup();
    const payload = textPayload("385910000001", "wamid.1", "Bok");
    await post(payload);
    const retry = await post(payload);
    expect(retry.status).toBe(200);
    expect(received).toHaveLength(1);
  });

  it("ignores status updates quietly", async () => {
    const { post, received } = setup();
    const res = await post(statusPayload());
    expect(res.status).toBe(200);
    expect(received).toEqual([]);
  });

  it("answers 200 to a signed but unknown payload so Meta doesn't retry", async () => {
    const { post, received } = setup();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await post({ object: "page" });
    expect(res.status).toBe(200);
    expect(received).toEqual([]);
    error.mockRestore();
  });

  it("keeps going when one message's handler throws", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const seen: string[] = [];
    const app = webhookRoutes(async (m) => {
      seen.push(m.messageId);
      if (m.messageId === "wamid.bad") throw new Error("boom");
    });
    const env = { DB: db, WHATSAPP_APP_SECRET: SECRET } as Env;
    const text = (id: string) => ({ from: "385910000001", id, timestamp: "1790000000", type: "text", text: { body: id } });
    const payload = envelope({ messages: [text("wamid.bad"), text("wamid.ok")] });
    const body = JSON.stringify(payload);
    const pending: Promise<unknown>[] = [];
    const ctx = { waitUntil: (p: Promise<unknown>) => pending.push(p) } as unknown as ExecutionContext;
    await app.request("/", { method: "POST", headers: { "X-Hub-Signature-256": await sign(SECRET, body) }, body }, env, ctx);
    await Promise.all(pending);
    expect(seen).toEqual(["wamid.bad", "wamid.ok"]);
    error.mockRestore();
  });
});

import { describe, expect, it, vi } from "vitest";
import { createWhatsApp } from "../src/whatsapp/client";

function setup(response: { status: number; body: unknown } = { status: 200, body: { messages: [{ id: "wamid.OUT" }] } }) {
  const calls: { url: string; init: RequestInit; body: Record<string, unknown> }[] = [];
  const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init!, body: JSON.parse(String(init!.body)) });
    return new Response(JSON.stringify(response.body), { status: response.status });
  }) as unknown as typeof globalThis.fetch;
  const wa = createWhatsApp({ token: "TOKEN", phoneNumberId: "PHONE_ID", fetch });
  return { wa, calls };
}

const choices = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `pick:s-${i}`, title: `Slot ${i}` }));

describe("whatsapp client", () => {
  it("sends text to the Graph API with auth and a number without +", async () => {
    const { wa, calls } = setup();
    const result = await wa.sendText("+385910000001", "Bok");
    expect(result).toEqual({ ok: true, messageId: "wamid.OUT" });
    expect(calls[0]!.url).toBe("https://graph.facebook.com/v23.0/PHONE_ID/messages");
    expect(new Headers(calls[0]!.init.headers).get("Authorization")).toBe("Bearer TOKEN");
    expect(calls[0]!.body).toEqual({
      messaging_product: "whatsapp",
      to: "385910000001",
      type: "text",
      text: { body: "Bok" },
    });
  });

  it("sends reply buttons", async () => {
    const { wa, calls } = setup();
    await wa.sendButtons("+385910000000", "Potvrdi?", [
      { id: "confirm:h-1", title: "Potvrdi" },
      { id: "reject:h-1", title: "Odbij" },
    ]);
    expect(calls[0]!.body.interactive).toEqual({
      type: "button",
      body: { text: "Potvrdi?" },
      action: {
        buttons: [
          { type: "reply", reply: { id: "confirm:h-1", title: "Potvrdi" } },
          { type: "reply", reply: { id: "reject:h-1", title: "Odbij" } },
        ],
      },
    });
  });

  it("refuses more than 3 buttons or a title over 20 chars", () => {
    const { wa, calls } = setup();
    expect(() => wa.sendButtons("+385910000000", "x", choices(4))).toThrow(/buttons/);
    expect(() => wa.sendButtons("+385910000000", "x", [{ id: "a", title: "x".repeat(21) }])).toThrow(/title/);
    expect(calls).toHaveLength(0);
  });

  it("sends a list message", async () => {
    const { wa, calls } = setup();
    await wa.sendList("+385910000001", "Slobodni termini", choices(4));
    expect(calls[0]!.body.interactive).toMatchObject({
      type: "list",
      body: { text: "Slobodni termini" },
      action: { button: "Odaberi", sections: [{ rows: choices(4) }] },
    });
  });

  it("refuses more than 10 list rows", () => {
    const { wa } = setup();
    expect(() => wa.sendList("+385910000001", "x", choices(11))).toThrow(/rows/);
  });

  it("maps core messages: text, ≤3 choices as buttons, more as a list", async () => {
    const { wa, calls } = setup();
    await wa.send("+1555000001", { kind: "text", body: "Hi" });
    await wa.send("+1555000001", { kind: "choices", body: "Pick", choices: choices(3) });
    await wa.send("+1555000001", { kind: "choices", body: "Pick", choices: choices(4) });
    expect(calls.map((c) => c.body.type)).toEqual(["text", "interactive", "interactive"]);
    expect(calls.map((c) => (c.body.interactive as { type: string } | undefined)?.type)).toEqual([
      undefined,
      "button",
      "list",
    ]);
  });

  it("logs and returns the Graph error body on non-2xx without throwing", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const graphError = { error: { message: "Recipient not in allowed list", code: 131030 } };
    const { wa } = setup({ status: 400, body: graphError });
    const result = await wa.sendText("+385910000009", "Bok");
    expect(result).toEqual({ ok: false, status: 400, error: JSON.stringify(graphError) });
    expect(error).toHaveBeenCalledWith(expect.stringContaining("failed (400)"), JSON.stringify(graphError));
    error.mockRestore();
  });
});

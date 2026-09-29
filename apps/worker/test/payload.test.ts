import { describe, expect, it } from "vitest";
import { parseWebhook } from "../src/webhook/payload";
import { audioPayload, buttonPayload, listPayload, statusPayload, textPayload } from "./whatsapp-fixtures";

describe("parseWebhook", () => {
  it("normalizes a text message with an E.164 sender", () => {
    expect(parseWebhook(textPayload("385910000001", "wamid.1", "Bok"))).toEqual([
      { from: "+385910000001", messageId: "wamid.1", kind: "text", text: "Bok" },
    ]);
  });

  it("turns button and list taps into a replyId", () => {
    expect(parseWebhook(buttonPayload("385910000000", "wamid.2", "confirm:h-1"))).toEqual([
      { from: "+385910000000", messageId: "wamid.2", kind: "reply", replyId: "confirm:h-1" },
    ]);
    expect(parseWebhook(listPayload("385910000001", "wamid.3", "pick:s-1"))).toEqual([
      { from: "+385910000001", messageId: "wamid.3", kind: "reply", replyId: "pick:s-1" },
    ]);
  });

  it("marks other message types as unsupported", () => {
    expect(parseWebhook(audioPayload("385910000001", "wamid.4"))).toEqual([
      { from: "+385910000001", messageId: "wamid.4", kind: "unsupported", type: "audio" },
    ]);
  });

  it("returns nothing for status updates", () => {
    expect(parseWebhook(statusPayload())).toEqual([]);
  });

  it("throws on something that isn't a WhatsApp webhook", () => {
    expect(() => parseWebhook({ object: "page", entry: [] })).toThrow();
  });
});

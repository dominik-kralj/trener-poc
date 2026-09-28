import { describe, expect, it } from "vitest";
import { parseReplyId, replyId, replyToEvent } from "./replies";

describe("reply ids", () => {
  it("round-trips every reply id", () => {
    expect(parseReplyId(replyId.sendOffer())).toEqual({ type: "sendOffer" });
    expect(parseReplyId(replyId.decline())).toEqual({ type: "decline" });
    expect(parseReplyId(replyId.pick("s1"))).toEqual({ type: "pick", slotId: "s1" });
    expect(parseReplyId(replyId.confirm("h1"))).toEqual({ type: "confirm", holdId: "h1" });
    expect(parseReplyId(replyId.reject("h1"))).toEqual({ type: "reject", holdId: "h1" });
  });

  it("keeps ids that contain a colon", () => {
    expect(parseReplyId("pick:a:b")).toEqual({ type: "pick", slotId: "a:b" });
  });

  it("returns null for unknown or empty ids", () => {
    expect(parseReplyId("")).toBeNull();
    expect(parseReplyId("pick:")).toBeNull();
    expect(parseReplyId("delete:s1")).toBeNull();
  });

  it("maps a reply to an event carrying the sender", () => {
    expect(replyToEvent("+385", { type: "pick", slotId: "s1" })).toEqual({
      type: "clientPickedSlot",
      from: "+385",
      slotId: "s1",
    });
  });
});

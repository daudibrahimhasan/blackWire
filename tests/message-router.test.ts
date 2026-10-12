import { describe, expect, it } from "vitest";
import { MockAdapter } from "../src/adapters/mock/mock-adapter.js";
import { MessageRouter } from "../src/daemon/message-router.js";

describe("MessageRouter", () => {
  it("delivers a private message only to its recipient", async () => {
    const router = new MessageRouter(); const a = new MockAdapter(); const b = new MockAdapter();
    await a.start({ id: "a", name: "A", cliType: "mock", roomId: "default" });
    await b.start({ id: "b", name: "B", cliType: "mock", roomId: "default" });
    let aReplies = 0; let bReplies = 0;
    a.onEvent(event => { if (event.type === "message_completed") aReplies += 1; });
    b.onEvent(event => { if (event.type === "message_completed") bReplies += 1; });
    router.register("a", a); router.register("b", b);
    await router.route({ id: "m1", roomId: "default", senderId: "user", recipient: "a", type: "message", content: "hello" });
    expect(aReplies).toBe(1); expect(bReplies).toBe(0);
  });
});

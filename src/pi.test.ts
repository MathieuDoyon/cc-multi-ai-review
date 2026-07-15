import { describe, expect, it } from "vitest";
import { buildPiArgs, createPiRunner } from "./pi.js";

describe("buildPiArgs", () => {
  it("always uses --print and --model", () => {
    expect(buildPiArgs({ model: "openai-codex/gpt-5.6-sol" })).toEqual([
      "--print",
      "--model",
      "openai-codex/gpt-5.6-sol",
    ]);
  });

  it("adds --thinking only when a level is provided", () => {
    expect(buildPiArgs({ model: "a/b", thinking: "high" })).toEqual([
      "--print",
      "--model",
      "a/b",
      "--thinking",
      "high",
    ]);
  });
});

describe("createPiRunner", () => {
  it("resolves ok:false instead of crashing on stdin EPIPE (large prompt, process exits early)", async () => {
    const runner = createPiRunner({ command: "/usr/bin/true", timeoutMs: 5000 });
    const largePrompt = "x".repeat(5 * 1024 * 1024);

    const result = await runner({ model: "test/model", prompt: largePrompt });

    expect(result).toMatchObject({ ok: false });
  });

  it("resolves ok:false (never rejects) when the binary does not exist", async () => {
    const runner = createPiRunner({ command: "definitely-not-a-real-binary-xyz", timeoutMs: 5000 });

    await expect(runner({ model: "test/model", prompt: "hello" })).resolves.toMatchObject({
      ok: false,
    });
  });
});

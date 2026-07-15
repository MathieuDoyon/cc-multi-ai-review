import { describe, expect, it } from "vitest";
import { buildPiArgs } from "./pi.js";

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

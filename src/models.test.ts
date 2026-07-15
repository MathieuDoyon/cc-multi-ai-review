import { describe, expect, it } from "vitest";
import { parseModelID, parseModelList } from "./models.js";

describe("parseModelList", () => {
  it("returns trimmed non-empty model IDs", () => {
    const output = "\n openai/gpt-5.5 \n\nopencode-go/kimi-k2.7-code\n";

    expect(parseModelList(output)).toEqual(["openai/gpt-5.5", "opencode-go/kimi-k2.7-code"]);
  });
});

describe("parseModelID", () => {
  it("splits the provider from the model ID", () => {
    expect(parseModelID("openai/gpt-5.5-pro")).toEqual({
      providerID: "openai",
      modelID: "gpt-5.5-pro",
    });
  });

  it("keeps slashes after the provider in the model ID", () => {
    expect(parseModelID("custom/provider/model")).toEqual({
      providerID: "custom",
      modelID: "provider/model",
    });
  });

  it("rejects invalid model IDs", () => {
    expect(parseModelID("missing-provider")).toBeUndefined();
    expect(parseModelID("/missing-provider")).toBeUndefined();
    expect(parseModelID("provider/")).toBeUndefined();
  });
});

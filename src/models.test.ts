import { describe, expect, it } from "vitest";
import { parseModelID, parsePiModels } from "./models.js";

const SAMPLE = `provider      model                context  max-out  thinking  images
openai-codex  gpt-5.4              272K     128K     yes       yes
openai-codex  gpt-5.4-mini         272K     128K     yes       yes
opencode-go   minimax-m3           1M       131.1K   yes       yes
opencode-go   glm-5.1              202.8K   32.8K    no        yes
`;

describe("parsePiModels", () => {
  it("parses provider, model, and thinking support, skipping the header", () => {
    expect(parsePiModels(SAMPLE)).toEqual([
      { id: "openai-codex/gpt-5.4", provider: "openai-codex", model: "gpt-5.4", thinking: true },
      { id: "openai-codex/gpt-5.4-mini", provider: "openai-codex", model: "gpt-5.4-mini", thinking: true },
      { id: "opencode-go/minimax-m3", provider: "opencode-go", model: "minimax-m3", thinking: true },
      { id: "opencode-go/glm-5.1", provider: "opencode-go", model: "glm-5.1", thinking: false },
    ]);
  });

  it("ignores blank lines and non-model noise", () => {
    const noisy = "supacode: OSC emit failed: code=ENXIO\n\n" + SAMPLE;
    expect(parsePiModels(noisy).map((m) => m.id)).toContain("opencode-go/minimax-m3");
    expect(parsePiModels(noisy)).toHaveLength(4);
  });
});

describe("parseModelID", () => {
  it("splits the provider from the model ID", () => {
    expect(parseModelID("openai-codex/gpt-5.5")).toEqual({ providerID: "openai-codex", modelID: "gpt-5.5" });
  });

  it("rejects invalid model IDs", () => {
    expect(parseModelID("missing-provider")).toBeUndefined();
    expect(parseModelID("provider/")).toBeUndefined();
  });
});

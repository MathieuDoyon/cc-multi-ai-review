import { describe, expect, it } from "vitest";
import { parseModelID, parsePiModels, familyKey, groupModelFamilies, thinkingSupportMap } from "./models.js";
import type { PiModel } from "./models.js";

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

function pm(id: string, thinking = true): PiModel {
  const [provider, model] = [id.slice(0, id.indexOf("/")), id.slice(id.indexOf("/") + 1)];
  return { id, provider, model, thinking };
}

describe("familyKey", () => {
  it("keeps openai gpt minor lines as distinct families", () => {
    expect(familyKey("openai-codex", "gpt-5.6-sol")).toBe("openai-codex/gpt-5.6");
    expect(familyKey("openai-codex", "gpt-5.4")).toBe("openai-codex/gpt-5.4");
  });

  it("strips version/variant to a root for other families", () => {
    expect(familyKey("opencode-go", "minimax-m3")).toBe("opencode-go/minimax");
    expect(familyKey("opencode-go", "kimi-k2.7-code")).toBe("opencode-go/kimi");
    expect(familyKey("opencode-go", "glm-5.2")).toBe("opencode-go/glm");
    expect(familyKey("opencode-go", "qwen3.7-plus")).toBe("opencode-go/qwen");
    expect(familyKey("opencode-go", "mimo-v2.5-pro")).toBe("opencode-go/mimo");
    expect(familyKey("opencode-go", "deepseek-v4-flash")).toBe("opencode-go/deepseek");
  });
});

describe("groupModelFamilies", () => {
  it("groups variants and picks the newest non-lightweight flagship", () => {
    const families = groupModelFamilies([
      pm("openai-codex/gpt-5.6-luna"),
      pm("openai-codex/gpt-5.6-sol"),
      pm("openai-codex/gpt-5.6-terra"),
      pm("opencode-go/kimi-k2.6"),
      pm("opencode-go/kimi-k2.7-code"),
      pm("opencode-go/minimax-m2.7"),
      pm("opencode-go/minimax-m3"),
    ]);

    const byFamily = Object.fromEntries(families.map((f) => [f.family, f.flagship]));
    expect(byFamily["openai-codex/gpt-5.6"]).toBe("openai-codex/gpt-5.6-terra");
    expect(byFamily["opencode-go/kimi"]).toBe("opencode-go/kimi-k2.7-code");
    expect(byFamily["opencode-go/minimax"]).toBe("opencode-go/minimax-m3");
  });

  it("excludes lightweight variants from flagship selection", () => {
    const families = groupModelFamilies([
      pm("openai-codex/gpt-5.4"),
      pm("openai-codex/gpt-5.4-mini"),
    ]);
    expect(families).toHaveLength(1);
    expect(families[0].flagship).toBe("openai-codex/gpt-5.4");
    expect(families[0].variants).toEqual(["openai-codex/gpt-5.4", "openai-codex/gpt-5.4-mini"]);
  });

  it("falls back to a lightweight variant when it is the only option", () => {
    const families = groupModelFamilies([pm("openai-codex/gpt-5.3-codex-spark")]);
    expect(families[0].flagship).toBe("openai-codex/gpt-5.3-codex-spark");
  });

  it("carries the flagship's thinking support onto the family", () => {
    const families = groupModelFamilies([pm("opencode-go/glm-5.2", false)]);
    expect(families[0].thinking).toBe(false);
  });
});

describe("thinkingSupportMap", () => {
  it("maps each model id to its thinking support", () => {
    expect(thinkingSupportMap([pm("a/b", true), pm("c/d", false)])).toEqual({ "a/b": true, "c/d": false });
  });
});

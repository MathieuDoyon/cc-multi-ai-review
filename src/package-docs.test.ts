import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");

describe("package docs", () => {
  it("ships a copyable multi-review command template", () => {
    const command = readFileSync(resolve(root, "commands/multi-review.md"), "utf8");

    expect(command).toContain("opencode models");
    expect(command).toContain("multi_ai_code_review");
    expect(command).toContain("question");
    expect(command).toContain("Group the available model IDs by model family");
    expect(command).toContain("one recommended model per family");
    expect(command).toContain("Prefer the newest stable/full variant");
    expect(command).toContain("Advanced: choose specific model variants");
    expect(command).toContain("Never pass the advanced option label");
    expect(command).toContain("multi_ai_code_review_last_models");
    expect(command).toContain("Use last:");
    expect(command).toContain("Never pass the `Use last:` label");
  });

  it("documents installation and command setup", () => {
    const readme = readFileSync(resolve(root, "README.md"), "utf8");

    expect(readme).toContain("opencode-multi-ai-review");
    expect(readme).toContain("plugin");
    expect(readme).toContain("Install from npm");
    expect(readme).toContain("Install from a local clone");
    expect(readme).toContain("commands/multi-review.md");
    expect(readme).not.toContain("~/Developer/opencode-multi-ai-review");
    expect(readme).not.toContain("curl -fsSL https://raw.githubusercontent.com/MathieuDoyon/opencode-multi-ai-review/main/commands/multi-review.md");
    expect(readme).not.toContain("cp /absolute/path/to/opencode-multi-ai-review/commands/multi-review.md");
    expect(readme).toContain("Command registration is automatic");
    expect(readme).toContain("opencode plugin opencode-multi-ai-review");
    expect(readme).toContain("opencode plugin --global opencode-multi-ai-review");
    expect(readme).toContain("You can also add it manually to your opencode config:");
    expect(readme).toContain("src/command.ts");
    expect(readme).toContain("packaged readable reference");
    expect(readme).toContain(".opencode/multi-ai-review/state.json");
    expect(readme).toContain(".opencode/multi-ai-review/.gitignore");
    expect(readme).not.toContain("After the package is published");
    expect(readme).not.toContain("before publishing");
  });
});

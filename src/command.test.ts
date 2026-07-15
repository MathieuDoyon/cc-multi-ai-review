import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MULTI_REVIEW_COMMAND_TEMPLATE, registerMultiReviewCommand } from "./command.js";

const root = resolve(import.meta.dirname, "..");

describe("registerMultiReviewCommand", () => {
  it("registers command.multi-review when missing", () => {
    const cfg: { command?: Record<string, unknown> } = {};

    registerMultiReviewCommand(cfg);

    expect(cfg.command?.["multi-review"]).toEqual({
      description: "Run a multi-model AI code review for the current branch",
      template: MULTI_REVIEW_COMMAND_TEMPLATE,
      agent: "build",
    });
  });

  it("preserves an existing command.multi-review override", () => {
    const existing = { description: "custom", template: "custom template", agent: "plan" };
    const cfg = { command: { "multi-review": existing } };

    registerMultiReviewCommand(cfg);

    expect(cfg.command["multi-review"]).toBe(existing);
  });
});

describe("MULTI_REVIEW_COMMAND_TEMPLATE", () => {
  it("matches the packaged command markdown body", () => {
    const command = readFileSync(resolve(root, "commands/multi-review.md"), "utf8");
    const body = command.replace(/^---\n[\s\S]*?\n---\n/, "").trim();

    expect(body).toBe(MULTI_REVIEW_COMMAND_TEMPLATE);
  });

  it("contains selection, last-model, and review tool instructions", () => {
    expect(MULTI_REVIEW_COMMAND_TEMPLATE).toContain("multi_ai_code_review_last_models");
    expect(MULTI_REVIEW_COMMAND_TEMPLATE).toContain("Use last:");
    expect(MULTI_REVIEW_COMMAND_TEMPLATE).toContain("Group the available model IDs by model family");
    expect(MULTI_REVIEW_COMMAND_TEMPLATE).toContain("Advanced: choose specific model variants");
    expect(MULTI_REVIEW_COMMAND_TEMPLATE).toContain("Never pass the advanced option label");
    expect(MULTI_REVIEW_COMMAND_TEMPLATE).toContain("Never pass the `Use last:` label");
    expect(MULTI_REVIEW_COMMAND_TEMPLATE).toContain("multi_ai_code_review");
  });
});

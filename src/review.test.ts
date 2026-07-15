import { describe, expect, it, vi } from "vitest";
import { runMultiAiReview } from "./review.js";
import type { PiRunner, ShellRunner } from "./types.js";

function shellWithGitContext(): ShellRunner {
  return async (command: string) => {
    const responses: Record<string, string> = {
      "git rev-parse --verify origin/main^{commit}": "base\n",
      "git merge-base HEAD origin/main": "merge-base\n",
      "git diff --stat merge-base..HEAD": "src/file.ts | 2 +-\n",
      "git diff --name-status merge-base..HEAD": "M\tsrc/file.ts\n",
      "git diff merge-base..HEAD": "diff --git a/src/file.ts b/src/file.ts\n+new line\n",
    };
    const response = responses[command];
    if (response === undefined) throw new Error(`unexpected command: ${command}`);
    return response;
  };
}

const FINDING_JSON = `\`\`\`json\n${JSON.stringify({
  summary: "summary",
  findings: [
    {
      title: "Missing null guard",
      severity: "high",
      confidence: "high",
      file: "src/file.ts",
      line: 12,
      category: "bug",
      evidence: "value may be null",
      recommendation: "Add a guard",
      falsePositiveRisk: "Caller may validate",
    },
  ],
})}\n\`\`\``;

describe("runMultiAiReview", () => {
  it("runs each model through the pi runner and renders grouped findings", async () => {
    const runPi = vi.fn<PiRunner>(async ({ model }) => ({ model, ok: true, stdout: FINDING_JSON }));

    const report = await runMultiAiReview({
      runPi,
      shell: shellWithGitContext(),
      models: ["openai-codex/gpt-5.6-sol", "opencode-go/minimax-m3"],
      thinking: "medium",
      limits: { maxDiffBytes: 1000, maxDiffLines: 100, maxFiles: 10 },
    });

    expect(runPi).toHaveBeenCalledTimes(2);
    expect(report).toContain("Missing null guard");
    expect(report).toContain("openai-codex/gpt-5.6-sol, opencode-go/minimax-m3");
    expect(report).toContain("address");
  });

  it("builds the prompt once and shares it across models", async () => {
    const prompts = new Set<string>();
    const runPi = vi.fn<PiRunner>(async ({ model, prompt }) => {
      prompts.add(prompt);
      return { model, ok: true, stdout: FINDING_JSON };
    });

    await runMultiAiReview({
      runPi,
      shell: shellWithGitContext(),
      models: ["a/b", "c/d"],
      limits: { maxDiffBytes: 1000, maxDiffLines: 100, maxFiles: 10 },
    });

    expect(prompts.size).toBe(1);
  });

  it("omits --thinking for models that do not support it", async () => {
    const calls: Array<{ model: string; thinking?: string }> = [];
    const runPi = vi.fn<PiRunner>(async ({ model, thinking }) => {
      calls.push({ model, ...(thinking ? { thinking } : {}) });
      return { model, ok: true, stdout: FINDING_JSON };
    });

    await runMultiAiReview({
      runPi,
      shell: shellWithGitContext(),
      models: ["thinks/yes", "thinks/no"],
      thinking: "high",
      thinkingSupport: { "thinks/yes": true, "thinks/no": false },
      limits: { maxDiffBytes: 1000, maxDiffLines: 100, maxFiles: 10 },
    });

    expect(calls).toContainEqual({ model: "thinks/yes", thinking: "high" });
    expect(calls).toContainEqual({ model: "thinks/no" });
  });

  it("reports a failed pi run as a reviewer failure", async () => {
    const runPi = vi.fn<PiRunner>(async ({ model }) => ({ model, ok: false, reason: "boom" }));

    const report = await runMultiAiReview({
      runPi,
      shell: shellWithGitContext(),
      models: ["openai-codex/gpt-5.6-sol"],
      limits: { maxDiffBytes: 1000, maxDiffLines: 100, maxFiles: 10 },
    });

    expect(report).toContain("## Reviewer Failures");
    expect(report).toContain("boom");
  });

  it("reports malformed reviewer output as a reviewer failure", async () => {
    const runPi = vi.fn<PiRunner>(async ({ model }) => ({ model, ok: true, stdout: "not json" }));

    const report = await runMultiAiReview({
      runPi,
      shell: shellWithGitContext(),
      models: ["openai-codex/gpt-5.6-sol"],
      limits: { maxDiffBytes: 1000, maxDiffLines: 100, maxFiles: 10 },
    });

    expect(report).toContain("Could not parse reviewer JSON output");
  });

  it("persists raw reviewer output on parse failure and includes the path in the reason", async () => {
    const runPi = vi.fn<PiRunner>(async ({ model }) => ({ model, ok: true, stdout: "not json" }));
    const saveRawOutput = vi.fn(async () => "/tmp/fake/raw.txt");

    const report = await runMultiAiReview({
      runPi,
      shell: shellWithGitContext(),
      models: ["openai-codex/gpt-5.6-sol"],
      limits: { maxDiffBytes: 1000, maxDiffLines: 100, maxFiles: 10 },
      saveRawOutput,
    });

    expect(report).toContain(
      "Could not parse reviewer JSON output (raw output: /tmp/fake/raw.txt)",
    );
    expect(saveRawOutput).toHaveBeenCalledWith("openai-codex/gpt-5.6-sol", "not json");
  });

  it("falls back to the plain parse-failure reason when saveRawOutput rejects", async () => {
    const runPi = vi.fn<PiRunner>(async ({ model }) => ({ model, ok: true, stdout: "not json" }));
    const saveRawOutput = vi.fn(async () => {
      throw new Error("disk full");
    });

    const report = await runMultiAiReview({
      runPi,
      shell: shellWithGitContext(),
      models: ["openai-codex/gpt-5.6-sol"],
      limits: { maxDiffBytes: 1000, maxDiffLines: 100, maxFiles: 10 },
      saveRawOutput,
    });

    expect(report).toContain("Could not parse reviewer JSON output");
    expect(report).not.toContain("raw output:");
  });

  it("isolates a rejecting runPi to a reviewer failure for that model", async () => {
    const runPi = vi.fn<PiRunner>(async ({ model }) => {
      if (model === "bad/model") throw new Error("spawn exploded");
      return { model, ok: true, stdout: FINDING_JSON };
    });

    const report = await runMultiAiReview({
      runPi,
      shell: shellWithGitContext(),
      models: ["bad/model", "openai-codex/gpt-5.6-sol"],
      limits: { maxDiffBytes: 1000, maxDiffLines: 100, maxFiles: 10 },
    });

    expect(report).toContain("Missing null guard");
    expect(report).toContain("## Reviewer Failures");
    expect(report).toContain("bad/model");
    expect(report).toContain("spawn exploded");
  });
});

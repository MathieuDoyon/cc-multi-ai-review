import { describe, expect, it, vi } from "vitest";
import { runMultiAiReview } from "./review.js";
import type { ReviewClient, ShellRunner } from "./types.js";

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

describe("runMultiAiReview", () => {
  it("creates one child session per model and renders grouped findings", async () => {
    const create = vi
      .fn<ReviewClient["session"]["create"]>()
      .mockResolvedValueOnce({ id: "child-a" })
      .mockResolvedValueOnce({ id: "child-b" });
    const prompt = vi.fn<ReviewClient["session"]["prompt"]>().mockResolvedValue({
      parts: [
        {
          type: "text",
          text: `\`\`\`json\n${JSON.stringify({
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
          })}\n\`\`\``,
        },
      ],
    });

    const report = await runMultiAiReview({
      client: { session: { create, prompt } },
      shell: shellWithGitContext(),
      sessionID: "parent",
      models: ["openai/gpt-5.5", "anthropic/claude"],
      limits: { maxDiffBytes: 1000, maxDiffLines: 100, maxFiles: 10 },
    });

    expect(create).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledWith({
      body: { parentID: "parent", title: "Code review: openai/gpt-5.5" },
    });
    expect(prompt).toHaveBeenCalledWith(
      expect.objectContaining({
        path: { id: "child-a" },
        body: expect.objectContaining({
          model: { providerID: "openai", modelID: "gpt-5.5" },
          tools: { write: false, edit: false, apply_patch: false },
        }),
      }),
    );
    expect(report).toContain("Missing null guard");
    expect(report).toContain("openai/gpt-5.5, anthropic/claude");
    expect(report).toContain("address");
  });

  it("reports malformed reviewer output as a reviewer failure", async () => {
    const create = vi.fn<ReviewClient["session"]["create"]>().mockResolvedValue({ id: "child-a" });
    const prompt = vi.fn<ReviewClient["session"]["prompt"]>().mockResolvedValue({
      parts: [{ type: "text", text: "not json" }],
    });

    const report = await runMultiAiReview({
      client: { session: { create, prompt } },
      shell: shellWithGitContext(),
      sessionID: "parent",
      models: ["openai/gpt-5.5"],
      limits: { maxDiffBytes: 1000, maxDiffLines: 100, maxFiles: 10 },
    });

    expect(report).toContain("## Reviewer Failures");
    expect(report).toContain("Could not parse reviewer JSON output");
  });
});

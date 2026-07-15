import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import plugin, { createMultiAiCodeReviewTool } from "./index.js";
import type { ReviewClient, ShellRunner } from "./types.js";

async function tempRepo(): Promise<string> {
  return mkdtemp(join(tmpdir(), "multi-ai-review-"));
}

describe("createMultiAiCodeReviewTool", () => {
  it("passes tool args and session context to the review runner", async () => {
    const client = { session: { create: vi.fn(), prompt: vi.fn() } } as unknown as ReviewClient;
    const shell: ShellRunner = vi.fn();
    const runReview = vi.fn().mockResolvedValue("# report");
    const reviewTool = createMultiAiCodeReviewTool({ client, shell, runReview });

    const result = await reviewTool.execute(
      { models: ["openai/gpt-5.5"], baseRef: "origin/main", instructions: "focus" },
      { sessionID: "session-1" } as never,
    );

    expect(result).toBe("# report");
    expect(runReview).toHaveBeenCalledWith({
      client,
      shell,
      sessionID: "session-1",
      models: ["openai/gpt-5.5"],
      baseRef: "origin/main",
      instructions: "focus",
      limits: { maxDiffBytes: 200000, maxDiffLines: 6000, maxFiles: 200 },
    });
  });

  it("saves selected models after running a review", async () => {
    const client = { session: { create: vi.fn(), prompt: vi.fn() } } as unknown as ReviewClient;
    const shell: ShellRunner = vi.fn();
    const runReview = vi.fn().mockResolvedValue("# report");
    const writeLastModels = vi.fn().mockResolvedValue(undefined);
    const reviewTool = createMultiAiCodeReviewTool({
      client,
      shell,
      runReview,
      state: { readLastModels: vi.fn(), writeLastModels },
    });

    await reviewTool.execute({ models: ["openai/gpt-5.5"] }, { sessionID: "session-1" } as never);

    expect(writeLastModels).toHaveBeenCalledWith(["openai/gpt-5.5"]);
  });

  it("still returns the report if saving selected models fails", async () => {
    const client = { session: { create: vi.fn(), prompt: vi.fn() } } as unknown as ReviewClient;
    const shell: ShellRunner = vi.fn();
    const runReview = vi.fn().mockResolvedValue("# report");
    const reviewTool = createMultiAiCodeReviewTool({
      client,
      shell,
      runReview,
      state: {
        readLastModels: vi.fn(),
        writeLastModels: vi.fn().mockRejectedValue(new Error("disk full")),
      },
    });

    await expect(
      reviewTool.execute({ models: ["openai/gpt-5.5"] }, { sessionID: "session-1" } as never),
    ).resolves.toBe("# report");
  });
});

describe("plugin", () => {
  it("registers the multi_ai_code_review tool", async () => {
    const hooks = await plugin({
      client: { session: { create: vi.fn(), prompt: vi.fn() } },
      directory: "/repo",
      worktree: "/repo",
      $: vi.fn(),
    } as never);

    expect(hooks.tool?.multi_ai_code_review).toBeDefined();
  });

  it("registers the multi_ai_code_review_last_models tool", async () => {
    const directory = await tempRepo();
    await mkdir(join(directory, ".opencode/multi-ai-review"), { recursive: true });
    await writeFile(
      join(directory, ".opencode/multi-ai-review/state.json"),
      `${JSON.stringify({ lastModels: ["openai/gpt-5.5"] }, null, 2)}\n`,
      "utf8",
    );

    const hooks = await plugin({
      client: { session: { create: vi.fn(), prompt: vi.fn() } },
      directory,
      worktree: directory,
      $: vi.fn(),
    } as never);

    await expect(hooks.tool?.multi_ai_code_review_last_models.execute({}, {} as never)).resolves.toBe(
      JSON.stringify({ models: ["openai/gpt-5.5"] }),
    );
  });
});

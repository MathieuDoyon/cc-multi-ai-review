import { tool, type ToolDefinition } from "@opencode-ai/plugin";
import { runMultiAiReview } from "./review.js";
import type { DiffLimits, ReviewClient, ReviewStateStore, RunReviewInput, ShellRunner } from "./types.js";

const DEFAULT_LIMITS: DiffLimits = {
  maxDiffBytes: 200_000,
  maxDiffLines: 6_000,
  maxFiles: 200,
};

type CreateToolInput = {
  client: ReviewClient;
  shell: ShellRunner;
  limits?: Partial<DiffLimits>;
  runReview?: (input: RunReviewInput) => Promise<string>;
  state?: ReviewStateStore;
};

export function createMultiAiCodeReviewTool(input: CreateToolInput): ToolDefinition {
  const limits = { ...DEFAULT_LIMITS, ...input.limits };
  const runReview = input.runReview ?? runMultiAiReview;

  return tool({
    description:
      "Run a branch-vs-base code review with one or more selected opencode models and return a synthesized report.",
    args: {
      models: tool.schema
        .array(tool.schema.string())
        .min(1)
        .describe("Selected model IDs, e.g. openai/gpt-5.5"),
      baseRef: tool.schema.string().optional().describe("Optional base ref, e.g. origin/main"),
      instructions: tool.schema.string().optional().describe("Optional extra review focus"),
    },
    async execute(args, context) {
      const report = await runReview({
        client: input.client,
        shell: input.shell,
        sessionID: context.sessionID,
        models: args.models,
        ...(args.baseRef ? { baseRef: args.baseRef } : {}),
        ...(args.instructions ? { instructions: args.instructions } : {}),
        limits,
      });

      try {
        await input.state?.writeLastModels(args.models);
      } catch {
        // The review report is more important than non-critical preference persistence.
      }

      return report;
    },
  });
}

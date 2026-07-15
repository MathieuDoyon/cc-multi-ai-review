import { collectDiff, resolveBaseRef } from "./git.js";
import { groupFindings } from "./findings.js";
import { buildReviewerPrompt, extractReviewerOutput } from "./prompt.js";
import { renderReport } from "./report.js";
import type { ReviewerFailure, ReviewerResult, RunReviewInput } from "./types.js";

export async function runMultiAiReview(input: RunReviewInput): Promise<string> {
  const base = await resolveBaseRef(input.shell, input.baseRef);
  if (!base.ok) return base.message;

  const diffContext = await collectDiff(input.shell, {
    baseRef: base.baseRef,
    mergeBase: base.mergeBase,
    limits: input.limits,
  });

  const prompt = buildReviewerPrompt({
    diffContext,
    ...(input.instructions ? { instructions: input.instructions } : {}),
  });

  const outcomes = await Promise.all(
    input.models.map((model) => reviewWithModel(input, model, prompt)),
  );

  const results: ReviewerResult[] = [];
  const failures: ReviewerFailure[] = [];
  for (const outcome of outcomes) {
    if ("output" in outcome) results.push(outcome);
    else failures.push(outcome);
  }

  return renderReport({
    groups: groupFindings(results),
    failures,
    partial: diffContext.truncated,
    ...(diffContext.truncationReason ? { truncationReason: diffContext.truncationReason } : {}),
  });
}

async function reviewWithModel(
  input: RunReviewInput,
  model: string,
  prompt: string,
): Promise<ReviewerResult | ReviewerFailure> {
  const supportsThinking = input.thinkingSupport?.[model] !== false;
  const result = await input.runPi({
    model,
    prompt,
    ...(input.thinking && supportsThinking ? { thinking: input.thinking } : {}),
  });

  if (!result.ok) return { model, reason: result.reason };

  const output = extractReviewerOutput(result.stdout);
  if (!output) return { model, reason: "Could not parse reviewer JSON output" };
  return { model, output };
}

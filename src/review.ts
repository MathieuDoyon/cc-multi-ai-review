import { groupFindings } from "./findings.js";
import { collectDiff, resolveBaseRef } from "./git.js";
import { parseModelID } from "./models.js";
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

  const settled = await Promise.allSettled(
    input.models.map((model) => reviewWithModel(input, model, diffContext)),
  );

  const results: ReviewerResult[] = [];
  const failures: ReviewerFailure[] = [];

  for (const item of settled) {
    if (item.status === "fulfilled") {
      if ("output" in item.value) results.push(item.value);
      else failures.push(item.value);
      continue;
    }

    failures.push({
      model: "unknown",
      reason: item.reason instanceof Error ? item.reason.message : String(item.reason),
    });
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
  diffContext: Parameters<typeof buildReviewerPrompt>[0]["diffContext"],
): Promise<ReviewerResult | ReviewerFailure> {
  const parsedModel = parseModelID(model);
  if (!parsedModel) return { model, reason: "Invalid model ID" };

  const child = await input.client.session.create({
    body: { parentID: input.sessionID, title: `Code review: ${model}` },
  });
  const response = await input.client.session.prompt({
    path: { id: child.id },
    body: {
      model: parsedModel,
      system: "You are a read-only code reviewer. Return only the requested review response.",
      tools: { write: false, edit: false, apply_patch: false },
      parts: [
        {
          type: "text",
          text: buildReviewerPrompt({ diffContext, instructions: input.instructions }),
        },
      ],
    },
  });

  const text = response.parts
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n");
  const output = extractReviewerOutput(text);

  if (!output) return { model, reason: "Could not parse reviewer JSON output" };
  return { model, output };
}

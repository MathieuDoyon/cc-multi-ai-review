import type { DiffContext, ReviewerOutput } from "./types.js";

type BuildReviewerPromptInput = {
  diffContext: DiffContext;
  instructions?: string;
};

export function buildReviewerPrompt(input: BuildReviewerPromptInput): string {
  const partialNotice = input.diffContext.truncated
    ? `\n\nPartial review notice: ${input.diffContext.truncationReason}`
    : "";
  const extraInstructions = input.instructions
    ? `\n\nExtra user instructions:\n${input.instructions}`
    : "";

  return `You are a read-only code reviewer. Do not modify files, run edits, or suggest broad rewrites.

Review the branch diff for concrete bugs, security issues, regressions, missing tests, and maintainability risks. Prefer specific evidence over speculation. Flag likely false positives explicitly.

Return exactly one fenced JSON block with this schema:

\`\`\`json
{
  "summary": "short reviewer summary",
  "findings": [
    {
      "title": "short issue title",
      "severity": "critical|high|medium|low",
      "confidence": "high|medium|low",
      "file": "path/to/file.ts",
      "line": 123,
      "category": "bug|security|performance|maintainability|test|docs|other",
      "evidence": "why this is a real issue",
      "recommendation": "specific fix",
      "falsePositiveRisk": "why this may be wrong"
    }
  ]
}
\`\`\`

Base ref: ${input.diffContext.baseRef}
Merge base: ${input.diffContext.mergeBase}${partialNotice}${extraInstructions}

Diff stat:
${input.diffContext.stat}

Changed files:
${input.diffContext.nameStatus}

Unified diff:
${input.diffContext.diff}`;
}

export function extractReviewerOutput(text: string): ReviewerOutput | undefined {
  const match = text.match(/```json\s*([\s\S]*?)\s*```/i);
  if (!match?.[1]) return undefined;

  try {
    const parsed = JSON.parse(match[1]) as unknown;
    return isReviewerOutput(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function isReviewerOutput(value: unknown): value is ReviewerOutput {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.summary === "string" && Array.isArray(candidate.findings);
}

#!/usr/bin/env node

// src/cli.ts
import { exec } from "node:child_process";
import { mkdir as mkdir2, writeFile as writeFile2 } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join as join2 } from "node:path";
import { promisify } from "node:util";

// src/git.ts
var DEFAULT_BASE_REFS = ["origin/main", "origin/master", "main", "master"];
async function resolveBaseRef(shell, explicitBaseRef) {
  if (explicitBaseRef !== void 0) {
    if (!isSafeGitRef(explicitBaseRef)) {
      return { ok: false, message: `Invalid base ref: ${explicitBaseRef}` };
    }
    return resolveCandidate(shell, explicitBaseRef);
  }
  for (const candidate of DEFAULT_BASE_REFS) {
    const result = await resolveCandidate(shell, candidate);
    if (result.ok) return result;
  }
  return {
    ok: false,
    message: "Could not resolve a base ref. Try /multi-ai-review origin/main."
  };
}
async function collectDiff(shell, input) {
  const range = `${input.mergeBase}..HEAD`;
  const stat = (await shell(`git diff --stat ${range}`)).trim();
  const rawNameStatus = (await shell(`git diff --name-status ${range}`)).trim();
  const rawDiff = (await shell(`git diff ${range}`)).trim();
  const nameStatusResult = truncateLines(rawNameStatus, input.limits.maxFiles);
  const lineResult = truncateLines(rawDiff, input.limits.maxDiffLines);
  const byteResult = truncateBytes(lineResult.text, input.limits.maxDiffBytes);
  const reasons = [
    nameStatusResult.truncated ? `maxFiles=${input.limits.maxFiles}` : void 0,
    lineResult.truncated ? `maxDiffLines=${input.limits.maxDiffLines}` : void 0,
    byteResult.truncated ? `maxDiffBytes=${input.limits.maxDiffBytes}` : void 0
  ].filter((reason) => reason !== void 0);
  return {
    baseRef: input.baseRef,
    mergeBase: input.mergeBase,
    stat,
    nameStatus: nameStatusResult.text,
    diff: byteResult.text,
    truncated: reasons.length > 0,
    ...reasons.length > 0 ? { truncationReason: `Diff context exceeded ${formatReasons(reasons)}.` } : {}
  };
}
async function resolveCandidate(shell, ref) {
  try {
    await shell(`git rev-parse --verify ${ref}^{commit}`);
    const mergeBase = (await shell(`git merge-base HEAD ${ref}`)).trim();
    return { ok: true, baseRef: ref, mergeBase };
  } catch {
    return { ok: false, message: `Could not resolve base ref: ${ref}` };
  }
}
function isSafeGitRef(ref) {
  return /^[A-Za-z0-9._/@:+-]+$/.test(ref) && !ref.includes("..") && !ref.startsWith("-");
}
function truncateLines(text, maxLines) {
  const lines = text.split("\n");
  if (lines.length <= maxLines) return { text, truncated: false };
  return { text: lines.slice(0, maxLines).join("\n"), truncated: true };
}
function truncateBytes(text, maxBytes) {
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes <= maxBytes) return { text, truncated: false };
  let result = "";
  for (const char of text) {
    if (Buffer.byteLength(result + char, "utf8") > maxBytes) break;
    result += char;
  }
  return { text: result, truncated: true };
}
function formatReasons(reasons) {
  if (reasons.length === 1) return reasons[0] ?? "limits";
  const last = reasons[reasons.length - 1];
  return `${reasons.slice(0, -1).join(", ")} and ${last}`;
}

// src/models.ts
function parsePiModels(output) {
  const models = [];
  for (const line of output.split("\n")) {
    const tokens = line.trim().split(/\s+/);
    if (tokens.length < 6) continue;
    const thinking = tokens[4];
    if (thinking !== "yes" && thinking !== "no") continue;
    const provider = tokens[0];
    const model = tokens[1];
    models.push({ id: `${provider}/${model}`, provider, model, thinking: thinking === "yes" });
  }
  return models;
}
var LIGHTWEIGHT_TOKENS = /* @__PURE__ */ new Set(["mini", "fast", "flash", "free", "spark", "lite"]);
function familyKey(provider, model) {
  const gpt = model.match(/^(gpt-\d+\.\d+)/);
  if (gpt) return `${provider}/${gpt[1]}`;
  return `${provider}/${familyRoot(model)}`;
}
function familyRoot(model) {
  const digit = model.search(/\d/);
  const head = digit === -1 ? model : model.slice(0, digit);
  const segments = head.split("-").filter((seg) => seg.length > 0);
  if (segments.length > 1 && (segments[segments.length - 1] ?? "").length <= 2) segments.pop();
  return segments.join("-") || model;
}
function isLightweight(model) {
  return model.split(/[-.]/).some((token) => LIGHTWEIGHT_TOKENS.has(token));
}
function pickFlagship(list) {
  const full = list.filter((m) => !isLightweight(m.model));
  const pool = full.length > 0 ? full : list;
  const sorted = [...pool].sort((a, b) => a.model.localeCompare(b.model, void 0, { numeric: true }));
  return sorted[sorted.length - 1];
}
function groupModelFamilies(models) {
  const map = /* @__PURE__ */ new Map();
  for (const m of models) {
    const key = familyKey(m.provider, m.model);
    const list = map.get(key) ?? [];
    list.push(m);
    map.set(key, list);
  }
  const families = [];
  for (const [family, list] of map) {
    const flagship = pickFlagship(list);
    families.push({
      family,
      flagship: flagship.id,
      variants: list.map((m) => m.id),
      thinking: flagship.thinking
    });
  }
  return families;
}
function thinkingSupportMap(models) {
  const map = {};
  for (const m of models) map[m.id] = m.thinking;
  return map;
}
var DEFAULT_TRIO = ["gpt", "minimax", "kimi"];
function orderFamilies(families, lastModels) {
  const remaining = [...families];
  const ordered = [];
  for (const id of lastModels) {
    const idx = remaining.findIndex((f) => f.variants.includes(id));
    if (idx !== -1) ordered.push(...remaining.splice(idx, 1));
  }
  for (const name of DEFAULT_TRIO) {
    const idx = name === "gpt" ? newestGptIndex(remaining) : remaining.findIndex((f) => familyModel(f) === name);
    if (idx !== -1) ordered.push(...remaining.splice(idx, 1));
  }
  ordered.push(...remaining);
  return ordered;
}
function familyModel(family) {
  return family.family.split("/")[1] ?? "";
}
function newestGptIndex(families) {
  let best = -1;
  for (let i = 0; i < families.length; i++) {
    if (!familyModel(families[i]).startsWith("gpt")) continue;
    if (best === -1) {
      best = i;
      continue;
    }
    const a = familyModel(families[i]);
    const b = familyModel(families[best]);
    if (a.localeCompare(b, void 0, { numeric: true }) > 0) best = i;
  }
  return best;
}

// src/pi.ts
import { spawn } from "node:child_process";
function buildPiArgs(invocation) {
  const args = ["--print", "--model", invocation.model];
  if (invocation.thinking) args.push("--thinking", invocation.thinking);
  return args;
}
function createPiRunner(options = {}) {
  const timeoutMs = options.timeoutMs ?? 24e4;
  const command = options.command ?? "pi";
  return (invocation) => new Promise((resolve) => {
    const child = spawn(command, buildPiArgs(invocation), { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({ model: invocation.model, ok: false, reason: `Timed out after ${timeoutMs}ms` });
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ model: invocation.model, ok: false, reason: error.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0 && stdout.trim().length > 0) {
        resolve({ model: invocation.model, ok: true, stdout });
      } else {
        resolve({ model: invocation.model, ok: false, reason: stderr.trim() || `pi exited with code ${code}` });
      }
    });
    child.stdin.on("error", () => {
    });
    child.stdin.end(invocation.prompt);
  });
}

// src/findings.ts
function groupFindings(results) {
  const groups = [];
  for (const result of results) {
    for (const finding of result.output.findings) {
      const normalized = normalizeFinding(finding);
      const existing = groups.find((group) => belongsToGroup(group, normalized));
      if (existing) {
        existing.findings.push(normalized);
        if (!existing.models.includes(result.model)) existing.models.push(result.model);
        existing.severity = highestSeverity(existing.severity, normalized.severity);
        existing.confidence = highestConfidence(existing.confidence, normalized.confidence);
        continue;
      }
      groups.push({
        title: normalized.title,
        severity: normalized.severity,
        confidence: normalized.confidence,
        category: normalized.category,
        file: normalized.file,
        ...normalized.line !== void 0 ? { line: normalized.line } : {},
        models: [result.model],
        findings: [normalized]
      });
    }
  }
  return groups.map((group) => ({ ...group, action: classifyAction(group) }));
}
function classifyAction(group) {
  if (group.confidence === "low" && (group.severity === "low" || group.category === "maintainability")) {
    return "likely false positive";
  }
  if (group.models.length > 1 && group.confidence !== "low") return "address";
  if ((group.severity === "critical" || group.severity === "high") && group.confidence === "high") {
    return group.models.length > 1 ? "address" : "investigate";
  }
  return group.confidence === "low" ? "likely false positive" : "investigate";
}
function normalizeFinding(finding) {
  return {
    ...finding,
    title: finding.title.trim(),
    file: finding.file.trim(),
    evidence: finding.evidence.trim(),
    recommendation: finding.recommendation.trim(),
    falsePositiveRisk: finding.falsePositiveRisk.trim()
  };
}
function belongsToGroup(group, finding) {
  if (group.file !== finding.file || group.category !== finding.category) return false;
  if (group.line !== void 0 && finding.line !== void 0) {
    return Math.abs(group.line - finding.line) <= 3;
  }
  return titleSimilarity(group.title, finding.title) >= 0.5;
}
function titleSimilarity(left, right) {
  const leftTokens = new Set(left.toLowerCase().split(/\W+/).filter(Boolean));
  const rightTokens = new Set(right.toLowerCase().split(/\W+/).filter(Boolean));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return intersection / Math.max(leftTokens.size, rightTokens.size);
}
function highestSeverity(left, right) {
  const order = ["low", "medium", "high", "critical"];
  return order.indexOf(right) > order.indexOf(left) ? right : left;
}
function highestConfidence(left, right) {
  const order = ["low", "medium", "high"];
  return order.indexOf(right) > order.indexOf(left) ? right : left;
}

// src/prompt.ts
function buildReviewerPrompt(input) {
  const partialNotice = input.diffContext.truncated ? `

Partial review notice: ${input.diffContext.truncationReason}` : "";
  const extraInstructions = input.instructions ? `

Extra user instructions:
${input.instructions}` : "";
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
function extractReviewerOutput(text) {
  const fenced = text.match(/```json\s*([\s\S]*?)\s*```/i);
  const candidate = fenced?.[1] ?? bareObject(text);
  if (!candidate) return void 0;
  try {
    const parsed = JSON.parse(candidate);
    return isReviewerOutput(parsed) ? parsed : void 0;
  } catch {
    return void 0;
  }
}
function bareObject(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return void 0;
  return text.slice(start, end + 1);
}
function isReviewerOutput(value) {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value;
  return typeof candidate.summary === "string" && Array.isArray(candidate.findings);
}

// src/report.ts
var SEVERITY_ORDER = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3
};
function renderReport(input) {
  const lines = ["# Multi-AI Code Review", ""];
  if (input.partial) {
    lines.push(`Partial review: ${input.truncationReason ?? "diff context was truncated."}`, "");
  }
  const actionable = [...input.groups].filter((group) => group.action !== "likely false positive").sort((left, right) => SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity]).map((group, index) => ({ number: index + 1, group }));
  lines.push("## Findings", "");
  lines.push("| # | Severity | Confidence | Finding | Models | Location | Recommendation | Action |");
  lines.push("| - | -------- | ---------- | ------- | ------ | -------- | -------------- | ------ |");
  if (actionable.length === 0) {
    lines.push("| - | - | - | No actionable findings | - | - | - | - |");
  } else {
    for (const finding of actionable) lines.push(renderFindingRow(finding));
  }
  lines.push(
    "",
    "Use finding numbers to choose next actions, for example: fix 1 3 or ignore 2.",
    "",
    "Recommended next action:",
    `- Address now: ${formatNumbersForAction(actionable, "address")}`,
    `- Investigate before fixing: ${formatNumbersForAction(actionable, "investigate")}`
  );
  const likelyFalsePositives = input.groups.filter(
    (group) => group.action === "likely false positive"
  );
  if (likelyFalsePositives.length > 0) {
    lines.push("", "## Do Not Address Yet", "");
    for (const group of likelyFalsePositives) {
      lines.push(
        `- **${escapeCell(group.title)}** (${locationFor(group)}): ${escapeCell(group.findings[0]?.falsePositiveRisk ?? "Evidence is weak.")}`
      );
    }
  }
  if (input.failures.length > 0) {
    lines.push("", "## Reviewer Failures", "");
    for (const failure of input.failures) lines.push(`- \`${failure.model}\`: ${escapeCell(failure.reason)}`);
  }
  return lines.join("\n");
}
function renderFindingRow(finding) {
  const recommendation = finding.group.findings[0]?.recommendation ?? "Investigate the cited evidence.";
  return `| ${finding.number} | ${escapeCell(finding.group.severity)} | ${escapeCell(finding.group.confidence)} | ${escapeCell(finding.group.title)} | ${escapeCell(finding.group.models.join(", "))} | ${escapeCell(locationFor(finding.group))} | ${escapeCell(recommendation)} | ${escapeCell(finding.group.action)} |`;
}
function formatNumbersForAction(findings, action) {
  const numbers = findings.filter((finding) => finding.group.action === action).map((finding) => String(finding.number));
  return numbers.length === 0 ? "none" : numbers.join(", ");
}
function locationFor(group) {
  return group.line === void 0 ? group.file : `${group.file}:${group.line}`;
}
function escapeCell(value) {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

// src/review.ts
async function runMultiAiReview(input) {
  const base = await resolveBaseRef(input.shell, input.baseRef);
  if (!base.ok) return base.message;
  const diffContext = await collectDiff(input.shell, {
    baseRef: base.baseRef,
    mergeBase: base.mergeBase,
    limits: input.limits
  });
  const prompt = buildReviewerPrompt({
    diffContext,
    ...input.instructions ? { instructions: input.instructions } : {}
  });
  const settled = await Promise.allSettled(
    input.models.map((model) => reviewWithModel(input, model, prompt))
  );
  const results = [];
  const failures = [];
  for (const [index, item] of settled.entries()) {
    if (item.status === "fulfilled") {
      if ("output" in item.value) results.push(item.value);
      else failures.push(item.value);
      continue;
    }
    failures.push({
      model: input.models[index] ?? "unknown",
      reason: item.reason instanceof Error ? item.reason.message : String(item.reason)
    });
  }
  return renderReport({
    groups: groupFindings(results),
    failures,
    partial: diffContext.truncated,
    ...diffContext.truncationReason ? { truncationReason: diffContext.truncationReason } : {}
  });
}
async function reviewWithModel(input, model, prompt) {
  const supportsThinking = input.thinkingSupport?.[model] !== false;
  const result = await input.runPi({
    model,
    prompt,
    ...input.thinking && supportsThinking ? { thinking: input.thinking } : {}
  });
  if (!result.ok) return { model, reason: result.reason };
  const output = extractReviewerOutput(result.stdout);
  if (!output) {
    let saved;
    if (input.saveRawOutput) {
      try {
        saved = await input.saveRawOutput(model, result.stdout);
      } catch {
        saved = void 0;
      }
    }
    return {
      model,
      reason: saved ? `Could not parse reviewer JSON output (raw output: ${saved})` : "Could not parse reviewer JSON output"
    };
  }
  return { model, output };
}

// src/state.ts
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
function createReviewStateStore(baseDir = join(homedir(), ".claude")) {
  const filePath = join(baseDir, "multi-ai-review", "state.json");
  const stateDirectory = dirname(filePath);
  return {
    async readLastModels() {
      try {
        const parsed = JSON.parse(await readFile(filePath, "utf8"));
        return Array.isArray(parsed.lastModels) && parsed.lastModels.every((model) => typeof model === "string") ? parsed.lastModels : [];
      } catch {
        return [];
      }
    },
    async writeLastModels(models) {
      await mkdir(stateDirectory, { recursive: true });
      await writeFile(`${filePath}.tmp`, `${JSON.stringify({ lastModels: models }, null, 2)}
`, "utf8");
      await rename(`${filePath}.tmp`, filePath);
    }
  };
}

// src/cli.ts
var DEFAULT_LIMITS = { maxDiffBytes: 2e5, maxDiffLines: 6e3, maxFiles: 200 };
var execAsync = promisify(exec);
function parseRunArgs(argv) {
  let models = [];
  let thinking = "medium";
  let baseRef;
  let focus;
  let timeoutSeconds;
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const next = argv[i + 1];
    const value = next !== void 0 && !next.startsWith("--") ? next : void 0;
    if (flag === "--models" && value !== void 0) {
      models = value.split(",").map((m) => m.trim()).filter(Boolean);
      i++;
    } else if (flag === "--thinking" && value !== void 0) {
      thinking = asThinking(value);
      i++;
    } else if (flag === "--base" && value !== void 0) {
      baseRef = value;
      i++;
    } else if (flag === "--focus" && value !== void 0) {
      focus = value;
      i++;
    } else if (flag === "--timeout" && value !== void 0) {
      timeoutSeconds = asTimeoutSeconds(value);
      i++;
    }
  }
  if (models.length === 0) throw new Error("Missing required --models a/b,c/d");
  return {
    models,
    thinking,
    ...baseRef ? { baseRef } : {},
    ...focus ? { focus } : {},
    ...timeoutSeconds !== void 0 ? { timeoutSeconds } : {}
  };
}
function asThinking(value) {
  if (value === "low" || value === "medium" || value === "high") return value;
  throw new Error(`Invalid --thinking value: ${value} (use low|medium|high)`);
}
function asTimeoutSeconds(value) {
  const n = Number(value);
  if (Number.isInteger(n) && n > 0) return n;
  throw new Error(`Invalid --timeout value: ${value} (use a positive integer of seconds)`);
}
function parsePrepArgs(argv) {
  const baseRef = argv.find((arg) => !arg.startsWith("--"));
  return baseRef ? { baseRef } : {};
}
async function runPrepCommand(deps, args) {
  const models = parsePiModels(await deps.shell("pi --list-models"));
  const lastModels = await deps.state.readLastModels();
  const families = orderFamilies(groupModelFamilies(models), lastModels);
  const base = await resolveBaseRef(deps.shell, args.baseRef);
  let diffStat = "";
  let baseRef;
  if (base.ok) {
    diffStat = (await deps.shell(`git diff --stat ${base.mergeBase}..HEAD`)).trim();
    baseRef = { ok: true, ref: base.baseRef, mergeBase: base.mergeBase };
  } else {
    baseRef = { ok: false, message: base.message };
  }
  return JSON.stringify({ baseRef, diffStat, families, lastModels }, null, 2);
}
async function runReviewCommand(deps, args) {
  const support = thinkingSupportMap(parsePiModels(await deps.shell("pi --list-models")));
  const report = await runMultiAiReview({
    runPi: deps.runPi,
    shell: deps.shell,
    models: args.models,
    thinking: args.thinking,
    thinkingSupport: support,
    limits: deps.limits,
    ...args.baseRef ? { baseRef: args.baseRef } : {},
    ...args.focus ? { instructions: args.focus } : {},
    ...deps.saveRawOutput ? { saveRawOutput: deps.saveRawOutput } : {}
  });
  try {
    await deps.state.writeLastModels(args.models);
  } catch {
  }
  return report;
}
async function saveRawReviewerOutput(model, text) {
  const dir = join2(tmpdir(), "multi-ai-review");
  await mkdir2(dir, { recursive: true });
  const file = join2(dir, `${Date.now()}-${model.replaceAll("/", "-")}.txt`);
  await writeFile2(file, text, "utf8");
  return file;
}
async function main(argv) {
  const [command, ...rest] = argv;
  const shell = async (cmd) => (await execAsync(cmd, { maxBuffer: 64 * 1024 * 1024 })).stdout;
  const baseDeps = {
    shell,
    state: createReviewStateStore(),
    limits: DEFAULT_LIMITS
  };
  if (command === "prep") {
    const deps = { ...baseDeps, runPi: createPiRunner() };
    process.stdout.write(await runPrepCommand(deps, parsePrepArgs(rest)));
  } else if (command === "run") {
    const args = parseRunArgs(rest);
    const deps = {
      ...baseDeps,
      runPi: createPiRunner(args.timeoutSeconds ? { timeoutMs: args.timeoutSeconds * 1e3 } : {}),
      saveRawOutput: saveRawReviewerOutput
    };
    process.stdout.write(await runReviewCommand(deps, args));
  } else {
    process.stderr.write(`Unknown command: ${command ?? "(none)"}. Use "prep" or "run".
`);
    process.exitCode = 1;
  }
}
var invokedDirectly = import.meta.url === `file://${process.argv[1]}`;
if (invokedDirectly) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}
`);
    process.exitCode = 1;
  });
}
export {
  main,
  parsePrepArgs,
  parseRunArgs,
  runPrepCommand,
  runReviewCommand
};

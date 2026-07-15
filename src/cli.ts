import { exec } from "node:child_process";
import { promisify } from "node:util";
import { resolveBaseRef } from "./git.js";
import { groupModelFamilies, orderFamilies, parsePiModels, thinkingSupportMap } from "./models.js";
import { createPiRunner } from "./pi.js";
import { runMultiAiReview } from "./review.js";
import { createReviewStateStore } from "./state.js";
import type { DiffLimits, PiRunner, ReviewStateStore, ShellRunner, ThinkingLevel } from "./types.js";

const DEFAULT_LIMITS: DiffLimits = { maxDiffBytes: 200_000, maxDiffLines: 6_000, maxFiles: 200 };
const execAsync = promisify(exec);

export type RunArgs = {
  models: string[];
  thinking: ThinkingLevel;
  baseRef?: string;
  focus?: string;
};

export type CliDeps = {
  shell: ShellRunner;
  runPi: PiRunner;
  state: ReviewStateStore;
  limits: DiffLimits;
};

export function parseRunArgs(argv: string[]): RunArgs {
  let models: string[] = [];
  let thinking: ThinkingLevel = "medium";
  let baseRef: string | undefined;
  let focus: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === "--models" && value !== undefined) {
      models = value.split(",").map((m) => m.trim()).filter(Boolean);
      i++;
    } else if (flag === "--thinking" && value !== undefined) {
      thinking = asThinking(value);
      i++;
    } else if (flag === "--base" && value !== undefined) {
      baseRef = value;
      i++;
    } else if (flag === "--focus" && value !== undefined) {
      focus = value;
      i++;
    }
  }

  if (models.length === 0) throw new Error("Missing required --models a/b,c/d");
  return { models, thinking, ...(baseRef ? { baseRef } : {}), ...(focus ? { focus } : {}) };
}

function asThinking(value: string): ThinkingLevel {
  if (value === "low" || value === "medium" || value === "high") return value;
  throw new Error(`Invalid --thinking value: ${value} (use low|medium|high)`);
}

export function parsePrepArgs(argv: string[]): { baseRef?: string } {
  const baseRef = argv.find((arg) => !arg.startsWith("--"));
  return baseRef ? { baseRef } : {};
}

export async function runPrepCommand(deps: CliDeps, args: { baseRef?: string }): Promise<string> {
  const models = parsePiModels(await deps.shell("pi --list-models"));
  const lastModels = await deps.state.readLastModels();
  const families = orderFamilies(groupModelFamilies(models), lastModels);
  const base = await resolveBaseRef(deps.shell, args.baseRef);

  let diffStat = "";
  let baseRef: unknown;
  if (base.ok) {
    diffStat = (await deps.shell(`git diff --stat ${base.mergeBase}..HEAD`)).trim();
    baseRef = { ok: true, ref: base.baseRef, mergeBase: base.mergeBase };
  } else {
    baseRef = { ok: false, message: base.message };
  }

  return JSON.stringify({ baseRef, diffStat, families, lastModels }, null, 2);
}

export async function runReviewCommand(deps: CliDeps, args: RunArgs): Promise<string> {
  const support = thinkingSupportMap(parsePiModels(await deps.shell("pi --list-models")));

  const report = await runMultiAiReview({
    runPi: deps.runPi,
    shell: deps.shell,
    models: args.models,
    thinking: args.thinking,
    thinkingSupport: support,
    limits: deps.limits,
    ...(args.baseRef ? { baseRef: args.baseRef } : {}),
    ...(args.focus ? { instructions: args.focus } : {}),
  });

  try {
    await deps.state.writeLastModels(args.models);
  } catch {
    // Persisting the lineup is best-effort; never fail the report on it.
  }
  return report;
}

export async function main(argv: string[]): Promise<void> {
  const [command, ...rest] = argv;
  const shell: ShellRunner = async (cmd) => (await execAsync(cmd, { maxBuffer: 64 * 1024 * 1024 })).stdout;
  const deps: CliDeps = {
    shell,
    runPi: createPiRunner(),
    state: createReviewStateStore(),
    limits: DEFAULT_LIMITS,
  };

  if (command === "prep") {
    process.stdout.write(await runPrepCommand(deps, parsePrepArgs(rest)));
  } else if (command === "run") {
    process.stdout.write(await runReviewCommand(deps, parseRunArgs(rest)));
  } else {
    process.stderr.write(`Unknown command: ${command ?? "(none)"}. Use "prep" or "run".\n`);
    process.exitCode = 1;
  }
}

const invokedDirectly = import.meta.url === `file://${process.argv[1]}`;
if (invokedDirectly) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

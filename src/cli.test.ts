import { describe, expect, it } from "vitest";
import { parsePrepArgs, parseRunArgs, runPrepCommand, runReviewCommand } from "./cli.js";
import type { CliDeps } from "./cli.js";
import type { PiRunner, ReviewStateStore, ShellRunner } from "./types.js";

const PI_LIST = `provider      model           context  max-out  thinking  images
openai-codex  gpt-5.6-sol     372K     128K     yes       yes
opencode-go   minimax-m3      1M       131.1K   yes       yes
opencode-go   glm-5.2         1M       131.1K   no        no
`;

function fakeShell(extra: Record<string, string> = {}): ShellRunner {
  const responses: Record<string, string> = {
    "pi --list-models": PI_LIST,
    "git rev-parse --verify origin/main^{commit}": "base\n",
    "git merge-base HEAD origin/main": "merge-base\n",
    "git diff --stat merge-base..HEAD": "src/file.ts | 2 +-\n",
    "git diff --name-status merge-base..HEAD": "M\tsrc/file.ts\n",
    "git diff merge-base..HEAD": "diff --git a/src/file.ts b/src/file.ts\n+x\n",
    ...extra,
  };
  return async (command) => {
    const value = responses[command];
    if (value === undefined) throw new Error(`unexpected command: ${command}`);
    return value;
  };
}

function memoryState(initial: string[] = []): ReviewStateStore {
  let models = initial;
  return {
    readLastModels: async () => models,
    writeLastModels: async (next) => {
      models = next;
    },
  };
}

function deps(overrides: Partial<CliDeps> = {}): CliDeps {
  return {
    shell: fakeShell(),
    runPi: (async ({ model }) => ({ model, ok: true, stdout: "not json" })) as PiRunner,
    state: memoryState(),
    limits: { maxDiffBytes: 1000, maxDiffLines: 100, maxFiles: 10 },
    ...overrides,
  };
}

describe("parseRunArgs", () => {
  it("parses models, thinking, base, and focus", () => {
    expect(
      parseRunArgs(["--models", "a/b,c/d", "--thinking", "high", "--base", "origin/dev", "--focus", "auth and tests"]),
    ).toEqual({ models: ["a/b", "c/d"], thinking: "high", baseRef: "origin/dev", focus: "auth and tests" });
  });

  it("defaults thinking to medium", () => {
    expect(parseRunArgs(["--models", "a/b"])).toEqual({ models: ["a/b"], thinking: "medium" });
  });

  it("throws when models are missing", () => {
    expect(() => parseRunArgs(["--thinking", "low"])).toThrow(/--models/);
  });

  it("throws on an invalid thinking level", () => {
    expect(() => parseRunArgs(["--models", "a/b", "--thinking", "deep"])).toThrow(/thinking/);
  });

  it("does not consume a following flag as a value", () => {
    expect(() => parseRunArgs(["--models", "--thinking", "high"])).toThrow(/--models/);
  });
});

describe("parsePrepArgs", () => {
  it("reads an optional base ref positional", () => {
    expect(parsePrepArgs(["origin/main"])).toEqual({ baseRef: "origin/main" });
    expect(parsePrepArgs([])).toEqual({});
  });
});

describe("runPrepCommand", () => {
  it("emits families ordered with last-used first, plus base ref and diff stat", async () => {
    const out = JSON.parse(
      await runPrepCommand(deps({ state: memoryState(["opencode-go/minimax-m3"]) }), {}),
    );
    expect(out.baseRef).toEqual({ ok: true, ref: "origin/main", mergeBase: "merge-base" });
    expect(out.diffStat).toBe("src/file.ts | 2 +-");
    expect(out.families[0].family).toBe("opencode-go/minimax");
    expect(out.lastModels).toEqual(["opencode-go/minimax-m3"]);
  });

  it("reports a base-ref failure without throwing", async () => {
    const shell = fakeShell({ "git rev-parse --verify origin/main^{commit}": "" });
    const failing: ShellRunner = async (cmd) => {
      if (cmd.startsWith("git rev-parse")) throw new Error("missing");
      return shell(cmd);
    };
    const out = JSON.parse(await runPrepCommand(deps({ shell: failing }), {}));
    expect(out.baseRef.ok).toBe(false);
  });
});

describe("runReviewCommand", () => {
  it("persists the selected lineup after running", async () => {
    const state = memoryState();
    await runReviewCommand(deps({ state }), { models: ["openai-codex/gpt-5.6-sol"], thinking: "medium" });
    await expect(state.readLastModels()).resolves.toEqual(["openai-codex/gpt-5.6-sol"]);
  });

  it("still resolves the report when persisting the lineup fails", async () => {
    const state: ReviewStateStore = {
      readLastModels: async () => [],
      writeLastModels: async () => {
        throw new Error("disk full");
      },
    };
    await expect(
      runReviewCommand(deps({ state }), { models: ["openai-codex/gpt-5.6-sol"], thinking: "medium" }),
    ).resolves.toContain("# Multi-AI Code Review");
  });

  it("gates thinking on pi's reported support", async () => {
    const seen: Array<{ model: string; thinking?: string }> = [];
    const runPi: PiRunner = async ({ model, thinking }) => {
      seen.push({ model, ...(thinking ? { thinking } : {}) });
      return { model, ok: true, stdout: "not json" };
    };
    await runReviewCommand(deps({ runPi }), {
      models: ["opencode-go/glm-5.2", "opencode-go/minimax-m3"],
      thinking: "high",
    });
    expect(seen).toContainEqual({ model: "opencode-go/glm-5.2" }); // glm-5.2 thinking=no
    expect(seen).toContainEqual({ model: "opencode-go/minimax-m3", thinking: "high" });
  });
});

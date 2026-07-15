import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createReviewStateStore } from "./state.js";

async function tempRepo(): Promise<string> {
  return mkdtemp(join(tmpdir(), "multi-ai-review-"));
}

describe("createReviewStateStore", () => {
  it("returns an empty list when state is missing", async () => {
    const store = createReviewStateStore(await tempRepo());

    await expect(store.readLastModels()).resolves.toEqual([]);
  });

  it("writes and reads last models", async () => {
    const directory = await tempRepo();
    const store = createReviewStateStore(directory);

    await store.writeLastModels(["openai/gpt-5.5", "opencode-go/qwen3.7-plus"]);

    await expect(store.readLastModels()).resolves.toEqual([
      "openai/gpt-5.5",
      "opencode-go/qwen3.7-plus",
    ]);
    await expect(readFile(join(directory, ".opencode/multi-ai-review/state.json"), "utf8"))
      .resolves.toContain("lastModels");
    await expect(readFile(join(directory, ".opencode/multi-ai-review/.gitignore"), "utf8"))
      .resolves.toBe("*\n!.gitignore\n");
  });

  it("ignores invalid state", async () => {
    const directory = await tempRepo();
    await mkdir(join(directory, ".opencode/multi-ai-review"), { recursive: true });
    await writeFile(join(directory, ".opencode/multi-ai-review/state.json"), "not json");
    const store = createReviewStateStore(directory);

    await expect(store.readLastModels()).resolves.toEqual([]);
  });
});

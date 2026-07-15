# cc-multi-ai-review

A self-contained Node CLI that powers the Claude Code `/multi-ai-review` skill:
one branch-vs-base code review across several `pi` model families, synthesized
into one deterministic Markdown report.

Running a review sends the full branch diff (up to the configured limits) to
third-party model providers via the `pi` CLI — whichever models you select,
e.g. OpenAI, MiniMax, or Kimi providers. Don't run it on repos whose diffs
must not leave the machine.

## Layout

- `src/` — TypeScript engine (models, git, prompt, findings, report, pi runner, cli).
- `dist/cli.mjs` — bundled zero-dependency CLI (built with esbuild).
- `skill/SKILL.md` — the tracked copy of the skill instructions.

## Build & install

```sh
pnpm install
pnpm build          # esbuild -> dist/cli.mjs
pnpm sync           # copy dist/cli.mjs -> ~/.claude/skills/multi-ai-review/scripts/cli.mjs
                    # and skill/SKILL.md -> ~/.claude/skills/multi-ai-review/SKILL.md
```

## CLI

```sh
node dist/cli.mjs prep [baseRef]
# -> JSON: { baseRef, diffStat, families[], lastModels[] }

node dist/cli.mjs run --models a/b,c/d --thinking medium [--base origin/main] [--focus "auth, data loss"]
# -> Markdown report; records the lineup at ~/.claude/multi-ai-review/state.json
```

## Use (in Claude Code)

```
/multi-ai-review
/multi-ai-review origin/main
/multi-ai-review origin/main focus on auth, data loss, and missing tests
```

The skill runs `prep`, asks which models + thinking level via `AskUserQuestion`
(offering your last lineup first), runs the review, then ground-truths the
actionable findings before presenting them.

## Test

```sh
pnpm test:run
pnpm typecheck
```

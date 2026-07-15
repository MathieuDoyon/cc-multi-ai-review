# cc-multi-ai-review

A Claude Code plugin providing the `/multi-ai-review` skill: one branch-vs-base
code review across several [`pi`](https://github.com/badlogic/pi-mono) model
families, run in parallel and synthesized into one deterministic Markdown
report. Claude then ground-truths the actionable findings before presenting
them.

> **Data egress**: running a review sends the full branch diff (up to the
> configured limits) to third-party model providers via the `pi` CLI —
> whichever models you select, e.g. OpenAI, MiniMax, or Kimi providers. Don't
> run it on repos whose diffs must not leave the machine.

## Install

Prerequisite: the [`pi`](https://github.com/badlogic/pi-mono) CLI must be
installed and configured with provider API keys.

In Claude Code:

```
/plugin marketplace add MathieuDoyon/cc-multi-ai-review
/plugin install multi-ai-review@cc-multi-ai-review
```

Updates: `/plugin marketplace update cc-multi-ai-review` (or manage everything
from the `/plugin` menu).

> If you previously installed the skill manually into
> `~/.claude/skills/multi-ai-review`, remove that copy to avoid duplicates.

## Use

```
/multi-ai-review
/multi-ai-review origin/main
/multi-ai-review origin/main focus on auth, data loss, and missing tests
```

The skill runs `prep`, asks which models + thinking level via `AskUserQuestion`
(offering your last lineup first), runs the review, then ground-truths the
actionable findings before presenting them.

## Layout

- `src/` — TypeScript engine (models, git, prompt, findings, report, pi runner, cli).
- `skills/multi-ai-review/SKILL.md` — the skill instructions.
- `skills/multi-ai-review/scripts/cli.mjs` — bundled zero-dependency CLI
  (committed build output, built with esbuild).
- `.claude-plugin/` — plugin + self-hosted marketplace manifests.

## Development

```sh
pnpm install
pnpm build          # esbuild -> skills/multi-ai-review/scripts/cli.mjs
pnpm test:run
pnpm typecheck
```

The built `cli.mjs` is committed so the plugin works straight from a git
install; CI fails if it drifts from `src/`. Rebuild and commit it whenever the
engine changes.

`pnpm sync` copies the skill into `~/.claude/skills/multi-ai-review` for local
testing without the plugin flow.

### CLI (standalone)

```sh
node skills/multi-ai-review/scripts/cli.mjs prep [baseRef]
# -> JSON: { baseRef, diffStat, families[], lastModels[] }

node skills/multi-ai-review/scripts/cli.mjs run --models a/b,c/d --thinking medium \
  [--base origin/main] [--focus "auth, data loss"] [--timeout 480]
# -> Markdown report; records the lineup at ~/.claude/multi-ai-review/state.json
```

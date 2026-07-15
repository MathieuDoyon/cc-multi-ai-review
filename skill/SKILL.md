---
name: multi-ai-review
description: >-
  Adversarial multi-AI peer review of a code change via the pi CLI across
  diverse model families, with interactive model selection (AskUserQuestion),
  selectable thinking level, base-ref override, extra focus, and a remembered
  last-used lineup. Use when the user asks for a "multi-AI review", "cross-AI
  review", "peer review", "review with pi / multiple models", or wants an
  independent second/third opinion on a diff, PR, or commit before merging.
---

# Multi-AI Peer Review (pi, engine-backed)

This skill drives a bundled Node CLI at `scripts/cli.mjs` that discovers pi
models, runs the selected ones in parallel forcing a JSON schema, and returns a
deterministic Markdown report. Claude then **ground-truths** the actionable
findings before presenting them.

Set the CLI path once:

```bash
DIR="$HOME/.claude/skills/multi-ai-review"
```

## Procedure

### 1. Parse invocation args

Invocation may include a base ref and/or extra focus:
`/multi-ai-review [baseRef] [focus text…]`.
- A token that looks like a git ref (contains `/` such as `origin/main`, or is a
  bare `main`/`master`/tag) → `baseRef`.
- All remaining words → `focus`.
Either may be absent.

### 2. Run prep

```bash
node "$DIR/scripts/cli.mjs" prep <baseRef-if-any>
```
Read the JSON: `families` (ordered — last-used first, then GPT/MiniMax/Kimi,
then the rest; each has `family`, `flagship`, `variants`, `thinking`),
`lastModels`, `baseRef` (`ok` + `ref`/`mergeBase`, or `ok:false` + `message`),
and `diffStat`.

### 3. Ask the user (AskUserQuestion)

Make a single `AskUserQuestion` call:

- **Q1 "Which models should review this?" (multiSelect: true).**
  Options = the flagship of each of the **first up to 4** families from `prep`.
  - Label each `Family (flagship-id)`, e.g. `GPT (openai-codex/gpt-5.6-terra)`.
  - For families whose flagship appears in `lastModels`, order them first and
    append ` · last` to the label. (AskUserQuestion cannot pre-check options, so
    surfacing them first + labeled is how "remember last" shows up.)
  - The auto-provided **Other** lets the user type exact model IDs or family
    names not shown; map that text to concrete IDs using the `prep` `families`
    list (a family name → its `flagship`; an exact `provider/model` → itself).
- **Q2 "Thinking level?" (single-select).** Options: `medium (Recommended)`,
  `high`, `low`.
- **Q3 "Base ref?"** — include **only if** `prep` returned `baseRef.ok:false`.
  Options: `origin/main`, `origin/master`, `main`, `master`, plus **Other**.
  If `prep` succeeded, do not ask; instead state the detected ref
  (`baseRef.ref`) and `diffStat` in your preamble.

### 4. Resolve selections to model IDs

Turn the selected family labels (and any "Other" text) into an exact
comma-separated list of `provider/model` IDs. Never pass a label — only IDs.

### 5. Run the review

```bash
node "$DIR/scripts/cli.mjs" run \
  --models <csv-of-ids> \
  --thinking <low|medium|high> \
  [--base <ref>] \
  [--focus "<focus text>"] \
  [--timeout <seconds>]
```
This prints the deterministic report (findings table with severity, confidence,
consensus models, location, recommendation, action; a "Do Not Address Yet"
section; and any reviewer failures) and records the lineup globally for next
time. Run it with `run_in_background: true` if you want to keep working; it
typically takes 1–3 minutes for three models. Large diffs may need a higher
timeout (default 240s), e.g. `--timeout 480`.

### 6. Ground-truth, then present

Reviewers hallucinate. Before presenting, verify every finding actioned
`address` or `investigate` against the actual code and tools:
- type claims → `tsc --noEmit` (a green `vite`/`esbuild` build does NOT type-check);
- behavior claims → read the cited file / run the relevant test.
Downgrade false positives with a one-line rationale. Present the report plus your
triage. Optionally apply the confirmed fixes, re-run the project gates
(lint/type-check/tests/build), and — for a PR — post a short summary comment with
the lineup, verdicts, and what was addressed vs. ignored.

## Notes

- The CLI forces each model into one fenced-JSON block; a non-compliant model
  degrades to a "Reviewer Failures" row rather than breaking the run.
- Model discovery is at runtime (`pi --list-models`); versions are never
  hardcoded. Keep family diversity — don't pick three variants of one family.
- Rebuild + resync the CLI after changing the engine:
  `cd ~/Developer/cc-multi-ai-review && pnpm build && pnpm sync`.
- Data egress: running a review sends the full branch diff (up to the
  configured limits) to third-party model providers via the `pi` CLI — the
  models you select, e.g. OpenAI, MiniMax, or Kimi providers. Don't run this
  skill on repos whose diffs must not leave the machine.

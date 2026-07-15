# opencode-multi-ai-review

Reusable opencode plugin for running one branch code review across multiple selected models and returning one synthesized Markdown report.

## Install from npm

Install the plugin into the current project's opencode config:

```sh
opencode plugin opencode-multi-ai-review
```

To install it globally instead:

```sh
opencode plugin --global opencode-multi-ai-review
```

You can also add it manually to your opencode config:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-multi-ai-review"]
}
```

Command registration is automatic. The runtime command template comes from `src/command.ts`; `commands/multi-review.md` is shipped as a packaged readable reference, so npm users do not need to copy a command file into each project.

Restart opencode after changing plugin or command configuration.

## Install from a local clone

For local development from a clone, build this package and point opencode at the local plugin file:

```sh
cd /absolute/path/to/opencode-multi-ai-review
pnpm install
pnpm build
```

Then configure the plugin with an absolute file URL:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["file:///absolute/path/to/opencode-multi-ai-review/dist/index.js"]
}
```

Command registration is automatic for local development too. Rebuild the plugin after changing the runtime command template in `src/command.ts` or other TypeScript source. `commands/multi-review.md` is a packaged readable reference and should stay aligned with the runtime template.

Restart opencode after changing plugin or command configuration.

## Use

Run the command in opencode:

```text
/multi-review
```

The command runs `opencode models`, offers the previous model selection from `.opencode/multi-ai-review/state.json` when available, asks which models to use through the built-in `question` tool, then calls `multi_ai_code_review`.

The plugin writes `.opencode/multi-ai-review/.gitignore` next to the generated state so `state.json` stays local and is not accidentally committed.

To override the auto-detected base ref:

```text
/multi-review origin/main
```

To add extra focus:

```text
/multi-review origin/main focus on auth, data loss, and missing tests
```

## Output

The final report includes:

- a findings table with severity, confidence, models, location, recommendation, and action;
- a `Do Not Address Yet` section for likely false positives;
- reviewer failures when a selected model fails or returns unparseable JSON;
- a partial-review notice when the diff is truncated.

## Options

Plugin options can be provided with opencode's tuple plugin config form:

```json
{
  "plugin": [
    ["opencode-multi-ai-review", {
      "maxDiffBytes": 200000,
      "maxDiffLines": 6000,
      "maxFiles": 200
    }]
  ]
}
```

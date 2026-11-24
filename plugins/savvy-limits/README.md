# savvy-limits

A Claude Code mod that tracks your Claude Code and Gemini (Antigravity) 5-hour and weekly limits, tells the [savvy-flow](../savvy-flow) orchestrator how to split work between them, and runs Gemini workers.

- **Telemetry band**: 5-hour and weekly meters for both providers above the prompt, with a status badge and reset countdowns. The terminal gets a one-line version.
- **`/limits`**: pace, reset times and the provider for each work track. `/limits refresh` re-reads Gemini now, and `/limits hide` or `/limits show` toggles the row.
- **`mcp__savvy-limits__limits`**: the same data for the orchestrator.
- **Gemini workers**: `bin/gemini-worker.mjs` checks quota, picks a model by track and size, runs `agy` in its own git worktree (or an existing `--worktree` / `--in-place` checkout), optionally grants scoped build/test/commit commands and extra paths from a per-project profile (`.savvy/gemini.json`), supports `resume <run-id>` to continue the same `agy` conversation, logs every streaming event, and reports to the savvy-progress panel. The `savvy-gemini` skill uses it outside the flow.
- **Gemini images**: `bin/gemini-image.mjs` makes images from a prompt, with optional reference images, through Antigravity's image generator on a cheap driver model, without a worktree. It retries Gemini capacity outages and can fall back to a gpt-image skill. It uses only Node built-ins, so it can also be copied into `~/.claude/skills` as a standalone skill.

## How work is split

| Track | Default | Why |
|-------|---------|-----|
| `mechanical`, `design`, `review` | Gemini | Saves Claude quota for orchestration and review |
| `code` | Claude (or Gemini with `.savvy/gemini.json`) | Needs running builds/tests; Gemini Neon can take `code` tasks end-to-end when the project configures a scoped command profile |
| `hard` | Claude | Hard judgment stays on Claude |
| `test` | Claude, always | Independent verification (`savvy-tester`) stays separate from the implementing worker |
| `media` | Gemini, always | Claude cannot generate images or read video and audio |

## Project profiles (`.savvy/gemini.json`)

Without `--profile`, Gemini workers run without terminal access. Add `<project>/.savvy/gemini.json` and pass `--profile default` (or `--profile <path>`) to grant scoped commands, external paths, localhost access, and long build timeouts without using `--dangerously-skip-permissions`:

```json
{
  "allowCommands": [
    "powershell ./Tools/build.ps1",
    "./Tools/test.ps1*",
    "./Tools/mp-smoke.ps1*",
    "git status",
    "git diff",
    "git log",
    "git add",
    "git commit"
  ],
  "denyCommands": ["git push", "rm -rf"],
  "readPaths": ["C:/Program Files/Epic Games/UE_5.8/Engine/Source"],
  "writePaths": ["%LOCALAPPDATA%/UnrealBuildTool", "%LOCALAPPDATA%/UnrealEngine"],
  "allowLocalhost": true,
  "commandTimeoutMin": 25,
  "timeoutMin": 60
}
```

Exit codes: `0` done, `1` failed/timeout, `2` bad usage/config, `3` quota blocked/exhausted, `4` slots busy, `5` permission denied, `6` command failure.

Capacity can then move work. A provider whose quota would expire unused is spent first, a low provider hands routine work to the other, and a blocked or unreadable provider gets none. `hard` leaves Claude only when Claude is blocked, and Claude keeps 40% of its 5-hour quota for orchestration and review. Argon runs only when you name it. Model ladders are starting estimates, because Google publishes no per-model quota costs.

A `media` run copies its generated images into its worktree, so they go through review like any other change. For images alone, `gemini-image.mjs` is faster and uses far less quota: a full worker spent about 3% of the 5-hour quota on a run that made no images, while `gemini-image.mjs` reports a capacity outage within about 15 seconds. Antigravity makes images with Nano Banana 2, which cannot be switched to another image model here. These workers do not generate video.

## Where the numbers come from

- **Claude**: `$.session.usage()`, the same rate-limit figures the status line gets. They appear on claude.ai subscriptions after a session's first response.
- **Gemini**: `agy -p /usage` from the official CLI. An active session reads it every 5 minutes by default (the `geminiPollMinutes` setting), and open sessions share the reading.

## Requirements and risk

Gemini needs the [Antigravity CLI](https://antigravity.google/docs/getting-started/) installed and signed in. Without it, Claude is still tracked and all work stays on Claude.

Google's [Antigravity terms](https://antigravity.google/terms) ban using third-party tools to access the service and warn of suspension. They do not say whether another program may launch the official CLI, which Google documents for headless use. This plugin only launches `agy`, never reads or reuses its login tokens, never skips its permission checks, and forces paid AI credits off. Decide for yourself whether that risk is acceptable for your account.

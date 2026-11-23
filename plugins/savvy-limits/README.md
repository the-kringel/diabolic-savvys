# savvy-limits

A Claude Code mod that tracks your Claude Code and Gemini (Antigravity) 5-hour and weekly limits, tells the [savvy-flow](../savvy-flow) orchestrator how to split work between them, and runs Gemini workers.

- **Telemetry band**: 5-hour and weekly meters for both providers above the prompt, with a status badge and reset countdowns. The terminal gets a one-line version.
- **`/limits`**: pace, reset times and the provider for each work track. `/limits refresh` re-reads Gemini now, and `/limits hide` or `/limits show` toggles the row.
- **`mcp__savvy-limits__limits`**: the same data for the orchestrator.
- **Gemini workers**: `bin/gemini-worker.mjs` checks quota, picks a model by track and size, runs `agy` in its own git worktree, and reports to the savvy-progress panel. The `savvy-gemini` skill uses it outside the flow.

## How work is split

| Track | Default | Why |
|-------|---------|-----|
| `mechanical`, `design`, `review` | Gemini | Saves Claude quota for orchestration and review |
| `code`, `hard` | Claude | Code usually needs to run, and hard judgment stays on Claude |
| `test` | Claude, always | Gemini workers have no terminal |
| `media` | Gemini, always | Claude cannot generate images or read video and audio |

Capacity can then move work. A provider whose quota would expire unused is spent first, a low provider hands routine work to the other, and a blocked or unreadable provider gets none. `hard` leaves Claude only when Claude is blocked, and Claude keeps 40% of its 5-hour quota for orchestration and review. Argon runs only when you name it. Model ladders are starting estimates, because Google publishes no per-model quota costs.

A `media` run copies its generated images into its worktree, so they go through review like any other change. Antigravity makes images with Nano Banana 2, which cannot be switched to another image model here. These workers do not generate video.

## Where the numbers come from

- **Claude**: `$.session.usage()`, the same rate-limit figures the status line gets. They appear on claude.ai subscriptions after a session's first response.
- **Gemini**: `agy -p /usage` from the official CLI. An active session reads it every 5 minutes by default (the `geminiPollMinutes` setting), and open sessions share the reading.

## Requirements and risk

Gemini needs the [Antigravity CLI](https://antigravity.google/docs/getting-started/) installed and signed in. Without it, Claude is still tracked and all work stays on Claude.

Google's [Antigravity terms](https://antigravity.google/terms) ban using third-party tools to access the service and warn of suspension. They do not say whether another program may launch the official CLI, which Google documents for headless use. This plugin only launches `agy`, never reads or reuses its login tokens, never skips its permission checks, and forces paid AI credits off. Decide for yourself whether that risk is acceptable for your account.

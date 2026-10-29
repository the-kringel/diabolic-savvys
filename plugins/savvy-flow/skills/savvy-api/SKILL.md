---
name: savvy-api
description: Run savvy-flow workers (and any delegated subagent work) on API credit instead of the subscription, falling back to normal subagents when the credit runs out. Use when the user says to use API credit, "savvy-api", or turns it on for a session.
---

# savvy-api: workers on API credit

While this skill is active, every task you would delegate with the Agent tool to a `savvy-*` worker (or a general-purpose subagent doing write work) runs instead as a headless `claude -p` billed to the API key in `SAVVY_API_KEY`. When the credit is gone, go back to the Agent tool for the rest of the session: nothing else changes.

The runner is `api-worker.mjs` in this skill's base directory (shown above as "Base directory for this skill"). Call it as `node "<base>/api-worker.mjs" ...`.

## Before the first delegation

Run `node "<base>/api-worker.mjs" --check` once:
- exit 0: API mode is on.
- exit 2: `SAVVY_API_KEY` is not set. Tell the user in one line (they set it in `env` of `~/.claude/settings.json`; never ask them to paste the key in chat) and use normal subagents.
- exit 3: credit ran out within the last 6 hours. Use normal subagents, say so in one line.

## Delegating one task

1. Write the brief exactly as you would for the Agent tool to a file in your scratchpad (`brief-<n>.md`). The worker cannot see this conversation: the brief must stand alone.
2. Run it in the background (Bash `run_in_background: true`), one call per task; independent tasks in parallel:
   ```
   node "<base>/api-worker.mjs" --tier <medium|careful|light|heavy|fable|swarm|tester> --title "<task title>" --brief-file "<brief file>" --cwd "<project dir>"
   ```
   - `--title` is the task's title verbatim, as for the Agent tool's `description`: the agents panel matches it to the planned task.
   - Optional: `--permission-mode <mode>` (default `acceptEdits`; Bash commands outside the allow-list are denied in headless mode, so give `bypassPermissions` only when the user said so), `--max-budget-usd <n>`.
3. You are woken when it exits. Its output is the worker's final report, then a line `[api-worker <id>: done|failed|NO_CREDIT, $cost, seconds]`. Review it like any worker report.

## When the credit runs out

Exit code 3 / `NO_CREDIT` means the API refused for billing. Then:
- Re-run that same task with the Agent tool (same `subagent_type` tier, same brief, same `description`).
- Use the Agent tool for every later task in this session; don't call the runner again. Tell the user in one line.
A plain failure (exit 1) is not a credit problem: handle it as a failed worker (retry or escalate the tier), still via the runner.

## Watching them

Each run keeps `<project>/.claude/api-workers/<id>.json` up to date: status, model, start/end time, tokens, cost, and the current action (last tool call). With the savvy-progress mod loaded, these rows show in the agents panel (`/agents-info`) next to normal subagents, marked as API workers. Without it, read the files when the user asks how they are doing. Report `mcp__savvy-progress__progress` for the flow as usual.

Add `.claude/api-workers/` to the project's `.gitignore` if it is not ignored yet.

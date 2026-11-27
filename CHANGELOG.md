# Changelog

## 1.8.0 — 2026-11-27

### savvy-flow 1.7.0

Tier rules retuned after measuring 59 real flow sessions: workers took 86% of the spend, Careful ran more often than the Medium default, `savvy-swarm` never ran, and with an Opus orchestrator the Opus workers saved nothing on price.

- Fully specified tasks (exact files, behaviour, edge cases, the check that proves them done) now default to `savvy-swarm` (Sonnet / medium), alone or in parallel waves. Work that needs judgment stays on Medium.
- Careful runs only on a named trigger: an invariant across files or releases, concurrency or ordering, a refactor across several modules, security or data-loss risk, or a bug whose cause is unclear. The plan shows the trigger. Unsure with no trigger now means Medium instead of Careful.
- Bugs with an unclear cause split into a Careful investigation and a Swarm or Medium fix.
- The orchestrator's own model sets the lane: on Fable, cheaper workers save on price; on Opus, delegation is for parallel work and a clean context, and Fable workers run only on request.
- The escalation ladder starts at Swarm: Swarm → Medium → Careful → Heavy → Fable.

## 1.7.3 — 2026-11-24

### savvy-limits 0.3.1

- `gemini-worker.mjs discard <id>` no longer fails when the run's worktree or branch is already gone. Runs in a `resume` chain share one worktree and branch, so discarding one of them used to make `discard` on the others exit 1 with "is not a working tree".

## 1.7.2 — 2026-11-24

### savvy-limits 0.3.0

- Extended `bin/gemini-worker.mjs` (plus new `lib/worker-config.mjs` and `bin/gemini-worker.test.mjs`) so Gemini Neon workers can carry coding tasks end-to-end — edit, run scoped build/test commands, fix errors, commit, and resume — without `--dangerously-skip-permissions`.
- Per-project profiles (`<project>/.savvy/gemini.json`, selected with `--profile default` or `--profile <path|name>`) configure scoped `allowCommands` / `denyCommands`, external `readPaths` and cache `writePaths` (with `%VAR%`, `${VAR}`, and `~` expansion), `allowLocalhost`, and `commandTimeoutMin` / `timeoutMin`. Blanket wildcard allow rules are rejected.
- Added `--worktree <path>` and `--in-place` to run directly inside an existing checkout/branch (preserving uncommitted or mid-merge state) while keeping fresh managed worktrees as the default. `apply` and `discard` refuse unmanaged checkouts.
- Added `resume <run-id> --brief-file <followup>` using `agy --conversation <id>` to continue the same agent conversation in the same worktree/checkout with per-turn token deltas (`turnUsage`).
- Enriched JSON results with `commit`, `head`, `commits`, `commands`, `deniedActions`, `eventLog` (`runs/<id>.events.jsonl`), and distinct exit codes (`3` quota, `4` slots busy, `5` permission denied, `6` command failure).

### savvy-flow 1.6.4

- Updated Capacity, Tiering, and section 4b so the orchestrator knows when a Gemini Neon worker with `<project>/.savvy/gemini.json` may take `code` tasks that run scoped builds/tests and commit, and prefers `resume <id>` for return rounds.

## 1.7.1 — 2026-11-24

### savvy-limits 0.2.0

- New `bin/gemini-image.mjs` makes images through Antigravity's image generator (Nano Banana 2) with your Google AI Pro login. It uses a cheap driver model in a throwaway folder and needs no worktree or brief. It accepts reference images, returns the real file type (usually JPEG), retries Gemini capacity outages (HTTP 503), and falls back to a gpt-image skill if one is installed (`--fallback none` turns this off).
- The limits tool also returns `geminiImage`, the image runner's path.
- A `media` worker run that makes no images now warns about it, and names the capacity outage when that was the cause. agy reported these runs as successes.

### savvy-flow 1.6.3

- Tasks that only make images go to `geminiImage` instead of a full Gemini worker.

## 1.7.0 — 2026-11-23

### savvy-progress 1.7.0

- Seven new Gemini heroes. Hydrogen is a water crew: the Raindrop Scout (low), Wave Rider (medium), Deep Diver (high) and Tide King (xhigh). Argon is a lab: the Lab Assistant (low), Chemist (medium) and Plasma Professor (high).
- Gemini models without a hero, such as Flash, still wear the Necromancer's robe.

### savvy-limits 0.1.2

- Routing no longer picks Gemini Flash. The lowest mechanical rung is now Hydrogen low.

### savvy-flow 1.6.2

- The plan can name Hydrogen and Argon heroes for Gemini tasks, so planned rows show the right hero.

### Docs

- New Hydrogen and Argon lineup images.

## 1.6.1 — 2026-11-23

### savvy-limits 0.1.1

- Routing puts task fit first. `code` now starts on Claude because Gemini workers cannot run it, and `hard` leaves Claude only when Claude is blocked.
- Claude keeps 40% of its 5-hour quota for orchestration and review. Below that, routine work moves to Gemini, even when Claude's weekly quota is about to expire.
- Gemini model choices: Hydrogen replaces Flash for most mechanical work, and Neon xhigh replaces Argon at the top of `review` and `hard`. Argon runs only when a task names it.
- New `media` track for generating images and reading video or audio, always on Gemini. Generated images are copied from Antigravity's artifacts into the run's worktree, so they appear in its diff.

### savvy-flow 1.6.1

- Side sessions pin their tier's model instead of inheriting the orchestrator's, so a Medium task under Fable runs on Opus.
- Workers can no longer start subagents or side sessions, including workers run through `savvy-api`.
- Image generation and video or audio reading go to Gemini, and wait rather than fall back to Claude when Gemini is unavailable.
- `savvy-tester` runs at high effort. Sonnet at medium scored about 7 points lower on Anthropic's SWE-bench Pro subset.

### savvy-progress 1.6.1

- Claude Fable 5.2 costs use its real prices ($8 input, $40 output, $0.20 cache read, $16 cache write). The panel was using Fable 5's.
- Planned Tester tasks show high effort.

## 1.6.0 — 2026-11-23

### savvy-limits 0.1.0 (new)

- A telemetry band above the prompt with Claude and Gemini 5-hour and weekly meters, status badges and reset countdowns, in light and dark, and `/limits` for pace, reset times and the provider per track.
- `mcp__savvy-limits__limits` gives the orchestrator both providers' capacity and a recommended provider for each work track.
- Gemini workers through the official `agy` CLI: quota check, model routing, an isolated git worktree, denied-action detection, a two-worker limit, and paid AI credits forced off.

### savvy-flow

- New Capacity section: with savvy-limits installed, the orchestrator reads both providers' limits before planning and before each wave, and assigns each task a provider.
- New section 4b: Gemini workers for self-contained file edits, read-only reviews and bounded design tracks. Planning, design decisions and final review stay on Claude.

### savvy-progress

- Gemini workers show in the agents panel with their model, steps and tokens.
- Four new heroes for Gemini Neon, dressed for a 90s techno rave: the Glowstick Kid (low), Acid Raver (medium), Vinyl DJ (high) and Laser Boss (xhigh). Other Gemini models wear the Necromancer's robe.

### Docs

- The README and plugin catalog now describe multi-model orchestration: how work is routed between Claude and Gemini, its guardrails, the Neon ravers, and the Gemini account risk.
- The lineup image has a fixed dark stage with readable captions on GitHub's light and dark themes, and a new Neon lineup image joins it.

## savvy-progress 1.5.2 — 2026-11-16

- The agents panel stayed blank in a long session even with 1.5.1 loaded. Every worker and planned task was its own hero drawing of 12 to 19 KB, so a panel with a dozen workers was a drawing of about 280 KB. Only the first 8 rows (running workers first, then the newest finished, then the next planned tasks) get a hero now; the rest are one line of text. Whether the size was what the desktop app refused is not confirmed.
- New pane log: each desktop session writes what it asked for and got (panel opens and their answers, the app attaching and detaching, closes, and each new shape of the drawing with its size) to `~/.claude/savvy-progress/pane-log/<session id>.jsonl`, the last 300 entries. A blank panel can now be diagnosed from that file.

## savvy-progress 1.5.1 — 2026-11-16

- Fix: the agents panel no longer stays blank ("Nothing to show yet") while the progress bar still works. The panel was opened once per flow and never again, so when Claude Code dropped it (the session resumed in a new process, the plugins reloaded, the hooks worker restarted, or its drawing failed once) the app kept an empty tab until the flow was renamed. The panel is now opened and drawn again from the session's saved state when the session starts, when the app shows the session again, and by a 10-second check while it runs; no `progress` or `step` call is needed.
- A panel you closed yourself (its close mark, `/agents-info`, the `×N` button) stays closed until you open it again.

## 1.5.0 — 2026-11-11

Both plugins: session mode. See [docs/SESSION-MODE.md](docs/SESSION-MODE.md).

### savvy-flow

- Fix: the `savvy-swarm` and `savvy-tester` agent files had frontmatter that did not parse (an unquoted `: ` in the description), so both loaded without their `model` and `effort` and ran on the default model instead of Sonnet / medium. Their descriptions are quoted now.
- Session mode (section 4a): in the desktop app a deliverable can run as its own side session. The plan names each task's kind; sessions get their tier's model and effort, never above the orchestrator's; at most 4 run at once; questions come to the orchestrator's decision box, permission prompts stay in the session; the main chat gets one line per event.
- Cleanup after merge: the orchestrator archives a merged session, removes its worktree and deletes its fully merged branch locally and on the remote.

### savvy-progress

- The progress bar leaves room for its `×N` button and dismiss: the dismiss was cut off at the right edge on the desktop.
- The progress bar counts the workers it sees, so it no longer shows `0/0` or "0 running" while background workers run.
- Side sessions as workers: same heroes as subagents, a `session` / `subagent` label, found even when started from a clicked card.
- The raised hand: a waving hand, a ✋ title, an amber reason and one notification while a side session waits on a permission dialog or a question.
- Worker titles are click targets (a session opens in the app, a subagent's transcript opens); hovering the row lights the title.
- Time left per worker, a warning for workers with no progress for over 10 minutes, and cost, tokens and context for side sessions.
- The `progress` tool takes the `swarm` and `tester` tiers for planned tasks.
- Side sessions are tracked through a section in the orchestrator's system prompt, which asks it to end each brief with a parent line; the `start_session` call is never rewritten, so auto mode accepts it on the first try.

## savvy-flow 1.4.1 — 2026-11-06

- `savvy-api`: a locked status file (Windows `EPERM` on rename) no longer crashes the worker: it retries the rename briefly, then writes in place, then skips that update.
- `savvy-api`: when `SAVVY_API_KEY` is missing, the skill now tells you to set it as an environment variable for your user account instead of in `~/.claude/settings.json`.

## 1.3.0 — 2026-10-27

First release of diabolic-savvys, forked from [johnnyvizz/claude-kit](https://github.com/johnnyvizz/claude-kit) (`savvy-flow` 1.2.0, `savvy-progress` 1.2.1).

### savvy-flow

- Tiering leans on Opus / medium: Medium is the default tier and Careful (Opus / high) the normal ceiling, including for bugs. Heavy and Fable become exception tiers, used only after a failure one tier below or on the user's request.
- Escalation on a returned task goes one tier at a time.
- Unclear root causes start on Careful instead of Heavy.
- New agent `savvy-swarm` (Sonnet 5.5 / medium) and a "Swarming" section: parallel waves of narrow, file-disjoint tasks.
- New agent `savvy-tester` (Sonnet 5.5 / medium): independent testing in the review step.

### savvy-progress

- New tiers `swarm` and `tester` with their own colors and model labels.
- New heroes: Desert Mercenary for `savvy-swarm`, Deckard Cain for `savvy-tester`.

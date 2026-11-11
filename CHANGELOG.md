# Changelog

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

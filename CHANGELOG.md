# Changelog

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

# savvy-flow

An orchestrated delivery flow for Claude Code. Run `/savvy-flow <task>` (`/savvy-flow:savvy-flow` when installed as a plugin): the session model plans, owns design, delegates implementation to tiered worker subagents and adversarially reviews what they return.

## What ships

- **Skill** `savvy-flow`: the orchestrator's playbook ([SKILL.md](skills/savvy-flow/SKILL.md)).
- **Agents**, cheapest that gets the task right first time:

  | Agent | Hero | Model / effort | For |
  | --- | --- | --- | --- |
  | `savvy-medium` | Barbarian | Opus / medium | **default**: standard feature work, bugs with a known cause |
  | `savvy-careful` | Paladin | Opus / high | **normal ceiling**: delicate changes, unclear bugs, investigations |
  | `savvy-light` | Assassin | Opus / low | mechanical edits, config, builds, tests |
  | `savvy-swarm` | Desert Mercenary | Sonnet / medium | narrow, fully specified tasks in parallel waves |
  | `savvy-tester` | Deckard Cain | Sonnet / medium | independent testing of another worker's change |
  | `savvy-heavy` | Druid | Opus / xhigh | exception: after Careful failed, or on request |
  | `savvy-fable` | Sorceress | Fable / high | exception: after Heavy failed, or on request; design features on request |

## How the orchestrator picks a tier

- No clear reason to go lower or higher → **Medium**.
- Unsure between Medium and Careful → Careful. Never go above Careful just because of uncertainty.
- Bugs: known cause → Medium; unclear cause or delicate fix → Careful.
- A task that fails review twice moves **one tier up**: Medium → Careful → Heavy → Fable.

## Swarming

When a feature splits into many small, independent pieces, the orchestrator settles the shared parts first (interfaces, types, config), then sends `savvy-swarm` workers out in one wave of about 3–8, each with its own files and an exact definition of done. Testers can swarm the same way, one per area. Each wave is reviewed before the next starts, and the full build and test suite runs once after it.

## Testing

For non-trivial changes, `savvy-tester` runs after the implementing worker returns. It never tests its own code (it writes none) and never fixes product code: its failures, with repro steps, go back as the defect list.

## Session mode (desktop app)

In the Claude Code desktop app the orchestrator can run a task as its own **side session** instead of a subagent: a session for each deliverable (a branch, a PR, an asset), a subagent for each question (research, review, tests). The plan says which tasks run as sessions; your go-ahead on the plan starts them.

- Each session gets the model and effort of its tier, never above the orchestrator's own: Medium runs at medium effort, Careful at high, Light at low, Swarm and Tester on Sonnet.
- At most 4 sessions run at once; the rest wait their turn.
- While sessions run, the main chat gets one line per event (`▶` started, `✓` done, `✋` needs you). A question from a session comes to the orchestrator's decision box; answer it there or in the session itself. Permission prompts are answered in the session.
- Once a session's PR is merged, the orchestrator archives the session, removes its worktree, and deletes its branch locally and on GitHub, only when the branch is fully merged and was created by the flow.

With savvy-progress installed, side sessions show in the agents panel like subagents: same heroes, a raised hand while one waits for you, and a title you click to open the session. The design is in [docs/SESSION-MODE.md](../../docs/SESSION-MODE.md).

## With savvy-progress

The skill and the agents run fine alone. With the [savvy-progress](../savvy-progress) mod installed, the orchestrator reports the plan and accepted tasks to a progress bar above the prompt, and each worker reports its own steps to the agents panel. Without the mod those calls are skipped.

Install instructions are in the [repository README](../../README.md).

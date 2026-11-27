# savvy-flow

An orchestrated delivery flow for Claude Code. Run `/savvy-flow <task>` (`/savvy-flow:savvy-flow` when installed as a plugin): the session model plans, owns design, delegates implementation to tiered worker subagents and adversarially reviews what they return.

## What ships

- **Skill** `savvy-flow`: the orchestrator's playbook ([SKILL.md](skills/savvy-flow/SKILL.md)).
- **Agents**, cheapest that gets the task right first time:

  | Agent | Hero | Model / effort | For |
  | --- | --- | --- | --- |
  | `savvy-medium` | Barbarian | Opus / medium | **default** for work that needs judgment: standard features, bugs with a known cause |
  | `savvy-careful` | Paladin | Opus / high | **only on a named trigger**: cross-file invariants, concurrency, multi-module refactors, security or data-loss risk, unclear bugs |
  | `savvy-light` | Assassin | Opus / low | mechanical edits, config, builds, tests |
  | `savvy-swarm` | Desert Mercenary | Sonnet / medium | **default** for fully specified tasks, alone or in parallel waves |
  | `savvy-tester` | Deckard Cain | Sonnet / high | independent testing of another worker's change |
  | `savvy-heavy` | Druid | Opus / xhigh | exception: after Careful failed, or on request |
  | `savvy-fable` | Sorceress | Fable / high | exception: after Heavy failed, or on request; design features on request |

## How the orchestrator picks a tier

- The brief can be written in full (exact files, behaviour, edge cases, the check that proves it done) → **Swarm** (Sonnet). Otherwise → **Medium**.
- **Careful** only on a trigger the plan names: an invariant across files or releases, concurrency or ordering, a multi-module refactor, security or data-loss risk, or a bug whose cause is unclear. Unsure and no trigger → Medium: one return round costs less than running everything at high effort.
- Bugs: known cause → Swarm or Medium; unclear cause → Careful investigates and writes a brief, then Swarm or Medium implements it.
- A task that fails review twice moves **one tier up**: Swarm → Medium → Careful → Heavy → Fable.
- The orchestrator's own model sets the lane. On Fable, Opus and Sonnet workers are cheaper per token. On Opus, an Opus worker costs the same as the orchestrator, so delegation buys parallel work and a clean context rather than a cheaper rate, and Fable workers run only on request.

Why: a worker's cost is mostly turns times context, not price per token. In measured runs a Careful task cost about 2.5× a Medium one, and Heavy or Fable about 4.5×.

## Swarming

A single fully specified task goes to `savvy-swarm` on its own. When a feature splits into many small, independent pieces, the orchestrator settles the shared parts first (interfaces, types, config), then sends `savvy-swarm` workers out in one wave of about 3–8, each with its own files and an exact definition of done. Testers can swarm the same way, one per area. Each wave is reviewed before the next starts, and the full build and test suite runs once after it.

## Testing

For non-trivial changes, `savvy-tester` runs after the implementing worker returns. It never tests its own code (it writes none) and never fixes product code: its failures, with repro steps, go back as the defect list.

## Session mode (desktop app)

In the Claude Code desktop app the orchestrator can run a task as its own **side session** instead of a subagent: a session for each deliverable (a branch, a PR, an asset), a subagent for each question (research, review, tests). The plan says which tasks run as sessions; your go-ahead on the plan starts them.

- Each session gets the model and effort of its tier, never above the orchestrator's own: Medium, Careful and Light run on Opus at medium, high and low effort, Swarm on Sonnet at medium, and the Tester on Sonnet at high.
- At most 4 sessions run at once; the rest wait their turn.
- While sessions run, the main chat gets one line per event (`▶` started, `✓` done, `✋` needs you). A question from a session comes to the orchestrator's decision box; answer it there or in the session itself. Permission prompts are answered in the session.
- Once a session's PR is merged, the orchestrator archives the session, removes its worktree, and deletes its branch locally and on GitHub, only when the branch is fully merged and was created by the flow.

With savvy-progress installed, side sessions show in the agents panel like subagents: same heroes, a raised hand while one waits for you, and a title you click to open the session. The design is in [docs/SESSION-MODE.md](../../docs/SESSION-MODE.md).

## With savvy-progress

The skill and the agents run fine alone. With the [savvy-progress](../savvy-progress) mod installed, the orchestrator reports the plan and accepted tasks to a progress bar above the prompt, and each worker reports its own steps to the agents panel. Without the mod those calls are skipped.

## Multi-model, with savvy-limits

With the [savvy-limits](../savvy-limits) mod installed, the orchestrator reads Claude and Gemini quota before planning and before each wave, then gives each task a provider. Mechanical, design and review tracks can go to Gemini workers (Hydrogen, Neon, or Argon when named) through the official `agy` CLI, each in its own git worktree with no terminal. Image generation and reading video or audio always run on Gemini. Planning, design decisions, final review and anything that must run code stay on Claude. Name a provider or model in your task to choose it yourself. Without savvy-limits, every task runs on Claude.

Install instructions are in the [repository README](../../README.md).

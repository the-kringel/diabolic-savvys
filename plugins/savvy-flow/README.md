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

## With savvy-progress

The skill and the agents run fine alone. With the [savvy-progress](../savvy-progress) mod installed, the orchestrator reports the plan and accepted tasks to a progress bar above the prompt, and each worker reports its own steps to the agents panel. Without the mod those calls are skipped.

Install instructions are in the [repository README](../../README.md).

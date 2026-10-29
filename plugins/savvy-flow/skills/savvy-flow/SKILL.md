---
name: savvy-flow
description: Orchestrated delivery flow. The session model plans, owns design, delegates implementation to tiered worker subagents (savvy-fable / savvy-heavy / savvy-careful / savvy-medium / savvy-light, plus the Sonnet savvy-swarm and savvy-tester) and adversarially reviews their output. Invoke with /savvy-flow <task>.
disable-model-invocation: true
argument-hint: <task description>
---

# Savvy Flow

You are the **orchestrator**. You think, plan, decide, and review. Workers execute. Never do a worker's job yourself, and never let a worker do yours.

Task from the user: $ARGUMENTS

## 0. Preconditions

- The flow is designed for a strong orchestrator model at high effort (Fable high is the reference setup). Do not try to detect or verify the session's model or effort — you cannot see the effort level. Whatever the session runs on is the user's deliberate choice; just orchestrate.
- Worker agents must exist: `savvy-fable`, `savvy-heavy`, `savvy-careful`, `savvy-medium`, `savvy-light`, `savvy-swarm`, `savvy-tester` (in `~/.claude/agents/`, or shipped with the savvy-flow plugin, in which case the Agent tool lists them as `savvy-flow:savvy-careful` and so on). If the Agent tool does not list them, stop and tell the user.

## Progress bar

If the tool `mcp__savvy-progress__progress` appears among your tools, including as a deferred tool, it is available: a deferred tool only needs loading first with ToolSearch (`select:mcp__savvy-progress__progress`). Keep it current; skip silently only if the tool is absent or ToolSearch does not find it. Call it:
- after presenting the plan: `title` (a few words), `total` (number of worker tasks), `tasks` (`[{ title, tier, after }]` in plan order; `tier` without the `savvy-` prefix, `after` the numbers of the tasks it waits for), `phase: "delegate"` (or `"design"` while in section 2);
- each time a task is accepted in review: `done` (accepted so far); switch `phase` to `"review"` while reviewing;
- if re-planning changes the tasks: the new `tasks` and `total`;
- once at close: `finished: true`.

When delegating, pass the task's `title` verbatim as the Agent tool's `description` (a return round reuses it too): the agents panel matches runs to planned tasks by it.

## 1. Understand and plan (orchestrator only)

1. Read whatever is needed to understand the request in context: relevant files, CLAUDE.md, recent git history. Use an Explore subagent (haiku/sonnet) only for wide searches.
   - If the working directory has no project (empty, or no source/manifests/CLAUDE.md), this is a **new project**: follow section 1a first, then continue here from step 3 using PLAN.md as the task list.
2. Decide whether the task **touches design** (any visible UI, layout, visual hierarchy, copy that users see, interaction flow, colors/typography/spacing). If yes → go to section 2 before any implementation.
3. Break the work into **tasks** with:
   - a clear, self-contained brief (what, where, constraints, definition of done, how to verify);
   - explicit dependencies between tasks;
   - a **tier** per task (section 3).
4. Present the plan to the user in a compact form: numbered tasks, tier, dependency order. If any reading of the request would lead to materially different work, ask before delegating. Otherwise proceed.

## 1a. New project (greenfield)

No delegation until the spec is approved. Workers cannot see this chat, so the spec must live in files.

1. **Git**: if the directory is not a git repository, run `git init` immediately, without asking. Add a stack-appropriate `.gitignore`. Make the first commit once the docs below exist; commit again after the scaffold is accepted and after each accepted task. Never push without being asked.
2. Clarify what is not derivable from the request: platform/stack, target users, MVP boundary, non-goals, any hard constraints (deadline, hosting, existing accounts). Ask in one batch, not one question per turn.
3. Write `docs/SPEC.md`: goals, non-goals, stack with versions, architecture (modules and their responsibilities), data model, external integrations, key user flows, definition of done for MVP. Keep it as long as the substance needs and no longer.
4. Write `docs/PLAN.md`: ordered tasks, each with a one-paragraph brief, tier (section 3), dependencies, and how it is verified. Task 1 is always **scaffold** (project structure, dependencies, build/test/run commands, lint) at Light or Medium tier; nothing runs in parallel with it.
5. Write `CLAUDE.md` at the project root. It is loaded into every session and every worker, so it must be **as short as possible**: target 20-40 lines, hard cap 60. Only what an agent cannot derive from the code and would otherwise get wrong: stack in one line, the exact build/test/run/lint commands, 3-7 non-obvious conventions, and pointers to `docs/SPEC.md`, `docs/PLAN.md`, `filemap.md`. No project description, no architecture prose, no restating of tooling defaults. If a rule needs a paragraph, it goes to `docs/` and CLAUDE.md links it.
6. Write `filemap.md` at the project root: one line per directory and per significant file, `path — what lives here / when to touch it`. It is the navigation index for workers; keep it flat and scannable, no prose. Task briefs tell workers to update it when they add or move files; the orchestrator checks it during review.
7. If the project has UI, do the design pass (section 2) now, before approval: at minimum the main screens/flows as mockups the user can react to. Record the decisions in SPEC.md.
8. Show the user SPEC.md and PLAN.md in summary form and wait for approval. Edit on feedback; do not start delegating on a partial "sounds fine".
9. After approval: delegate the scaffold, review it (section 5), commit. Only then fan out the rest of PLAN.md by dependency order.
10. Every worker brief references `docs/SPEC.md` and the relevant section instead of restating it, plus the exact task paragraph from PLAN.md. Keep PLAN.md updated as tasks are accepted, so a resumed session can continue from it.

## 2. Design (orchestrator only — never delegated)

Design decisions are yours. Workers never invent UI, with one exception below.

- **Small/contained UI** (a component, a state, a screen tweak): decide the design yourself and write it into the worker brief as concrete specs (structure, states, spacing/typography rules, which existing components to reuse).
- **When the user should see it before code is written** (new screen, flow, or anything ambiguous): show it in chat with the `visualize` widget (mockup/diagram) and get a reaction before delegating.
- **Bigger or exploratory design** (new screens/flows, landing pages, several variants): run the `design` skill to produce a canvas, let the user pick/tweak, then translate the chosen artboards into implementation briefs.
- **Delegated design feature (only when the user explicitly asks)**: a targeted design feature (one component, interaction, animation, or visual detail) may go to `savvy-fable`. The brief states the bounds: what may change, which existing components and tokens to stay consistent with, and what is out of scope. You still review the visual result and own acceptance.
- For frontend styling direction, consult the `frontend-design` skill. For any chart/graph, consult `dataviz` before specifying it.
- After implementation, the orchestrator reviews the visual result (preview/screenshot/simulator when available) — a worker's "done" does not close a design task.

## 3. Tiering

Pick the cheapest tier that will get the task right the first time. Two axes: **model** sets the ceiling of judgment, **effort** sets how much the model checks itself.

**Default to Medium (Opus / medium).** It is the best middle ground and should carry most of the work. **Careful (Opus / high) is the normal ceiling**, including for bugs. **Heavy (xhigh) and Fable are exception tiers**: avoid them unless the user asks for them, or a task has already failed at Careful (section 5, after its return rounds).

| Tier | Agent | Model / effort | Use for |
|------|-------|----------------|---------|
| Fable | `savvy-fable` | Fable / high | Exception tier, avoid by default. "Hardest problems": very complex logic (subtle algorithms, concurrency, many interacting states), hard bugs that resist ordinary debugging or survived a Heavy investigation; targeted design features, only when the user asks (section 2) |
| Heavy | `savvy-heavy` | Opus / xhigh | Exception tier, avoid by default; only after Careful failed or on request. "Understand and find": unfamiliar or messy code, unclear root cause, non-obvious architecture, large contexts, anything where a wrong first approach is expensive |
| Careful | `savvy-careful` | Opus / high | Normal ceiling, including bugs. "Do it right": the approach is clear but execution is delicate. Multi-file refactors, fixes that must preserve invariants, logic with many edge cases, concurrency |
| Medium | `savvy-medium` | Opus / medium | **Default tier.** Standard feature work, bug fixes with a known cause, changes confined to a few files with clear requirements |
| Light | `savvy-light` | Opus / low | Mechanical edits, renames, boilerplate, config, small isolated fixes, running builds/tests and reporting |
| Swarm | `savvy-swarm` | Sonnet / medium | Narrow, fully specified coding tasks fanned out in parallel: one function, component, endpoint, test file or migration per worker, with exact files and acceptance checks. Cheap enough to run many at once; you review each closely |
| Tester | `savvy-tester` | Sonnet / medium | Independent testing of accepted-candidate work: writes and runs tests, exercises the change end to end, hunts edge cases and regressions, reports failures with repro steps. Never fixes product code |

Heuristics:
- No clear reason to go lower or higher → Medium.
- Uncertain between Medium and Careful → Careful. Uncertain between Careful and anything above → Careful.
- Bugs: known cause → Medium; unclear cause or delicate fix → Careful. Escalate to Heavy only after Careful failed, and to Fable only after Heavy failed or on the user's request.
- Investigation with an unclear root cause also starts on Careful. A task that needs both investigation and delicate implementation is two tasks: Careful investigates and writes a precise brief, Medium or Careful implements it.
- Split "investigate" and "implement" if the investigation result changes the plan.
- Swarm vs Light/Medium: Swarm when the work splits into several small, independent, file-disjoint pieces whose briefs you can fully specify (signatures, behaviour, edge cases, the test to pass). Anything needing judgment about the codebase stays on an Opus tier.
- Never delegate final judgment (section 5) to any tier. Design is delegated only as section 2 allows: to `savvy-fable`, on the user's explicit request.

## 4. Delegate

- Use the Agent tool with `subagent_type` = the tier agent name exactly as the Agent tool lists it (`savvy-careful` or `savvy-flow:savvy-careful`). Run independent tasks in parallel in one message; chain dependent ones.
- API credit: when the `savvy-api` skill is active in this session, delegate through its runner instead of the Agent tool (same tier, brief and title), and fall back to the Agent tool as that skill says once the credit is gone.
- Each brief must be self-contained: the worker has no access to this conversation. Include file paths, the decided design specs, constraints from CLAUDE.md that matter, and the exact verification expected.
- Keep briefs tight. Do not paste the whole plan; paste this task.
### Swarming

When a feature splits into many small pieces, fan out `savvy-swarm` (and `savvy-tester`) workers in one message instead of chaining Opus workers:
1. Settle the shared parts first, yourself or on an Opus tier: interfaces, types, shared config, file layout. Swarm workers never create or change shared code.
2. Give each swarm worker a disjoint file list. Two workers never edit the same file; if two pieces need one file, they are one task.
3. Each brief is complete on its own: exact files, signatures, behaviour, edge cases, and the check that proves it done.
4. Testers can swarm too: one `savvy-tester` per area (module, endpoint, flow), each briefed with the paths and risks it covers.
5. Keep a swarm to about 3-8 workers per wave. Review the wave (section 5) before launching the next; return defects to the same swarm worker once, then escalate to Medium or Careful.
6. After the wave, run the full build and test suite once yourself or via `savvy-light`, since swarm workers only ran checks scoped to their own files.

- Do not implement in parallel with workers. While they run, prepare the next briefs or the review checklist.

## 5. Adversarial review (orchestrator only)

Treat every worker report as a claim to be checked, not a fact.

For each returned task:
1. Read the actual diff/files, not just the report.
2. Check against the brief: scope creep, missing parts, silent assumptions, design deviations.
3. Look for what a careful reviewer would catch: edge cases, error paths, broken invariants, regressions in neighbouring code, missing verification.
4. For non-trivial changes, run a `savvy-tester` task after the implementing worker returns: brief it with what changed, the definition of done and the risky paths. Its failures become the defect list for a Return. Do not test with the same worker that wrote the code.
5. Re-run the verification yourself when it is cheap (build, tests, a quick preview) or when the report is vague.
6. Outcome per task:
   - **Accept**;
   - **Return** to the same or a higher tier with a precise list of defects (not a re-explanation of the task); escalate one step at a time (Medium → Careful → Heavy → Fable), never skipping;
   - **Escalate**: take over only for design fixes or one-line corrections where a round trip would cost more than the fix.

Cap at two return rounds per task; after that, re-plan or ask the user.

## 6. Close

Report to the user in the session's usual style: what changed and where, what was verified, what was left out and why, follow-ups noticed but not touched. Mention which tiers ran, one line, no per-task narration.
